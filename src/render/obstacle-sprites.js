// Obstacles, bonus et trous dessinés avec l'atlas assets/bg/obstacles.png.
//
// Les sprites sont dessinés « tournés vers la droite » (rampes qui montent vers la droite) ;
// ils sont retournés quand le niveau va vers la gauche (direction < 0). Les hitboxes restent
// celles de data/entities.js : les sprites ont été réduits à leur taille (tools/slice_bg.py).
//
// `dessiner` renvoie false tant que la texture n'est pas chargée : l'appelant retombe alors
// sur le rendu procédural d'origine (render/obstacles.js).

import OBSTACLES from '../../assets/bg/obstacles.js';

const BASE = 'assets/';

// Type d'entité → frames possibles (la variante est choisie une fois par entité, de façon stable).
const VARIANTES = {
  curb: ['curb.0', 'curb.1'],
  cone: ['cone'],
  hydrant: ['hydrant.0', 'hydrant.1'],
  bin: ['bin.0', 'bin.1'],
  planter: ['planter'],
  bench: ['bench.0', 'bench.1'],
  vending: ['vending.0', 'vending.1'],
  quarterpipe: ['qp.0', 'qp.1'],
  stairs: ['stairs.0', 'stairs.1'],
  rail: ['rail.0', 'rail.1'],
  railKinked: ['rail.2', 'rail.3'],
  railLong: ['rail.long'],
};
const CANETTE = ['can.0', 'can.1', 'can.2', 'can.3'];   // type 'coin' : canette, 4 images de rotation
const CROIX = ['heart.0', 'heart.1'];                   // type 'life_cross' : pulsation

export function createObstacleRenderer() {
  const { frames } = OBSTACLES;
  const img = new Image();
  img.src = BASE + OBSTACLES.sheet + (OBSTACLES.v ? `?v=${OBSTACLES.v}` : '');
  const pret = () => img.complete && img.naturalWidth > 0;

  /** Entier stable dérivé de la position monde : même entité → même variante à chaque frame. */
  function variante(entite, n) {
    return Math.abs(Math.floor(entite.worldX * 7.31)) % n;
  }

  function blit(ctx, f, cx, bas, direction) {
    const gauche = Math.round(cx - f.w / 2);
    const haut = Math.round(bas - f.h);
    if (direction < 0) {
      ctx.save();
      ctx.translate(gauche + f.w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, f.x, f.y, f.w, f.h, 0, haut, f.w, f.h);
      ctx.restore();
    } else {
      ctx.drawImage(img, f.x, f.y, f.w, f.h, gauche, haut, f.w, f.h);
    }
  }

  /**
   * Dessine une entité (obstacle, rampe, rail, canette, bonus de vie).
   * @param {number} x     centre de l'entité à l'écran
   * @param {number} sol   ordonnée du sol
   * @param {number} temps temps de jeu en secondes (animation des bonus)
   * @returns {boolean} faux si ce type n'a pas de sprite ou si la texture n'est pas prête
   */
  function dessiner(ctx, entite, x, sol, direction, temps) {
    if (!pret()) return false;
    const bas = sol - (entite.elevation || 0);

    if (entite.type === 'coin') {
      const f = frames[CANETTE[Math.floor(temps * 10) % CANETTE.length]];
      const bob = Math.sin(temps * 6 + x * 0.05) * 1.5;
      blit(ctx, f, x, bas + f.h / 2 + bob, direction);
      return true;
    }
    if (entite.type === 'life_cross') {
      const f = frames[CROIX[Math.floor(temps * 4) % CROIX.length]];
      const bob = Math.sin(temps * 5 + x * 0.05) * 3;
      blit(ctx, f, x, bas + f.h / 2 + bob, direction);
      return true;
    }
    const noms = VARIANTES[entite.type];
    if (!noms) return false;
    blit(ctx, frames[noms[variante(entite, noms.length)]], x, bas, direction);
    return true;
  }

  /**
   * Trou dans le sol entre `gauche` et `droite` (écran) : fond de fosse répété, bords éclatés
   * de chaque côté. Renvoie false si la texture n'est pas prête (l'appelant remplit en noir).
   */
  function dessinerTrou(ctx, view, solY, gauche, droite, direction) {
    if (!pret()) return false;
    const fosse = frames['gap.pit'];
    const profondeur = view.h - solY;
    ctx.save();
    ctx.beginPath();
    ctx.rect(gauche, solY, droite - gauche, profondeur);
    ctx.clip();
    for (let x = gauche; x < droite; x += fosse.w) {
      ctx.drawImage(img, fosse.x, fosse.y, fosse.w, fosse.h, Math.round(x), solY, fosse.w, Math.min(fosse.h, profondeur));
    }
    ctx.restore();
    // Le bord « avant » est celui par lequel le rider arrive : à gauche si direction > 0.
    const bordG = frames[direction > 0 ? 'gap.left' : 'gap.right'];
    const bordD = frames[direction > 0 ? 'gap.right' : 'gap.left'];
    ctx.drawImage(img, bordG.x, bordG.y, bordG.w, bordG.h, Math.round(gauche - bordG.w + 3), solY, bordG.w, Math.min(bordG.h, profondeur));
    ctx.drawImage(img, bordD.x, bordD.y, bordD.w, bordD.h, Math.round(droite - 3), solY, bordD.w, Math.min(bordD.h, profondeur));
    return true;
  }

  return { dessiner, dessinerTrou };
}
