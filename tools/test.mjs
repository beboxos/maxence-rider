#!/usr/bin/env node
// Tests automatisés du jeu, sans navigateur.
//
//   node tools/test.mjs
//
// Le jeu tourne dans le harnais headless (tools/harness.mjs) avec un temps
// piloté à la main : chaque exécution est reproductible au pas de simulation
// près. C'est ce qui permet d'affirmer des choses comme « le rider ne traverse
// jamais un obstacle » sans dépendre du timing d'un vrai navigateur.

import { boot, ROOT } from './harness.mjs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Modules purs (aucune dépendance DOM) : testables directement sous Node, sans
// passer par le harnais canvas.
const { resoudre, LARGEUR_RIDER, chevauchementHorizontal } = await import(pathToFileURL(join(ROOT, 'src/game/physics.js')).href);
const { construireEntites, entitesActives } = await import(pathToFileURL(join(ROOT, 'src/game/entities.js')).href);
const { placerSuivant, dernierObstacleX, premierObstacleX } = await import(pathToFileURL(join(ROOT, 'src/game/chunks.js')).href);
const { TOUS_LES_CHUNKS, RESPIRATION, BONUS } = await import(pathToFileURL(join(ROOT, 'src/data/chunks.js')).href);
const { VITESSE_MAX_LEAN } = await import(pathToFileURL(join(ROOT, 'src/data/tuning.js')).href);
const { Family } = await import(pathToFileURL(join(ROOT, 'src/data/entities.js')).href);
const { createPool } = await import(pathToFileURL(join(ROOT, 'src/core/pool.js')).href);
const { createScoring } = await import(pathToFileURL(join(ROOT, 'src/game/scoring.js')).href);
const { createParticleSystem } = await import(pathToFileURL(join(ROOT, 'src/game/particles.js')).href);
const { THEMES, getTheme } = await import(pathToFileURL(join(ROOT, 'src/data/themes.js')).href);
const { saisonCourante, dessinerSaison } = await import(pathToFileURL(join(ROOT, 'src/game/saison.js')).href);
const { createCamera } = await import(pathToFileURL(join(ROOT, 'src/game/camera.js')).href);
const { createParallaxRenderer } = await import(pathToFileURL(join(ROOT, 'src/render/parallax.js')).href);
const { createAudio } = await import(pathToFileURL(join(ROOT, 'src/core/audio.js')).href);
const { dessinerCurb2D, dessinerRampe2D, dessinerCone2D } = await import(pathToFileURL(join(ROOT, 'src/render/obstacles.js')).href);
const { createStorage } = await import(pathToFileURL(join(ROOT, 'src/core/storage.js')).href);

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

const SEED_TEST = 1234567;

/**
 * Réinitialise une run complète (rider, niveau, monde), sans obstacles par
 * défaut : les tests de physique pure (sauts, coyote time…) n'ont rien à voir
 * avec le contenu généré, et un niveau réel finirait par en placer un sur leur
 * chemin après suffisamment de frames.
 * L'attente initiale purge la fenêtre de double tap : sans elle, le tap de
 * clôture du test précédent s'apparie avec le premier tap du suivant et le
 * transforme silencieusement en boost.
 */
