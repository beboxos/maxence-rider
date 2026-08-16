// Description des planches contact fournies dans assets/raw/.
// Les planches partagent la même grille : 6 bandes de cases, un séparateur
// vertical central qui sépare la version « Gauche » de la version « Droite ».
//
// Deux modes de découpe par bande :
//   'grid'    → n cases régulières entre les bords du bloc. Pour les planches
//               personnage (une frame d'anim par case) et les tuiles de sol/mur.
//   'objects' → segmentation par composantes connexes sur tout le bloc. Pour les
//               décors, où Gemini a posé plusieurs objets par case et laissé des
//               rails déborder sur trois cases : découper à la case les couperait.
//
// Règle §3 du brief : on n'importe que la version Droite, le rendu gauche est un
// flip horizontal. Exception pour les bandes où les deux moitiés ne sont pas
// miroir l'une de l'autre (Sols vs Murs, Atmosphère vs Décors de Rue) : les deux
// côtés sont alors déclarés explicitement.

// Bornes verticales des bandes, communes aux 5 planches (affinées à l'exécution).
const ROW = {
  r1: [133, 371],
  r2: [459, 709],
  r3: [797, 1012],
  r4: [1101, 1315],
  r5: [1404, 1677],
  r5a: [1405, 1541], // bande 5 quand elle est scindée en deux rangées de tuiles
  r5b: [1541, 1678],
  r6: [1778, 2001],
};

// Bornes horizontales des blocs (affinées à l'exécution).
const LEFT = [20, 1040];
const RIGHT = [1073, 2090];
// Bande BONUS/IDLE : chaque moitié est scindée en deux cadres accolés.
const L_A = [19, 527], L_B = [536, 1041];
const R_A = [1069, 1576], R_B = [1585, 2090];

const rider = (prefix, special) => [
  { row: ROW.r1, block: RIGHT, mode: 'grid', count: 5, name: `${prefix}.roll` },
  { row: ROW.r2, block: RIGHT, mode: 'grid', count: 5, name: `${prefix}.ollie` },
  { row: ROW.r3, block: RIGHT, mode: 'grid', count: 7, name: `${prefix}.flip` },
  { row: ROW.r4, block: RIGHT, mode: 'grid', count: 6, name: `${prefix}.${special}` },
  { row: ROW.r5, block: RIGHT, mode: 'grid', count: 6, name: `${prefix}.crash` },
  { row: ROW.r6, block: R_A, mode: 'grid', count: 3, name: `${prefix}.grind` },
  { row: ROW.r6, block: R_B, mode: 'grid', count: 3, name: `${prefix}.idle` },
];

export const SHEETS = [
  {
    file: 'skate_prodigy.png',
    category: 'skate',
    bands: rider('skate', 'nocomply'),
  },
  {
    file: 'roller_prodigy.png',
    category: 'roller',
    bands: rider('roller', 'manual'),
  },
  {
    file: 'decors_obstacles.png',
    category: 'decor',
    bands: [
      { row: ROW.r1, block: RIGHT, mode: 'objects', name: 'park' },
      { row: ROW.r2, block: RIGHT, mode: 'objects', name: 'urban' },
      // Les rails et les curbs traversent trois cases : il faut recoller les
      // morceaux horizontalement, sans coller entre elles les rangées empilées.
      { row: ROW.r3, block: RIGHT, mode: 'objects', name: 'rail', heal: 16, segment: { gapX: 34, gapY: 3 } },
      { row: ROW.r4, block: RIGHT, mode: 'objects', name: 'prop' },
      { row: ROW.r5a, block: LEFT, mode: 'grid', count: 6, name: 'ground' },
      { row: ROW.r5b, block: LEFT, mode: 'grid', count: 6, name: 'wall' },
      { row: ROW.r6, block: R_A, mode: 'objects', name: 'fx.spark' },
      { row: ROW.r6, block: R_B, mode: 'objects', name: 'fx.dust' },
    ],
  },
  {
    file: 'decors_obstacles_2.png',
    category: 'decor',
    // Les 5 premières bandes doublonnent decors_obstacles ; seule la bande
    // « Modules compatibles avec rails » est propre à cette planche.
    bands: [
      { row: ROW.r6, block: RIGHT, mode: 'objects', name: 'bonus' },
    ],
  },
  {
    file: 'terrain_atmosphere.png',
    category: 'decor',
    bands: [
      // Gemini a posé deux distributeurs en tête de la rangée « Sols » : ce sont
      // des doublons de `prop`, on les écarte.
      {
        row: ROW.r4, block: LEFT, mode: 'grid', count: 6, name: 'ground2',
        names: [null, null, 'ground.asphalt', 'ground.marking', 'ground.dirt', 'ground.gutter'],
      },
      {
        row: ROW.r4, block: RIGHT, mode: 'grid', count: 6, name: 'wall2',
        names: ['wall.notrespassing.0', 'wall.notrespassing.1', 'wall.cracked.0',
                'wall.cracked.1', 'wall.brick', 'wall.skatearea'],
      },
      { row: ROW.r5, block: LEFT, mode: 'objects', name: 'atmo' },
      { row: ROW.r5, block: RIGHT, mode: 'objects', name: 'street' },
      { row: ROW.r6, block: LEFT, mode: 'objects', name: 'connector' },
      { row: ROW.r6, block: RIGHT, mode: 'objects', name: 'curb' },
    ],
  },
];
