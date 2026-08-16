// Instanciation des entités de niveau à partir des chunks (§6.5, §8).
//
// Les chunks ne bougent jamais : ce sont des positions fixes dans l'espace du
// monde (worldX, en pixels depuis le départ du niveau). C'est le défilement
// qui fait apparaître et disparaître les entités à l'écran. La liste plate est
// donc calculée une seule fois, au chargement du niveau — aucune allocation
// par frame dans la boucle chaude (§14).

import { ENTITIES } from '../data/entities.js';

/** Aplatit une séquence de chunks placés (voir game/chunks.js) en entités. */
export function construireEntites(chunksPlaces) {
  const liste = [];
  for (const { chunk, offset } of chunksPlaces) {
    const chunkInstance = {
      id: chunk.id,
      offset,
      totalCoins: 0,
      coinsRamasses: 0,
      cleanLineAccordee: false,
    };

    // Compter d'abord les coins du chunk
    for (const e of chunk.entities) {
      if (e.type === 'coin') chunkInstance.totalCoins++;
    }

    for (const e of chunk.entities) {
      const def = ENTITIES[e.type];
      if (!def) throw new Error(`type d'entité inconnu : ${e.type}`);
      liste.push({
        type: e.type,
        family: def.family,
        frame: def.frame,
        grindable: def.grindable || false,
        worldX: offset + e.x,
        hitbox: { w: e.w ?? def.hitbox.w, h: def.hitbox.h },
        elevation: e.y || 0, // hauteur au-dessus du sol (rails suspendus, §8)
        collected: false,
        chunkInstance,
      });
    }
  }
  liste.sort((a, b) => a.worldX - b.worldX);
  return liste;
}

/**
 * Sous-ensemble des entités dont le worldX tombe dans [scroll-marge, scroll+marge].
 * `liste` est triée par worldX et `indexDepart` est le curseur renvoyé par
 * l'appel précédent : comme le rider n'avance que dans un sens, ce curseur ne
 * recule jamais et chaque frame ne refiltre qu'une fenêtre, pas tout le niveau.
 */
export function entitesActives(liste, indexDepart, scroll, marge = 600) {
  let i = indexDepart;
  while (i < liste.length && liste[i].worldX < scroll - marge) i++;
  const actives = [];
  for (let j = i; j < liste.length && liste[j].worldX < scroll + marge; j++) {
    actives.push(liste[j]);
  }
  return { actives, indexSuivant: i };
}