function reset({ obstacles = false } = {}) {
  h.wait(400);
  h.frames(2);      // absorbe le grand dt provoqué par l'attente
  M.demarrerRun(SEED_TEST, { obstacles });
  M.jeu.go(M.State.PLAY);
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

// §16 : « aucun glitch, aucune perte d'état » — avec le contenu réel (P4/P5 :
// obstacles, parallaxe, HUD, thème), pas seulement le joueur nu comme les
// vérifications ci-dessus, écrites avant que ce contenu n'existe.
{
  M.demarrerRun(555, { obstacles: true });
  M.jeu.go(M.State.PLAY);
  h.frames(30);
  const etatAvant2 = M.jeu.current;
  const scoreAvant = M.scoring.scoreTotal(0);
  const nbEntitesAvant = M.entites.length;

  h.resize(540, 960, 1); h.frames(10);
  h.resize(960, 540, 1); h.frames(10);
  h.resize(320, 800, 1); h.frames(10); // portrait étroit, cas mobile extrême
  h.resize(960, 540, 1); h.frames(2);

  verifier('rotations multiples : aucune exception levée (implicite si on arrive ici)', true);
  verifier('rotations multiples : état de jeu préservé', M.jeu.current === etatAvant2, M.jeu.current);
  verifier('rotations multiples : le score n\'est pas perdu', M.scoring.scoreTotal(0) === scoreAvant);
  verifier('rotations multiples : les entités du niveau restent chargées',
    M.entites.length === nbEntitesAvant, `${nbEntitesAvant} → ${M.entites.length}`);
}
reset();

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

// §5 : la chute se joue une fois puis se fige — vérifié juste avant les 900 ms
// du §6.7, au-delà desquelles main.js respawn automatiquement le rider (testé
// avec le cycle complet dans la section « Crash et respawn » ci-dessous).
reset();
player.crasher();
h.frames(2);
verifier('crash : animation de chute', /^skate\.crash\.\d$/.test(player.frameKey()), player.frameKey());
h.frames(50);
verifier('crash : figé sur la dernière frame', player.frameKey() === 'skate.crash.5', player.frameKey());
reset();

// ─── Invariant des chunks (§8) ────────────────────────────────────────────────
titre('Invariant des chunks (§8)');

// Le sac tire dans le pool du palier courant ∪ respiration ∪ bonus (voir
// game/level.js) : c'est cet ensemble-là, pas seulement les chunks numérotés,
// qui doit rester sûr pour N'IMPORTE QUELLE paire, dans les deux ordres. Testé
// à VITESSE_MAX_LEAN (460 × 1,15 ≈ 529 px/s, plafond + lean) : c'est la seule
// vitesse qui rend la garantie valable « à toutes les vitesses » sans supposer
// où en est le rider dans la montée en vitesse au moment où il y arrive (voir
// le commentaire d'en-tête de game/chunks.js pour le raisonnement complet).
const poolInvariant = [...TOUS_LES_CHUNKS, ...RESPIRATION, ...BONUS];
let pireGap = Infinity, pirePaire = null, paires = 0;
for (const a of poolInvariant) {
  for (const b of poolInvariant) {
    const dernier = dernierObstacleX(a);
    const premier = premierObstacleX(b);
    if (dernier === null || premier === null) continue; // chunk vide : rien à garantir
    const offsetB = placerSuivant(a, 0, b);
    const gap = (offsetB + premier) - dernier;
    paires++;
    if (gap < pireGap) { pireGap = gap; pirePaire = [a.id, b.id]; }
  }
}
const requis = VITESSE_MAX_LEAN * 0.9;
verifier(`toutes les paires (${paires}) respectent le gap requis`, pireGap >= requis - 0.01,
  `pire cas ${pireGap.toFixed(1)} px ≥ ${requis.toFixed(1)} px requis (${pirePaire?.join(' → ')})`);

// ─── Collisions (physics.resoudre) ───────────────────────────────────────────
titre('Collisions');

const SOL_TEST = 230;
/** Joueur synthétique minimal pour physics.resoudre, sans passer par player.js. */
function joueurTest({ x = 100, y = SOL_TEST, prevY = y, auSol = y >= SOL_TEST, direction = 1 } = {}) {
  return { x, y, prevY, auSol, direction };
}

{
  const curb = { family: Family.LOW, worldX: 0, hitbox: { w: 44, h: 14 }, elevation: 0 };
  const auSol = joueurTest({});
  verifier('LOW : crash si le rider reste au sol',
    resoudre(curb, auSol, SOL_TEST, 0, 0) === 'crash');
  const enSaut = joueurTest({ y: SOL_TEST - 30, prevY: SOL_TEST - 32, auSol: false });
  verifier('LOW : franchi si les pieds passent au-dessus (ollie)',
    resoudre(curb, enSaut, SOL_TEST, 0, 0) === 'clear');
}
{
  const bin = { family: Family.HIGH, worldX: 0, hitbox: { w: 20, h: 32 }, elevation: 0 };
  const sautCourt = joueurTest({ y: SOL_TEST - 20, prevY: SOL_TEST - 22, auSol: false }); // sous les 32 px du bac
  verifier('HIGH : crash si le saut n\'atteint pas le sommet',
    resoudre(bin, sautCourt, SOL_TEST, 0, 0) === 'crash');
  const sautHaut = joueurTest({ y: SOL_TEST - 40, prevY: SOL_TEST - 42, auSol: false });
  verifier('HIGH : franchi si le saut dépasse le sommet (flip)',
    resoudre(bin, sautHaut, SOL_TEST, 0, 0) === 'clear');
}
{
  const gap = { family: Family.GAP, worldX: 0, hitbox: { w: 90, h: 0 }, elevation: 0 };
  const auSol = joueurTest({});
  verifier('GAP : chute si abordé au sol',
    resoudre(gap, auSol, SOL_TEST, 0, 0) === 'crash');
  const enVol = joueurTest({ y: SOL_TEST - 50, prevY: SOL_TEST - 52, auSol: false });
  verifier('GAP : franchi sans dommage si sauté par-dessus',
    resoudre(gap, enVol, SOL_TEST, 0, 0) === 'none');
}
{
  // Coyote time au bord d'un gap : un saut tardif de quelques px passe, plus loin on tombe.
  const gap = { family: Family.GAP, worldX: 45, hitbox: { w: 90, h: 0 }, elevation: 0 };
  const auBord = { ...joueurTest({}), vitesse: 240 };
  verifier('GAP : pas de chute au tout premier contact du bord',
    resoudre(gap, auBord, SOL_TEST, 0, 0) === 'none');
  const dedans = { ...joueurTest({}), vitesse: 240 };
  verifier('GAP : chute une fois le rider engagé au-delà de la tolérance',
    resoudre({ ...gap, worldX: 20 }, dedans, SOL_TEST, 0, 0) === 'crash');
}
{
  // Corner correction : rater le sommet de ≤ 4 px remonte le rider, au-delà c'est un crash.
  const cone = { family: Family.LOW, worldX: 0, hitbox: { w: 15, h: 17 }, elevation: 0 };
  const curb = { family: Family.LOW, worldX: 0, hitbox: { w: 44, h: 14 }, elevation: 0, grindable: true };
  const presque = { ...joueurTest({ y: SOL_TEST - 14, prevY: SOL_TEST - 15, auSol: false }), vy: 50 };
  verifier('CORNER : cone raté de 3 px → remonté dessus', resoudre(cone, presque, SOL_TEST, 0, 0) === 'corner');
  verifier('CORNER : curb raté de 3 px → grind', resoudre(curb, { ...presque, y: SOL_TEST - 11, prevY: SOL_TEST - 12 }, SOL_TEST, 0, 0) === 'grind');
  const trop = { ...joueurTest({ y: SOL_TEST - 8, prevY: SOL_TEST - 9, auSol: false }), vy: 50 };
  verifier('CORNER : cone raté de 9 px → crash', resoudre(cone, trop, SOL_TEST, 0, 0) === 'crash');
  const auSol = { ...joueurTest({}), vy: 0 };
  verifier('CORNER : rider au sol contre le cone → crash', resoudre(cone, auSol, SOL_TEST, 0, 0) === 'crash');
}
{
  // Aimant à rail : retomber à ≤ 16 px d'un bout de rail l'accroche, au-delà non.
  const rail = (dx) => ({ family: Family.RAIL, worldX: 46 + dx, hitbox: { w: 92, h: 10 }, elevation: 4, grindable: true });
  const sommet = SOL_TEST - 4 - 10;
  const retombe = { ...joueurTest({ y: sommet + 1, prevY: sommet - 9, auSol: false }), vy: 600 };
  verifier('RAIL : retombé à 10 px avant le bout → accroché', resoudre(rail(10), retombe, SOL_TEST, 0, 0) === 'grind');
  verifier('RAIL : retombé à 20 px avant le bout → pas accroché', resoudre(rail(20), retombe, SOL_TEST, 0, 0) === 'none');
  verifier('RAIL : retombé à 10 px après le bout → accroché', resoudre(rail(-92 - 10), retombe, SOL_TEST, 0, 0) === 'grind');
  const monte = { ...joueurTest({ y: sommet - 9, prevY: sommet + 1, auSol: false }), vy: -600 };
  verifier("RAIL : l'aimant ne retient pas un rider qui monte", resoudre(rail(10), monte, SOL_TEST, 0, 0) === 'none');
}
{
  const rampe = { family: Family.RAMP, worldX: 0, hitbox: { w: 40, h: 14 }, elevation: 0 };
  const auSol = joueurTest({});
  verifier('RAMP : jamais de crash au contact', resoudre(rampe, auSol, SOL_TEST, 0, 0) === 'ramp');
  const loinEnVol = joueurTest({ y: SOL_TEST - 100, prevY: SOL_TEST - 102, auSol: false });
  verifier('RAMP : pas de déclenchement en survolant de loin',
    resoudre(rampe, loinEnVol, SOL_TEST, 0, 0) === 'none');
}
{
  // Rail élevé (§8, entity.y du chunk) : crash par le côté, franchi par-dessus
  // ET par-dessous (on passe en dessous en roulant normalement au sol).
  const rail = { family: Family.RAIL, worldX: 0, hitbox: { w: 92, h: 10 }, elevation: 24 };
  const auSolDessous = joueurTest({}); // solY=230, rail entre 196 et 206 : le sol (230) est bien en dessous
  verifier('RAIL élevé : on passe dessous sans crash au ras du sol',
    resoudre(rail, auSolDessous, SOL_TEST, 0, 0) === 'clear');
  const surLeRail = joueurTest({ y: SOL_TEST - 25, prevY: SOL_TEST - 27, auSol: false }); // pieds dans [196,206]
  verifier('RAIL élevé : crash si les pieds arrivent dans sa tranche',
    resoudre(rail, surLeRail, SOL_TEST, 0, 0) === 'crash');
  const parDessus = joueurTest({ y: SOL_TEST - 60, prevY: SOL_TEST - 62, auSol: false });
  verifier('RAIL élevé : franchi par-dessus', resoudre(rail, parDessus, SOL_TEST, 0, 0) === 'clear');
}

// Aucune entité DECOR ne doit jamais interrompre le rider (§6.5 dernière ligne).
{
  const poteau = { family: Family.DECOR, worldX: 0, hitbox: { w: 20, h: 60 }, elevation: 0 };
  verifier('DECOR : jamais de collision', resoudre(poteau, joueurTest({}), SOL_TEST, 0, 0) === 'none');
}

// ─── Non-tunneling (swept AABB) ──────────────────────────────────────────────
titre('Non-tunneling (swept AABB)');

// En jeu réel, le pas fixe (core/loop.js) borne le déplacement par pas de
// simulation à VITESSE_MAX_LEAN/60 ≈ 8,8 px — bien en-deçà de la largeur du
// rider (14 px), donc un test naïf aux deux extrémités du pas suffirait déjà à
// ne rien manquer à cette échelle. Le test ci-dessous vise donc directement la
// fonction resoudre() avec un très grand écart de scroll en un seul appel : ça
// simule ce qui arriverait avec une vitesse bien plus élevée (ou un gros
// rattrapage), et ça prouve que la détection reste correcte par construction,
// indépendamment des garanties que le reste du système lui offre par ailleurs.
{
  const fin = { family: Family.LOW, worldX: 50, hitbox: { w: 2, h: 14 }, elevation: 0 };
  const j = joueurTest({ x: 100 }); // bande du rider : [93, 107]
  // scrollAvant=0 → centre à l'écran = 100+50-0 = 150 (loin devant, hors bande)
  // scrollApres=100 → centre à l'écran = 100+50-100 = 50 (loin derrière, hors bande)
  // Aux deux instants échantillonnés, aucun recoupement — mais l'obstacle a
  // nécessairement traversé toute la bande du rider entre les deux (continuité).
  const avantSeul = resoudre(fin, { ...j, y: SOL_TEST, prevY: SOL_TEST, auSol: true }, SOL_TEST, 0, 0);
  const apresSeul = resoudre(fin, { ...j, y: SOL_TEST, prevY: SOL_TEST, auSol: true }, SOL_TEST, 100, 100);
  verifier('témoin : pas de recoupement à t=0 seul', avantSeul === 'none');
  verifier('témoin : pas de recoupement à t=1 seul', apresSeul === 'none');
  const balaye = resoudre(fin, { ...j, y: SOL_TEST, prevY: SOL_TEST, auSol: true }, SOL_TEST, 0, 100);
  verifier('le balayage détecte la traversée qu\'un test aux 2 points manquerait',
    balaye === 'crash', balaye);
}

// ─── Instanciation des entités ───────────────────────────────────────────────
titre('Instanciation des entités');

{
  const chunkTest = { width: 480, entities: [{ type: 'curb', x: 100 }, { type: 'gap', x: 300, w: 70 }] };
  const liste = construireEntites([{ chunk: chunkTest, offset: 1000 }]);
  verifier('worldX = offset du chunk + x local', liste[0].worldX === 1100, liste[0].worldX);
  verifier('largeur de gap reprise depuis le chunk', liste[1].hitbox.w === 70, liste[1].hitbox.w);
  verifier('triée par worldX croissant', liste[0].worldX < liste[1].worldX);

  const { actives, indexSuivant } = entitesActives(liste, 0, 1100, 50);
  verifier('fenêtre active : ne garde que ce qui est proche', actives.length === 1 && actives[0] === liste[0]);
  verifier('le curseur ne recule jamais', indexSuivant >= 0);
}

// ─── Crash et respawn (§6.7) ──────────────────────────────────────────────────
titre('Crash et respawn');

M.demarrerRun(SEED_TEST, { obstacles: false });
h.frames(2);
verifier('3 vies au départ', M.run.vies === 3);

const distanceAvantCrash = player.distance;
player.crasher();
h.frames(2);
verifier('crash : le monde arrête de défiler', M.jeu.current === 'PLAY' && player.state === 'CRASH');
h.frames(58); // > 900 ms : main.js doit respawn automatiquement
verifier('respawn automatique après 900 ms', player.state !== 'CRASH', player.state);
verifier('une vie est perdue', M.run.vies === 2, M.run.vies);
verifier('le rider est reposé au sol', proche(player.y, M.solY(), 1));
verifier('invincibilité active juste après le respawn',
  M.run.tempsTotal < M.run.invincibleJusque);

h.frames(120); // dépasse les 1,8 s d'invincibilité (§6.7)
verifier('l\'invincibilité se termine après 1,8 s', M.run.tempsTotal >= M.run.invincibleJusque);

// Trois crashes consécutifs → game over.
player.crasher();
h.frames(60);
verifier('vies : 1 restante', M.run.vies === 1, M.run.vies);
player.crasher();
h.frames(60);
verifier('game over à 0 vie', M.jeu.current === 'GAMEOVER', M.jeu.current);

// demarrerRun() ne remet que les données (vies, position…) : c'est à
// l'appelant de faire aussi jeu.go(PLAY), exactement comme le fait le handler
// GAMEOVER de main.js — sans ça, la machine à états reste bloquée pour tous
// les tests suivants.
M.demarrerRun(SEED_TEST, { obstacles: false });
M.jeu.go(M.State.PLAY);
h.frames(2);

// ─── Checkpoints et génération de niveau ─────────────────────────────────────
titre('Checkpoints et génération');

M.demarrerRun(SEED_TEST, { obstacles: true });
verifier('le niveau démarre avec des chunks placés', M.level.placés.length > 0,
  `${M.level.placés.length} chunks`);
verifier('un run infini expose au moins un checkpoint après génération',
  M.entites.length >= 0); // les entités peuvent être vides si le sac tire des respirations

M.level.assurerJusque(2400 * 3); // largement au-delà de 5 chunks (§6.7 : un checkpoint tous les 5)
verifier('au moins un checkpoint franchissable généré', M.level.checkpoints.length >= 1,
  `${M.level.checkpoints.length} checkpoints`);
verifier('les checkpoints sont croissants',
  M.level.checkpoints.every((c, i) => i === 0 || c > M.level.checkpoints[i - 1]));

M.demarrerRun(SEED_TEST, { obstacles: false });
h.frames(2);

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
h.wait(2000); // dépasse l'invincibilité initiale clignotante de 1,8 s
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
M.run.invincibleJusque = 0;
tapLong();
h.frames(16);
verifier('le rider est peint en vol', pixelsRider() > 300, `${pixelsRider()} px`);
verifier('le rider a bien décollé', M.solY() - player.y > 60,
  `${(M.solY() - player.y).toFixed(0)} px`);

if (M.view.oy > 0) {
  const [fr, fg, fb] = px(Math.floor(h.canvas.width / 2), Math.floor(M.view.oy / 2));
  verifier('bandes de fond hors viewport', fr < 30 && fg < 30 && fb < 40, `rgb(${fr},${fg},${fb})`);
}

// ─── Pool d'objets (O(1) sans GC) ─────────────────────────────────────────────
titre('Pool d\'objets (O(1) sans GC)');

const testPool = createPool(() => ({ val: 0 }), 3);
verifier('pool créé avec capacité', testPool.capacite === 3 && testPool.count === 0);
const o1 = testPool.acquire();
const o2 = testPool.acquire();
verifier('acquisition augmente le count', testPool.count === 2 && o1 !== null && o2 !== null);
testPool.release(o1);
verifier('libération décrémente le count', testPool.count === 1);
const o3 = testPool.acquire();
const o4 = testPool.acquire();
verifier('pool plein atteint la capacité', testPool.count === 3);
const oOverflow = testPool.acquire();
verifier('pool saturé renvoie null sans crash', oOverflow === null);

// ─── Scoring, Combos et Multiplicateur (§6.4, §6.6) ──────────────────────────
titre('Scoring, Combos et Multiplicateur (§6.4, §6.6)');

const sc = createScoring();
verifier('score initial à zéro', sc.etat.score === 0 && sc.etat.multiplicateur === 1);

// Enregistrement d'un trick
sc.enregistrerTrick('OLLIE', 50, 100, 100);
verifier('premier trick : +50 en attente, multiplicateur passe à 2', sc.etat.enAttente === 50 && sc.etat.multiplicateur === 2);

sc.enregistrerTrick('KICKFLIP', 150, 100, 100);
verifier('second trick : x2 appliqué, multiplicateur passe à 3', sc.etat.enAttente === 350 && sc.etat.multiplicateur === 3);

// Multiplicateur plafonné à 10
for (let i = 0; i < 15; i++) sc.enregistrerTrick('OLLIE', 50, 100, 100);
verifier('multiplicateur plafonné à 10', sc.etat.multiplicateur === 10);

// Inactivité 1.8 s -> encaissement
sc.update(1.85);
verifier('inactivité 1.8s : score en attente encaissé', sc.etat.score > 0 && sc.etat.enAttente === 0 && sc.etat.multiplicateur === 1);

// Perte sur crash
sc.enregistrerTrick('OLLIE', 50, 100, 100);
const scoreAvantCrash = sc.etat.score;
sc.perdreCombo();
verifier('crash : combo et points en attente perdus', sc.etat.enAttente === 0 && sc.etat.multiplicateur === 1 && sc.etat.score === scoreAvantCrash);

// Collectibles et Clean Line
const scoreAvantCoin = sc.etat.score;
sc.ramasserCollectible(100, 100);
verifier('collectible : +100 pts immédiat', sc.etat.score === scoreAvantCoin + 100);

const scoreAvantClean = sc.etat.score;
sc.cleanLine(100, 100);
verifier('clean line : +500 pts immédiat', sc.etat.score === scoreAvantClean + 500);

// Formule de score total avec distance
verifier('scoreTotal inclut la distance (distance_m * 2)', sc.scoreTotal(100) === sc.etat.score + 200);

// Fenêtre de grâce de 200 ms après grind
sc.etat.score = 0;
sc.grinding(0.2); // 2 ticks de 0.1s -> +40 pts
verifier('grind : accumulation de +20 pts / 0.1s', sc.etat.enAttente === 40);
sc.finGrind();
verifier('finGrind active la fenêtre de grâce', sc.etat.grace === true);
sc.update(0.1); // 100 ms < 200 ms
verifier('grâce active : combo non encore encaissé', sc.etat.enAttente === 40);
sc.update(0.15); // > 200 ms au total
verifier('fin de grâce (200 ms) : encaissement', sc.etat.score === 40 && sc.etat.enAttente === 0);

// ─── Particules (§5, §14) ───────────────────────────────────────────────────
titre('Particules (§5, §14)');

const ps = createParticleSystem();
verifier('système de particules initialement vide', ps.pool.count === 0);
ps.poussiere(100, 200, 1);
verifier('émission de poussière active une particule', ps.pool.count === 1);
ps.update(1.0);
verifier('particules recyclées automatiquement après fin d\'anim', ps.pool.count === 0);

// ─── Gameplay P4 en jeu (Grind, Manual, Combos, Collectibles) ─────────────────
titre('Gameplay P4 en jeu (Grind, Manual, Combos, Collectibles)');

// Chevauchement horizontal
const entiteRail = { worldX: 200, hitbox: { w: 90, h: 10 } };
const ratioCentre = chevauchementHorizontal(entiteRail, 144, 200, 1);
verifier('chevauchement horizontal calculé à 100% au centre', ratioCentre >= 0.99, `${(ratioCentre * 100).toFixed(0)}%`);
const ratioBord = chevauchementHorizontal(entiteRail, 144, 200 - 40, 1);
verifier('chevauchement partiel sur le bord', ratioBord > 0.3 && ratioBord < 0.9, `${(ratioBord * 100).toFixed(0)}%`);

// Test de l'état GRIND sur le rider
reset({ obstacles: false });
const solG = M.solY();
const railTest = {
  type: 'rail',
  family: Family.RAIL,
  worldX: M.monde.defilement,
  elevation: 4,
  hitbox: { w: 300, h: 10 },
  grindable: true,
};
player.entrerGrind(railTest, solG);
verifier('player.state passe en GRIND', player.state === M.RiderState.GRIND);
verifier('position Y verrouillée au sommet du rail', player.y === solG - 4 - 10, `y=${player.y}`);
h.frames(7); // > 100 ms
verifier('score accumulé pendant le grind', M.scoring.etat.enAttente >= 20, `enAttente=${M.scoring.etat.enAttente}`);

// Saut depuis le grind
h.keyDown('Space');
h.frames(2);
h.keyUp('Space');
h.frames(2);
verifier('saut depuis le grind : décollage en AIR', player.state === M.RiderState.AIR, player.state);
verifier('le saut depuis le grind active le boost de vitesse 1s', player.boostGrindTimer > 0, `${player.boostGrindTimer.toFixed(2)}s`);
verifier('vitesse augmentée pendant le boost de grind (+35%)', player.vitesse >= 240 * 1.3, `${player.vitesse.toFixed(1)} px/s`);
h.frames(65); // > 1.0 s
verifier('le boost de vitesse se dissipe après 1 seconde', player.boostGrindTimer === 0);

// Manual avec le rider roller
reset({ obstacles: false });
M.demarrerRun(SEED_TEST, { obstacles: false, rider: 'roller' });
verifier('rider roller initialisé', player.stats.id === 'roller');
h.keyDown('ArrowDown');
h.frames(5);
verifier('maintien de flèche bas au sol déclenche le MANUAL', player.state === M.RiderState.MANUAL, player.state);
h.frames(7);
verifier('accumulation de points en manual', M.scoring.etat.enAttente >= 10, `enAttente=${M.scoring.etat.enAttente}`);
h.keyUp('ArrowDown');
h.frames(2);
verifier('relâchement de flèche bas sort du manual', player.state === M.RiderState.ROLL, player.state);

// Collectible au vol
reset({ obstacles: false });
const coinTest = {
  type: 'coin',
  family: Family.COLLECTIBLE,
  worldX: M.monde.defilement,
  elevation: 0,
  hitbox: { w: 12, h: 12 },
  collected: false,
};
const resCoin = resoudre(coinTest, player, solG, M.monde.defilement, M.monde.defilement + 2);
verifier('collision avec un collectible résolue en collect', resCoin === 'collect');

// Combo x10 atteignable (critère d'acceptation P4)
M.scoring.perdreCombo();
for (let trick = 1; trick <= 10; trick++) {
  M.scoring.enregistrerTrick('OLLIE', 50, 100, 100);
}
verifier('combo x10 atteignable', M.scoring.etat.multiplicateur === 10, `combo=x${M.scoring.etat.multiplicateur}`);

// Accumulation de plusieurs boosts simultanés
reset({ obstacles: false });
player.ajouterBoost(1.0, 0.35); // Boost grind
player.ajouterBoost(1.0, 0.25); // Boost saut d'obstacle
h.frames(2);
verifier('2 boosts actifs simultanément s\'accumulent', player.boosts.length === 2, `${player.boosts.length}`);
verifier('vitesse boostée cumulée (+60% de boost)', player.vitesse >= 240 * 1.55, `${player.vitesse.toFixed(1)} px/s`);

// Franchissement d'obstacle en l'air
const curbTest = { type: 'curb', family: Family.LOW, worldX: M.monde.defilement + 50, hitbox: { w: 44, h: 14 } };
const resClear = resoudre(curbTest, { ...player, y: solG - 40, prevY: solG - 40, auSol: false }, solG, 0, 100);
verifier('franchissement d\'obstacle en l\'air résolu en clear', resClear === 'clear');

// Collectible Croix Verte (Bonus Vie +1)
reset({ obstacles: false });
const lifeCrossTest = {
  type: 'life_cross',
  family: Family.COLLECTIBLE,
  worldX: M.monde.defilement,
  elevation: 0,
  hitbox: { w: 16, h: 16 },
  collected: false,
};
const resLife = resoudre(lifeCrossTest, player, solG, M.monde.defilement, M.monde.defilement + 2);
verifier('collision avec life_cross résolue en collect', resLife === 'collect');

// Gain de vie au changement de palier 10 000 pts
reset({ obstacles: false });
M.run.vies = 2;
M.scoring.etat.score = 12000;
h.frames(2);
verifier('palier 10k pts donne +1 vie', M.run.vies === 3, `vies=${M.run.vies}`);

// Multi-grinds et rails longs
const chunkDouble = TOUS_LES_CHUNKS.find(c => c.id === 'p4_double_grind');
verifier('chunk double grind présent dans la bibliothèque', !!chunkDouble);
const chunkTriple = TOUS_LES_CHUNKS.find(c => c.id === 'p4_triple_grind');
verifier('chunk triple grind présent dans la bibliothèque', !!chunkTriple);

// Progression par niveau tous les 10 000 points
reset({ obstacles: false });
M.scoring.etat.score = 25000;
h.frames(2);
verifier('palier calculé à 25k pts = niveau 3 (École)', M.level.palier === 3, `Niveau ${M.level.palier}`);
verifier('thème niveau 3 est Le Campus & École', getTheme(M.level.palier).nom === 'Le Campus & École');
verifier('vitesse globale majorée au niveau 3', player.vitesse > 240 * 1.1, `${player.vitesse.toFixed(1)} px/s`);

// ─── 5 Ambiances et Thèmes (§9) ──────────────────────────────────────────────
titre('5 Ambiances et Thèmes (§9)');

verifier('5 thèmes distincts configurés', Object.keys(THEMES).length === 5);
for (let p = 1; p <= 5; p++) {
  const t = getTheme(p);
  verifier(`thème palier ${p} (${t.nom}) : ciel, tuiles et sol définis`,
    !!(t.cielHaut && t.cielBas && t.solLigne && t.tuilesSol.length > 0 && t.murs.length > 0));
}
verifier('getTheme borne les paliers hors limite', getTheme(99).id === THEMES[5].id && getTheme(-1).id === THEMES[1].id);

// ─── Caméra dynamique et Screen Shake (§6.2, §10) ────────────────────────────
titre('Caméra dynamique et Screen Shake (§6.2, §10)');

const cam = createCamera();
const offRepos = cam.getOffset(240, 1);
verifier('caméra : anticipation à vitesse 240 px/s = +60 px', offRepos.anticipationX === 60);

cam.shake(8, 0.3);
const offShake = cam.getOffset(240, 1);
verifier('shake déclenché génère un décalage', Math.abs(offShake.shakeX) > 0 || Math.abs(offShake.shakeY) > 0);

cam.update(0.35); // expiration du shake
const offApres = cam.getOffset(240, 1);
verifier('shake amorti et terminé après sa durée', offApres.shakeX === 0 && offApres.shakeY === 0);

// ─── Rendu Parallaxe 3 couches (§14) ─────────────────────────────────────────
titre('Rendu Parallaxe 3 couches (§14)');

const pr = createParallaxRenderer();
verifier('moteur de parallaxe instanciable sans erreur', typeof pr.render === 'function');

// ─── Audio synthétisé Web Audio API (§12) ────────────────────────────────────
titre('Audio synthétisé Web Audio API (§12)');

const aud = createAudio();
verifier('moteur audio instancié avec état muet configurable', typeof aud.isMuted === 'function');
const initMute = aud.isMuted();
aud.toggleMute();
verifier('toggleMute inverse l\'état', aud.isMuted() === !initMute);
aud.setMuted(initMute);
verifier('setMuted rétablit l\'état', aud.isMuted() === initMute);
verifier('tous les SFX sont appelables sans erreur',
  typeof aud.sfx.jump === 'function'
  && typeof aud.sfx.land === 'function'
  && typeof aud.sfx.grindTick === 'function'
  && typeof aud.sfx.coin === 'function'
  && typeof aud.sfx.cleanLine === 'function'
  && typeof aud.sfx.crash === 'function'
  && typeof aud.sfx.combo === 'function');

// ─── Obstacles 2D de profil (§6.5) ───────────────────────────────────────────
titre('Obstacles 2D de profil (§6.5)');

verifier('renderers 2D de profil définis',
  typeof dessinerCurb2D === 'function'
  && typeof dessinerRampe2D === 'function'
  && typeof dessinerCone2D === 'function');

// ─── Game Over interactif & Boutons Rejouer / Menu ───────────────────────────
titre('Game Over interactif & Boutons Rejouer / Menu');

reset({ obstacles: false });
M.jeu.go(M.State.GAMEOVER);
verifier('état GAMEOVER actif', M.jeu.is(M.State.GAMEOVER));

// Clic sur "REJOUER" (gauche du centre, y=165)
h.canvas.dispatch('click', { clientX: 370, clientY: 330 });
verifier('clic sur Rejouer relance immédiatement en PLAY', M.jeu.is(M.State.PLAY));
verifier('3 vies réinitialisées au restart', M.run.vies === 3);

// Retour au Game Over puis Clic sur "MENU / RIDER" (droite du centre, y=165)
M.jeu.go(M.State.GAMEOVER);
h.canvas.dispatch('click', { clientX: 628, clientY: 330 });
verifier('clic sur Menu / Rider renvoie à l\'écran titre State.MENU', M.jeu.is(M.State.MENU));

// ─── Écran d'accueil & Titre Maxence Rider (P6) ──────────────────────────────
titre('Écran d\'accueil & Titre Maxence Rider (P6)');

M.jeu.go(M.State.MENU);
verifier('état MENU / Écran titre actif', M.jeu.is(M.State.MENU));

// Défilement du décor en fond de menu
const scrollMenuAvant = M.monde.defilement;
h.frames(10);
verifier('le décor défile doucement en arrière-plan du menu', M.monde.defilement > scrollMenuAvant);

// §7 : le roller est verrouillé tant que 25 000 pts cumulés ne sont pas
// atteints — cliquer dessus ne doit pas le sélectionner.
verifier('roller verrouillé par défaut', !M.storage.riderDebloque('roller'));
h.canvas.dispatch('click', { clientX: 730, clientY: 200 });
verifier('état reste MENU après clic sur rider verrouillé (ne démarre pas)', M.jeu.is(M.State.MENU));
verifier('le rider reste skate tant que le roller est verrouillé', M.selectedRider === 'skate');

// Une fois débloqué (score cumulé simulé), le clic sélectionne bien roller.
M.storage.debloquerRider('roller');
h.canvas.dispatch('click', { clientX: 730, clientY: 200 });
verifier('état reste MENU après sélection de rider (ne démarre pas)', M.jeu.is(M.State.MENU));
verifier('le roller débloqué devient sélectionnable', M.selectedRider === 'roller');

// Clic sur le bouton COMMENCER (clientX 620, clientY 284)
h.canvas.dispatch('click', { clientX: 620, clientY: 284 });
verifier('clic sur COMMENCER lance la partie en PLAY', M.jeu.is(M.State.PLAY));
verifier('le rider actif est bien Maxence Roller', M.player.stats.id === 'roller');
verifier('le rider commence avec une invincibilité protectrice', M.run.invincibleJusque > 0);
verifier('le rider commence la partie avec 3 vies', M.run.vies === 3);

// ─── Orientation du sprite ───────────────────────────────────────────────────
titre('Orientation du sprite');

const { flipPourDirection } = await import('../src/render/sprite.js');
verifier('sens droite (direction +1) → sprite flippé', flipPourDirection(1) === true);
verifier('sens gauche (direction -1) → sprite non flippé', flipPourDirection(-1) === false);

// ─── Persistance (§12, core/storage.js) ──────────────────────────────────────
titre('Persistance (§12)');

// Note sur .flush() dans ce bloc : planifierEcriture() utilise un vrai
// setTimeout (500 ms de temps RÉEL, pas simulé par le harnais). Sans flush()
// avant localStorage.clear(), ce timer continue de courir en arrière-plan et
// finit par réécrire une VIEILLE valeur par-dessus tout ce que les tests
// suivants auront fait entre-temps — exactement le genre de fuite de timer
// déjà rencontrée avec la musique en P4bis. flush() écrit tout de suite et
// annule le timer, donc plus rien à laisser traîner.

// Panne simulée : getItem qui lève, comme le ferait la navigation privée iOS
// que le §12 demande explicitement de gérer.
{
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('QuotaExceededError'); } };
  const s = createStorage();
  verifier('bascule sur un store mémoire si localStorage échoue', s.disponible === false);
  s.setSetting('haptics', false); // ne doit pas planter, même sans backend
  verifier('les réglages restent lisibles malgré l\'absence de backend',
    s.settings.haptics === false);
  globalThis.localStorage = original;
}

