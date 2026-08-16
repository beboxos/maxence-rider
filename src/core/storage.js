// Persistance locale, schéma versionné (§12).
//
// Une seule clé, `maxence-rider.v1`. Écriture débouncée (500 ms) : jamais de
// localStorage.setItem synchrone dans la boucle de jeu à 60 fps — un accès
// disque, même bref, n'a rien à faire dans un budget de 16 ms par frame.
//
// try/catch partout : en navigation privée iOS, localStorage peut lever à la
// lecture comme à l'écriture. Un échec bascule sur un store mémoire (le jeu
// continue de fonctionner pour la session en cours) et prévient une seule
// fois, jamais en boucle.

const CLE = 'maxence-rider.v1';
const SCHEMA = 1;
const DELAI_DEBOUNCE = 500;
const TOP_N = 10;

function etatParDefaut() {
  return {
    schema: SCHEMA,
    settings: { sound: true, music: true, haptics: true, rider: 'skate', reducedFx: false },
    progress: { levelsUnlocked: 1, stars: {}, totalScore: 0, ridersUnlocked: ['skate'] },
    scores: {
      landscape: { endless: [] },
      portrait: { endless: [] },
    },
    stats: { runs: 0, crashes: 0, bestCombo: 0, totalDistance: 0 },
  };
}

/** Fusionne un objet lu avec les valeurs par défaut, sans jamais faire confiance à sa forme. */
function normaliser(brut) {
  const def = etatParDefaut();
  if (!brut || typeof brut !== 'object' || brut.schema !== SCHEMA) return def;
  try {
    return {
      schema: SCHEMA,
      settings: { ...def.settings, ...(brut.settings || {}) },
      progress: { ...def.progress, ...(brut.progress || {}), stars: { ...(brut.progress?.stars || {}) } },
      scores: {
        landscape: { ...def.scores.landscape, ...(brut.scores?.landscape || {}) },
        portrait: { ...def.scores.portrait, ...(brut.scores?.portrait || {}) },
      },
      stats: { ...def.stats, ...(brut.stats || {}) },
    };
  } catch {
    return def;
  }
}

export function createStorage() {
  let etat = etatParDefaut();
  let disponible = true;
  let avertiEchec = false;
  let minuteur = null;

  function avertirUneFois(message) {
    if (avertiEchec) return;
    avertiEchec = true;
    console.warn(`[storage] ${message}`);
  }

  function charger() {
    try {
      if (typeof localStorage === 'undefined') { disponible = false; return; }
      const brut = localStorage.getItem(CLE);
      if (brut) etat = normaliser(JSON.parse(brut));
    } catch {
      disponible = false;
      avertirUneFois('lecture impossible — les scores ne seront pas conservés sur cet appareil.');
    }
  }

  function ecrireMaintenant() {
    if (!disponible) return;
    try {
      localStorage.setItem(CLE, JSON.stringify(etat));
    } catch {
      disponible = false;
      avertirUneFois('écriture impossible — les scores ne seront pas conservés sur cet appareil.');
    }
  }

  /** Programme une écriture différée ; les appels rapprochés fusionnent en une seule. */
  function planifierEcriture() {
    if (!disponible) return;
    if (minuteur) clearTimeout(minuteur);
    minuteur = setTimeout(() => { minuteur = null; ecrireMaintenant(); }, DELAI_DEBOUNCE);
  }

  charger();

  return {
    get disponible() { return disponible; },
    get settings() { return etat.settings; },
    get progress() { return etat.progress; },
    get stats() { return etat.stats; },

    setSetting(cle, valeur) {
      etat.settings[cle] = valeur;
      planifierEcriture();
    },

    /** §6.6/§7 : cumul du score total, base du déblocage des riders. */
    ajouterScoreCumule(points) {
      etat.progress.totalScore += Math.max(0, points);
      planifierEcriture();
    },

    debloquerRider(id) {
      if (!etat.progress.ridersUnlocked.includes(id)) {
        etat.progress.ridersUnlocked.push(id);
        planifierEcriture();
      }
    },

    riderDebloque(id) {
      return etat.progress.ridersUnlocked.includes(id);
    },

    enregistrerStats({ crash = false, combo = 1, distance = 0 } = {}) {
      etat.stats.runs++;
      if (crash) etat.stats.crashes++;
      etat.stats.bestCombo = Math.max(etat.stats.bestCombo, combo);
      etat.stats.totalDistance += Math.max(0, distance);
      planifierEcriture();
    },

    /**
     * Ajoute un score au classement `categorie` (ex. "endless"), trié
     * décroissant, tronqué à 10 (§12). `orientation` sépare paysage/portrait
     * (§11 : scores non comparables entre les deux).
     */
    ajouterScore(orientation, categorie, entree) {
      const bucket = etat.scores[orientation] || (etat.scores[orientation] = {});
      const liste = bucket[categorie] || (bucket[categorie] = []);
      liste.push(entree);
      liste.sort((a, b) => b.score - a.score);
      liste.length = Math.min(liste.length, TOP_N);
      planifierEcriture();
      return liste;
    },

    meilleursScores(orientation, categorie) {
      return etat.scores[orientation]?.[categorie] || [];
    },

    /** §12 : bouton « Effacer mes données », avec confirmation côté appelant. */
    effacerTout() {
      etat = etatParDefaut();
      if (minuteur) { clearTimeout(minuteur); minuteur = null; }
      ecrireMaintenant();
    },

    /** Force l'écriture immédiate — utile avant de quitter la page. */
    flush() {
      if (minuteur) { clearTimeout(minuteur); minuteur = null; ecrireMaintenant(); }
    },
  };
}
