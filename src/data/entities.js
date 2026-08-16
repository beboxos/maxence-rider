// Registre des types d'obstacles et de décor (§6.5).
//
// Hitbox calibrées au pixel pour une précision arcade sans tunneling.

export const Family = {
  LOW: 'LOW',                 // Ollie suffit — collision latérale, dessus franchissable
  HIGH: 'HIGH',               // Flip ou Boost obligatoires
  GAP: 'GAP',                 // Boost obligatoire — chute si abordé au sol
  RAMP: 'RAMP',               // Jamais de crash — bonus de trajectoire (§6.5)
  RAIL: 'RAIL',               // Grindable par le dessus, crash par le côté
  DECOR: 'DECOR',             // Aucune collision — pure profondeur visuelle
  COLLECTIBLE: 'COLLECTIBLE', // Canettes (+100 pts) et Bonus de vie Croix Verte (+1 VIE)
};

export const ENTITIES = {
  // Solide bas — Ollie suffit (dessus grindable pour le curb).
  curb: { family: Family.LOW, frame: 'curb.0', hitbox: { w: 44, h: 14 }, grindable: true },
  cone: { family: Family.LOW, frame: 'cone', hitbox: { w: 15, h: 17 } },
  hydrant: { family: Family.LOW, frame: 'street.2', hitbox: { w: 22, h: 22 } },

  // Solide haut — Flip ou Boost.
  bin: { family: Family.HIGH, frame: 'urban.2', hitbox: { w: 20, h: 32 } },
  planter: { family: Family.HIGH, frame: 'urban.4', hitbox: { w: 28, h: 34 } },
  bench: { family: Family.HIGH, frame: 'urban.5', hitbox: { w: 32, h: 30 } },
  vending: { family: Family.HIGH, frame: 'prop.0', hitbox: { w: 24, h: 40 } },

  // Gap — largeur fournie par le chunk (`w` sur l'entité).
  gap: { family: Family.GAP, frame: null, hitbox: { w: null, h: 0 } },

  // Rampes — jamais de crash, bonus de trajectoire.
  quarterpipe: { family: Family.RAMP, frame: 'park.1', hitbox: { w: 40, h: 14 } },
  stairs: { family: Family.RAMP, frame: 'bonus.3', hitbox: { w: 30, h: 10 } },

  // Rails — grindables par le dessus (§6.4, §6.5).
  rail: { family: Family.RAIL, frame: 'rail.0', hitbox: { w: 92, h: 10 }, grindable: true },
  railKinked: { family: Family.RAIL, frame: 'rail.5', hitbox: { w: 90, h: 10 }, grindable: true },
  railLong: { family: Family.RAIL, frame: 'rail.0', hitbox: { w: 160, h: 10 }, grindable: true },

  // Collectibles — canettes (+100 pts) et bonus de vie (+1 VIE).
  coin: { family: Family.COLLECTIBLE, frame: null, hitbox: { w: 12, h: 12 } },
  life_cross: { family: Family.COLLECTIBLE, frame: null, hitbox: { w: 16, h: 16 } },

  // Décor — aucune collision.
  pole: { family: Family.DECOR, frame: 'prop.2' },
  palm: { family: Family.DECOR, frame: 'atmo.3' },
  sign: { family: Family.DECOR, frame: 'street.3' },
};