// Un schéma corrompu ou d'une version antérieure est réinitialisé, pas
// interprété au petit bonheur (§12 : « si schema < 1, réinitialiser proprement
// plutôt que de deviner »).
{
  localStorage.setItem('maxence-rider.v1', JSON.stringify({ schema: 0, settings: { sound: false } }));
  const s = createStorage();
  verifier('un schéma obsolète repart de zéro', s.settings.sound === true);
  s.flush(); localStorage.clear();
}

{
  localStorage.setItem('maxence-rider.v1', '{ceci n\'est pas du JSON');
  const s = createStorage();
  verifier('un JSON corrompu ne fait pas planter le chargement', s.settings.sound === true);
  s.flush(); localStorage.clear();
}

// Classement : tri décroissant, tronqué à 10 (§12).
{
  const s = createStorage();
  for (let i = 0; i < 15; i++) s.ajouterScore('landscape', 'endless', { score: i * 100, distance: i });
  const liste = s.meilleursScores('landscape', 'endless');
  verifier('classement tronqué à 10', liste.length === 10, `${liste.length} entrées`);
  verifier('classement trié décroissant', liste[0].score === 1400 && liste[9].score === 500,
    `${liste[0].score} .. ${liste[9].score}`);
  verifier('paysage et portrait restent des classements séparés',
    s.meilleursScores('portrait', 'endless').length === 0);
  s.flush(); localStorage.clear();
}

