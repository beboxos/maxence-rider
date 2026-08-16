#!/usr/bin/env node
// Tests automatisés du jeu, sans navigateur.
//
//   node tools/test.mjs
//
// Le jeu tourne dans le harnais headless (tools/harness.mjs) avec un temps
// piloté à la main : chaque exécution est reproductible au pas de simulation
// près. C'est ce qui permet d'affirmer des choses comme « le rider ne traverse
// jamais un obstacle » sans dépendre du timing d'un vrai navigateur.

import { boot } from './harness.mjs';

let réussis = 0;
const échecs = [];
let section = '';

function titre(t) {
  section = t;
  console.log(`\n${t}\n`);
}

function verifier(nom, condition, détail = '') {
  const ligne = `${nom}${détail ? ` — ${détail}` : ''}`;
  if (condition) { réussis++; console.log(`  ✓ ${ligne}`); }
  else { échecs.push(`[${section}] ${ligne}`); console.log(`  ✗ ${ligne}`); }
}

const proche = (a, b, tol) => Math.abs(a - b) <= tol;

const h = await boot({ width: 960, height: 540, dpr: 1, search: '?debug=1' });
const M = globalThis.window.__maxence;
const { player } = M;

/**
 * Repose le rider au sol, run remis à zéro.
 * L'attente initiale purge la fenêtre de double tap : sans elle, le tap de
 * clôture du test précédent s'apparie avec le premier tap du suivant et le
 * transforme silencieusement en boost.
 */
function reset() {
  h.wait(400);
  h.frames(2);      // absorbe le grand dt provoqué par l'attente
  player.poser(Math.round(M.view.w * 0.3), M.solY());
  player.tempsCourse = 0;
  player.bonusRampe = 1;
  h.frames(2);
}

/**
 * Joue un geste et renvoie la hauteur maximale atteinte.
 * L'échantillonnage doit couvrir le geste lui-même : un maintien long consomme
 * des frames, et le sommet du saut peut tomber avant que le geste ne rende la
 * main. On intercepte donc h.frame le temps de la mesure.
 */
function hauteurSaut(geste) {
  reset();
  const sol = M.solY();
  let max = 0;
  const frameRéelle = h.frame.bind(h);
  const frameSuivie = (ms) => { frameRéelle(ms); max = Math.max(max, sol - player.y); };
  h.frame = frameSuivie;
  try {
    geste();
    for (let i = 0; i < 160; i++) {
      frameSuivie();
      if (player.auSol && max > 5) break;
    }
  } finally {
    h.frame = frameRéelle;
  }
  return max;
}

const tapCourt = () => { h.keyDown('Space'); h.frames(4); h.keyUp('Space'); };
const tapLong = () => { h.keyDown('Space'); h.frames(20); h.keyUp('Space'); };
const boost = () => { h.keyDown('Space', { shiftKey: true }); h.frames(4); h.keyUp('Space'); };

// ─── Boucle, échelle, orientation ────────────────────────────────────────────
titre('Boucle, échelle, orientation');

verifier('le jeu démarre et expose son état', !!M);
h.frames(3);
verifier('paysage : espace virtuel 480×270', M.view.w === 480 && M.view.h === 270,
  `${M.view.w}×${M.view.h}`);
verifier('échelle entière en paysage', M.view.scale === 2, `×${M.view.scale}`);

const etatAvant = M.jeu.current;
const distAvant = player.distance;
h.resize(540, 960, 1);
h.frames(3);
verifier('portrait : espace virtuel 270×480', M.view.w === 270 && M.view.h === 480,
  `${M.view.w}×${M.view.h}`);
verifier('échelle entière en portrait', M.view.scale === 2, `×${M.view.scale}`);
verifier('rotation sans perte d\'état', M.jeu.current === etatAvant);
verifier('rotation sans perte de progression', player.distance >= distAvant);
verifier('rider au sol après rotation', proche(player.y, M.solY(), 1),
  `y=${player.y.toFixed(1)} sol=${M.solY()}`);

// Rotation en plein vol : le rider garde sa hauteur au-dessus du sol, il ne
// doit ni retomber d'un coup ni sortir de l'écran.
reset();
tapCourt();
h.frames(14);
const hauteurAvant = M.solY() - player.y;
h.resize(960, 540, 1);
h.frames(1);
verifier('rotation en plein vol : hauteur conservée',
  proche(M.solY() - player.y, hauteurAvant, 12),
  `${hauteurAvant.toFixed(0)} → ${(M.solY() - player.y).toFixed(0)} px`);

h.resize(960, 540, 1);
h.frames(2);

