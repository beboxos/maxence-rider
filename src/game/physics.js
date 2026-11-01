// Collisions swept AABB entre le rider et les entités de jeu (§6.5).
//
// Le rider ne se déplace jamais en X à l'écran : c'est le monde qui défile
// sous lui (§6.2), player.x reste fixe à 30 % de l'écran. La collision se
// ramène donc à un test d'intervalle : à quel moment, pendant le pas de
// simulation, l'intervalle X (mobile, porté par le défilement) de l'entité
// a-t-il recoupé la bande X (fixe) du rider ? Sans ce test « balayé » — pas
// seulement échantillonné au début et à la fin du pas — un obstacle pourrait
// franchir la bande du rider *entre* deux frames à 460+ px/s sans jamais
// déclencher de collision : c'est le tunneling que le §6.5 demande d'éviter.
//
// Vertical, le même principe s'applique en sens inverse : les pieds du rider
// sont balayés entre prevY et y, comparés à la tranche verticale [sommet, bas]
// de l'obstacle. Trois issues possibles : passé par-dessus (jamais descendu
// sous le sommet), passé par-dessous (jamais monté au-dessus du bas — le cas
// d'un rail élevé sous lequel on roule), ou collision.

import { Family } from '../data/entities.js';

export const LARGEUR_RIDER = 14; // hitbox du rider, plus étroite que le sprite (§3)
const HAUTEUR_RIDER = 45;
const TOLERANCE = 2; // px, absorbe les arrondis de rendu
const SEUIL_OVERLAP_GRIND = 0.60; // §6.4 : chevauchement horizontal ≥ 60 %

/** Position écran d'une entité à `t` ∈ [0,1] du pas, entre deux positions de scroll. */
function screenX(worldX, playerX, scrollAvant, scrollApres, direction, t) {
  const scroll = scrollAvant + (scrollApres - scrollAvant) * t;
  return playerX + direction * (worldX - scroll);
}

/** Vrai si l'intervalle X balayé de l'entité a pu croiser la bande du rider. */
function balayageX(entity, playerX, scrollAvant, scrollApres, direction) {
  const demiLargeur = (entity.hitbox?.w || 12) / 2;
  const x0 = screenX(entity.worldX, playerX, scrollAvant, scrollApres, direction, 0) - demiLargeur;
  const x1 = screenX(entity.worldX, playerX, scrollAvant, scrollApres, direction, 1) - demiLargeur;
  const xMin = Math.min(x0, x1);
  const xMax = Math.max(x0, x1) + (entity.hitbox?.w || 12);
  const pMin = playerX - LARGEUR_RIDER / 2;
  const pMax = playerX + LARGEUR_RIDER / 2;
  return xMin < pMax && xMax > pMin;
}

/** Ratio de chevauchement horizontal entre le rider et l'entité. */
export function chevauchementHorizontal(entity, playerX, scroll, direction) {
  const demiLargeur = (entity.hitbox?.w || 12) / 2;
  const ex = playerX + direction * (entity.worldX - scroll);
  const eMin = ex - demiLargeur;
  const eMax = ex + demiLargeur;
  const pMin = playerX - LARGEUR_RIDER / 2;
  const pMax = playerX + LARGEUR_RIDER / 2;
  const inter = Math.max(0, Math.min(pMax, eMax) - Math.max(pMin, eMin));
  return inter / LARGEUR_RIDER;
}

/**
 * Résout la collision rider/entité pour ce pas de simulation.
 * @param {number} scrollAvant  défilement du monde au début du pas
 * @param {number} scrollApres  défilement du monde à la fin du pas
 * @returns {'none'|'crash'|'ramp'|'clear'|'grind'|'collect'}
 *   none    — aucun contact
 *   crash   — collision, §6.7
 *   ramp    — contact avec une rampe : bonus de trajectoire, jamais de crash
 *   clear   — franchi sans dommage (par-dessus un solide/rail, par-dessous un rail élevé)
 *   grind   — atterrissage descendant sur rail/curb avec overlap ≥ 60 %, §6.4
 *   collect — pièce / canette ramassée au vol, §6.6
 */