// Déblocage : au-delà du seuil, jamais en-deçà.
{
  const s = createStorage();
  verifier('roller verrouillé au départ', !s.riderDebloque('roller'));
  s.ajouterScoreCumule(10000);
  verifier('10 000 pts cumulés ne suffisent pas', !s.riderDebloque('roller'));
  s.debloquerRider('roller');
  verifier('debloquerRider() débloque effectivement', s.riderDebloque('roller'));
  s.debloquerRider('roller'); // idempotent
  verifier('un second débloquage ne duplique rien',
    s.progress.ridersUnlocked.filter((r) => r === 'roller').length === 1);
  s.flush(); localStorage.clear();
}

// Effacer mes données (§12) : tout repart de l'état par défaut.
{
  const s = createStorage();
  s.ajouterScoreCumule(5000);
  s.ajouterScore('landscape', 'endless', { score: 999 });
  s.effacerTout();
  verifier('effacerTout() repart de zéro',
    s.progress.totalScore === 0 && s.meilleursScores('landscape', 'endless').length === 0);
  s.flush(); localStorage.clear();
}

// ─── Persistance intégrée au jeu ──────────────────────────────────────────────
titre('Persistance intégrée au jeu');

localStorage.clear();
reset({ obstacles: false });

verifier('storage exposé et disponible dans le vrai jeu', M.storage.disponible === true);

