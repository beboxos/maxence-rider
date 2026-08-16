// Séquencement des chunks : tirage en sac et placement garanti sans piège (§8).
//
// Note d'implémentation — l'invariant du §8, comment il est réellement tenu.
//
// « La distance entre le dernier obstacle d'un chunk et le premier du suivant
// doit toujours être ≥ speed × 0.9. » Un chunk fait 480 px de large. À la
// vitesse plafond avec lean (§6.2 : 460 × 1.15 ≈ 529 px/s), le gap requis est
// de ~476 px — quasiment la largeur d'un chunk entier. Si on demandait à
// CHAQUE chunk de rester sûr contre N'IMPORTE QUEL voisin par construction
// statique (dernier obstacle proche du bord gauche ET premier obstacle proche
// du bord droit, pour survivre aux deux rôles), il ne resterait qu'une bande
// utile d'une centaine de pixels au centre de chaque chunk — invivable pour du
// contenu varié, et ça contredit l'exemple même du brief (obstacles à
// x=120, 260, 380, qui ne passerait pas ce test statique).
//
// Le placement compense donc dynamiquement, au moment d'accoler deux chunks :
// l'écart réel entre le dernier obstacle du chunk qui se termine et le premier
// du chunk qui commence est mesuré, et un « rab » silencieux est inséré si
// besoin pour toujours atteindre le gap requis à la vitesse plafond — quelle
// que soit la vitesse réelle au moment où le rider y arrivera. Un chunk vide
// (respiration) n'a pas de dernier obstacle : rien à garantir, rab nul. Ça
// laisse les chunks libres d'être aussi riches que le brief le suggère, tout
// en rendant l'invariant vrai par construction, pas par une contrainte
// d'auteur difficile à respecter et impossible à vérifier à l'œil.

import { VITESSE_MAX_LEAN } from '../data/tuning.js';

export function dernierObstacleX(chunk) {
  let max = -Infinity;
  for (const e of chunk.entities) if (e.x > max) max = e.x;
  return max === -Infinity ? null : max;
}

export function premierObstacleX(chunk) {
  let min = Infinity;
  for (const e of chunk.entities) if (e.x < min) min = e.x;
  return min === Infinity ? null : min;
}

/**
 * Offset du chunk `suivant`, en insérant le rab nécessaire pour respecter
 * l'invariant du §8 à `vitesse` px/s (par défaut, la vitesse plafond avec
 * lean : c'est la seule qui rend la garantie valable "à toutes les vitesses"
 * sans avoir à connaître la vitesse réelle au moment du passage).
 */
export function placerSuivant(precedent, precedentOffset, suivant, vitesse = VITESSE_MAX_LEAN) {
  const finPrecedent = precedentOffset + precedent.width;
  const dernier = dernierObstacleX(precedent);
  const premier = premierObstacleX(suivant);
  if (dernier === null || premier === null) return finPrecedent;

  const requis = vitesse * 0.9;
  const actuel = (precedent.width - dernier) + premier;
  const rab = Math.max(0, requis - actuel);
  return finPrecedent + rab;
}

/** Sac : pioche sans remise dans `chunks`, remélange une fois épuisé (§8). */
export function createSac(chunks, rng) {
  let pioche = [];
  function remplir() {
    pioche = chunks.slice();
    for (let i = pioche.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pioche[i], pioche[j]] = [pioche[j], pioche[i]];
    }
  }
  return {
    tirer() {
      if (pioche.length === 0) remplir();
      return pioche.pop();
    },
  };
}
