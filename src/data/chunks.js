// Bibliothèque de chunks enrichie (§8) : segments de 480 px.
//
// Variété maximale : double grinds, triple grinds, rails longs,
// et bonus de vie croix verte géré à raison de STRICTEMENT 1 par niveau.

const chunk = (id, difficulty, requires, entities) => ({
  id, width: 480, difficulty, requires, ground: 'concrete', entities, decor: [],
});

// ─── Palier 1 — Ollie seul, obstacles bas variés ─────────────────────────────
const PALIER_1 = [
  chunk('p1_curb_seul', 1, ['ollie'], [
    { type: 'curb', x: 220 },
    { type: 'coin', x: 190, y: 25 }, { type: 'coin', x: 220, y: 55 }, { type: 'coin', x: 250, y: 25 },
  ]),
  chunk('p1_cone_seul', 1, ['ollie'], [
    { type: 'cone', x: 260 },
    { type: 'coin', x: 230, y: 25 }, { type: 'coin', x: 260, y: 55 }, { type: 'coin', x: 290, y: 25 },
  ]),
  chunk('p1_hydrant_seul', 1, ['ollie'], [
    { type: 'hydrant', x: 200 },
    { type: 'coin', x: 170, y: 25 }, { type: 'coin', x: 200, y: 55 }, { type: 'coin', x: 230, y: 25 },
  ]),
  chunk('p1_deux_curbs', 1, ['ollie'], [
    { type: 'curb', x: 120 }, { type: 'curb', x: 340 },
    { type: 'coin', x: 120, y: 45 }, { type: 'coin', x: 340, y: 45 },
  ]),
  chunk('p1_cone_hydrant', 1, ['ollie'], [
    { type: 'cone', x: 150 }, { type: 'hydrant', x: 330 },
    { type: 'coin', x: 150, y: 45 }, { type: 'coin', x: 330, y: 50 },
  ]),
  chunk('p1_triple_bas', 1, ['ollie'], [
    { type: 'curb', x: 100 }, { type: 'cone', x: 240 }, { type: 'hydrant', x: 380 },
    { type: 'coin', x: 100, y: 45 }, { type: 'coin', x: 240, y: 45 }, { type: 'coin', x: 380, y: 50 },
  ]),
  chunk('p1_curb_long_grind', 1, ['ollie'], [
    { type: 'curb', x: 140 }, { type: 'curb', x: 220 }, { type: 'cone', x: 380 },
    { type: 'coin', x: 140, y: 35 }, { type: 'coin', x: 220, y: 35 }, { type: 'coin', x: 380, y: 45 },
  ]),
];

// ─── Palier 2 — Flip, obstacles hauts & premiers grinds ──────────────────────
const PALIER_2 = [
  chunk('p2_poubelle_seule', 2, ['ollie', 'flip'], [
    { type: 'bin', x: 220 },
    { type: 'coin', x: 180, y: 40 }, { type: 'coin', x: 220, y: 80 }, { type: 'coin', x: 260, y: 40 },
  ]),
  chunk('p2_banc_seul', 2, ['ollie', 'flip'], [
    { type: 'bench', x: 240 },
    { type: 'coin', x: 200, y: 40 }, { type: 'coin', x: 240, y: 75 }, { type: 'coin', x: 280, y: 40 },
  ]),
  chunk('p2_distributeur', 2, ['ollie', 'flip'], [
    { type: 'vending', x: 200 },
    { type: 'coin', x: 160, y: 50 }, { type: 'coin', x: 200, y: 95 }, { type: 'coin', x: 240, y: 50 },
  ]),
  chunk('p2_mix_bas_haut', 2, ['ollie', 'flip'], [
    { type: 'curb', x: 90 }, { type: 'planter', x: 260 },
    { type: 'coin', x: 90, y: 45 }, { type: 'coin', x: 260, y: 80 },
  ]),
  chunk('p2_jardiniere_poubelle', 2, ['ollie', 'flip'], [
    { type: 'planter', x: 140 }, { type: 'bin', x: 340 },
    { type: 'coin', x: 140, y: 80 }, { type: 'coin', x: 340, y: 80 },
  ]),
  chunk('p2_enchainement_hauts', 2, ['ollie', 'flip'], [
    { type: 'bench', x: 110 }, { type: 'cone', x: 220 }, { type: 'vending', x: 360 },
    { type: 'coin', x: 110, y: 75 }, { type: 'coin', x: 220, y: 45 }, { type: 'coin', x: 360, y: 95 },
  ]),
  chunk('p2_banc_grind_curb', 2, ['ollie', 'flip'], [
    { type: 'curb', x: 110 }, { type: 'bench', x: 260 }, { type: 'curb', x: 400 },
    { type: 'coin', x: 110, y: 45 }, { type: 'coin', x: 260, y: 80 }, { type: 'coin', x: 400, y: 45 },
  ]),
];

