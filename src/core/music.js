// Séquenceur de musique : joue les thèmes de src/data/music.js (générés par tools/compose_music.py)
// avec des voix Web Audio — aucun fichier audio, aucune banque de sons.
//
// Planification « en avance » (lookahead) : un minuteur léger programme les notes quelques dizaines
// de millisecondes avant l'heure de l'horloge audio. Le tempo reste exact même quand le thread
// principal est occupé (un setInterval par note dérive et saccade).
//
// Changer de thème (`setTheme`) attend la fin de la mesure en cours : pas de coupure en plein temps.

import MUSIQUES from '../data/music.js';

const AVANCE_S = 0.14;      // jusqu'où l'on programme à l'avance
const TICK_MS = 30;         // période du minuteur
const THEME_DEFAUT = 'skatepark';

// Timbre de chaque instrument, par thème : forme d'onde, volume, filtre passe-bas, envoi vers l'écho.
// `vol` égalise le niveau perçu entre thèmes (RMS mesuré en direct dans Chrome).
const VOIX = {
  skatepark: {
    vol: 0.9,
    lead: { type: 'square', gain: 0.10, longueur: 1.5 }, bass: { type: 'triangle', gain: 0.27 },
    arp: { type: 'square', gain: 0.045, longueur: 1.0 }, echo: { temps: 3, retour: 0.28, niveau: 0.15 },
  },
  maisons: {
    vol: 0.62,
    lead: { type: 'triangle', gain: 0.17, longueur: 1.7, vibrato: true }, bass: { type: 'sine', gain: 0.38 },
    arp: { type: 'triangle', gain: 0.075, longueur: 2.4 }, echo: { temps: 3, retour: 0.3, niveau: 0.2 },
    batterie: { doux: true },
  },
  ecole: {
    vol: 1.6,
    lead: { type: 'square', gain: 0.075, longueur: 0.9, filtre: 2600 }, bass: { type: 'triangle', gain: 0.27 },
    stab: { type: 'triangle', gain: 0.10, longueur: 0.8 }, echo: { temps: 2, retour: 0.2, niveau: 0.12 },
    batterie: { doux: true },
  },
  chantier: {
    vol: 1.35,
    lead: { type: 'sawtooth', gain: 0.07, longueur: 1.2, filtre: 1900 }, bass: { type: 'sawtooth', gain: 0.17, filtre: 700 },
    stab: { type: 'square', gain: 0.07, longueur: 1.4, filtre: 2100, desaccord: 9 }, echo: { temps: 3, retour: 0.18, niveau: 0.06 },
    batterie: { dur: true },
  },
  cyber: {
    vol: 1.25,
    lead: { type: 'square', gain: 0.085, longueur: 1.6, vibrato: true }, bass: { type: 'sawtooth', gain: 0.17, filtre: 650 },
    arp: { type: 'sawtooth', gain: 0.05, longueur: 1.1, filtre: 2400 }, pad: { type: 'sawtooth', gain: 0.04, filtre: 900 },
    echo: { temps: 3, retour: 0.42, niveau: 0.24 },
  },
};

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/** Index « par pas » d'un thème : evt[instrument][pas] = [[note, durée, vélocité], …]. Calculé une fois. */
function indexer(theme) {
  const total = theme.pasParMesure * theme.mesures;
  const par = {};
  for (const inst of ['lead', 'bass', 'arp', 'pad', 'stab']) {
    par[inst] = new Array(total);
    for (const [pas, note, ln, vel] of theme[inst] || []) {
      (par[inst][pas] ||= []).push([note, ln, vel]);
    }
  }
  par.drums = {};
  for (const [inst, pas] of Object.entries(theme.drums)) {
    const set = new Set(pas);
    par.drums[inst] = set;
  }
  return { total, par };
}

/**
 * @param {object} o
 * @param {() => AudioContext|null} o.getCtx
 * @param {() => AudioNode|null}    o.getOut     nœud de sortie de la musique (gain musique)
 * @param {() => boolean}           o.estMuet
 */
