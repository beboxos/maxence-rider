// Table des animations du rider (§5).
//
// L'atlas fournit déjà les frames et un fps ; ce fichier ajoute la couche
// gameplay : le découpage d'une animation de saut en phases.
//
// Pourquoi ce découpage. Une anim d'ollie fait 5 frames à 18 fps, soit 0,28 s,
// alors que le saut dure 0,56 s — et bien davantage pour un boost. Jouer
// l'animation « au chronomètre » la ferait finir en plein vol, rider figé sur
// une pose d'atterrissage à un mètre du sol. On la pilote donc par la phase du
// saut : le pop se joue une fois au décollage, l'air boucle tant que le rider
// est en l'air, la réception se joue au contact. L'animation reste ainsi
// synchrone avec la physique quelle que soit la hauteur du saut.

export const PHASES = {
  ollie: { pop: [0, 1], air: [2, 3], land: [4] },
  flip: { pop: [0, 1, 2], air: [3, 4, 5], land: [6] },
  nocomply: { pop: [0, 1], air: [2, 3, 4], land: [5] },
  manual: { pop: [0, 1], air: [2, 3, 4], land: [5] },
};

// §6.4 : le trick ne compte que si le rider est dans la partie « trick en l'air »
// de son animation ; c'est aussi la fenêtre du perfect landing.
export const FENETRE_TRICK = {
  ollie: [2, 3],
  flip: [3, 5],
  nocomply: [2, 4],
  manual: [2, 4],
};

export const FPS = {
  idle: 6,
  roll: 14,
  ollie: 18,
  flip: 20,
  nocomply: 16,
  manual: 10,
  grind: 12,
  crash: 12,
};

// §5 : la vitesse de l'animation de roulé suit la vitesse du rider.
export function fpsRoulé(vitesse) {
  return Math.max(8, Math.min(20, 8 + vitesse / 40));
}

// §5 : la dernière frame de chute reste affichée avant la réapparition.
export const DUREE_CRASH_FIGE = 0.9;

// §5 : pas de frame de réception dédiée — un écrasement vertical bref suffit à
// vendre l'impact.
export const SQUASH_RECEPTION = 0.88;
export const DUREE_RECEPTION = 0.1;
