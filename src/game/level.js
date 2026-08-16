// Séquenceur de niveau : file de chunks placés, générée au fur et à mesure que
// le rider avance (§2, §8, §9).
//
// Les bonus de vie (croix verte type pharmacie) sont distribués à raison
// de STRICTEMENT UNE FOIS par niveau / palier.

import { createSac, placerSuivant } from './chunks.js';
import { CHUNKS_PAR_PALIER, RESPIRATION, BONUS } from '../data/chunks.js';

const CHUNKS_PAR_CHECKPOINT = 5; // §6.7

export function createLevel({ rng, palierInitial = 1 } = {}) {
  const sacsParPalier = new Map();
  function sacDuPalier(p) {
    if (!sacsParPalier.has(p)) {
      const pool = [...(CHUNKS_PAR_PALIER[p] || CHUNKS_PAR_PALIER[1]), ...RESPIRATION, ...BONUS];
      sacsParPalier.set(p, createSac(pool, rng));
    }
    return sacsParPalier.get(p);
  }

  const placés = [];        // { chunk, offset }
  const checkpoints = [];   // worldX de chaque checkpoint franchi (§6.7)
  const viePlaceeParPalier = new Set();
  let palier = palierInitial;
  let dernierPalierVu = palierInitial;
  let chunksDansCePalier = 0;
  let finPlacée = 0;
  let depuisCheckpoint = 0;

  function pousserUnChunk() {
    if (palier !== dernierPalierVu) {
      dernierPalierVu = palier;
      chunksDansCePalier = 0;
    }
    chunksDansCePalier++;

    let chunk = sacDuPalier(palier).tirer();

    // Exactement UN bonus de vie croix verte par niveau / palier
    if (!viePlaceeParPalier.has(palier) && chunksDansCePalier >= 4) {
      viePlaceeParPalier.add(palier);
      const entitiesAvecVie = [...chunk.entities, { type: 'life_cross', x: 240, y: 55 }];
      chunk = { ...chunk, entities: entitiesAvecVie };
    }

    const dernier = placés[placés.length - 1];
    const offset = dernier ? placerSuivant(dernier.chunk, dernier.offset, chunk) : 0;
    placés.push({ chunk, offset });
    finPlacée = offset + chunk.width;

    depuisCheckpoint++;
    if (depuisCheckpoint >= CHUNKS_PAR_CHECKPOINT) {
      checkpoints.push(finPlacée);
      depuisCheckpoint = 0;
    }
  }

  return {
    placés,
    checkpoints,
    get palier() { return palier; },
    set palier(p) { palier = Math.max(1, Math.min(5, p)); },

    /** Génère assez de chunks pour couvrir jusqu'à `scroll + marge`. */
    assurerJusque(scroll, marge = 960) {
      while (finPlacée < scroll + marge) pousserUnChunk();
    },

    /** Dernier checkpoint déjà franchi par le rider (0 s'il n'y en a pas). */
    dernierCheckpointFranchi(scroll) {
      let dernier = 0;
      for (const cp of checkpoints) {
        if (cp > scroll) break;
        dernier = cp;
      }
      return dernier;
    },
  };
}
