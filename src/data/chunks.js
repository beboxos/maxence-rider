// Bibliothèque de chunks (§8) : segments de 480 px, purement déclaratifs.
//
// `entities[].x` est une position LOCALE au chunk (0..480) ; game/chunks.js se
// charge de l'espacement entre chunks (voir son commentaire d'en-tête pour le
// pourquoi de l'invariant §8). Ici, on écrit du contenu naturel, sans se
// soucier des bords — exactement comme l'exemple du brief lui-même.
//
// Les collectibles (`coin`) n'existent pas encore : le scoring arrive en P4
// (§6.6). Le format accueillera le champ sans changer de forme.
//
// Structure demandée par le brief : 6 chunks par palier de difficulté (1 à 5),
// plus 3 chunks « respiration » (vides) et 3 chunks « bonus » (combo garanti).

const chunk = (id, difficulty, requires, entities) => ({
  id, width: 480, difficulty, requires, ground: 'concrete', entities, decor: [],
});

// ─── Palier 1 — Ollie seul, obstacles bas isolés ─────────────────────────────
const PALIER_1 = [
  chunk('p1_curb_seul', 1, ['ollie'], [{ type: 'curb', x: 220 }]),
  chunk('p1_cone_seul', 1, ['ollie'], [{ type: 'cone', x: 260 }]),
  chunk('p1_hydrant_seul', 1, ['ollie'], [{ type: 'hydrant', x: 200 }]),
  chunk('p1_deux_curbs', 1, ['ollie'], [{ type: 'curb', x: 120 }, { type: 'curb', x: 340 }]),
  chunk('p1_cone_hydrant', 1, ['ollie'], [{ type: 'cone', x: 150 }, { type: 'hydrant', x: 330 }]),
  chunk('p1_triple_bas', 1, ['ollie'], [
    { type: 'curb', x: 100 }, { type: 'cone', x: 240 }, { type: 'hydrant', x: 380 },
  ]),
];

// ─── Palier 2 — Flip, obstacles hauts ────────────────────────────────────────
const PALIER_2 = [
  chunk('p2_poubelle_seule', 2, ['ollie', 'flip'], [{ type: 'bin', x: 220 }]),
  chunk('p2_banc_seul', 2, ['ollie', 'flip'], [{ type: 'bench', x: 240 }]),
  chunk('p2_distributeur', 2, ['ollie', 'flip'], [{ type: 'vending', x: 200 }]),
  chunk('p2_mix_bas_haut', 2, ['ollie', 'flip'], [
    { type: 'curb', x: 90 }, { type: 'planter', x: 260 },
  ]),
  chunk('p2_jardiniere_poubelle', 2, ['ollie', 'flip'], [
    { type: 'planter', x: 140 }, { type: 'bin', x: 340 },
  ]),
  chunk('p2_enchainement_hauts', 2, ['ollie', 'flip'], [
    { type: 'bench', x: 110 }, { type: 'cone', x: 220 }, { type: 'vending', x: 360 },
  ]),
];

// ─── Palier 3 — Boost, gaps ───────────────────────────────────────────────────
const PALIER_3 = [
  chunk('p3_gap_seul', 3, ['ollie', 'flip', 'boost'], [{ type: 'gap', x: 220, w: 90 }]),
  chunk('p3_gap_large', 3, ['ollie', 'flip', 'boost'], [{ type: 'gap', x: 200, w: 120 }]),
  chunk('p3_curb_gap', 3, ['ollie', 'flip', 'boost'], [
    { type: 'curb', x: 80 }, { type: 'gap', x: 260, w: 90 },
  ]),
  chunk('p3_gap_poubelle', 3, ['ollie', 'flip', 'boost'], [
    { type: 'gap', x: 150, w: 80 }, { type: 'bin', x: 360 },
  ]),
  chunk('p3_double_gap', 3, ['ollie', 'flip', 'boost'], [
    { type: 'gap', x: 110, w: 70 }, { type: 'gap', x: 320, w: 70 },
  ]),
  chunk('p3_mix_complet', 3, ['ollie', 'flip', 'boost'], [
    { type: 'cone', x: 70 }, { type: 'gap', x: 200, w: 90 }, { type: 'bench', x: 380 },
  ]),
];

