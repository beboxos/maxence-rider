// 5 ambiances graphiques de Maxence Rider — Changement tous les 10 000 points (§9, §14).
//
// 1 (0-10k)   : Le Skatepark & Avenue (Cyan & Bleu Nuit)
// 2 (10k-20k) : Pâté de Maisons & Résidences (Briques & Doré chaleureux)
// 3 (20k-30k) : Le Campus & L'École (Façades scolaires, horloges, dalles & Pourpre)
// 4 (30k-40k) : Le Chantier & Lofts (Échafaudages, grues, béton & Ambre de sécurité)
// 5 (40k+)    : Le Quartier Cyber Arcade (Néons rouge/cyan, gratte-ciels & Nuit étoilée)

export const THEMES = {
  1: {
    id: 'skatepark',
    nom: 'Le Skatepark & Avenue',
    cielHaut: '#080c16',
    cielBas: '#121e2c',
    solLigne: '#4ed4c4',
    solFond: '#0c121a',
    tuilesSol: ['ground.asphalt', 'ground.asphalt', 'ground.marking', 'ground.asphalt'],
    murs: ['street.0', 'wall.brick', 'prop.0', 'wall.skatearea', 'atmo.3', 'street.3', 'prop.1'],
    atmo: ['atmo.0', 'atmo.4', 'atmo.1'],
    etoiles: true,
    accent: '#4ed4c4',
    curbColor: '#424554',
    curbBorder: '#4ed4c4',
    coneColor: '#ff5c3a',
    rampTop: '#4ed4c4',
  },
  2: {
    id: 'maisons',
    nom: 'Pâté de Maisons & Résidences',
    cielHaut: '#1a0e08',
    cielBas: '#341c10',
    solLigne: '#ffc93c',
    solFond: '#1a100a',
    tuilesSol: ['ground.0', 'ground.1', 'ground.gutter', 'ground.0'],
    murs: ['wall.brick', 'street.0', 'prop.1', 'wall.brick', 'atmo.3', 'prop.0'],
    atmo: ['atmo.1', 'atmo.2', 'atmo.0'],
    etoiles: false,
    accent: '#ffc93c',
    curbColor: '#5a382c',
    curbBorder: '#ffc93c',
    coneColor: '#ff9f1a',
    rampTop: '#ffc93c',
  },
  3: {
    id: 'ecole',
    nom: 'Le Campus & École',
    cielHaut: '#14081c',
    cielBas: '#2c1038',
    solLigne: '#e056fd',
    solFond: '#140c1a',
    tuilesSol: ['ground.2', 'ground.5', 'ground.2', 'ground.5'],
    murs: ['prop.0', 'street.0', 'wall.brick', 'street.3', 'atmo.3', 'prop.1'],
    atmo: ['atmo.3', 'atmo.4', 'atmo.1'],
    etoiles: false,
    accent: '#e056fd',
    curbColor: '#443454',
    curbBorder: '#e056fd',
    coneColor: '#e056fd',
    rampTop: '#e056fd',
  },
  4: {
    id: 'chantier',
    nom: 'Le Chantier & Lofts',
    cielHaut: '#140f0a',
    cielBas: '#2a1a10',
    solLigne: '#ff9f1a',
    solFond: '#16100a',
    tuilesSol: ['ground.dirt', 'ground.3', 'ground.dirt', 'ground.4'],
    murs: ['wall.cracked.0', 'street.4', 'wall.cracked.1', 'prop.2', 'wall.brick', 'street.5'],
    atmo: ['atmo.0', 'atmo.2', 'atmo.4'],
    etoiles: false,
    accent: '#ff9f1a',
    curbColor: '#3c3832',
    curbBorder: '#ff9f1a',
    coneColor: '#ff5c3a',
    rampTop: '#ff9f1a',
  },
  5: {
    id: 'cyber',
    nom: 'Le Quartier Cyber Arcade',
    cielHaut: '#160410',
    cielBas: '#320a22',
    solLigne: '#ff3366',
    solFond: '#14060e',
    tuilesSol: ['ground.asphalt', 'ground.dirt', 'ground.gutter', 'ground.asphalt'],
    murs: ['wall.skatearea', 'street.0', 'wall.brick', 'street.3', 'prop.0', 'atmo.3'],
    atmo: ['atmo.0', 'atmo.1', 'atmo.4'],
    etoiles: true,
    accent: '#ff3366',
    curbColor: '#361828',
    curbBorder: '#ff3366',
    coneColor: '#ff3366',
    rampTop: '#ff3366',
  },
};

export function getTheme(palier = 1) {
  const p = Math.max(1, Math.min(5, Math.floor(palier)));
  return THEMES[p] || THEMES[1];
}