// Écran plus petit que l'espace virtuel : pas de débordement.
h.resize(320, 200, 1);
h.frames(2);
verifier('petit écran : pas de débordement',
  M.view.w * M.view.scale <= 320.001 && M.view.h * M.view.scale <= 200.001,
  `${(M.view.w * M.view.scale).toFixed(1)}×${(M.view.h * M.view.scale).toFixed(1)}`);
h.resize(960, 540, 1);
h.frames(2);

// ─── Pas fixe ────────────────────────────────────────────────────────────────
titre('Pas fixe');

reset();
const d0 = player.distance;
h.frames(60);
verifier('60 frames ≈ 240 px parcourus', proche(player.distance - d0, 240, 8),
  `${(player.distance - d0).toFixed(1)} px`);

const d1 = player.distance;
h.frame(2000);
verifier('frame de 2 s : rattrapage borné', player.distance - d1 <= 24,
  `${(player.distance - d1).toFixed(1)} px`);

// §6.2 : +8 px/s tous les paliers de 10 s, plafonné à 460.
reset();
const vDepart = player.vitesse;
player.tempsCourse = 10.5;
h.frames(2);
verifier('la vitesse monte par paliers', proche(player.vitesse, vDepart + 8, 1),
  `${vDepart.toFixed(0)} → ${player.vitesse.toFixed(0)} px/s`);
player.tempsCourse = 5000;
h.frames(2);
verifier('vitesse plafonnée à 460', proche(player.vitesse, 460, 1),
  `${player.vitesse.toFixed(0)} px/s`);
reset();

// ─── Les trois sauts ─────────────────────────────────────────────────────────
titre('Les trois sauts');

const hOllie = hauteurSaut(tapCourt);
const hFlip = hauteurSaut(tapLong);
const hBoost = hauteurSaut(boost);

verifier('ollie ≈ 87 px', proche(hOllie, 87, 8), `${hOllie.toFixed(0)} px`);
verifier('flip ≈ 153 px', proche(hFlip, 153, 10), `${hFlip.toFixed(0)} px`);
verifier('boost ≈ 175 px', proche(hBoost, 175, 10), `${hBoost.toFixed(0)} px`);
verifier('trois courbes distinctes', hOllie < hFlip && hFlip < hBoost,
  `${hOllie.toFixed(0)} / ${hFlip.toFixed(0)} / ${hBoost.toFixed(0)}`);

// Le boost doit rester en l'air plus longtemps que le flip malgré une vitesse
// initiale plus faible : c'est sa gravité réduite qui fait la différence (§6.3).
function airtime(geste) {
  reset();
  geste();
  let n = 0;
  for (let i = 0; i < 200; i++) { h.frame(); if (player.auSol) break; n++; }
  return n / 60;
}
const aFlip = airtime(tapLong);
const aBoost = airtime(boost);
verifier('le boost plane plus longtemps que le flip', aBoost > aFlip,
  `${aBoost.toFixed(2)} s vs ${aFlip.toFixed(2)} s`);

verifier('tap tactile = ollie',
  proche(hauteurSaut(() => { h.pointer('pointerdown'); h.frames(4); h.pointer('pointerup'); }), hOllie, 2));
verifier('tap long tactile = flip',
  proche(hauteurSaut(() => { h.pointer('pointerdown'); h.frames(20); h.pointer('pointerup'); }), hFlip, 2));
verifier('double tap = boost',
  proche(hauteurSaut(() => {
    h.pointer('pointerdown'); h.frames(3); h.pointer('pointerup');
    h.frames(5);
    h.pointer('pointerdown'); h.frames(3); h.pointer('pointerup');
  }), hBoost, 12));

// §6.3 : un seul saut par contact au sol.
reset();
tapCourt();
h.frames(20);
const yAvant = player.y;
tapCourt();
h.frame();
verifier('pas de double saut', player.y >= yAvant - 2,
  `y ${yAvant.toFixed(1)} → ${player.y.toFixed(1)}`);

// La hauteur du flip ne dépend pas de la durée du maintien : voir la note sur
// le « variable jump height » dans player.js. Un maintien juste au-dessus du
// seuil et un maintien long doivent donner la même hauteur.
const hFlipCourt = hauteurSaut(() => { h.keyDown('Space'); h.frames(10); h.keyUp('Space'); });
const hFlipLong = hauteurSaut(() => { h.keyDown('Space'); h.frames(40); h.keyUp('Space'); });
verifier('la hauteur du flip ne dépend pas de la durée du maintien',
  proche(hFlipCourt, hFlipLong, 2), `${hFlipCourt.toFixed(0)} vs ${hFlipLong.toFixed(0)} px`);

