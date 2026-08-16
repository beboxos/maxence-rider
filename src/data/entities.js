// Registre des types d'obstacles et de décor (§6.5).
//
// Chaque hitbox est tracée à la main, jamais déduite de la taille du sprite
// (§3) : les décors sont dessinés en perspective isométrique légère, qui
// gonfle leur hauteur visuelle bien au-delà de leur encombrement réel au sol.
// curb.0 dessine par exemple un bloc de 39 px de haut pour un rebord qui ne
// doit bloquer le rider que sur ses 14 derniers pixels.
//
// La classification par famille suit le tableau nommé du §6.5 (curb/cône/
// borne = bas, poubelle/banc/jardinière/distributeur = haut), pas le seuil
// « h ≤ 28 px » qu'il donne en regard : ce seuil est une indication de lecture
// du tableau, pas une règle à vérifier contre des hitbox déjà volontairement
// réduites — le banc par exemple (37×21 en sprite) est classé « haut » par le
// tableau nommé alors que 21 px passerait sous le seuil ; sa hitbox est donc
// portée à 30 px de haut pour rester cohérente avec les deux à la fois.
//
// Les collectibles (coins) n'existent pas encore ici : ils arrivent avec le
// scoring en P4 (§6.6). Le format de chunk les accueillera sans changer de
// forme le moment venu.

export const Family = {
  LOW: 'LOW',     // Ollie suffit — collision latérale, dessus franchissable
  HIGH: 'HIGH',    // Flip ou Boost obligatoires
  GAP: 'GAP',      // Boost obligatoire — chute si abordé au sol
  RAMP: 'RAMP',    // Jamais de crash — bonus de trajectoire (§6.5)
  RAIL: 'RAIL',    // Grindable par le dessus, crash par le côté
  DECOR: 'DECOR',  // Aucune collision — pure profondeur visuelle
};

export const ENTITIES = {
  // Solide bas — Ollie suffit.
  curb: { family: Family.LOW, frame: 'curb.0', hitbox: { w: 44, h: 14 } },
  cone: { family: Family.LOW, frame: 'connector.0', hitbox: { w: 26, h: 18 } },
  hydrant: { family: Family.LOW, frame: 'street.2', hitbox: { w: 22, h: 22 } },

  // Solide haut — Flip ou Boost.
  bin: { family: Family.HIGH, frame: 'urban.2', hitbox: { w: 20, h: 32 } },
  planter: { family: Family.HIGH, frame: 'urban.4', hitbox: { w: 28, h: 34 } },
  bench: { family: Family.HIGH, frame: 'urban.5', hitbox: { w: 32, h: 30 } },
  vending: { family: Family.HIGH, frame: 'prop.0', hitbox: { w: 24, h: 40 } },

  // Gap — largeur fournie par le chunk (`w` sur l'entité), pas de sprite :
  // c'est un trou dans le sol, rendu procéduralement comme le sol lui-même
  // en attendant les vraies tuiles de P5.
  gap: { family: Family.GAP, frame: null, hitbox: { w: null, h: 0 } },

  // Rampes — jamais de crash, bonus de trajectoire.
  quarterpipe: { family: Family.RAMP, frame: 'park.1', hitbox: { w: 40, h: 14 } },
  stairs: { family: Family.RAMP, frame: 'bonus.3', hitbox: { w: 30, h: 10 } },

  // Rails — grindables par le dessus (mécanique complète en P4).
  rail: { family: Family.RAIL, frame: 'rail.0', hitbox: { w: 92, h: 10 } },
  railKinked: { family: Family.RAIL, frame: 'rail.5', hitbox: { w: 90, h: 10 } },

  // Décor — aucune collision.
  pole: { family: Family.DECOR, frame: 'prop.2' },
  palm: { family: Family.DECOR, frame: 'atmo.3' },
  sign: { family: Family.DECOR, frame: 'street.3' },
};