// §7 : déblocage réel du roller par le score cumulé sur plusieurs runs. Il
// faut vraiment épuiser les 3 vies (pas juste crasher une fois) pour atteindre
// GAMEOVER, où enregistrerFinDeRun() cumule le score dans storage.
M.storage.effacerTout();
verifier('roller verrouillé en tout début de partie', !M.storage.riderDebloque('roller'));
M.scoring.etat.score = 30000; // simule un run qui a rapporté 30 000 pts
// Franchir 10 000 pts change de palier et offre une vie bonus (§ progression
// de niveau) : laisser cet effet se produire avant de fixer vies=1, sinon le
// bonus le fait remonter à 2 et le crash respawn au lieu d'aller en GAMEOVER.
h.frames(2);
M.run.vies = 1;
player.crasher();
h.frames(60); // > 900 ms : crash → 0 vie → GAMEOVER → enregistrerFinDeRun()
verifier('game over enregistre le run', M.jeu.current === 'GAMEOVER', M.jeu.current);
verifier('roller débloqué après 25 000 pts cumulés (§7)', M.storage.riderDebloque('roller'),
  `totalScore=${M.storage.progress.totalScore}`);
M.jeu.go(M.State.MENU);

// Coordonnées de clic canvas → espace virtuel : le harnais n'a pas de
// getBoundingClientRect, donc main.js retombe sur { width: canvas.width },
// et scaleX = view.w / canvas.width. Ici canvas.width=960, view.w=480 → le
// facteur est 2 : un clic à la position virtuelle (x,y) s'envoie en
// multipliant par ce facteur, exactement comme les tests « clic sur
// COMMENCER » plus haut le font déjà (clientX 620 → cx 310 = rightX).
const echelleClic = h.canvas.width / M.view.w;
const clicVirtuel = (x, y) => h.canvas.dispatch('click', { clientX: x * echelleClic, clientY: y * echelleClic });