// ─── Coyote time et tampon d'entrée ──────────────────────────────────────────
titre('Coyote time et tampon d\'entrée');

// §6.3 : 90 ms de grâce après avoir quitté le sol. Le rider doit être en
// hauteur, sinon il retouche le sol dès la frame suivante et le test ne mesure
// que la reprise d'appui.
function quitterUnRebord(délaiFrames) {
  reset();
  player.y = M.solY() - 120;
  player.prevY = player.y;
  player.quitterLeSol();
  // Un tap court n'émet qu'au relâchement : le tap lui-même compte dans le
  // délai, sinon on mesure 117 ms là où on croyait en mesurer 50.
  h.frames(délaiFrames - 1);
  h.keyDown('Space');
  h.frames(1);
  h.keyUp('Space');
  h.frames(2);
  // Un saut se voit à la vitesse verticale : elle repasse franchement négative.
  return player.vy < -200;
}

verifier('saut accepté dans la fenêtre coyote (50 ms)', quitterUnRebord(3));
verifier('saut refusé hors fenêtre coyote (150 ms)', !quitterUnRebord(9));



// §6.3 : une entrée reste valable 120 ms — appuyer juste avant l'atterrissage
// doit relancer un saut au contact, pas être perdu.
reset();
tapCourt();
// Descend jusqu'à être tout près du sol.
for (let i = 0; i < 160 && !(player.vy > 0 && M.solY() - player.y < 25); i++) h.frame();
verifier('rider en approche du sol', !player.auSol && player.vy > 0);
tapCourt();                  // appui anticipé
let renvoi = 0;
for (let i = 0; i < 20; i++) { h.frame(); renvoi = Math.max(renvoi, M.solY() - player.y); }
verifier('tampon d\'entrée : le saut part au contact', renvoi > 30,
  `${renvoi.toFixed(0)} px après contact`);

// ─── Animation ───────────────────────────────────────────────────────────────
titre('Animation');

reset();
h.frames(4);
verifier('au sol : animation de roulé', /^skate\.roll\.\d$/.test(player.frameKey()),
  player.frameKey());

// La frame de roulé change avec le temps, à la cadence liée à la vitesse (§5).
const vues = new Set();
for (let i = 0; i < 40; i++) { h.frame(); vues.add(player.frameKey()); }
verifier('le roulé défile sur plusieurs frames', vues.size >= 4, `${vues.size} frames`);

// §5 : le saut se joue par phases — pop, air, réception — et non au chronomètre :
// l'animation doit rester en phase « air » tant que le rider est en l'air.
reset();
tapLong();
h.frames(2);
const framesPop = player.frameKey();
verifier('décollage : animation de flip', /^skate\.flip\.\d$/.test(framesPop), framesPop);

const indices = [];
for (let i = 0; i < 40 && !player.auSol; i++) {
  h.frame();
  indices.push(Number(player.frameKey().split('.').pop()));
}
const phaseAir = indices.filter((i) => i >= 3 && i <= 5).length;
verifier('en vol : l\'animation reste en phase aérienne',
  phaseAir > indices.length * 0.6, `${phaseAir}/${indices.length} frames`);
verifier('l\'animation ne se fige pas sur la réception avant le contact',
  !indices.slice(0, -1).includes(6));

// Réception : écrasement vertical bref (§5). Le saut ne part qu'au relâchement
// du tap : il faut attendre le décollage avant de guetter le contact.
reset();
tapCourt();
for (let i = 0; i < 10 && player.auSol; i++) h.frame();   // décollage
verifier('le tap court fait décoller le rider', !player.auSol);
for (let i = 0; i < 160 && !player.auSol; i++) h.frame(); // vol
h.frame();
verifier('réception : état LAND', player.state === M.RiderState.LAND, player.state);
verifier('réception : écrasement vertical', player.squash < 1 && player.squash >= 0.87,
  `scaleY ${player.squash.toFixed(2)}`);
h.frames(10);
verifier('l\'écrasement se relâche', player.squash === 1, `scaleY ${player.squash}`);
verifier('retour au roulé après réception', player.state === M.RiderState.ROLL, player.state);

// §6.4 : fenêtre de trick, base du scoring en P4.
reset();
tapLong();
let dansFenetre = 0;
for (let i = 0; i < 60 && !player.auSol; i++) { h.frame(); if (player.dansFenetreTrick()) dansFenetre++; }
verifier('la fenêtre de trick s\'ouvre en vol', dansFenetre > 5, `${dansFenetre} frames`);

