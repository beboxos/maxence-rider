// Pool d'objets à taille fixe : pas d'allocation dans la boucle chaude (§14).
//
// Les particules et les bandeaux de score naissent et meurent en continu — des
// dizaines de fois par seconde en combo actif. Allouer un objet à chaque
// naissance forcerait le GC à intervenir en pleine partie, ce qui se voit à
// l'écran comme un micro-freeze. Le pool préalloue tout une fois au
// chargement, puis recycle.
//
// Implémentation par swap-remove : items[0..nActifs) sont actifs,
// items[nActifs..) sont libres. acquire()/release() sont O(1), sans
// allocation. forEachActive() itère à rebours par défaut — c'est le seul ordre
// qui reste correct si l'appelant relâche des instances pendant l'itération
// (un swap-remove en avant sauterait l'élément qui vient de prendre la place
// de celui qu'on retire).

export function createPool(fabrique, taille) {
  const items = [];
  for (let i = 0; i < taille; i++) {
    const it = fabrique();
    it._i = i;
    items.push(it);
  }
  let nActifs = 0;

  return {
    /** Renvoie une instance recyclée, ou null si le pool est saturé. */
    acquire() {
      if (nActifs >= items.length) return null;
      return items[nActifs++];
    },
    /** Rend une instance au pool. Sans effet si déjà relâchée. */
    release(item) {
      const i = item._i;
      if (i >= nActifs) return;
      const dernier = nActifs - 1;
      const autre = items[dernier];
      items[i] = autre; autre._i = i;
      items[dernier] = item; item._i = dernier;
      nActifs--;
    },
    forEachActive(fn) {
      for (let i = nActifs - 1; i >= 0; i--) fn(items[i]);
    },
    get count() { return nActifs; },
    get capacite() { return items.length; },
  };
}
