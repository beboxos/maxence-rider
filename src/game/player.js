// Le rider : physique et machine à états d'animation.
//
// Un seul objet pour les deux personnages — seuls les coefficients de riders.js
// et le préfixe d'animation changent (§7).

import { Action } from '../core/input.js';
import { getRider } from '../data/riders.js';
import {
  PHASES, FENETRE_TRICK, FPS, fpsRoulé,
  DUREE_CRASH_FIGE, SQUASH_RECEPTION, DUREE_RECEPTION,
} from '../data/anims.js';

export const RiderState = {
  IDLE: 'IDLE',
  ROLL: 'ROLL',
  AIR: 'AIR',
  LAND: 'LAND',
  CRASH: 'CRASH',
};

export const GRAVITE = 2200;
export const GRAVITE_BOOST = 1400;   // §6.3 : montée du boost seulement
export const CHUTE_MAX = 1400;

export const COYOTE = 0.09;          // §6.3
const FENETRE_CONVERSION = 0.14;     // voir commentaire sur le double tap

// §6.2 : vitesse de défilement.
const VITESSE_BASE = 240;
const VITESSE_GAIN = 8;              // par palier
const PALIER = 10;                   // secondes
const VITESSE_MAX = 460;
const LEAN = 0.15;

// §6.3 : les trois sauts.
export const SAUTS = {
  ollie: { v0: -620, gravite: GRAVITE, anim: 'ollie', points: 50 },
  flip: { v0: -820, gravite: GRAVITE, anim: 'flip', points: 150 },
  boost: { v0: -700, gravite: GRAVITE_BOOST, anim: null, points: 200 },
};

const hauteurSommet = (v0, g) => (v0 * v0) / (2 * g);