export function createMusic({ getCtx, getOut, estMuet }) {
  const cache = new Map();
  let courant = null;       // { id, theme, idx, voix }
  let enAttente = null;     // id du thème à lancer à la prochaine mesure
  let themeChoisi = THEME_DEFAUT;
  let minuteur = null;
  let pas = 0;              // pas courant dans le thème
  let prochain = 0;         // heure audio du prochain pas
  let bruit = null;         // tampon de bruit blanc partagé
  let echo = null;          // { entree, delai, retour }

  function theme(id) {
    const ident = MUSIQUES[id] ? id : THEME_DEFAUT;
    if (!cache.has(ident)) cache.set(ident, { id: ident, theme: MUSIQUES[ident], idx: indexer(MUSIQUES[ident]), voix: VOIX[ident] || VOIX[THEME_DEFAUT] });
    return cache.get(ident);
  }

  function preparerSortie(ctx, sortie) {
    if (!bruit) {
      bruit = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = bruit.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (!echo) {
      const entree = ctx.createGain();
      const delai = ctx.createDelay(1.0);
      const retour = ctx.createGain();
      const humide = ctx.createGain();
      entree.connect(delai);
      delai.connect(retour);
      retour.connect(delai);
      delai.connect(humide);
      humide.connect(sortie);
      echo = { entree, delai, retour, humide };
    }
  }

  function regler(ctx, t, c) {
    const e = c.voix.echo || { temps: 3, retour: 0.2, niveau: 0 };
    const pasS = 60 / c.theme.bpm / 4;
    echo.delai.delayTime.setValueAtTime(Math.min(0.9, pasS * e.temps), t);
    echo.retour.gain.setValueAtTime(e.retour, t);
    echo.humide.gain.setValueAtTime(e.niveau > 0 ? 1 : 0, t);
    echo.niveau = e.niveau;
  }

  /** Une note : oscillateur + enveloppe (+ filtre, vibrato, désaccord) ; `envoi` = part envoyée à l'écho. */
  function note(ctx, sortie, t, midi, dur, v, vel, envoi = 0) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = v.type;
    osc.frequency.setValueAtTime(hz(midi), t);
    if (v.desaccord) osc.detune.setValueAtTime(v.desaccord, t);
    const crete = v.gain * (vel / 100);
    const att = v.attaque ?? 0.006;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(crete, t + att);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0005, crete * 0.18), t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0003, t + dur);
    let fin = osc;
    if (v.filtre) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(v.filtre, t);
      osc.connect(f);
      fin = f;
    }
    fin.connect(g);
    g.connect(sortie);
    if (envoi > 0 && echo) {
      const s = ctx.createGain();
      s.gain.setValueAtTime(envoi, t);
      g.connect(s);
      s.connect(echo.entree);
    }
    let lfo = null;
    if (v.vibrato && dur > 0.25) {          // léger vibrato sur les notes longues
      lfo = ctx.createOscillator();
      const prof = ctx.createGain();
      lfo.frequency.setValueAtTime(5.2, t);
      prof.gain.setValueAtTime(0, t);
      prof.gain.linearRampToValueAtTime(14, t + Math.min(0.25, dur * 0.6));
      lfo.connect(prof);
      prof.connect(osc.detune);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function percussion(ctx, sortie, t, inst, style) {
    const dou = (style.doux ? 0.6 : 1) * (style.vol ?? 1);
    const dur = style.dur ? 1.25 : 1;
    if (inst === 'k') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(style.dur ? 170 : 140, t);
      o.frequency.exponentialRampToValueAtTime(32, t + 0.09);
      g.gain.setValueAtTime(0.36 * dou * dur, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      o.connect(g);
      g.connect(sortie);
      o.start(t);
      o.stop(t + 0.12);
      return;
    }
    const cfg = {
      s: { f: 1500, type: 'highpass', long: 0.11, gain: 0.2 },
      h: { f: 7500, type: 'highpass', long: 0.03, gain: 0.07 },
      o: { f: 6500, type: 'highpass', long: 0.14, gain: 0.08 },
      t: { f: 400, type: 'bandpass', long: 0.12, gain: 0.16 },
      c: { f: 1800, type: 'bandpass', long: 0.1, gain: 0.17 },
    }[inst];
    if (!cfg) return;
    const src = ctx.createBufferSource();
    src.buffer = bruit;
    const f = ctx.createBiquadFilter();
    f.type = cfg.type;
    f.frequency.setValueAtTime(cfg.f, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(cfg.gain * dou * dur, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + cfg.long);
    src.connect(f);
    f.connect(g);
    g.connect(sortie);
    src.start(t, Math.random() * 0.5);
    src.stop(t + cfg.long + 0.02);
  }

  function programmer(ctx, sortie, c, p, t) {
    const { par } = c.idx;
    const pasS = 60 / c.theme.bpm / 4;
    const v = c.voix;
    for (const [nom, evts] of [['bass', par.bass[p]], ['lead', par.lead[p]], ['arp', par.arp[p]], ['pad', par.pad[p]], ['stab', par.stab[p]]]) {
      if (!evts) continue;
      const voix = v[nom] || (nom === 'bass' ? v.bass : null);
      if (!voix) continue;
      for (const [m, ln, vel] of evts) {
        const dur = nom === 'pad' ? ln * pasS * 0.98 : Math.max(0.05, ln * pasS * (voix.longueur ?? 0.9));
        const envoi = (nom === 'lead' || nom === 'arp') ? (c.voix.echo?.niveau || 0) : 0;
        const att = nom === 'pad' ? Math.min(0.5, dur * 0.4) : undefined;
        note(ctx, sortie, t, m, dur, att ? { ...voix, attaque: att } : voix, vel * (v.vol ?? 1), envoi);
      }
    }
    for (const [inst, set] of Object.entries(par.drums)) {
      if (set.has(p)) percussion(ctx, sortie, t, inst, { ...(v.batterie || {}), vol: v.vol ?? 1 });
    }
  }

  function tick() {
    const ctx = getCtx();
    const sortie = getOut();
    if (!ctx || !sortie || !courant) return;
    while (prochain < ctx.currentTime + AVANCE_S) {
      // Changement de thème : seulement au début d'une mesure.
      if (enAttente && pas % courant.theme.pasParMesure === 0) {
        courant = theme(enAttente);
        enAttente = null;
        pas = 0;
        regler(ctx, prochain, courant);
      }
      const pasS = 60 / courant.theme.bpm / 4;
      const swing = pas % 2 === 1 ? courant.theme.swing * pasS : 0;
      if (!estMuet()) programmer(ctx, sortie, courant, pas, Math.max(prochain + swing, ctx.currentTime));
      prochain += pasS;
      pas = (pas + 1) % courant.idx.total;
    }
  }

  return {
    /** Choisit le thème : immédiat si la musique est arrêtée, sinon à la prochaine mesure. */
    setTheme(id) {
      const ident = MUSIQUES[id] ? id : THEME_DEFAUT;
      themeChoisi = ident;
      if (minuteur) enAttente = ident !== courant.id ? ident : null;
    },
    get theme() { return themeChoisi; },
    start() {
      const ctx = getCtx();
      const sortie = getOut();
      if (!ctx || !sortie || minuteur) return;
      preparerSortie(ctx, sortie);
      courant = theme(themeChoisi);
      enAttente = null;
      pas = 0;
      prochain = ctx.currentTime + 0.06;
      regler(ctx, prochain, courant);
      minuteur = setInterval(tick, TICK_MS);
    },
    stop() {
      if (minuteur) clearInterval(minuteur);
      minuteur = null;
      courant = null;
      enAttente = null;
    },
    get enMarche() { return !!minuteur; },
  };
}

export const THEMES_MUSIQUE = Object.keys(MUSIQUES);
