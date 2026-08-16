#!/usr/bin/env node
// Tests automatisés du jeu, sans navigateur.
//
//   node tools/test.mjs
//
// Le jeu tourne dans le harnais headless (tools/harness.mjs) avec un temps
// piloté à la main : chaque exécution est reproductible au pas de simulation
// près. C'est ce qui permet d'affirmer des choses comme « le rider ne traverse
// jamais un obstacle » sans dépendre du hasard d'un vrai navigateur.

import { boot } from './harness.mjs';

let réussis = 0;
const échecs = [];

function verifier(nom, condition, détail = '') {
  if (condition) { réussis++; console.log(`  ✓ ${nom}`); }
  else { échecs.push(`${nom}${détail ? ` — ${détail}` : ''}`); console.log(`  ✗ ${nom}${détail ? ` — ${détail}` : ''}`); }
}

const proche = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('\nBoucle, rendu, entrées\n');

const h = await boot({ width: 960, height: 540, dpr: 1, search: '?debug=1' });
const M = globalThis.window.__maxence;
verifier('le jeu démarre et expose son état', !!M);

// ── Mise à l'échelle ─────────────────────────────────────────────────────────
h.frames(3);
verifier('paysage : espace virtuel 480×270', M.view.w === 480 && M.view.h === 270,
  `${M.view.w}×${M.view.h}`);
verifier('échelle entière en paysage', M.view.scale === 2, `×${M.view.scale}`);
verifier('viewport centré', M.view.ox === 0 && M.view.oy === 0,
  `ox=${M.view.ox} oy=${M.view.oy}`);

// ── Rotation à chaud (C3) ────────────────────────────────────────────────────
const etatAvant = M.jeu.current;
const defilementAvant = M.monde.defilement;
h.resize(540, 960, 1);
h.frames(3);
verifier('portrait : espace virtuel 270×480', M.view.w === 270 && M.view.h === 480,
  `${M.view.w}×${M.view.h}`);
verifier('portrait détecté', M.view.portrait === true);
verifier('échelle entière en portrait', M.view.scale === 2, `×${M.view.scale}`);
verifier('rotation sans perte d\'état', M.jeu.current === etatAvant);
verifier('rotation sans perte de progression', M.monde.defilement >= defilementAvant);
verifier('rider au sol après rotation', proche(M.carre.y, M.view.h - 40, 1),
  `y=${M.carre.y.toFixed(1)} attendu ${M.view.h - 40}`);

// Écran plus petit que l'espace virtuel : échelle fractionnaire plutôt que
// débordement.
h.resize(320, 200, 1);
h.frames(2);
verifier('petit écran : pas de débordement',
  M.view.w * M.view.scale <= 320 + 0.001 && M.view.h * M.view.scale <= 200 + 0.001,
  `${(M.view.w * M.view.scale).toFixed(1)}×${(M.view.h * M.view.scale).toFixed(1)}`);

h.resize(960, 540, 1);
h.frames(2);

// ── Pas fixe ─────────────────────────────────────────────────────────────────
const solY = M.view.h - 40;
M.carre.y = solY; M.carre.vy = 0; M.carre.auSol = true; M.carre.tempsVol = 0;
const departDefilement = M.monde.defilement;
h.frames(60);
verifier('60 frames ≈ 240 px parcourus',
  proche(M.monde.defilement - departDefilement, 240, 6),
  `${(M.monde.defilement - departDefilement).toFixed(1)} px`);

// Une frame très longue ne doit pas faire bondir la simulation : le pas fixe
// rattrape au plus 5 pas, le reste est jeté (sinon spirale de la mort).
const avantSaut = M.monde.defilement;
h.frame(2000);
verifier('frame de 2 s : rattrapage borné',
  M.monde.defilement - avantSaut <= 240 * 0.1,
  `${(M.monde.defilement - avantSaut).toFixed(1)} px`);

// ── Sauts ────────────────────────────────────────────────────────────────────

/** Joue un geste puis renvoie la hauteur maximale atteinte. */
function hauteurSaut(geste) {
  M.carre.y = M.view.h - 40; M.carre.vy = 0; M.carre.auSol = true; M.carre.tempsVol = 0;
  h.frames(2);
  const sol = M.view.h - 40;
  geste();
  let max = 0;
  for (let i = 0; i < 140; i++) {
    h.frame();
    max = Math.max(max, sol - M.carre.y);
    if (M.carre.auSol && max > 5) break;
  }
  return max;
}

const tapCourt = () => { h.keyDown('Space'); h.frames(4); h.keyUp('Space'); };
const tapLong = () => { h.keyDown('Space'); h.frames(20); h.keyUp('Space'); };
const boost = () => { h.keyDown('Space', { shiftKey: true }); h.frames(4); h.keyUp('Space'); };

