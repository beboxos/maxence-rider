// Maxence Rider — amorçage.

import { createLoop } from './core/loop.js';
import { createInput, Action } from './core/input.js';
import { loadAssets, atlas, frame as frameInfo } from './core/assets.js';
import { mulberry32 } from './core/rng.js';
import { createRenderer } from './render/renderer.js';
import { drawFrame, flipPourDirection } from './render/sprite.js';
import { createStateMachine, State } from './game/state.js';
import { createPlayer, RiderState } from './game/player.js';
import { createLevel } from './game/level.js';
import { construireEntites, entitesActives } from './game/entities.js';
import { resoudre } from './game/physics.js';
import { Family, ENTITIES } from './data/entities.js';

const DEBUG = new URLSearchParams(location.search).has('debug');

const canvas = document.getElementById('jeu');
const boutonPause = document.getElementById('pause');
const chargement = document.getElementById('chargement');
const panne = document.getElementById('panne');

const renderer = createRenderer(canvas);
const { ctx, view } = renderer;

const SOL = 40; // hauteur du sol depuis le bas de l'espace virtuel
const MARGE_VUE = 80; // px hors écran avant de considérer une entité invisible

const player = createPlayer({ rider: 'skate', direction: 1 });
const monde = { defilement: 0, prevDefilement: 0 };

const BONUS_RAMPE = 1.4; // §6.5

// §6.7 : 3 vies, checkpoints tous les 5 chunks, invincibilité 1,2 s au respawn.
const run = {
  vies: 3,
  invincibleJusque: 0, // en secondes de jeu écoulées (tempsTotal)
  tempsTotal: 0,
  seed: (Date.now() % 0xffffffff) >>> 0,
};

let level = null;
let entites = [];
let curseurEntites = 0;

function solY() {
  return view.h - SOL;
}

function nouvelleSeed() {
  return (Date.now() % 0xffffffff) >>> 0;
}

function demarrerRun(seed = nouvelleSeed(), { obstacles = true } = {}) {
  run.seed = seed;
  run.vies = 3;
  run.invincibleJusque = 0;
  run.tempsTotal = 0;

  level = createLevel({ rng: mulberry32(seed) });
  level.assurerJusque(0);
  // `obstacles: false` sert aux tests de physique pure (sauts, coyote time…) :
  // sans lui, un test qui avance des dizaines de frames finirait par heurter
  // un vrai obstacle du niveau généré, pour une raison qui n'a rien à voir
  // avec ce qu'il vérifie.
  entites = obstacles ? construireEntites(level.placés) : [];
  curseurEntites = 0;

  player.poser(Math.round(view.w * 0.3), solY());
  player.tempsCourse = 0;
  player.distance = 0;
  player.bonusRampe = 1;
  monde.defilement = 0;
  monde.prevDefilement = 0;
}

/** Repositionne le rider au dernier checkpoint franchi, invincibilité brève. */
function respawn() {
  const cible = level.dernierCheckpointFranchi(monde.defilement);
  monde.defilement = cible;
  monde.prevDefilement = cible;
  player.poser(Math.round(view.w * 0.3), solY());
  player.bonusRampe = 1;
  run.invincibleJusque = run.tempsTotal + 1.2;
  // Un respawn peut faire reculer le défilement : le curseur d'entités actives
  // n'est valide que pour un défilement croissant (game/entities.js), il faut
  // le réarmer pour qu'il puisse revoir les entités déjà dépassées.
  curseurEntites = 0;
}

function majCollisions(scrollAvant, scrollApres) {
  if (run.tempsTotal < run.invincibleJusque) return; // §6.7 : invincibilité au respawn

  const { actives, indexSuivant } = entitesActives(entites, curseurEntites, monde.defilement, 600);
  curseurEntites = indexSuivant;

  for (const entite of actives) {
    const resultat = resoudre(entite, player, solY(), scrollAvant, scrollApres);
    if (resultat === 'crash') {
      player.crasher();
      return;
    }
    if (resultat === 'ramp') {
      player.bonusRampe = BONUS_RAMPE;
    }
  }
}

function majJeu(dt) {
  input.update();

  run.tempsTotal += dt;
  monde.prevDefilement = monde.defilement;

  const scrollAvant = monde.defilement;
  player.update(dt, { input, solY: solY() });

  if (player.state !== RiderState.CRASH) {
    // Toujours croissant : c'est une distance parcourue, pas une coordonnée
    // écran. Le sens visuel (§6.2 : niveaux impairs à droite, pairs à gauche)
    // n'intervient que dans la projection monde→écran (screenXDe), jamais ici
    // — sinon un niveau "vers la gauche" ferait reculer le défilement, et
    // game/level.js ne saurait plus jusqu'où générer de nouveaux chunks.
    monde.defilement += player.vitesse * dt;
  }
  player.x = Math.round(view.w * 0.3);
  player.prevX = player.x;

  level.assurerJusque(monde.defilement);
  // Le niveau peut avoir généré de nouveaux chunks : la liste plate d'entités
  // doit suivre (§14 : reconstruite seulement quand du contenu neuf apparaît,
  // pas à chaque frame).
  if (entites.length < level.placés.reduce((n, p) => n + p.chunk.entities.length, 0)) {
    entites = construireEntites(level.placés);
  }

  if (player.state === RiderState.CRASH) {
    if (player.crashTermine) {
      run.vies--;
      if (run.vies <= 0) jeu.go(State.GAMEOVER);
      else respawn();
    }
  } else {
    majCollisions(scrollAvant, monde.defilement);
  }

  if (input.consume(Action.RESTART)) demarrerRun();
}

