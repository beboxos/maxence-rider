// Maxence Rider — amorçage.

import { createLoop } from './core/loop.js';
import { createInput, Action } from './core/input.js';
import { loadAssets, atlas } from './core/assets.js';
import { createRenderer } from './render/renderer.js';
import { createStateMachine, State } from './game/state.js';

const DEBUG = new URLSearchParams(location.search).has('debug');

const canvas = document.getElementById('jeu');
const boutonPause = document.getElementById('pause');
const chargement = document.getElementById('chargement');
const panne = document.getElementById('panne');

const renderer = createRenderer(canvas);
const { ctx, view } = renderer;

// ── Bac à sable P1 ───────────────────────────────────────────────────────────
// Un carré rouge qui court et saute : de quoi valider la boucle, les entrées et
// la mise à l'échelle avant d'y brancher le vrai rider (P2).

const GRAVITE = 2200;
// Le boost monte sous gravité réduite (§6.3) : c'est ce qui lui donne son
// airtime long, pas une vitesse initiale plus forte. À gravité pleine il
// plafonnerait à 111 px, sous les 175 px attendus.
const GRAVITE_BOOST = 1400;
const CHUTE_MAX = 1400;
// Le premier tap d'un double tap part forcément en ollie : attendre la fenêtre
// de double tap pour trancher ajouterait 250 ms de latence à chaque saut. On
// laisse donc partir l'ollie et le second tap convertit le saut à peine amorcé.
const FENETRE_CONVERSION = 0.14;
const HAUTEUR_BOOST = (700 * 700) / (2 * 1400); // 175 px, §6.3
const SOL = 40; // hauteur du sol depuis le bas de l'écran

const carre = {
  x: 0, y: 0, vy: 0,
  taille: 16,
  auSol: true,
  graviteMontee: GRAVITE,
  tempsVol: 0,
  // Position au pas précédent, pour interpoler au rendu.
  prevX: 0, prevY: 0,
};

const monde = { defilement: 0, vitesse: 240 };

function reinitialiser() {
  carre.x = view.w * 0.3;
  carre.y = view.h - SOL;
  carre.vy = 0;
  carre.auSol = true;
  carre.prevX = carre.x;
  carre.prevY = carre.y;
  monde.defilement = 0;
}

/** Recale le saut en cours pour qu'il culmine à `cible` px au-dessus du sol. */
function convertirVers(cible, graviteMontee) {
  const hauteurActuelle = (view.h - SOL) - carre.y;
  const restant = Math.max(0, cible - hauteurActuelle);
  carre.vy = -Math.sqrt(2 * graviteMontee * restant);
  carre.graviteMontee = graviteMontee;
}

function sauter(vitesse, graviteMontee = GRAVITE) {
  carre.vy = vitesse;
  carre.auSol = false;
  carre.graviteMontee = graviteMontee;
  carre.tempsVol = 0;
}

function majJeu(dt) {
  input.update();

  carre.prevX = carre.x;
  carre.prevY = carre.y;

  // §6.2 : la vitesse se module de ±15 % par inclinaison.
  let facteur = 1;
  if (input.isDown(Action.LEAN_FWD)) facteur = 1.15;
  else if (input.isDown(Action.LEAN_BACK)) facteur = 0.85;
  monde.defilement += monde.vitesse * facteur * dt;

  // §6.3 : trois sauts, trois courbes distinctes.
  if (carre.auSol) {
    if (input.consume(Action.JUMP_LONG)) sauter(-700, GRAVITE_BOOST);
    else if (input.consume(Action.JUMP_HIGH)) sauter(-820);
    else if (input.consume(Action.JUMP_SHORT)) sauter(-620);
  } else if (carre.tempsVol < FENETRE_CONVERSION && carre.vy < 0
             && input.consume(Action.JUMP_LONG)) {
    // Conversion, pas double saut : c'est le même geste qui se termine. On vise
    // le sommet du boost au lieu d'ajouter sa vitesse à celle déjà acquise —
    // sinon le saut converti monterait plus haut qu'un boost franc.
    convertirVers(HAUTEUR_BOOST, GRAVITE_BOOST);
  }

  if (!carre.auSol) {
    carre.tempsVol += dt;
    const g = carre.vy < 0 ? carre.graviteMontee : GRAVITE;
    carre.vy = Math.min(carre.vy + g * dt, CHUTE_MAX);
    carre.y += carre.vy * dt;
    const sol = view.h - SOL;
    if (carre.y >= sol) {
      carre.y = sol;
      carre.vy = 0;
      carre.auSol = true;
      carre.tempsVol = 0;
    }
  }

  // Le rider reste à 30 % de l'écran dans le sens de la marche (§6.2).
  carre.x = Math.round(view.w * 0.3);
}

function dessinerJeu(alpha) {
  const x = carre.prevX + (carre.x - carre.prevX) * alpha;
  const y = carre.prevY + (carre.y - carre.prevY) * alpha;
  const solY = view.h - SOL;

  // Ciel
  ctx.fillStyle = '#1b1d27';
  ctx.fillRect(0, 0, view.w, view.h);

  // Sol, avec des dalles qui défilent : sans repère mobile, impossible de voir
  // si le jeu avance à la bonne vitesse.
  ctx.fillStyle = '#2a2c3a';
  ctx.fillRect(0, solY, view.w, view.h - solY);
  ctx.fillStyle = '#3a3d4e';
  const pas = 32;
  const decalage = monde.defilement % pas;
  for (let sx = -decalage; sx < view.w; sx += pas) {
    ctx.fillRect(Math.round(sx), solY, 1, view.h - solY);
  }
  ctx.fillStyle = '#4ed4c4';
  ctx.fillRect(0, solY, view.w, 1);

  // Le carré rouge de la phase 1.
  ctx.fillStyle = '#ff5c3a';
  ctx.fillRect(Math.round(x - carre.taille / 2), Math.round(y - carre.taille), carre.taille, carre.taille);
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
// C3 : relayout à chaud, sans rechargement ni perte d'état. Les entités sont
// repositionnées proportionnellement dans le nouvel espace virtuel.

function surRedimensionnement() {
  const ancien = { w: view.w, h: view.h };
  renderer.resize();
  if (view.w !== ancien.w || view.h !== ancien.h) {
    const ratioY = (view.h - SOL) / (ancien.h - SOL);
    carre.y *= ratioY;
    carre.prevY *= ratioY;
    carre.x = Math.round(view.w * 0.3);
    carre.prevX = carre.x;
  }
}

window.addEventListener('resize', surRedimensionnement);
window.addEventListener('orientationchange', surRedimensionnement);
// iOS ne déclenche pas toujours resize quand les barres système se replient.
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
    `${boucle.stats.fps} fps · ${boucle.stats.updates} maj/frame`,
    `${view.w}×${view.h} ×${view.scale} dpr ${view.dpr}`,
    view.portrait ? 'portrait' : 'paysage',
    `frames atlas : ${Object.keys(atlas.frames).length}`,
  ];
  ctx.font = '6px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(18,19,26,0.7)';
  ctx.fillRect(2, 2, 96, lignes.length * 8 + 4);
  ctx.fillStyle = '#ffc93c';
  lignes.forEach((l, i) => ctx.fillText(l, 5, 6 + i * 8));
}

// ── Démarrage ────────────────────────────────────────────────────────────────

// En mode debug seulement : donne prise sur l'état interne, pour l'inspection
// en console et pour les tests automatisés.
if (DEBUG) {
  window.__maxence = { carre, monde, view, jeu, boucle, input, Action, State };
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
