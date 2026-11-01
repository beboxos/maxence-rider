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
// Tolérances de « game feel » : elles pardonnent une erreur que le joueur ne
// perçoit pas, sans jamais rendre un obstacle plus facile à franchir en visant juste.
const CORNER_PX = 4;        // pieds à ≤ 4 px sous le sommet d'un obstacle : on les remonte dessus
const GRACE_GAP_S = 0.06;   // saut tardif au bord d'un gap : le sol « tient » encore 60 ms
export const AIMANT_RAIL_PX = 16; // atterrir à ≤ 16 px d'un bout de rail l'accroche quand même

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

/** Vrai si le centre du rider est au-dessus de l'entité, à AIMANT_RAIL_PX près de chaque bout. */
function centreSurObstacle(entity, player, scrollApres) {
  const ex = player.x + player.direction * (entity.worldX - scrollApres);
  return Math.abs(player.x - ex) <= (entity.hitbox?.w || 12) / 2 + AIMANT_RAIL_PX;
}

/**
 * Aimant à rail : un rider qui retombe juste avant ou juste après un rail (son corps ne le
 * recouvre pas encore) est accroché si ses pieds franchissent le dessus du rail dans ce pas.
 * Sans lui, un saut parti un peu trop tôt ou trop tard dépose le rider à côté du rail.
 */
function aimantRail(entity, player, solY, scrollApres) {
  if (!(entity.grindable || entity.family === Family.RAIL)) return false;
  const sommet = solY - (entity.elevation || 0) - entity.hitbox.h;
  if (!(player.prevY < sommet - TOLERANCE && (player.vy >= 0 || player.y >= player.prevY))) return false;
  const piedsMin = Math.min(player.prevY, player.y);
  const piedsMax = Math.max(player.prevY, player.y);
  if (!(piedsMin <= sommet + TOLERANCE && piedsMax >= sommet - TOLERANCE)) return false;
  return centreSurObstacle(entity, player, scrollApres);
}

/**
 * Résout la collision rider/entité pour ce pas de simulation.
 * @param {number} scrollAvant  défilement du monde au début du pas
 * @param {number} scrollApres  défilement du monde à la fin du pas
 * @returns {'none'|'crash'|'ramp'|'clear'|'grind'|'collect'|'corner'}
 *   none    — aucun contact
 *   crash   — collision, §6.7
 *   ramp    — contact avec une rampe : bonus de trajectoire, jamais de crash
 *   clear   — franchi sans dommage (par-dessus un solide/rail, par-dessous un rail élevé)
 *   grind   — atterrissage descendant sur rail/curb avec overlap ≥ 60 %, §6.4
 *   collect — pièce / canette ramassée au vol, §6.6
 *   corner  — pieds à ≤ CORNER_PX sous le sommet d'un obstacle non grindable :
 *             l'appelant remonte le rider dessus (jamais un crash)
 */
export function resoudre(entity, player, solY, scrollAvant, scrollApres) {
  if (entity.family === Family.DECOR) return 'none';
  if (!balayageX(entity, player.x, scrollAvant, scrollApres, player.direction)) {
    return aimantRail(entity, player, solY, scrollApres) ? 'grind' : 'none';
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
    if (!(player.auSol && player.y >= solY - TOLERANCE)) return 'none';
    // Coyote time : le rider n'est « tombé » que lorsque son centre a dépassé le
    // bord d'entrée d'au moins vitesse × GRACE_GAP_S. Un saut pressé un peu tard
    // (auSol → false) passe alors avant le crash.
    const demi = (entity.hitbox?.w || 12) / 2;
    const ex = player.x + player.direction * (entity.worldX - scrollApres);
    const profondeur = player.direction > 0 ? player.x - (ex - demi) : (ex + demi) - player.x;
    return profondeur >= (player.vitesse || 0) * GRACE_GAP_S ? 'crash' : 'none';
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
      if (ratio >= SEUIL_OVERLAP_GRIND || centreSurObstacle(entity, player, scrollApres)) {
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

  // Corner correction : un saut qui rate le sommet de quelques pixels (≤ CORNER_PX)
  // remonte sur l'obstacle au lieu de heurter sa face. Seul un rider déjà en
  // l'air et qui ne monte plus est concerné ; roulé au sol contre l'obstacle,
  // l'enfoncement vaut toute sa hauteur et le crash reste.
  const enfoncement = piedsMax - sommet;
  if (enfoncement <= CORNER_PX && player.prevY < sommet + CORNER_PX && !(player.vy < 0)) {
    return estGrindable ? 'grind' : 'corner';
  }

  return 'crash';
}