// ── Rendu ────────────────────────────────────────────────────────────────────

function screenXDe(worldX, scroll) {
  return player.x + player.direction * (worldX - scroll);
}

function dessinerSol(sol, scroll) {
  ctx.fillStyle = '#2a2c3a';
  ctx.fillRect(0, sol, view.w, view.h - sol);
  ctx.fillStyle = '#3a3d4e';
  const pas = 32;
  const decalage = (((scroll * player.direction) % pas) + pas) % pas;
  for (let sx = -decalage; sx < view.w; sx += pas) {
    ctx.fillRect(Math.round(sx), sol, 1, view.h - sol);
  }
  ctx.fillStyle = '#4ed4c4';
  ctx.fillRect(0, sol, view.w, 1);
}

/** Trou dans le sol : procédural, comme le sol lui-même (les vraies tuiles
 * de terrain arrivent en P5, voir §6.5 famille GAP dans data/entities.js). */
function dessinerGap(entite, sol, scroll) {
  const x = screenXDe(entite.worldX, scroll);
  const w = entite.hitbox.w;
  ctx.fillStyle = '#0c0d12';
  ctx.fillRect(Math.round(x - w / 2), sol, w, view.h - sol);
}

function dessinerEntites(sol, scroll) {
  const { actives } = entitesActives(entites, 0, scroll, view.w / 2 + MARGE_VUE);
  for (const entite of actives) {
    const x = screenXDe(entite.worldX, scroll);
    if (x < -MARGE_VUE || x > view.w + MARGE_VUE) continue;

    if (entite.family === Family.GAP) {
      dessinerGap(entite, sol, scroll);
      continue;
    }
    const info = frameInfo(entite.frame);
    if (!info) continue;
    drawFrame(ctx, entite.frame, x, sol - entite.elevation, {
      flip: flipPourDirection(player.direction),
    });

    if (DEBUG) {
      const bas = sol - entite.elevation;
      const sommet = bas - entite.hitbox.h;
      ctx.strokeStyle = entite.family === Family.RAMP ? 'rgba(78,212,196,0.8)' : 'rgba(255,92,58,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - entite.hitbox.w / 2 + 0.5, sommet + 0.5, entite.hitbox.w - 1, entite.hitbox.h - 1);
    }
  }
}

function dessinerJeu(alpha) {
  const y = player.prevY + (player.y - player.prevY) * alpha;
  const scroll = monde.prevDefilement + (monde.defilement - monde.prevDefilement) * alpha;
  const sol = solY();

  ctx.fillStyle = '#1b1d27';
  ctx.fillRect(0, 0, view.w, view.h);

  dessinerSol(sol, scroll);
  dessinerEntites(sol, scroll);

  const invincible = run.tempsTotal < run.invincibleJusque;
  // Clignotement pendant l'invincibilité post-respawn (§6.7).
  const visible = !invincible || Math.floor(run.tempsTotal * 12) % 2 === 0;
  if (visible) {
    drawFrame(ctx, player.frameKey(), player.x, y, {
      flip: flipPourDirection(player.direction),
      scaleY: player.squash,
    });
  }

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
  // Écran minimal pour P3 : la présentation « sticker » complète arrive en P6.
  [State.GAMEOVER]: {
    enter: () => { input.clear(); },
    update: () => {
      input.update();
      if (input.consume(Action.RESTART) || input.consume(Action.CONFIRM)) {
        demarrerRun();
        jeu.go(State.PLAY);
      }
    },
    render: (alpha) => {
      dessinerJeu(alpha);
      ctx.fillStyle = 'rgba(18,19,26,0.82)';
      ctx.fillRect(0, 0, view.w, view.h);
      texteCentre('GAME OVER', view.h / 2 - 8, '#ff5c3a');
      texteCentre(`Distance : ${(player.distance / 10).toFixed(0)} m`, view.h / 2 + 4, '#f2f0e6');
      texteCentre('R pour recommencer', view.h / 2 + 16, '#8a8d9e');
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
  else return;
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
    `palier ${level?.palier ?? '-'} · vies ${run.vies} · cp ${level?.checkpoints.length ?? 0}`,
    `entités ${entites.length} · seed ${run.seed}`,
    player.state === RiderState.AIR ? `vol ${player.tempsVol.toFixed(2)}s` : '',
  ].filter(Boolean);
  ctx.font = '6px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(18,19,26,0.7)';
  ctx.fillRect(2, 2, 140, lignes.length * 8 + 4);
  ctx.fillStyle = '#ffc93c';
  lignes.forEach((l, i) => ctx.fillText(l, 5, 6 + i * 8));
}

// ── Démarrage ────────────────────────────────────────────────────────────────

if (DEBUG) {
  window.__maxence = {
    player, monde, view, jeu, boucle, input, atlas, run,
    Action, State, RiderState, Family, ENTITIES, solY,
    get level() { return level; },
    get entites() { return entites; },
    demarrerRun, respawn,
  };
}

loadAssets()
  .then(() => {
    chargement.hidden = true;
    demarrerRun();
    jeu.go(State.PLAY);
    boucle.start();
  })
  .catch((err) => {
    chargement.hidden = true;
    panne.hidden = false;
    panne.textContent = `Chargement impossible : ${err.message}`;
    console.error(err);
  });