const hOllie = hauteurSaut(tapCourt);
const hFlip = hauteurSaut(tapLong);
const hBoost = hauteurSaut(boost);

verifier('ollie ≈ 87 px', proche(hOllie, 87, 8), `${hOllie.toFixed(0)} px`);
verifier('flip ≈ 153 px', proche(hFlip, 153, 10), `${hFlip.toFixed(0)} px`);
verifier('boost ≈ 175 px', proche(hBoost, 175, 10), `${hBoost.toFixed(0)} px`);
verifier('les trois sauts sont distincts', hOllie < hFlip && hFlip < hBoost,
  `${hOllie.toFixed(0)} / ${hFlip.toFixed(0)} / ${hBoost.toFixed(0)}`);

// Tactile : même règles, autre source.
const hTap = hauteurSaut(() => {
  h.pointer('pointerdown'); h.frames(4); h.pointer('pointerup');
});
verifier('tap tactile = ollie', proche(hTap, hOllie, 2), `${hTap.toFixed(0)} px`);

const hTapLong = hauteurSaut(() => {
  h.pointer('pointerdown'); h.frames(20); h.pointer('pointerup');
});
verifier('tap long tactile = flip', proche(hTapLong, hFlip, 2), `${hTapLong.toFixed(0)} px`);

const hDouble = hauteurSaut(() => {
  h.pointer('pointerdown'); h.frames(3); h.pointer('pointerup');
  h.frames(5);
  h.pointer('pointerdown'); h.frames(3); h.pointer('pointerup');
});
verifier('double tap = boost', proche(hDouble, hBoost, 12), `${hDouble.toFixed(0)} px`);

// Un seul saut par contact au sol (§6.3).
M.carre.y = M.view.h - 40; M.carre.vy = 0; M.carre.auSol = true; M.carre.tempsVol = 0;
h.frames(2);
tapCourt();
h.frames(20); // bien au-delà de la fenêtre de conversion
const yAvant = M.carre.y;
tapCourt();
h.frame();
verifier('pas de double saut', M.carre.y >= yAvant - 2,
  `y ${yAvant.toFixed(1)} → ${M.carre.y.toFixed(1)}`);

// ── Pause ────────────────────────────────────────────────────────────────────
M.carre.y = M.view.h - 40; M.carre.vy = 0; M.carre.auSol = true;
h.frames(2);
h.keyDown('Escape');
h.frames(2);
verifier('Échap met en pause', M.jeu.current === 'PAUSE', M.jeu.current);
const gelé = M.monde.defilement;
h.frames(30);
verifier('le monde ne défile pas en pause', M.monde.defilement === gelé);
h.keyDown('KeyP');
h.frames(2);
verifier('P reprend la partie', M.jeu.current === 'PLAY', M.jeu.current);

h.setHidden(true);
h.frames(2);
verifier('onglet masqué → pause', M.jeu.current === 'PAUSE', M.jeu.current);
h.setHidden(false);

// ── Rendu ────────────────────────────────────────────────────────────────────
// Le voile de pause fausserait toutes les couleurs : on reprend d'abord.
h.keyDown('KeyP');
h.frames(2);
M.carre.y = M.view.h - 40; M.carre.vy = 0; M.carre.auSol = true;
h.frames(2);

const px = (x, y) => {
  const i = (y * h.canvas.width + x) * 4;
  return [h.canvas.data[i], h.canvas.data[i + 1], h.canvas.data[i + 2]];
};
const versEcran = (vx, vy) => [
  Math.round(vx * M.view.scale + M.view.ox),
  Math.round(vy * M.view.scale + M.view.oy),
];

const [sx, sy] = versEcran(M.view.w / 2, M.view.h - 40);
const [r, g, b] = px(sx, sy);
verifier('la ligne de sol est rendue en #4ed4c4',
  g > 150 && b > 150 && r < 120, `rgb(${r},${g},${b})`);

// Le rider est dessiné à 30 % de l'écran, posé sur le sol.
const [cx, cy] = versEcran(M.view.w * 0.3, M.view.h - 40 - 8);
const [cr, cg, cb] = px(cx, cy);
verifier('le rider est rendu à sa position',
  cr > 200 && cg < 140 && cb < 110, `rgb(${cr},${cg},${cb})`);

// Hors du viewport virtuel : bande de fond, jamais de contenu de jeu.
if (M.view.oy > 0) {
  const [fr, fg, fb] = px(Math.floor(h.canvas.width / 2), Math.floor(M.view.oy / 2));
  verifier('bandes de fond hors viewport',
    fr < 30 && fg < 30 && fb < 40, `rgb(${fr},${fg},${fb})`);
}

// ── Bilan ────────────────────────────────────────────────────────────────────
console.log(`\n${réussis} réussis, ${échecs.length} échoués\n`);
if (échecs.length) {
  for (const e of échecs) console.log(`  ✗ ${e}`);
  process.exit(1);
}
