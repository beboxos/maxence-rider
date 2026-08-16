// Constantes de vitesse partagées (§6.2).
//
// Sorties ici plutôt que dans player.js : game/chunks.js en a besoin pour
// calculer le rab de sécurité entre chunks (§8) sans importer tout le module
// du rider — et sans risquer que les deux dérivent si on change un chiffre
// dans un seul des deux fichiers.

export const VITESSE_BASE = 240;
export const VITESSE_GAIN = 8;     // par palier
export const PALIER = 10;          // secondes
export const VITESSE_MAX = 460;
export const LEAN = 0.15;          // ±15 % (§6.2)

// Vitesse la plus haute jamais atteignable, lean compris : c'est elle qui sert
// de référence de sécurité pour l'invariant du §8 (voir game/chunks.js).
export const VITESSE_MAX_LEAN = VITESSE_MAX * (1 + LEAN);