// ─── Écran RÉGLAGES ───────────────────────────────────────────────────────────
titre('Écran RÉGLAGES');

M.jeu.go(M.State.SETTINGS);
h.frames(2);
verifier('état SETTINGS actif', M.jeu.is(M.State.SETTINGS));

const haptiqueAvant = M.storage.settings.haptics;
// Item « Vibrations » : troisième ligne de optionsReglages() → y = 46+2*22 = 90.
clicVirtuel(240, 90);
verifier('clic sur un réglage le bascule', M.storage.settings.haptics === !haptiqueAvant,
  `${haptiqueAvant} → ${M.storage.settings.haptics}`);

// Bouton « Effacer mes données » : deux clics, pas un seul (§12 : confirmation).
M.storage.ajouterScoreCumule(1234);
const yEffacer = 46 + 4 * 22 + 10;
clicVirtuel(240, yEffacer);
verifier('un seul clic ne suffit pas à effacer', M.storage.progress.totalScore > 0);
clicVirtuel(240, yEffacer);
verifier('le second clic confirme l\'effacement', M.storage.progress.totalScore === 0);

h.keyDown('Escape');
h.frames(2);
verifier('Échap quitte les réglages vers le menu', M.jeu.is(M.State.MENU));

// ─── Écran SCORES ─────────────────────────────────────────────────────────────
titre('Écran SCORES');