// §5 : la chute se joue une fois puis se fige.
reset();
player.crasher();
h.frames(2);
verifier('crash : animation de chute', /^skate\.crash\.\d$/.test(player.frameKey()), player.frameKey());
h.frames(60);
verifier('crash : figé sur la dernière frame', player.frameKey() === 'skate.crash.5', player.frameKey());
verifier('crash : terminé après 900 ms', player.crashTermine);
reset();

// ─── Pause ───────────────────────────────────────────────────────────────────
titre('Pause');

h.keyDown('Escape');
h.frames(2);
verifier('Échap met en pause', M.jeu.current === 'PAUSE', M.jeu.current);
const gelée = player.distance;
h.frames(30);
verifier('le monde ne défile pas en pause', player.distance === gelée);
h.keyDown('KeyP');
h.frames(2);
verifier('P reprend la partie', M.jeu.current === 'PLAY', M.jeu.current);
h.setHidden(true);
h.frames(2);
verifier('onglet masqué → pause', M.jeu.current === 'PAUSE', M.jeu.current);
h.setHidden(false);
h.keyDown('KeyP');
h.frames(2);

// ─── Rendu ───────────────────────────────────────────────────────────────────
titre('Rendu');

reset();
h.frames(2);
const px = (x, y) => {
  const i = (y * h.canvas.width + x) * 4;
  return [h.canvas.data[i], h.canvas.data[i + 1], h.canvas.data[i + 2]];
};
const versEcran = (vx, vy) => [
  Math.round(vx * M.view.scale + M.view.ox),
  Math.round(vy * M.view.scale + M.view.oy),
];

const [sx, sy] = versEcran(M.view.w / 2, M.solY());
const [r, g, b] = px(sx, sy);
verifier('la ligne de sol est rendue en #4ed4c4', g > 150 && b > 150 && r < 120,
  `rgb(${r},${g},${b})`);

// Le rider doit être peint : on compte les pixels non-fond dans sa boîte.
function pixelsRider() {
  const [x0, y0] = versEcran(player.x - 20, player.y - 55);
  const [x1, y1] = versEcran(player.x + 20, player.y - 2);
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const [pr, pg, pb] = px(x, y);
    // Le fond du ciel est #1b1d27 ; tout ce qui s'en écarte vient du sprite.
    if (Math.abs(pr - 27) + Math.abs(pg - 29) + Math.abs(pb - 39) > 30) n++;
  }
  return n;
}
verifier('le rider est peint au sol', pixelsRider() > 300, `${pixelsRider()} px`);

// En l'air, la zone au-dessus du sol est occupée et le sol est dégagé.
reset();
tapLong();
h.frames(16);
verifier('le rider est peint en vol', pixelsRider() > 300, `${pixelsRider()} px`);
verifier('le rider a bien décollé', M.solY() - player.y > 60,
  `${(M.solY() - player.y).toFixed(0)} px`);

if (M.view.oy > 0) {
  const [fr, fg, fb] = px(Math.floor(h.canvas.width / 2), Math.floor(M.view.oy / 2));
  verifier('bandes de fond hors viewport', fr < 30 && fg < 30 && fb < 40, `rgb(${fr},${fg},${fb})`);
}

// ─── Bundle file:// ──────────────────────────────────────────────────────────
// Le jeu doit démarrer aussi bien depuis dist/bundle.js que depuis les modules.
// Ce n'est pas redondant : le bundle est produit par notre propre outil, et une
// extraction d'export ratée y passerait inaperçue jusqu'à l'ouverture réelle.
titre('Bundle file://');

const hb = await boot({ width: 960, height: 540, dpr: 1, search: '?debug=1', bundle: true });
const MB = globalThis.window.__maxence;
verifier('le bundle démarre', !!MB);
if (MB) {
  hb.frames(10);
  verifier('le bundle joue une animation de rider',
    /^skate\.(roll|idle)\.\d$/.test(MB.player.frameKey()), MB.player.frameKey());
  verifier('le bundle n\'affiche pas d\'écran de panne', hb.element('panne').hidden);

  const solB = MB.solY();
  hb.keyDown('Space'); hb.frames(4); hb.keyUp('Space');
  let maxB = 0;
  for (let i = 0; i < 160; i++) { hb.frame(); maxB = Math.max(maxB, solB - MB.player.y); if (MB.player.auSol && maxB > 5) break; }
  verifier('le bundle fait sauter le rider', maxB > 70, `${maxB.toFixed(0)} px`);
}

// ─── Bilan ───────────────────────────────────────────────────────────────────
console.log(`\n${réussis} réussis, ${échecs.length} échoués\n`);
if (échecs.length) {
  for (const e of échecs) console.log(`  ✗ ${e}`);
  process.exit(1);
}