export function resoudre(entity, player, solY, scrollAvant, scrollApres) {
  if (entity.family === Family.DECOR) return 'none';
  if (!balayageX(entity, player.x, scrollAvant, scrollApres, player.direction)) {
    return 'none';
  }

  // §6.6 : Collectibles (canettes / coins)
  if (entity.family === Family.COLLECTIBLE) {
    if (entity.collected) return 'none';
    const cY = solY - (entity.elevation || 0);
    const halfH = (entity.hitbox?.h || 12) / 2;
    const cMinY = cY - halfH;
    const cMaxY = cY + halfH;
    const pMinY = Math.min(player.prevY, player.y) - HAUTEUR_RIDER;
    const pMaxY = Math.max(player.prevY, player.y);
    if (pMaxY >= cMinY && pMinY <= cMaxY) {
      return 'collect';
    }
    return 'none';
  }

  if (entity.family === Family.GAP) {
    // §6.5 : tomber dedans exige d'être au sol ; un saut par-dessus n'y touche pas.
    return player.auSol && player.y >= solY - TOLERANCE ? 'crash' : 'none';
  }

  const bas = solY - (entity.elevation || 0);
  const piedsMax = Math.max(player.prevY, player.y); // point le plus bas atteint pendant le pas
  const piedsMin = Math.min(player.prevY, player.y); // point le plus haut atteint pendant le pas

  if (entity.family === Family.RAMP) {
    // Contact seulement si le rider est proche du sol/de la rampe — survoler
    // sa tranche X en plein vol ne déclenche pas le bonus.
    return piedsMax >= bas - TOLERANCE ? 'ramp' : 'none';
  }

  const sommet = bas - entity.hitbox.h;

  // §6.4 : Détection du Grind sur rail / curb
  // Condition : obstacle grindable, en l'air *par rapport à cet obstacle*,
  // vitesse descendante (vy >= 0), et les pieds franchissent la surface
  // supérieure [sommet - TOLERANCE, sommet + TOLERANCE].
  //
  // On teste `player.prevY` contre `sommet` plutôt que `player.auSol` : pour un
  // curb posé au ras du sol, majPhysique() a déjà reposé le rider sur le sol
  // général (et remis auSol à true) avant que cette fonction ne s'exécute pour
  // ce pas — auSol ment donc sur l'état réel vis-à-vis de CET obstacle précis.
  const estGrindable = entity.grindable || entity.family === Family.RAIL;
  const etaitAuDessusDeLObstacle = player.prevY < sommet - TOLERANCE;
  if (estGrindable && etaitAuDessusDeLObstacle && (player.vy >= 0 || player.y >= player.prevY)) {
    const toucheSommet = piedsMin <= sommet + TOLERANCE && piedsMax >= sommet - TOLERANCE;
    if (toucheSommet) {
      const ratio = chevauchementHorizontal(entity, player.x, scrollApres, player.direction);
      if (ratio >= SEUIL_OVERLAP_GRIND) {
        return 'grind';
      }
    }
  }

  // LOW, HIGH, RAIL : trois issues selon où sont passés les pieds pendant le pas.
  if (piedsMax <= sommet + TOLERANCE) return 'clear'; // resté au-dessus tout le pas

  // « Passé par-dessous » n'a de sens que s'il existe un vrai espace physique
  // sous l'obstacle (elevation > 0, un rail suspendu par exemple). Un obstacle
  // posé au sol a bas === solY : un rider au sol a alors piedsMin === bas à
  // l'exacte tolérance près, ce qui validerait à tort "passé dessous" pour un
  // simple curb qu'on n'a pas sauté.
  if (entity.elevation > 0 && piedsMin >= bas - TOLERANCE) return 'clear';

  return 'crash';
}