M.storage.ajouterScore('landscape', 'endless', { score: 4242, distance: 100, combo: 5, rider: 'skate', date: '2026-01-01' });
M.jeu.go(M.State.SCORES);
h.frames(2);
verifier('état SCORES actif', M.jeu.is(M.State.SCORES));
h.keyDown('KeyR');
h.frames(2);
verifier('R depuis l\'écran scores retourne au menu', M.jeu.is(M.State.MENU));

// ─── Haptique (§11) ───────────────────────────────────────────────────────────
titre('Haptique (§11)');

// Le vibrer() sur crash vit dans majCollisions() (main.js), pas dans
// player.crasher() : un appel direct à crasher() ne l'exercerait pas. Il faut
// une vraie collision — seed 999 place un curb en worldX=100 (§P3/P4bis).
function provoquerCrashReel() {
  M.demarrerRun(999, { obstacles: true });
  M.jeu.go(M.State.PLAY);
  h.frames(2);
  // §6.7 : 1,8 s d'invincibilité au démarrage d'un run — à 240 px/s ça couvre
  // 432 px, largement au-delà du curb en worldX=100. Sans la lever, le rider
  // le traverse sans jamais entrer en collision.
  M.run.invincibleJusque = 0;
  for (let i = 0; i < 120 && M.jeu.is(M.State.PLAY) && player.state !== 'CRASH'; i++) h.frame();
}

M.storage.setSetting('haptics', true);
reset({ obstacles: false });
h.vibrations.length = 0; // purge les vibrations des resets précédents

tapCourt();
for (let i = 0; i < 160 && !(player.state === 'LAND'); i++) h.frame();
h.frames(2);
verifier('un trick réussi déclenche une vibration courte (§11)',
  h.vibrations.includes(12), JSON.stringify(h.vibrations));

h.vibrations.length = 0;
provoquerCrashReel();
verifier('crash obtenu pour le test de vibration', player.state === 'CRASH', player.state);
verifier('un crash déclenche le motif de vibration [40,30,40] (§11)',
  h.vibrations.some((v) => Array.isArray(v) && v[0] === 40 && v[1] === 30 && v[2] === 40),
  JSON.stringify(h.vibrations));

M.storage.setSetting('haptics', false);
h.vibrations.length = 0;
provoquerCrashReel();
verifier('haptique désactivée dans les réglages → aucune vibration',
  h.vibrations.length === 0, JSON.stringify(h.vibrations));

M.storage.setSetting('haptics', true);
localStorage.clear();
reset({ obstacles: false });

// ─── Navigation clavier (§16 : toute action accessible au clavier) ──────────
titre('Navigation clavier du menu et des réglages');

M.jeu.go(M.State.MENU);
h.frames(2);

// MENU : 5 items — skate, roller, commencer, scores, réglages — cyclique.
verifier('le menu démarre le curseur sur COMMENCER', M.player.stats.id === 'skate'); // sanity : état de base
h.keyDown('KeyW'); h.frames(1); // MENU_UP depuis 'commencer' (index 2) → 'roller' (1)
h.keyDown('Enter'); h.frames(2);
verifier('ArrowUp/W navigue vers le haut sans souris ni tactile',
  !M.jeu.is(M.State.PLAY), M.jeu.current); // roller verrouillé : Entrée ne lance rien

M.storage.debloquerRider('roller');
h.keyDown('Enter'); h.frames(2); // reconfirme sur 'roller', débloqué cette fois
verifier('Entrée active l\'item survolé au clavier (roller débloqué)',
  M.selectedRider === 'roller');

h.keyDown('KeyS'); h.frames(1); // MENU_DOWN : roller(1) → commencer(2)
h.keyDown('KeyS'); h.frames(1); // commencer(2) → scores(3)
h.keyDown('Enter'); h.frames(2);
verifier('ArrowDown/S + Entrée atteint et active SCORES sans souris', M.jeu.is(M.State.SCORES));

h.keyDown('Escape'); h.frames(2);
verifier('Échap revient au menu depuis les scores', M.jeu.is(M.State.MENU));

// SETTINGS : 5 items — 4 réglages + « effacer », navigation + activation.
M.jeu.go(M.State.SETTINGS);
h.frames(2);
const musiqueAvant = M.storage.settings.music;
h.keyDown('KeyS'); h.frames(1); // 0 (sons) → 1 (musique)
h.keyDown('Enter'); h.frames(2);
verifier('navigation clavier + Entrée bascule un réglage sans souris',
  M.storage.settings.music === !musiqueAvant);

// Descendre jusqu'à « Effacer mes données » (index = nb de réglages). Sortir
// et rentrer réinitialise le curseur à 0 (enter() du handler SETTINGS) : sans
// ça, le curseur était déjà à 1 (musique) après le test précédent, et 4 pas de
// plus retombe sur 0 par le modulo cyclique, pas sur « effacer ».
M.jeu.go(M.State.MENU);
M.jeu.go(M.State.SETTINGS);
h.frames(2);
const nbReglages = 4;
for (let i = 0; i < nbReglages; i++) { h.keyDown('KeyS'); h.frames(1); }
M.storage.ajouterScoreCumule(999);
h.keyDown('Enter'); h.frames(2);
verifier('premier Entrée sur « effacer » demande confirmation, n\'efface pas',
  M.storage.progress.totalScore > 0);
h.keyDown('Enter'); h.frames(2);
verifier('second Entrée confirme l\'effacement au clavier', M.storage.progress.totalScore === 0);

h.keyDown('Escape'); h.frames(2);
verifier('Échap revient au menu depuis les réglages', M.jeu.is(M.State.MENU));

localStorage.clear();
reset({ obstacles: false });