// ─── Palier 4 — Rampes, grinds ────────────────────────────────────────────────
const PALIER_4 = [
  chunk('p4_rampe_seule', 4, ['ollie', 'flip', 'boost'], [{ type: 'quarterpipe', x: 200 }]),
  chunk('p4_escalier', 4, ['ollie', 'flip', 'boost'], [{ type: 'stairs', x: 220 }]),
  chunk('p4_rail_droit', 4, ['ollie', 'flip', 'boost'], [{ type: 'rail', x: 190, y: 4 }]),
  chunk('p4_rail_kinked', 4, ['ollie', 'flip', 'boost'], [{ type: 'railKinked', x: 190, y: 4 }]),
  chunk('p4_rampe_rail', 4, ['ollie', 'flip', 'boost'], [
    { type: 'quarterpipe', x: 80 }, { type: 'rail', x: 280, y: 4 },
  ]),
  chunk('p4_escalier_gap', 4, ['ollie', 'flip', 'boost'], [
    { type: 'stairs', x: 90 }, { type: 'gap', x: 280, w: 80 },
  ]),
];

// ─── Palier 5 — Densité maximale, tout mélangé ───────────────────────────────
const PALIER_5 = [
  chunk('p5_gauntlet_1', 5, ['ollie', 'flip', 'boost'], [
    { type: 'curb', x: 60 }, { type: 'bin', x: 160 }, { type: 'gap', x: 280, w: 80 }, { type: 'rail', x: 400, y: 4 },
  ]),
  chunk('p5_gauntlet_2', 5, ['ollie', 'flip', 'boost'], [
    { type: 'cone', x: 50 }, { type: 'quarterpipe', x: 150 }, { type: 'planter', x: 300 }, { type: 'hydrant', x: 400 },
  ]),
  chunk('p5_gauntlet_3', 5, ['ollie', 'flip', 'boost'], [
    { type: 'gap', x: 70, w: 70 }, { type: 'bench', x: 220 }, { type: 'stairs', x: 340 },
  ]),
  chunk('p5_gauntlet_4', 5, ['ollie', 'flip', 'boost'], [
    { type: 'railKinked', x: 60, y: 4 }, { type: 'cone', x: 250 }, { type: 'gap', x: 360, w: 70 },
  ]),
  chunk('p5_gauntlet_5', 5, ['ollie', 'flip', 'boost'], [
    { type: 'vending', x: 60 }, { type: 'curb', x: 180 }, { type: 'planter', x: 300 }, { type: 'hydrant', x: 400 },
  ]),
  chunk('p5_gauntlet_6', 5, ['ollie', 'flip', 'boost'], [
    { type: 'quarterpipe', x: 60 }, { type: 'gap', x: 200, w: 80 }, { type: 'bin', x: 340 }, { type: 'cone', x: 420 },
  ]),
];

// ─── Respiration — vides, pour laisser souffler après une séquence dure ─────
export const RESPIRATION = [
  chunk('respiration_1', 0, [], []),
  chunk('respiration_2', 0, [], []),
  chunk('respiration_3', 0, [], []),
];

// ─── Bonus — rail long, ligne de coins (les coins arrivent en P4) ────────────
export const BONUS = [
  chunk('bonus_rail_long', 0, ['ollie', 'flip', 'boost'], [
    { type: 'rail', x: 130, y: 4 }, { type: 'rail', x: 260, y: 4 },
  ]),
  chunk('bonus_combo_garanti', 0, ['ollie', 'flip', 'boost'], [
    { type: 'quarterpipe', x: 80 }, { type: 'rail', x: 220, y: 4 }, { type: 'quarterpipe', x: 380 },
  ]),
  chunk('bonus_ligne_bas', 0, ['ollie'], [
    { type: 'curb', x: 100 }, { type: 'cone', x: 220 }, { type: 'hydrant', x: 340 },
  ]),
];

export const CHUNKS_PAR_PALIER = {
  1: PALIER_1, 2: PALIER_2, 3: PALIER_3, 4: PALIER_4, 5: PALIER_5,
};

export const TOUS_LES_CHUNKS = [
  ...PALIER_1, ...PALIER_2, ...PALIER_3, ...PALIER_4, ...PALIER_5,
  ...RESPIRATION, ...BONUS,
];