export function createPlayer({ rider = 'skate', direction = 1 } = {}) {
  const stats = getRider(rider);

  const p = {
    stats,
    direction,                 // +1 vers la droite, -1 vers la gauche (§6.2)

    x: 0, y: 0, vy: 0,
    prevX: 0, prevY: 0,

    state: RiderState.IDLE,
    auSol: true,
    coyote: 0,
    tempsVol: 0,
    sautEnCours: null,         // clé de SAUTS
    animSaut: 'ollie',         // anim jouée pendant le vol
    bonusRampe: 1,             // §6.5 : une rampe majore le prochain saut

    tempsAnim: 0,
    tempsEtat: 0,
    squash: 1,

    vitesse: VITESSE_BASE,
    tempsCourse: 0,
    distance: 0,

    /** Réinitialise le rider au sol, sans toucher aux compteurs de run. */
    poser(x, y) {
      p.x = p.prevX = x;
      p.y = p.prevY = y;
      p.vy = 0;
      p.auSol = true;
      p.coyote = 0;
      p.tempsVol = 0;
      p.sautEnCours = null;
      p.squash = 1;
      setState(RiderState.ROLL);
    },

    update(dt, { input, solY }) {
      p.prevX = p.x;
      p.prevY = p.y;
      p.tempsEtat += dt;
      p.tempsAnim += dt;

      if (p.state === RiderState.CRASH) {
        majChute(dt, solY);
        return;
      }

      majVitesse(dt, input);
      majSaut(input);
      majPhysique(dt, solY);
      majAnim(dt);
    },

    /** Clé de frame à dessiner. */
    frameKey() {
      const pre = stats.prefixe;
      switch (p.state) {
        case RiderState.IDLE: return `${pre}.idle.${indexBoucle('idle', 3)}`;
        case RiderState.ROLL: return `${pre}.roll.${indexRoulé()}`;
        case RiderState.AIR: return `${pre}.${p.animSaut}.${indexVol()}`;
        case RiderState.LAND: return `${pre}.${p.animSaut}.${dernierePhase()}`;
        case RiderState.CRASH: return `${pre}.crash.${indexCrash()}`;
        default: return `${pre}.idle.0`;
      }
    },

    /** §6.4 : le rider est-il dans la fenêtre de trick de son animation ? */
    dansFenetreTrick() {
      if (p.state !== RiderState.AIR) return false;
      const f = FENETRE_TRICK[p.animSaut];
      if (!f) return false;
      const i = indexVol();
      return i >= f[0] && i <= f[1];
    },

    /** Déclenche la chute (§6.7). */
    crasher() {
      if (p.state === RiderState.CRASH) return;
      setState(RiderState.CRASH);
      p.vy = Math.min(p.vy, -180); // le rider est projeté avant de retomber
    },

    get crashTermine() {
      return p.state === RiderState.CRASH && p.tempsEtat >= DUREE_CRASH_FIGE;
    },
  };

  // ── Interne ────────────────────────────────────────────────────────────────

  function setState(s) {
    if (p.state === s) return;
    p.state = s;
    p.tempsEtat = 0;
    p.tempsAnim = 0;
  }

  function majVitesse(dt, input) {
    p.tempsCourse += dt;
    const paliers = Math.floor(p.tempsCourse / PALIER);
    const base = Math.min(VITESSE_MAX, VITESSE_BASE + paliers * VITESSE_GAIN);

    let facteur = 1;
    if (input.isDown(Action.LEAN_FWD)) facteur = 1 + LEAN;
    else if (input.isDown(Action.LEAN_BACK)) facteur = 1 - LEAN;

    p.vitesse = base * stats.vitesse * facteur;
    p.distance += p.vitesse * dt;
  }

  function lancerSaut(type) {
    const saut = SAUTS[type];
    // Le boost n'a pas d'animation propre : il emprunte le spécial du rider,
    // no-comply pour le skate, manual pour le roller (§7).
    p.animSaut = saut.anim || stats.special;
    p.sautEnCours = type;
    p.vy = saut.v0 * stats.hauteurSaut * p.bonusRampe;
    p.graviteMontee = saut.gravite;
    p.auSol = false;
    p.coyote = 0;
    p.tempsVol = 0;
    p.bonusRampe = 1;
    setState(RiderState.AIR);
  }

  /** Recale le saut en cours pour culminer à `cible` px au-dessus du sol. */
  function convertirVers(type, solY) {
    const saut = SAUTS[type];
    const cible = hauteurSommet(saut.v0 * stats.hauteurSaut, saut.gravite);
    const acquise = solY - p.y;
    p.vy = -Math.sqrt(2 * saut.gravite * Math.max(0, cible - acquise));
    p.graviteMontee = saut.gravite;
    p.animSaut = saut.anim || stats.special;
    p.sautEnCours = type;
  }

  function majSaut(input) {
    // Note d'implémentation — « variable jump height » (§6.3).
    //
    // La règle « relâcher tôt coupe la vitesse verticale à 45 % » ne peut
    // s'appliquer à aucun des trois sauts de ce jeu, parce que le schéma
    // d'entrées du §11 la contredit :
    //   • l'ollie part *au relâchement* d'un tap court — la touche est déjà
    //     lâchée à l'instant du décollage, la coupure serait systématique ;
    //   • le boost naît d'un double tap ou d'un Shift+Espace, gestes brefs par
    //     nature — même problème ;
    //   • le flip part au franchissement du seuil de 150 ms. Y appliquer la
    //     coupure obligeait à maintenir ~500 ms pour obtenir la hauteur
    //     nominale : essayé, mesuré à 122 px au lieu de 153. Un joueur qui fait
    //     exactement le geste demandé par le brief rate son saut.
    //
    // Les trois sauts gardent donc une hauteur fixe — ce que le tableau du §6.3
    // spécifie au pixel près, et ce qui sert le cœur du design : trois sauts
    // lisibles dont on choisit un pour ses contraintes, pas une modulation
    // continue. La profondeur de jeu vient du choix du saut et de l'airtime
    // qu'il coûte, pas d'un dosage de la touche.
    const peutSauter = p.auSol || p.coyote > 0;

    if (peutSauter) {
      if (input.consume(Action.JUMP_LONG)) return lancerSaut('boost');
      if (input.consume(Action.JUMP_HIGH)) return lancerSaut('flip');
      if (input.consume(Action.JUMP_SHORT)) return lancerSaut('ollie');
      return;
    }

    // Le premier tap d'un double tap est forcément parti en ollie : attendre la
    // fenêtre de double tap pour trancher ajouterait 250 ms de latence à chaque
    // saut. Le second tap convertit donc le saut à peine amorcé — même geste,
    // pas un double saut.
    if (p.tempsVol < FENETRE_CONVERSION && p.vy < 0
        && p.sautEnCours !== 'boost' && input.consume(Action.JUMP_LONG)) {
      convertirVers('boost', p.solY);
    }
  }

  function majPhysique(dt, solY) {
    p.solY = solY;

    if (p.auSol) {
      p.y = solY;
      p.vy = 0;
      return;
    }

    p.tempsVol += dt;
    if (p.coyote > 0) p.coyote = Math.max(0, p.coyote - dt);

    const g = p.vy < 0 ? (p.graviteMontee || GRAVITE) : GRAVITE;
    p.vy = Math.min(p.vy + g * dt, CHUTE_MAX);
    p.y += p.vy * dt;

    if (p.y >= solY) {
      p.y = solY;
      p.vy = 0;
      p.auSol = true;
      p.tempsVol = 0;
      p.sautEnCours = null;
      if (p.state === RiderState.AIR) setState(RiderState.LAND);
    }
  }

  function majChute(dt, solY) {
    p.vy = Math.min(p.vy + GRAVITE * dt, CHUTE_MAX);
    p.y = Math.min(solY, p.y + p.vy * dt);
    if (p.y >= solY) { p.y = solY; p.vy = 0; p.auSol = true; }
  }

  function majAnim(dt) {
    if (p.state === RiderState.LAND) {
      // §5 : écrasement vertical bref, qui se relâche progressivement.
      const t = Math.min(1, p.tempsEtat / DUREE_RECEPTION);
      p.squash = SQUASH_RECEPTION + (1 - SQUASH_RECEPTION) * t;
      if (p.tempsEtat >= DUREE_RECEPTION) {
        p.squash = 1;
        setState(RiderState.ROLL);
      }
      return;
    }
    p.squash = 1;
  }

  // ── Sélection de frame ─────────────────────────────────────────────────────

  function indexBoucle(nom, nbFrames) {
    return Math.floor(p.tempsAnim * FPS[nom]) % nbFrames;
  }

  function indexRoulé() {
    return Math.floor(p.tempsAnim * fpsRoulé(p.vitesse)) % 5;
  }

  function phases() {
    return PHASES[p.animSaut] || PHASES.ollie;
  }

  function dernierePhase() {
    const ph = phases();
    return ph.land[ph.land.length - 1];
  }

  function indexVol() {
    const ph = phases();
    const fps = FPS[p.animSaut] || 16;
    const iPop = Math.floor(p.tempsAnim * fps);
    if (iPop < ph.pop.length) return ph.pop[iPop];
    // Le pop est joué, on boucle sur les frames aériennes jusqu'au contact.
    const iAir = iPop - ph.pop.length;
    return ph.air[iAir % ph.air.length];
  }

  function indexCrash() {
    // §5 : l'animation se joue une fois puis se fige sur la dernière frame.
    return Math.min(5, Math.floor(p.tempsEtat * FPS.crash));
  }

  /** Le rider vient de quitter le sol sans sauter : il garde sa fenêtre coyote. */
  p.quitterLeSol = function quitterLeSol() {
    if (!p.auSol) return;
    p.auSol = false;
    p.coyote = COYOTE;
    p.tempsVol = 0;
    if (p.state === RiderState.ROLL) setState(RiderState.AIR);
    p.animSaut = 'ollie';
  };

  return p;
}