// ─── Palier 3 — Boost, gaps & rails combinés ─────────────────────────────────
const PALIER_3 = [
  chunk('p3_gap_seul', 3, ['ollie', 'flip', 'boost'], [
    { type: 'gap', x: 220, w: 90 },
    { type: 'coin', x: 170, y: 35 }, { type: 'coin', x: 220, y: 85 }, { type: 'coin', x: 270, y: 35 },
  ]),
  chunk('p3_gap_large', 3, ['ollie', 'flip', 'boost'], [
    { type: 'gap', x: 200, w: 120 },
    { type: 'coin', x: 140, y: 35 }, { type: 'coin', x: 200, y: 95 }, { type: 'coin', x: 260, y: 35 },
  ]),
  chunk('p3_curb_gap', 3, ['ollie', 'flip', 'boost'], [
    { type: 'curb', x: 80 }, { type: 'gap', x: 260, w: 90 },
    { type: 'coin', x: 80, y: 45 }, { type: 'coin', x: 260, y: 85 },
  ]),
  chunk('p3_gap_poubelle', 3, ['ollie', 'flip', 'boost'], [
    { type: 'gap', x: 150, w: 80 }, { type: 'bin', x: 360 },
    { type: 'coin', x: 150, y: 85 }, { type: 'coin', x: 360, y: 80 },
  ]),
  chunk('p3_double_gap', 3, ['ollie', 'flip', 'boost'], [
    { type: 'gap', x: 110, w: 70 }, { type: 'gap', x: 320, w: 70 },
    { type: 'coin', x: 110, y: 80 }, { type: 'coin', x: 215, y: 45 }, { type: 'coin', x: 320, y: 80 },
  ]),
  chunk('p3_mix_complet', 3, ['ollie', 'flip', 'boost'], [
    { type: 'cone', x: 70 }, { type: 'gap', x: 200, w: 90 }, { type: 'bench', x: 380 },
    { type: 'coin', x: 70, y: 45 }, { type: 'coin', x: 200, y: 85 }, { type: 'coin', x: 380, y: 75 },
  ]),
  chunk('p3_gap_rail_jump', 3, ['ollie', 'flip', 'boost'], [
    { type: 'rail', x: 120, y: 4 }, { type: 'gap', x: 300, w: 80 },
    { type: 'coin', x: 120, y: 30 }, { type: 'coin', x: 300, y: 85 },
  ]),
];

// ─── Palier 4 — Rampes, doubles et triples grinds ────────────────────────────
const PALIER_4 = [
  chunk('p4_rampe_seule', 4, ['ollie', 'flip', 'boost'], [
    { type: 'quarterpipe', x: 200 },
    { type: 'coin', x: 200, y: 55 }, { type: 'coin', x: 230, y: 75 }, { type: 'coin', x: 260, y: 55 },
  ]),
  chunk('p4_escalier', 4, ['ollie', 'flip', 'boost'], [
    { type: 'stairs', x: 220 },
    { type: 'coin', x: 200, y: 35 }, { type: 'coin', x: 240, y: 50 },
  ]),
  chunk('p4_rail_long', 4, ['ollie', 'flip', 'boost'], [
    { type: 'railLong', x: 220, y: 4 },
    { type: 'coin', x: 160, y: 25 }, { type: 'coin', x: 220, y: 25 }, { type: 'coin', x: 280, y: 25 },
  ]),
  // ⚡ Double Grind avec saut au milieu
  chunk('p4_double_grind', 4, ['ollie', 'flip', 'boost'], [
    { type: 'rail', x: 120, y: 4 }, { type: 'rail', x: 340, y: 4 },
    { type: 'coin', x: 120, y: 25 }, { type: 'coin', x: 230, y: 55 }, { type: 'coin', x: 340, y: 25 },
  ]),
  // ⚡ Triple Grind successif (Rail -> Curb -> Rail)
  chunk('p4_triple_grind', 4, ['ollie', 'flip', 'boost'], [
    { type: 'rail', x: 90, y: 4 }, { type: 'curb', x: 230 }, { type: 'rail', x: 370, y: 4 },
    { type: 'coin', x: 90, y: 25 }, { type: 'coin', x: 230, y: 35 }, { type: 'coin', x: 370, y: 25 },
  ]),
  chunk('p4_rampe_double_rail', 4, ['ollie', 'flip', 'boost'], [
    { type: 'quarterpipe', x: 70 }, { type: 'rail', x: 210, y: 4 }, { type: 'rail', x: 370, y: 4 },
    { type: 'coin', x: 70, y: 60 }, { type: 'coin', x: 210, y: 25 }, { type: 'coin', x: 370, y: 25 },
  ]),
  chunk('p4_escalier_gap', 4, ['ollie', 'flip', 'boost'], [
    { type: 'stairs', x: 90 }, { type: 'gap', x: 280, w: 80 },
    { type: 'coin', x: 90, y: 45 }, { type: 'coin', x: 280, y: 85 },
  ]),
];

