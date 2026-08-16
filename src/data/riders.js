// Caractéristiques des deux riders (§7).
//
// Les deux partagent la même machine à états : seuls les coefficients et la
// table d'animations changent. Ajouter un rider revient à ajouter une entrée ici
// et les animations correspondantes dans l'atlas.

export const RIDERS = {
  skate: {
    id: 'skate',
    nom: 'Maxence (skate)',
    prefixe: 'skate',
    special: 'nocomply',        // saut long
    vitesse: 1.00,
    hauteurSaut: 1.00,
    pointsTrick: 1.00,
    grind: 1.00,
    debloqueA: 0,
  },
  roller: {
    id: 'roller',
    nom: 'Maxence (roller)',
    prefixe: 'roller',
    special: 'manual',          // maintien de combo
    vitesse: 1.10,
    hauteurSaut: 0.92,
    pointsTrick: 0.85,
    grind: 1.25,
    debloqueA: 25000,
  },
};

export const RIDER_PAR_DEFAUT = 'skate';

export function getRider(id) {
  return RIDERS[id] || RIDERS[RIDER_PAR_DEFAUT];
}
