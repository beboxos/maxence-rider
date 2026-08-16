// Score, combo, multiplicateur, bandeaux flottants (§6.4, §6.6).
//
// Note d'implémentation — la fenêtre de grâce du grind.
//
// Le §6.4 dit : combo vidé après 1,8 s sans trick/grind/manual, et « sortie de
// rail : maintenir le combo si le joueur enchaîne un saut dans les 200 ms ».
// Si le grind se contentait de suspendre le délai standard comme le manual, la
// mention spécifique des 200 ms n'aurait pas de raison d'exister. La lecture
// retenue ici : pendant le grind, le délai d'expiration ne progresse pas (on
// score activement) ; à la SORTIE du rail, une fenêtre courte et stricte de
// 200 ms s'ouvre — un nouveau trick dans cette fenêtre garde le combo, sinon
// il est encaissé immédiatement, sans attendre les 1,8 s normales. Ça évite
// qu'un grind interminable serve à figer indéfiniment un combo sans risque, et
// ça donne un sens concret à la mention des 200 ms.
//
// Le manual n'a pas cette mention de fenêtre courte : à son relâchement, le
// délai standard de 1,8 s reprend simplement son cours.

import { createPool } from '../core/pool.js';

const PLAFOND_MULTI = 10;
const DELAI_EXPIRATION = 1.8;       // §6.4
const DELAI_GRACE_GRIND = 0.2;      // §6.4 : sortie de rail
const DUREE_BANDEAU = 0.7;          // §6.6
const MONTEE_BANDEAU = 20;          // px, §6.6
const TAILLE_POOL_BANDEAUX = 16;

const TICK_GRIND = 0.1;             // §6.4 : +20 pts / 0.1 s
const POINTS_GRIND = 20;
const TICK_MANUAL = 0.1;            // §6.4 : +10 pts / 0.1 s
const POINTS_MANUAL = 10;

const POINTS_COIN = 100;            // §6.6
const POINTS_CLEAN_LINE = 500;      // §6.6

function creerBandeau() {
  return { texte: '', x: 0, y: 0, age: 0, couleur: '#ffc93c' };
}

export function createScoring() {
  const bandeaux = createPool(creerBandeau, TAILLE_POOL_BANDEAUX);

  const etat = {
    score: 0,              // déjà encaissé : tricks encaissés + collectibles + clean line
    multiplicateur: 1,
    enAttente: 0,
    tempsDepuisAction: Infinity, // Infinity = pas de combo en cours, rien à expirer
    grace: false,
    tempsGrace: 0,
    meilleurCombo: 1,
  };

  function emettreBandeau(texte, x, y, couleur = '#ffc93c') {
    const b = bandeaux.acquire();
    if (!b) return;
    b.texte = texte; b.x = x; b.y = y; b.age = 0; b.couleur = couleur;
  }

  /** §6.3/§6.4 : un trick (ollie/flip/boost) réussi. */
  function enregistrerTrick(label, points, x, y, { perfect = false } = {}) {
    const gain = Math.round(points * (perfect ? 1.5 : 1));
    etat.enAttente += gain * etat.multiplicateur;
    etat.multiplicateur = Math.min(PLAFOND_MULTI, etat.multiplicateur + 1);
    etat.meilleurCombo = Math.max(etat.meilleurCombo, etat.multiplicateur);
    etat.tempsDepuisAction = 0;
    etat.grace = false;

    const suffixe = etat.multiplicateur > 1 ? ` ×${etat.multiplicateur - 1}` : '';
    emettreBandeau(`${label} +${gain}${suffixe}`, x, y, perfect ? '#4ed4c4' : '#ffc93c');
  }

  /** §6.4 : accumulateurs pour grind et manual — tick discret, pas de taux continu. */
  function creerAccumulateurTick(intervalle, points) {
    let t = 0;
    return {
      /** Appelé chaque frame tant que l'action est active. */
      update(dt) {
        etat.tempsDepuisAction = 0; // reste vivant tant que l'action continue
        etat.grace = false;
        t += dt;
        while (t >= intervalle) {
          t -= intervalle;
          etat.enAttente += points * etat.multiplicateur;
        }
      },
      reset() { t = 0; },
    };
  }
  const grindTick = creerAccumulateurTick(TICK_GRIND, POINTS_GRIND);
  const manualTick = creerAccumulateurTick(TICK_MANUAL, POINTS_MANUAL);

  function grinding(dt) { grindTick.update(dt); }
  function manualing(dt) { manualTick.update(dt); }

  /** Sortie de rail : ouvre la fenêtre de grâce de 200 ms (voir en-tête). */
  function finGrind() {
    grindTick.reset();
    if (etat.enAttente > 0) { etat.grace = true; etat.tempsGrace = 0; }
  }

  function finManual() {
    manualTick.reset();
    // Pas de fenêtre de grâce spécifique : le délai standard reprend simplement.
    if (etat.enAttente > 0) etat.tempsDepuisAction = 0;
  }

  function encaisser() {
    etat.score += etat.enAttente;
    etat.enAttente = 0;
    etat.multiplicateur = 1;
    etat.tempsDepuisAction = Infinity;
    etat.grace = false;
  }

  /** §6.7 : un crash fait tout perdre, rien n'est encaissé. */
  function perdreCombo() {
    etat.enAttente = 0;
    etat.multiplicateur = 1;
    etat.tempsDepuisAction = Infinity;
    etat.grace = false;
  }

  /** §6.6 : collectible, hors combo — encaissé immédiatement. */
  function ramasserCollectible(x, y) {
    etat.score += POINTS_COIN;
    emettreBandeau(`+${POINTS_COIN}`, x, y, '#ffc93c');
  }

  /** §6.6 : chunk de collectibles entièrement ramassé sans en rater un. */
  function cleanLine(x, y) {
    etat.score += POINTS_CLEAN_LINE;
    emettreBandeau(`CLEAN LINE +${POINTS_CLEAN_LINE}`, x, y, '#4ed4c4');
  }

  function update(dt) {
    if (etat.grace) {
      etat.tempsGrace += dt;
      if (etat.tempsGrace >= DELAI_GRACE_GRIND) encaisser();
    } else if (etat.tempsDepuisAction < Infinity) {
      etat.tempsDepuisAction += dt;
      if (etat.tempsDepuisAction >= DELAI_EXPIRATION) encaisser();
    }

    bandeaux.forEachActive((b) => {
      b.age += dt;
      if (b.age >= DUREE_BANDEAU) bandeaux.release(b);
    });
  }

  /** Position/opacité d'un bandeau pour le rendu. */
  function etatBandeau(b) {
    const t = b.age / DUREE_BANDEAU;
    return { y: b.y - MONTEE_BANDEAU * t, alpha: 1 - t };
  }

  return {
    etat,
    bandeaux,
    enregistrerTrick,
    grinding,
    manualing,
    finGrind,
    finManual,
    perdreCombo,
    ramasserCollectible,
    cleanLine,
    emettreBandeau,
    // Alias pour les bandeaux « libres » (vie gagnée, changement de niveau) que
    // main.js émet hors du flux normal d'un trick — même signature
    // (texte, x, y, couleur) que emettreBandeau, pas un ordre différent.
    afficherBandeau: emettreBandeau,
    update,
    etatBandeau,
    /** §6.6 : score_run complet, distance comprise. */
    scoreTotal(distanceM) {
      return etat.score + Math.round(distanceM * 2);
    },
  };
}