// ─── Palier 5 — Gauntlets ultra-rythmés, combos extrêmes ─────────────────────
const PALIER_5 = [
  chunk('p5_gauntlet_1', 5, ['ollie', 'flip', 'boost'], [
    { type: 'curb', x: 60 }, { type: 'bin', x: 160 }, { type: 'gap', x: 280, w: 80 }, { type: 'rail', x: 400, y: 4 },
    { type: 'coin', x: 60, y: 45 }, { type: 'coin', x: 160, y: 80 }, { type: 'coin', x: 280, y: 85 }, { type: 'coin', x: 400, y: 25 },
  ]),
  // ⚡ Triple Grind Gauntlet
  chunk('p5_triple_grind_gauntlet', 5, ['ollie', 'flip', 'boost'], [
    { type: 'railKinked', x: 80, y: 4 }, { type: 'curb', x: 230 }, { type: 'railLong', x: 380, y: 4 },
    { type: 'coin', x: 80, y: 25 }, { type: 'coin', x: 230, y: 55 }, { type: 'coin', x: 380, y: 25 },
  ]),
  chunk('p5_gauntlet_2', 5, ['ollie', 'flip', 'boost'], [
    { type: 'cone', x: 50 }, { type: 'quarterpipe', x: 150 }, { type: 'planter', x: 300 }, { type: 'hydrant', x: 400 },
    { type: 'coin', x: 50, y: 45 }, { type: 'coin', x: 150, y: 65 }, { type: 'coin', x: 300, y: 80 }, { type: 'coin', x: 400, y: 50 },
  ]),
  chunk('p5_gauntlet_3', 5, ['ollie', 'flip', 'boost'], [
    { type: 'gap', x: 70, w: 70 }, { type: 'bench', x: 220 }, { type: 'stairs', x: 340 },
    { type: 'coin', x: 70, y: 80 }, { type: 'coin', x: 220, y: 75 }, { type: 'coin', x: 340, y: 45 },
  ]),
  chunk('p5_gauntlet_4', 5, ['ollie', 'flip', 'boost'], [
    { type: 'railLong', x: 100, y: 4 }, { type: 'cone', x: 260 }, { type: 'gap', x: 370, w: 70 },
    { type: 'coin', x: 100, y: 25 }, { type: 'coin', x: 260, y: 45 }, { type: 'coin', x: 370, y: 80 },
  ]),
  chunk('p5_gauntlet_5', 5, ['ollie', 'flip', 'boost'], [
    { type: 'vending', x: 60 }, { type: 'curb', x: 180 }, { type: 'planter', x: 300 }, { type: 'hydrant', x: 400 },
    { type: 'coin', x: 60, y: 95 }, { type: 'coin', x: 180, y: 45 }, { type: 'coin', x: 300, y: 80 }, { type: 'coin', x: 400, y: 50 },
  ]),
  chunk('p5_gauntlet_6', 5, ['ollie', 'flip', 'boost'], [
    { type: 'quarterpipe', x: 60 }, { type: 'gap', x: 200, w: 80 }, { type: 'bin', x: 340 }, { type: 'cone', x: 420 },
    { type: 'coin', x: 60, y: 65 }, { type: 'coin', x: 200, y: 85 }, { type: 'coin', x: 340, y: 80 }, { type: 'coin', x: 420, y: 45 },
  ]),
];

// ─── Respiration — vides, pour souffler après une séquence intense ──────────
export const RESPIRATION = [
  chunk('respiration_1', 0, [], []),
  chunk('respiration_2', 0, [], []),
  chunk('respiration_3', 0, [], []),
];

// ─── Bonus — rails longs et lignes de pièces ────────────────────────────────
export const BONUS = [
  chunk('bonus_super_grind', 0, ['ollie', 'flip', 'boost'], [
    { type: 'railLong', x: 140, y: 4 }, { type: 'railLong', x: 340, y: 4 },
    { type: 'coin', x: 80, y: 25 }, { type: 'coin', x: 140, y: 25 }, { type: 'coin', x: 240, y: 45 },
    { type: 'coin', x: 300, y: 25 }, { type: 'coin', x: 360, y: 25 },
  ]),
  chunk('bonus_combo_garanti', 0, ['ollie', 'flip', 'boost'], [
    { type: 'quarterpipe', x: 80 }, { type: 'rail', x: 220, y: 4 }, { type: 'quarterpipe', x: 380 },
    { type: 'coin', x: 80, y: 65 }, { type: 'coin', x: 150, y: 35 }, { type: 'coin', x: 220, y: 25 },
    { type: 'coin', x: 290, y: 35 }, { type: 'coin', x: 380, y: 65 },
  ]),
  chunk('bonus_ligne_bas', 0, ['ollie'], [
    { type: 'curb', x: 100 }, { type: 'cone', x: 220 }, { type: 'hydrant', x: 340 },
    { type: 'coin', x: 100, y: 45 }, { type: 'coin', x: 160, y: 20 }, { type: 'coin', x: 220, y: 45 },
    { type: 'coin', x: 280, y: 20 }, { type: 'coin', x: 340, y: 50 },
  ]),
];

export const CHUNKS_PAR_PALIER = {
  1: PALIER_1, 2: PALIER_2, 3: PALIER_3, 4: PALIER_4, 5: PALIER_5,
};

export const TOUS_LES_CHUNKS = [
  ...PALIER_1, ...PALIER_2, ...PALIER_3, ...PALIER_4, ...PALIER_5,
  ...RESPIRATION, ...BONUS,
];