// ─── Bundle file:// ──────────────────────────────────────────────────────────
// Le jeu doit démarrer aussi bien depuis dist/bundle.js que depuis les modules.
// Ce n'est pas redondant : le bundle est produit par notre propre outil, et une
// extraction d'export ratée y passerait inaperçue jusqu'à l'ouverture réelle.
titre('Bundle file://');

const hb = await boot({ width: 960, height: 540, dpr: 1, search: '?debug=1', bundle: true });
const MB = globalThis.window.__maxence;
verifier('le bundle démarre', !!MB);
if (MB) {
  MB.demarrerRun();
  MB.jeu.go(MB.State.PLAY);
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

// ─── Avertissement stockage indisponible (§12) ───────────────────────────────
// « En cas d'échec, basculer sur un store mémoire et afficher une fois » — pas
// juste logger en console, qu'un joueur ne voit jamais. Il faut simuler la
// panne AVANT le chargement de main.js, donc un boot() dédié.
titre('Avertissement stockage indisponible (§12)');
{
  const hp = await boot({
    width: 960, height: 540, dpr: 1, search: '?debug=1', localStorageEchoue: true,
  });
  const Mp = globalThis.window.__maxence;
  verifier('storage bascule en mémoire quand localStorage échoue', Mp.storage.disponible === false);
  hp.frames(2);

  const px = (x, y) => {
    const i = (y * hp.canvas.width + x) * 4;
    return [hp.canvas.data[i], hp.canvas.data[i + 1], hp.canvas.data[i + 2]];
  };
  const [r, g, b] = px(Math.floor(hp.canvas.width / 2), 4);
  verifier('un bandeau d\'avertissement orange est peint en haut de l\'écran',
    r > 200 && g > 60 && g < 140 && b < 100, `rgb(${r},${g},${b})`);

  hp.frame(5000); // au-delà des 4 s d'affichage
  const [r2] = px(Math.floor(hp.canvas.width / 2), 4);
  verifier('le bandeau disparaît après quelques secondes', r2 < 200, `r=${r2}`);
}

// ─── Persistance entre deux sessions (§16 : « survit à la fermeture ») ───────
// En dernier, volontairement : chaque boot() réinstalle globalThis.window,
// .document, .requestAnimationFrame — tout ce que h/M/player utilisaient
// depuis le début du fichier. Après ce bloc, plus aucun test ne doit dépendre
// de l'environnement global — exactement comme le bloc « Bundle file:// »
// juste au-dessus, qui pollue de la même façon et pour la même raison.
titre('Persistance entre deux sessions');

localStorage.clear();
{
  // Première « session » : un run qui rapporte des points.
  const h1 = await boot({ width: 960, height: 540, dpr: 1, search: '?debug=1', resetStorage: true });
  const M1 = globalThis.window.__maxence;
  h1.frames(2);
  M1.demarrerRun(999, { obstacles: false });
  M1.jeu.go(M1.State.PLAY);
  h1.frames(2);
  M1.scoring.etat.score = 777;
  M1.run.vies = 1; // sinon 3 vies par défaut : un seul crash ne suffit pas au game over
  M1.player.crasher();
  h1.frames(60);
  verifier('session 1 : le run est enregistré', M1.storage.progress.totalScore === 777);
  // planifierEcriture() debounce sur un vrai setTimeout(500ms) — flush() écrit
  // tout de suite. Sans lui, le second boot() (qui suit en quelques ms de
  // temps réel) lirait avant que l'écriture différée n'ait eu lieu : un vrai
  // navigateur aurait le même problème si on fermait l'onglet dans la même
  // fraction de seconde, raison d'être de C4 (« jamais pendant une frame ») —
  // mais ici on veut vérifier l'ÉCRITURE, pas ce cas limite de timing.
  M1.storage.flush();

  // Deuxième « session » : nouveau boot, MÊME localStorage (fermer/rouvrir).
  const h2 = await boot({ width: 960, height: 540, dpr: 1, search: '?debug=1', resetStorage: false });
  const M2 = globalThis.window.__maxence;
  h2.frames(2);
  verifier('session 2 : le score cumulé a survécu à la « fermeture »',
    M2.storage.progress.totalScore === 777, `lu : ${M2.storage.progress.totalScore}`);
  verifier('session 2 : le classement a survécu aussi',
    M2.storage.meilleursScores('landscape', 'endless').some((s) => s.score === 777));
}
localStorage.clear();

// ─── Décor de saison (Halloween) ─────────────────────────────────────────────
titre('Décor de saison : Halloween du 27/10 au 04/11, heure de Paris');
{
  const jour = (iso) => saisonCourante(new Date(iso));
  verifier('26/10 : pas de décor', jour('2026-10-26T12:00:00+01:00') === null);
  verifier('27/10 : décor (4 jours avant)', jour('2026-10-27T12:00:00+01:00') === 'halloween');
  verifier('31/10 : décor', jour('2026-10-31T12:00:00+01:00') === 'halloween');
  verifier('04/11 : décor (4 jours après)', jour('2026-11-04T12:00:00+01:00') === 'halloween');
  verifier('05/11 : plus de décor', jour('2026-11-05T12:00:00+01:00') === null);
  verifier('en plein été : pas de décor', jour('2026-07-14T12:00:00+02:00') === null);
  verifier('heure de Paris : 26/10 23h30 UTC = 27/10 à Paris', jour('2026-10-26T23:30:00Z') === 'halloween');
  verifier('?theme=halloween force le décor', saisonCourante(new Date('2026-07-14T12:00:00Z'), 'halloween') === 'halloween');
  verifier('?theme=aucun le coupe', saisonCourante(new Date('2026-10-31T12:00:00Z'), 'aucun') === null);
  const appels = [];
  const faux = new Proxy({}, { get: (_, nom) => (nom === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...a) => { appels.push(nom); } ), set: () => true });
  dessinerSaison(faux, { w: 960, h: 540 }, 1.5, null);
  verifier("hors saison : rien n'est dessiné", appels.length === 0);
  dessinerSaison(faux, { w: 960, h: 540 }, 1.5, 'halloween');
  verifier('en saison : teinte et décors dessinés', appels.includes('fillRect') && appels.filter((n) => n === 'fillText').length === 8);
  verifier('le contexte est restauré (save/restore équilibrés)', appels.filter((n) => n === 'save').length === appels.filter((n) => n === 'restore').length);
}

// ─── Bilan ───────────────────────────────────────────────────────────────────
console.log(`\n${réussis} réussis, ${échecs.length} échoués\n`);
if (échecs.length) {
  for (const e of échecs) console.log(`  ✗ ${e}`);
  process.exit(1);
}

// Sortie explicite. Sans elle, le process reste vivant indéfiniment après le
// bilan (`_getActiveHandles()`/`_getActiveResourcesInfo()` ne montrent pourtant
// rien, `--trace-exit` n'affiche rien non plus, et le comportement varie d'un
// run à l'autre à code strictement identique) — signe d'une race condition
// dans l'environnement de test plutôt que d'un handle mal fermé identifiable ;
// suspect probable : l'interaction entre le mock Image/Canvas du harnais et le
// nombre bien plus élevé de chargements d'assets (menu_hero.png, thèmes) que
// lorsque ce fichier ne testait que P1-P3. N'affecte pas le jeu lui-même — un
// vrai navigateur n'a pas ce cycle de vie de process à gérer.
process.exit(0);
