// Chargement des assets.
//
// L'atlas est importé en module ES, pas récupéré par fetch : le jeu doit aussi
// démarrer depuis file://, où fetch() d'un fichier local est bloqué. Les images,
// elles, se chargent bien via <img> quel que soit le protocole.

import ATLAS from '../../assets/atlas.js';

// Chemin relatif au document, pas au module : le bundle file:// est un script
// classique, où import.meta n'existe pas.
const BASE = 'assets/';

let sheet = null;
let heroImg = null;

export const atlas = ATLAS;

export function loadAssets() {
  const pSheet = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { sheet = img; resolve(); };
    img.onerror = () => reject(new Error(`texture introuvable : ${ATLAS.sheet}`));
    img.src = BASE + ATLAS.sheet;
  });

  const pHero = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { heroImg = img; resolve(); };
    img.onerror = () => { resolve(); }; // Pas d'erreur fatale si absent
    img.src = BASE + 'menu_hero.png';
  });

  return Promise.all([pSheet, pHero]);
}

export function sheetImage() {
  return sheet;
}

export function menuHeroImage() {
  return heroImg;
}

/** Métadonnées d'une frame, ou null si la clé n'existe pas. */
export function frame(key) {
  return ATLAS.frames[key] || null;
}

export function anim(key) {
  return ATLAS.anims[key] || null;
}

export function hasFrame(key) {
  return key in ATLAS.frames;
}
