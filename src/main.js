// Maxence Rider — amorçage.

import { createLoop } from './core/loop.js';
import { createInput, Action } from './core/input.js';
import { loadAssets, atlas } from './core/assets.js';
import { createRenderer } from './render/renderer.js';
import { drawFrame } from './render/sprite.js';
import { createStateMachine, State } from './game/state.js';
import { createPlayer, RiderState } from './game/player.js';

const DEBUG = new URLSearchParams(location.search).has('debug');

const canvas = document.getElementById('jeu');
const boutonPause = document.getElementById('pause');
const chargement = document.getElementById('chargement');
const panne = document.getElementById('panne');

const renderer = createRenderer(canvas);
const { ctx, view } = renderer;

const SOL = 40; // hauteur du sol depuis le bas de l'espace virtuel

const player = createPlayer({ rider: 'skate', direction: 1 });
const monde = { defilement: 0 };

function solY() {
  return view.h - SOL;
}

function reinitialiser() {
  player.poser(Math.round(view.w * 0.3), solY());
  player.tempsCourse = 0;
  player.distance = 0;
  monde.defilement = 0;
}

function majJeu(dt) {
  input.update();
  player.update(dt, { input, solY: solY() });

  // §6.2 : le rider avance tout seul ; c'est le monde qui défile sous lui.
  monde.defilement += player.vitesse * player.direction * dt;
  player.x = Math.round(view.w * 0.3);
  player.prevX = player.x;

  if (input.consume(Action.RESTART)) reinitialiser();
}

function dessinerJeu(alpha) {
  const y = player.prevY + (player.y - player.prevY) * alpha;
  const sol = solY();

  ctx.fillStyle = '#1b1d27';
  ctx.fillRect(0, 0, view.w, view.h);

  // Sol provisoire : les vraies tuiles et le décor arrivent en P3/P5.
  ctx.fillStyle = '#2a2c3a';
  ctx.fillRect(0, sol, view.w, view.h - sol);
  ctx.fillStyle = '#3a3d4e';
  const pas = 32;
  const decalage = ((monde.defilement % pas) + pas) % pas;
  for (let sx = -decalage; sx < view.w; sx += pas) {
    ctx.fillRect(Math.round(sx), sol, 1, view.h - sol);
  }
  ctx.fillStyle = '#4ed4c4';
  ctx.fillRect(0, sol, view.w, 1);

  drawFrame(ctx, player.frameKey(), player.x, y, {
    flip: player.direction < 0,
    scaleY: player.squash,
  });

  if (DEBUG) {
    ctx.fillStyle = 'rgba(255,201,60,0.9)';
    ctx.fillRect(player.x - 3, Math.round(y), 7, 1);
    ctx.fillRect(player.x, Math.round(y) - 3, 1, 7);
  }
}

// ── Écrans ───────────────────────────────────────────────────────────────────

const jeu = createStateMachine(State.BOOT, {
  [State.PLAY]: {
    enter: () => { input.clear(); },
    update: majJeu,
    render: dessinerJeu,
  },
  [State.PAUSE]: {
    enter: () => { input.clear(); },
    update: () => { input.update(); },
    render: (alpha) => {
      dessinerJeu(alpha);
      ctx.fillStyle = 'rgba(18,19,26,0.72)';
      ctx.fillRect(0, 0, view.w, view.h);
      texteCentre('PAUSE', view.h / 2 - 4, '#f2f0e6');
      texteCentre('Reprendre : Échap, P, ou le bouton', view.h / 2 + 10, '#8a8d9e');
    },
  },
});

function texteCentre(texte, y, couleur) {
  ctx.fillStyle = couleur;
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texte, view.w / 2, y);
}

function basculerPause() {
  if (jeu.is(State.PLAY)) jeu.go(State.PAUSE);
  else if (jeu.is(State.PAUSE)) jeu.go(State.PLAY);
  boutonPause.textContent = jeu.is(State.PAUSE) ? '▶' : 'II';
  boutonPause.setAttribute('aria-label', jeu.is(State.PAUSE) ? 'Reprendre' : 'Pause');
}

const input = createInput(canvas, { onPause: basculerPause });
boutonPause.addEventListener('click', basculerPause);

// ── Orientation et redimensionnement ─────────────────────────────────────────
// C3 : relayout à chaud, sans rechargement ni perte d'état.

function surRedimensionnement() {
  const ancienSol = solY();
  renderer.resize();
  const nouveauSol = solY();
  if (nouveauSol !== ancienSol) {
    // On conserve la hauteur au-dessus du sol, pas la coordonnée absolue :
    // un rider en plein saut ne doit ni se téléporter au sol ni sortir de l'écran.
    const hauteur = ancienSol - player.y;
    player.y = nouveauSol - hauteur;
    player.prevY = player.y;
  }
  player.x = player.prevX = Math.round(view.w * 0.3);
}

window.addEventListener('resize', surRedimensionnement);
window.addEventListener('orientationchange', surRedimensionnement);
window.visualViewport?.addEventListener('resize', surRedimensionnement);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && jeu.is(State.PLAY)) basculerPause();
});

// ── Boucle ───────────────────────────────────────────────────────────────────

const boucle = createLoop({
  update: (dt) => jeu.update(dt),
  render: (alpha) => {
    renderer.begin();
    jeu.render(alpha);
    if (DEBUG) dessinerDebug();
    renderer.end();
  },
});

function dessinerDebug() {
  const lignes = [
    `${boucle.stats.fps} fps · ${boucle.stats.updates} maj`,
    `${view.w}x${view.h} x${view.scale} ${view.portrait ? 'portrait' : 'paysage'}`,
    `${player.state} ${player.frameKey()}`,
    `v ${player.vitesse.toFixed(0)} px/s · ${(player.distance / 10).toFixed(0)} m`,
    player.state === RiderState.AIR ? `vol ${player.tempsVol.toFixed(2)}s` : '',
  ].filter(Boolean);
  ctx.font = '6px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(18,19,26,0.7)';
  ctx.fillRect(2, 2, 120, lignes.length * 8 + 4);
  ctx.fillStyle = '#ffc93c';
  lignes.forEach((l, i) => ctx.fillText(l, 5, 6 + i * 8));
}

// ── Démarrage ────────────────────────────────────────────────────────────────

if (DEBUG) {
  window.__maxence = {
    player, monde, view, jeu, boucle, input, atlas,
    Action, State, RiderState, solY,
  };
}

loadAssets()
  .then(() => {
    chargement.hidden = true;
    reinitialiser();
    jeu.go(State.PLAY);
    boucle.start();
  })
  .catch((err) => {
    chargement.hidden = true;
    panne.hidden = false;
    panne.textContent = `Chargement impossible : ${err.message}`;
    console.error(err);
  });
