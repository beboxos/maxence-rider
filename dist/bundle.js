// Généré par tools/bundle.mjs — ne pas éditer. Source : src/
(function () {
"use strict";
const __mod = Object.create(null);
__mod["src/core/loop.js"] = (function () {
// Boucle de jeu à pas fixe.
//
// La simulation avance toujours par pas de 1/60 s, quel que soit le taux de
// rafraîchissement de l'écran : la physique reste identique sur un 60 Hz, un
// 120 Hz ou une machine qui rame. Le rendu, lui, reçoit le reliquat sous forme
// d'un facteur d'interpolation pour rester fluide entre deux pas.

const STEP = 1 / 60;
const MAX_DELTA = 0.25;   // au-delà, l'onglet était en arrière-plan : on oublie
const MAX_CATCHUP = 5;    // pas de rattrapage par frame, sinon spirale de la mort

function createLoop({ update, render }) {
  let running = false;
  let handle = 0;
  let last = 0;
  let accumulator = 0;

  const stats = { fps: 0, step: STEP, updates: 0, dropped: 0 };
  let fpsFrames = 0;
  let fpsSince = 0;

  function tick(now) {
    if (!running) return;
    handle = requestAnimationFrame(tick);

    let delta = (now - last) / 1000;
    last = now;
    if (!(delta > 0)) delta = 0;
    if (delta > MAX_DELTA) delta = MAX_DELTA;

    accumulator += delta;
    let steps = 0;
    while (accumulator >= STEP && steps < MAX_CATCHUP) {
      update(STEP);
      accumulator -= STEP;
      steps++;
    }
    // Toujours en retard après le rattrapage : on jette le reliquat plutôt que
    // de le laisser gonfler d'une frame à l'autre.
    if (accumulator >= STEP) {
      stats.dropped += Math.floor(accumulator / STEP);
      accumulator = 0;
    }
    stats.updates = steps;

    render(accumulator / STEP);

    fpsFrames++;
    if (now - fpsSince >= 500) {
      stats.fps = Math.round((fpsFrames * 1000) / (now - fpsSince));
      fpsFrames = 0;
      fpsSince = now;
    }
  }

  return {
    stats,
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      fpsSince = last;
      accumulator = 0;
      handle = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(handle);
    },
    get running() {
      return running;
    },
  };
}

return { createLoop };
})();
__mod["src/core/input.js"] = (function () {
// Entrées → actions abstraites.
//
// Aucun code de gameplay ne lit un événement clavier ou tactile : tout passe par
// les actions ci-dessous. C'est ce qui permet d'avoir exactement les mêmes règles
// de jeu au doigt et au clavier, et de tester une action sans simuler un geste.

const Action = {
  JUMP_SHORT: 'JUMP_SHORT',     // ollie
  JUMP_HIGH: 'JUMP_HIGH',       // flip
  JUMP_LONG: 'JUMP_LONG',       // boost
  CROUCH_MANUAL: 'CROUCH_MANUAL',
  JUMP_HOLD: 'JUMP_HOLD',       // le geste de saut est encore en cours

  LEAN_FWD: 'LEAN_FWD',
  LEAN_BACK: 'LEAN_BACK',
  PAUSE: 'PAUSE',
  RESTART: 'RESTART',
  CONFIRM: 'CONFIRM',
};

// Un appui bref est un ollie, un appui tenu un flip. Le seuil doit être franchi
// pendant l'appui — pas au relâchement — sinon le flip part avec 150 ms de
// retard et le jeu paraît mou.
const HOLD_THRESHOLD = 0.15;
const DOUBLE_TAP_WINDOW = 0.25;
const SWIPE_DISTANCE = 30;      // px CSS
const BUFFER = 0.12;            // §6.3 : une entrée reste valable 120 ms

const now = () => performance.now() / 1000;

function createInput(target, { onPause } = {}) {
  /** Dernier instant d'émission de chaque action, consommable une seule fois. */
  const fired = Object.create(null);
  /** Actions maintenues. */
  const held = Object.create(null);

  const press = (action) => { fired[action] = now(); };

  // ── Geste courant, partagé par le clavier et le tactile ────────────────────
  // Les deux sources suivent la même machine : appui → (seuil) → relâchement.
  function createGesture() {
    return { active: false, start: 0, longFired: false, skipRelease: false, id: -1 };
  }
  const keyGesture = createGesture();
  const touchGesture = createGesture();
  let lastReleaseAt = -Infinity;

  function gestureDown(g, { boost = false } = {}) {
    if (g.active) return;
    g.active = true;
    g.start = now();
    g.longFired = false;
    g.skipRelease = false;
    held[Action.JUMP_HOLD] = true;

    if (boost || now() - lastReleaseAt <= DOUBLE_TAP_WINDOW) {
      press(Action.JUMP_LONG);
      g.skipRelease = true;
      lastReleaseAt = -Infinity; // un double tap ne peut pas amorcer un triple
    }
  }

  function gestureUpdate(g) {
    if (!g.active || g.longFired || g.skipRelease) return;
    if (now() - g.start >= HOLD_THRESHOLD) {
      press(Action.JUMP_HIGH);
      g.longFired = true;
      // Le doigt encore posé après le flip vaut demande de manual (§11).
      held[Action.CROUCH_MANUAL] = true;
    }
  }

  function gestureUp(g) {
    if (!g.active) return;
    if (!g.longFired && !g.skipRelease) {
      press(Action.JUMP_SHORT);
      lastReleaseAt = now();
    }
    g.active = false;
    g.longFired = false;
    if (!keyGesture.active && !touchGesture.active) {
      held[Action.CROUCH_MANUAL] = false;
      held[Action.JUMP_HOLD] = false;
    }
  }

  // ── Clavier ────────────────────────────────────────────────────────────────
  function onKeyDown(e) {
    if (e.repeat) return;
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        gestureDown(keyGesture, { boost: e.shiftKey });
        break;
      case 'ArrowDown': case 'KeyS':
        e.preventDefault();
        held[Action.CROUCH_MANUAL] = true;
        break;
      case 'ArrowLeft': case 'KeyA': held[Action.LEAN_BACK] = true; break;
      case 'ArrowRight': case 'KeyD': held[Action.LEAN_FWD] = true; break;
      case 'Escape': case 'KeyP': press(Action.PAUSE); onPause?.(); break;
      case 'KeyR': press(Action.RESTART); break;
      case 'Enter': press(Action.CONFIRM); break;
      default: break;
    }
  }

  function onKeyUp(e) {
    switch (e.code) {
      case 'Space': gestureUp(keyGesture); break;
      case 'ArrowDown': case 'KeyS': held[Action.CROUCH_MANUAL] = false; break;
      case 'ArrowLeft': case 'KeyA': held[Action.LEAN_BACK] = false; break;
      case 'ArrowRight': case 'KeyD': held[Action.LEAN_FWD] = false; break;
      default: break;
    }
  }

  // ── Tactile ────────────────────────────────────────────────────────────────
  let touchX = 0, touchY = 0, swiped = false;

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (touchGesture.id !== -1) return; // un seul doigt pilote le rider
    touchGesture.id = e.pointerId;
    touchX = e.clientX;
    touchY = e.clientY;
    swiped = false;
    target.setPointerCapture?.(e.pointerId);
    gestureDown(touchGesture);
  }

  function onPointerMove(e) {
    if (e.pointerId !== touchGesture.id) return;
    const dx = e.clientX - touchX;
    const dy = e.clientY - touchY;

    if (!swiped && dy < -SWIPE_DISTANCE && Math.abs(dy) > Math.abs(dx)) {
      press(Action.JUMP_HIGH);              // swipe ↑ = flip immédiat
      touchGesture.longFired = true;
      swiped = true;
    }
    // Le lean suit le doigt en continu : c'est un réglage fin de vitesse, pas
    // une commande à déclenchement.
    held[Action.LEAN_FWD] = dx > SWIPE_DISTANCE;
    held[Action.LEAN_BACK] = dx < -SWIPE_DISTANCE;
  }

  function onPointerUp(e) {
    if (e.pointerId !== touchGesture.id) return;
    touchGesture.id = -1;
    held[Action.LEAN_FWD] = false;
    held[Action.LEAN_BACK] = false;
    gestureUp(touchGesture);
  }

  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerup', onPointerUp);
  target.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // Sans ça, iOS interprète les gestes comme du scroll et du zoom.
  target.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  target.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', () => {
    for (const k of Object.keys(held)) held[k] = false;
    keyGesture.active = touchGesture.active = false;
    touchGesture.id = -1;
  });

  return {
    /** À appeler une fois par pas de simulation, avant la logique de jeu. */
    update() {
      gestureUpdate(keyGesture);
      gestureUpdate(touchGesture);
    },
    /** Vrai une seule fois par appui, dans la fenêtre de tampon (§6.3). */
    consume(action, window = BUFFER) {
      const t = fired[action];
      if (t === undefined || now() - t > window) return false;
      fired[action] = undefined;
      return true;
    },
    /** Vrai tant que l'entrée est maintenue. */
    isDown(action) {
      return !!held[action];
    },
    /** Purge le tampon : à l'entrée d'un écran, pour ne pas hériter d'un appui. */
    clear() {
      for (const k of Object.keys(fired)) fired[k] = undefined;
    },
  };
}

return { Action, createInput };
})();
__mod["assets/atlas.js"] = (function () {
const __default = {
  "version": 1,
  "sheet": "atlas.png",
  "sheetSize": [
    1024,
    275
  ],
  "frames": {
    "skate.roll.0": {
      "file": "sprites/skate/skate_roll_0.png",
      "w": 33,
      "h": 51,
      "offset": [
        -13,
        -51
      ],
      "rect": [
        79,
        66,
        33,
        51
      ]
    },
    "skate.roll.1": {
      "file": "sprites/skate/skate_roll_1.png",
      "w": 44,
      "h": 51,
      "offset": [
        -18,
        -51
      ],
      "rect": [
        113,
        66,
        44,
        51
      ]
    },
    "skate.roll.2": {
      "file": "sprites/skate/skate_roll_2.png",
      "w": 43,
      "h": 51,
      "offset": [
        -18,
        -51
      ],
      "rect": [
        158,
        66,
        43,
        51
      ]
    },
    "skate.roll.3": {
      "file": "sprites/skate/skate_roll_3.png",
      "w": 41,
      "h": 51,
      "offset": [
        -17,
        -51
      ],
      "rect": [
        202,
        66,
        41,
        51
      ]
    },
    "skate.roll.4": {
      "file": "sprites/skate/skate_roll_4.png",
      "w": 33,
      "h": 51,
      "offset": [
        -13,
        -51
      ],
      "rect": [
        244,
        66,
        33,
        51
      ]
    },
    "skate.ollie.0": {
      "file": "sprites/skate/skate_ollie_0.png",
      "w": 42,
      "h": 48,
      "offset": [
        -15,
        -48
      ],
      "rect": [
        386,
        119,
        42,
        48
      ]
    },
    "skate.ollie.1": {
      "file": "sprites/skate/skate_ollie_1.png",
      "w": 38,
      "h": 55,
      "offset": [
        -18,
        -55
      ],
      "rect": [
        218,
        0,
        38,
        55
      ]
    },
    "skate.ollie.2": {
      "file": "sprites/skate/skate_ollie_2.png",
      "w": 39,
      "h": 60,
      "offset": [
        -19,
        -60
      ],
      "rect": [
        119,
        0,
        39,
        60
      ]
    },
    "skate.ollie.3": {
      "file": "sprites/skate/skate_ollie_3.png",
      "w": 43,
      "h": 46,
      "offset": [
        -18,
        -46
      ],
      "rect": [
        742,
        119,
        43,
        46
      ]
    },
    "skate.ollie.4": {
      "file": "sprites/skate/skate_ollie_4.png",
      "w": 32,
      "h": 43,
      "offset": [
        -16,
        -43
      ],
      "rect": [
        293,
        170,
        32,
        43
      ]
    },
    "skate.flip.0": {
      "file": "sprites/skate/skate_flip_0.png",
      "w": 28,
      "h": 45,
      "offset": [
        -9,
        -44
      ],
      "rect": [
        941,
        119,
        28,
        45
      ]
    },
    "skate.flip.1": {
      "file": "sprites/skate/skate_flip_1.png",
      "w": 37,
      "h": 48,
      "offset": [
        -18,
        -47
      ],
      "rect": [
        429,
        119,
        37,
        48
      ]
    },
    "skate.flip.2": {
      "file": "sprites/skate/skate_flip_2.png",
      "w": 39,
      "h": 52,
      "offset": [
        -20,
        -51
      ],
      "rect": [
        548,
        0,
        39,
        52
      ]
    },
    "skate.flip.3": {
      "file": "sprites/skate/skate_flip_3.png",
      "w": 32,
      "h": 41,
      "offset": [
        -14,
        -48
      ],
      "rect": [
        504,
        170,
        32,
        41
      ]
    },
    "skate.flip.4": {
      "file": "sprites/skate/skate_flip_4.png",
      "w": 28,
      "h": 50,
      "offset": [
        -13,
        -49
      ],
      "rect": [
        659,
        66,
        28,
        50
      ]
    },
    "skate.flip.5": {
      "file": "sprites/skate/skate_flip_5.png",
      "w": 32,
      "h": 48,
      "offset": [
        -15,
        -47
      ],
      "rect": [
        467,
        119,
        32,
        48
      ]
    },
    "skate.flip.6": {
      "file": "sprites/skate/skate_flip_6.png",
      "w": 37,
      "h": 45,
      "offset": [
        -17,
        -44
      ],
      "rect": [
        970,
        119,
        37,
        45
      ]
    },
    "skate.nocomply.0": {
      "file": "sprites/skate/skate_nocomply_0.png",
      "w": 33,
      "h": 50,
      "offset": [
        -12,
        -50
      ],
      "rect": [
        688,
        66,
        33,
        50
      ]
    },
    "skate.nocomply.1": {
      "file": "sprites/skate/skate_nocomply_1.png",
      "w": 33,
      "h": 50,
      "offset": [
        -14,
        -50
      ],
      "rect": [
        722,
        66,
        33,
        50
      ]
    },
    "skate.nocomply.2": {
      "file": "sprites/skate/skate_nocomply_2.png",
      "w": 32,
      "h": 50,
      "offset": [
        -15,
        -50
      ],
      "rect": [
        756,
        66,
        32,
        50
      ]
    },
    "skate.nocomply.3": {
      "file": "sprites/skate/skate_nocomply_3.png",
      "w": 34,
      "h": 50,
      "offset": [
        -18,
        -50
      ],
      "rect": [
        789,
        66,
        34,
        50
      ]
    },
    "skate.nocomply.4": {
      "file": "sprites/skate/skate_nocomply_4.png",
      "w": 35,
      "h": 51,
      "offset": [
        -18,
        -50
      ],
      "rect": [
        278,
        66,
        35,
        51
      ]
    },
    "skate.nocomply.5": {
      "file": "sprites/skate/skate_nocomply_5.png",
      "w": 33,
      "h": 49,
      "offset": [
        -18,
        -50
      ],
      "rect": [
        253,
        119,
        33,
        49
      ]
    },
    "skate.crash.0": {
      "file": "sprites/skate/skate_crash_0.png",
      "w": 38,
      "h": 50,
      "offset": [
        -16,
        -55
      ],
      "rect": [
        824,
        66,
        38,
        50
      ]
    },
    "skate.crash.1": {
      "file": "sprites/skate/skate_crash_1.png",
      "w": 39,
      "h": 51,
      "offset": [
        -19,
        -53
      ],
      "rect": [
        314,
        66,
        39,
        51
      ]
    },
    "skate.crash.2": {
      "file": "sprites/skate/skate_crash_2.png",
      "w": 36,
      "h": 46,
      "offset": [
        -18,
        -47
      ],
      "rect": [
        786,
        119,
        36,
        46
      ]
    },
    "skate.crash.3": {
      "file": "sprites/skate/skate_crash_3.png",
      "w": 40,
      "h": 50,
      "offset": [
        -19,
        -49
      ],
      "rect": [
        863,
        66,
        40,
        50
      ]
    },
    "skate.crash.4": {
      "file": "sprites/skate/skate_crash_4.png",
      "w": 40,
      "h": 24,
      "offset": [
        -20,
        -25
      ],
      "rect": [
        828,
        216,
        40,
        24
      ]
    },
    "skate.crash.5": {
      "file": "sprites/skate/skate_crash_5.png",
      "w": 40,
      "h": 17,
      "offset": [
        -20,
        -17
      ],
      "rect": [
        149,
        254,
        40,
        17
      ]
    },
    "skate.grind.0": {
      "file": "sprites/skate/skate_grind_0.png",
      "w": 39,
      "h": 50,
      "offset": [
        -18,
        -50
      ],
      "rect": [
        904,
        66,
        39,
        50
      ]
    },
    "skate.grind.1": {
      "file": "sprites/skate/skate_grind_1.png",
      "w": 40,
      "h": 53,
      "offset": [
        -20,
        -53
      ],
      "rect": [
        329,
        0,
        40,
        53
      ]
    },
    "skate.grind.2": {
      "file": "sprites/skate/skate_grind_2.png",
      "w": 41,
      "h": 52,
      "offset": [
        -20,
        -52
      ],
      "rect": [
        588,
        0,
        41,
        52
      ]
    },
    "skate.idle.0": {
      "file": "sprites/skate/skate_idle_0.png",
      "w": 29,
      "h": 53,
      "offset": [
        -12,
        -52
      ],
      "rect": [
        370,
        0,
        29,
        53
      ]
    },
    "skate.idle.1": {
      "file": "sprites/skate/skate_idle_1.png",
      "w": 29,
      "h": 53,
      "offset": [
        -13,
        -52
      ],
      "rect": [
        400,
        0,
        29,
        53
      ]
    },
    "skate.idle.2": {
      "file": "sprites/skate/skate_idle_2.png",
      "w": 29,
      "h": 53,
      "offset": [
        -13,
        -52
      ],
      "rect": [
        430,
        0,
        29,
        53
      ]
    },
    "roller.roll.0": {
      "file": "sprites/roller/roller_roll_0.png",
      "w": 35,
      "h": 51,
      "offset": [
        -13,
        -51
      ],
      "rect": [
        354,
        66,
        35,
        51
      ]
    },
    "roller.roll.1": {
      "file": "sprites/roller/roller_roll_1.png",
      "w": 44,
      "h": 51,
      "offset": [
        -18,
        -51
      ],
      "rect": [
        390,
        66,
        44,
        51
      ]
    },
    "roller.roll.2": {
      "file": "sprites/roller/roller_roll_2.png",
      "w": 43,
      "h": 51,
      "offset": [
        -18,
        -51
      ],
      "rect": [
        435,
        66,
        43,
        51
      ]
    },
    "roller.roll.3": {
      "file": "sprites/roller/roller_roll_3.png",
      "w": 43,
      "h": 51,
      "offset": [
        -17,
        -51
      ],
      "rect": [
        479,
        66,
        43,
        51
      ]
    },
    "roller.roll.4": {
      "file": "sprites/roller/roller_roll_4.png",
      "w": 35,
      "h": 51,
      "offset": [
        -13,
        -51
      ],
      "rect": [
        523,
        66,
        35,
        51
      ]
    },
    "roller.ollie.0": {
      "file": "sprites/roller/roller_ollie_0.png",
      "w": 36,
      "h": 49,
      "offset": [
        -15,
        -48
      ],
      "rect": [
        287,
        119,
        36,
        49
      ]
    },
    "roller.ollie.1": {
      "file": "sprites/roller/roller_ollie_1.png",
      "w": 37,
      "h": 50,
      "offset": [
        -17,
        -55
      ],
      "rect": [
        944,
        66,
        37,
        50
      ]
    },
    "roller.ollie.2": {
      "file": "sprites/roller/roller_ollie_2.png",
      "w": 39,
      "h": 51,
      "offset": [
        -18,
        -60
      ],
      "rect": [
        559,
        66,
        39,
        51
      ]
    },
    "roller.ollie.3": {
      "file": "sprites/roller/roller_ollie_3.png",
      "w": 35,
      "h": 48,
      "offset": [
        -18,
        -47
      ],
      "rect": [
        500,
        119,
        35,
        48
      ]
    },
    "roller.ollie.4": {
      "file": "sprites/roller/roller_ollie_4.png",
      "w": 32,
      "h": 44,
      "offset": [
        -16,
        -44
      ],
      "rect": [
        161,
        170,
        32,
        44
      ]
    },
    "roller.flip.0": {
      "file": "sprites/roller/roller_flip_0.png",
      "w": 28,
      "h": 44,
      "offset": [
        -10,
        -44
      ],
      "rect": [
        194,
        170,
        28,
        44
      ]
    },
    "roller.flip.1": {
      "file": "sprites/roller/roller_flip_1.png",
      "w": 37,
      "h": 48,
      "offset": [
        -18,
        -48
      ],
      "rect": [
        536,
        119,
        37,
        48
      ]
    },
    "roller.flip.2": {
      "file": "sprites/roller/roller_flip_2.png",
      "w": 38,
      "h": 51,
      "offset": [
        -20,
        -51
      ],
      "rect": [
        599,
        66,
        38,
        51
      ]
    },
    "roller.flip.3": {
      "file": "sprites/roller/roller_flip_3.png",
      "w": 28,
      "h": 41,
      "offset": [
        -16,
        -49
      ],
      "rect": [
        537,
        170,
        28,
        41
      ]
    },
    "roller.flip.4": {
      "file": "sprites/roller/roller_flip_4.png",
      "w": 30,
      "h": 50,
      "offset": [
        -14,
        -50
      ],
      "rect": [
        982,
        66,
        30,
        50
      ]
    },
    "roller.flip.5": {
      "file": "sprites/roller/roller_flip_5.png",
      "w": 27,
      "h": 48,
      "offset": [
        -13,
        -47
      ],
      "rect": [
        574,
        119,
        27,
        48
      ]
    },
    "roller.flip.6": {
      "file": "sprites/roller/roller_flip_6.png",
      "w": 37,
      "h": 44,
      "offset": [
        -17,
        -44
      ],
      "rect": [
        223,
        170,
        37,
        44
      ]
    },
    "roller.manual.0": {
      "file": "sprites/roller/roller_manual_0.png",
      "w": 33,
      "h": 50,
      "offset": [
        -12,
        -49
      ],
      "rect": [
        0,
        119,
        33,
        50
      ]
    },
    "roller.manual.1": {
      "file": "sprites/roller/roller_manual_1.png",
      "w": 34,
      "h": 50,
      "offset": [
        -14,
        -50
      ],
      "rect": [
        34,
        119,
        34,
        50
      ]
    },
    "roller.manual.2": {
      "file": "sprites/roller/roller_manual_2.png",
      "w": 32,
      "h": 50,
      "offset": [
        -15,
        -50
      ],
      "rect": [
        69,
        119,
        32,
        50
      ]
    },
    "roller.manual.3": {
      "file": "sprites/roller/roller_manual_3.png",
      "w": 34,
      "h": 50,
      "offset": [
        -16,
        -50
      ],
      "rect": [
        102,
        119,
        34,
        50
      ]
    },
    "roller.manual.4": {
      "file": "sprites/roller/roller_manual_4.png",
      "w": 34,
      "h": 50,
      "offset": [
        -16,
        -50
      ],
      "rect": [
        137,
        119,
        34,
        50
      ]
    },
    "roller.manual.5": {
      "file": "sprites/roller/roller_manual_5.png",
      "w": 33,
      "h": 50,
      "offset": [
        -16,
        -50
      ],
      "rect": [
        172,
        119,
        33,
        50
      ]
    },
    "roller.crash.0": {
      "file": "sprites/roller/roller_crash_0.png",
      "w": 39,
      "h": 45,
      "offset": [
        -18,
        -55
      ],
      "rect": [
        0,
        170,
        39,
        45
      ]
    },
    "roller.crash.1": {
      "file": "sprites/roller/roller_crash_1.png",
      "w": 40,
      "h": 45,
      "offset": [
        -19,
        -52
      ],
      "rect": [
        40,
        170,
        40,
        45
      ]
    },
    "roller.crash.2": {
      "file": "sprites/roller/roller_crash_2.png",
      "w": 37,
      "h": 46,
      "offset": [
        -19,
        -47
      ],
      "rect": [
        823,
        119,
        37,
        46
      ]
    },
    "roller.crash.3": {
      "file": "sprites/roller/roller_crash_3.png",
      "w": 39,
      "h": 48,
      "offset": [
        -20,
        -48
      ],
      "rect": [
        602,
        119,
        39,
        48
      ]
    },
    "roller.crash.4": {
      "file": "sprites/roller/roller_crash_4.png",
      "w": 41,
      "h": 24,
      "offset": [
        -20,
        -24
      ],
      "rect": [
        869,
        216,
        41,
        24
      ]
    },
    "roller.crash.5": {
      "file": "sprites/roller/roller_crash_5.png",
      "w": 40,
      "h": 22,
      "offset": [
        -20,
        -23
      ],
      "rect": [
        936,
        216,
        40,
        22
      ]
    },
    "roller.grind.0": {
      "file": "sprites/roller/roller_grind_0.png",
      "w": 39,
      "h": 49,
      "offset": [
        -16,
        -49
      ],
      "rect": [
        324,
        119,
        39,
        49
      ]
    },
    "roller.grind.1": {
      "file": "sprites/roller/roller_grind_1.png",
      "w": 40,
      "h": 54,
      "offset": [
        -20,
        -53
      ],
      "rect": [
        257,
        0,
        40,
        54
      ]
    },
    "roller.grind.2": {
      "file": "sprites/roller/roller_grind_2.png",
      "w": 40,
      "h": 52,
      "offset": [
        -19,
        -52
      ],
      "rect": [
        630,
        0,
        40,
        52
      ]
    },
    "roller.idle.0": {
      "file": "sprites/roller/roller_idle_0.png",
      "w": 20,
      "h": 53,
      "offset": [
        -8,
        -52
      ],
      "rect": [
        460,
        0,
        20,
        53
      ]
    },
    "roller.idle.1": {
      "file": "sprites/roller/roller_idle_1.png",
      "w": 20,
      "h": 53,
      "offset": [
        -9,
        -52
      ],
      "rect": [
        481,
        0,
        20,
        53
      ]
    },
    "roller.idle.2": {
      "file": "sprites/roller/roller_idle_2.png",
      "w": 20,
      "h": 53,
      "offset": [
        -9,
        -52
      ],
      "rect": [
        502,
        0,
        20,
        53
      ]
    },
    "park.0": {
      "file": "sprites/decor/park_0.png",
      "w": 46,
      "h": 37,
      "offset": [
        -23,
        -37
      ],
      "rect": [
        924,
        170,
        46,
        37
      ]
    },
    "park.1": {
      "file": "sprites/decor/park_1.png",
      "w": 49,
      "h": 48,
      "offset": [
        -25,
        -48
      ],
      "rect": [
        642,
        119,
        49,
        48
      ]
    },
    "park.2": {
      "file": "sprites/decor/park_2.png",
      "w": 49,
      "h": 48,
      "offset": [
        -25,
        -48
      ],
      "rect": [
        692,
        119,
        49,
        48
      ]
    },
    "park.3": {
      "file": "sprites/decor/park_3.png",
      "w": 44,
      "h": 39,
      "offset": [
        -22,
        -39
      ],
      "rect": [
        679,
        170,
        44,
        39
      ]
    },
    "park.4": {
      "file": "sprites/decor/park_4.png",
      "w": 44,
      "h": 12,
      "offset": [
        -22,
        -12
      ],
      "rect": [
        230,
        254,
        44,
        12
      ]
    },
    "park.5": {
      "file": "sprites/decor/park_5.png",
      "w": 31,
      "h": 12,
      "offset": [
        -16,
        -12
      ],
      "rect": [
        275,
        254,
        31,
        12
      ]
    },
    "urban.0": {
      "file": "sprites/decor/urban_0.png",
      "w": 19,
      "h": 27,
      "offset": [
        -10,
        -27
      ],
      "rect": [
        789,
        216,
        19,
        27
      ]
    },
    "urban.1": {
      "file": "sprites/decor/urban_1.png",
      "w": 20,
      "h": 28,
      "offset": [
        -10,
        -28
      ],
      "rect": [
        768,
        216,
        20,
        28
      ]
    },
    "urban.2": {
      "file": "sprites/decor/urban_2.png",
      "w": 24,
      "h": 34,
      "offset": [
        -12,
        -34
      ],
      "rect": [
        159,
        216,
        24,
        34
      ]
    },
    "urban.3": {
      "file": "sprites/decor/urban_3.png",
      "w": 35,
      "h": 19,
      "offset": [
        -18,
        -19
      ],
      "rect": [
        79,
        254,
        35,
        19
      ]
    },
    "urban.4": {
      "file": "sprites/decor/urban_4.png",
      "w": 35,
      "h": 37,
      "offset": [
        -18,
        -37
      ],
      "rect": [
        971,
        170,
        35,
        37
      ]
    },
    "urban.5": {
      "file": "sprites/decor/urban_5.png",
      "w": 37,
      "h": 21,
      "offset": [
        -19,
        -21
      ],
      "rect": [
        977,
        216,
        37,
        21
      ]
    },
    "urban.6": {
      "file": "sprites/decor/urban_6.png",
      "w": 37,
      "h": 21,
      "offset": [
        -19,
        -21
      ],
      "rect": [
        0,
        254,
        37,
        21
      ]
    },
    "rail.0": {
      "file": "sprites/decor/rail_0.png",
      "w": 100,
      "h": 9,
      "offset": [
        -50,
        -9
      ],
      "rect": [
        720,
        254,
        100,
        9
      ]
    },
    "rail.1": {
      "file": "sprites/decor/rail_1.png",
      "w": 100,
      "h": 10,
      "offset": [
        -50,
        -10
      ],
      "rect": [
        307,
        254,
        100,
        10
      ]
    },
    "rail.2": {
      "file": "sprites/decor/rail_2.png",
      "w": 99,
      "h": 10,
      "offset": [
        -50,
        -10
      ],
      "rect": [
        408,
        254,
        99,
        10
      ]
    },
    "rail.3": {
      "file": "sprites/decor/rail_3.png",
      "w": 100,
      "h": 9,
      "offset": [
        -50,
        -9
      ],
      "rect": [
        821,
        254,
        100,
        9
      ]
    },
    "rail.4": {
      "file": "sprites/decor/rail_4.png",
      "w": 99,
      "h": 10,
      "offset": [
        -50,
        -10
      ],
      "rect": [
        508,
        254,
        99,
        10
      ]
    },
    "rail.5": {
      "file": "sprites/decor/rail_5.png",
      "w": 99,
      "h": 10,
      "offset": [
        -50,
        -10
      ],
      "rect": [
        608,
        254,
        99,
        10
      ]
    },
    "prop.0": {
      "file": "sprites/decor/prop_0.png",
      "w": 30,
      "h": 43,
      "offset": [
        -15,
        -43
      ],
      "rect": [
        326,
        170,
        30,
        43
      ]
    },
    "prop.1": {
      "file": "sprites/decor/prop_1.png",
      "w": 30,
      "h": 43,
      "offset": [
        -15,
        -43
      ],
      "rect": [
        357,
        170,
        30,
        43
      ]
    },
    "prop.2": {
      "file": "sprites/decor/prop_2.png",
      "w": 19,
      "h": 50,
      "offset": [
        -10,
        -50
      ],
      "rect": [
        206,
        119,
        19,
        50
      ]
    },
    "prop.3": {
      "file": "sprites/decor/prop_3.png",
      "w": 20,
      "h": 51,
      "offset": [
        -10,
        -51
      ],
      "rect": [
        638,
        66,
        20,
        51
      ]
    },
    "prop.4": {
      "file": "sprites/decor/prop_4.png",
      "w": 18,
      "h": 25,
      "offset": [
        -9,
        -25
      ],
      "rect": [
        809,
        216,
        18,
        25
      ]
    },
    "prop.5": {
      "file": "sprites/decor/prop_5.png",
      "w": 13,
      "h": 21,
      "offset": [
        -7,
        -21
      ],
      "rect": [
        38,
        254,
        13,
        21
      ]
    },
    "prop.6": {
      "file": "sprites/decor/prop_6.png",
      "w": 9,
      "h": 13,
      "offset": [
        -5,
        -13
      ],
      "rect": [
        220,
        254,
        9,
        13
      ]
    },
    "prop.7": {
      "file": "sprites/decor/prop_7.png",
      "w": 26,
      "h": 21,
      "offset": [
        -13,
        -21
      ],
      "rect": [
        52,
        254,
        26,
        21
      ]
    },
    "prop.8": {
      "file": "sprites/decor/prop_8.png",
      "w": 12,
      "h": 18,
      "offset": [
        -6,
        -18
      ],
      "rect": [
        136,
        254,
        12,
        18
      ]
    },
    "ground.0": {
      "file": "sprites/decor/ground_0.png",
      "w": 42,
      "h": 32,
      "offset": [
        -20,
        -33
      ],
      "rect": [
        474,
        216,
        42,
        32
      ]
    },
    "ground.1": {
      "file": "sprites/decor/ground_1.png",
      "w": 41,
      "h": 32,
      "offset": [
        -20,
        -33
      ],
      "rect": [
        517,
        216,
        41,
        32
      ]
    },
    "ground.2": {
      "file": "sprites/decor/ground_2.png",
      "w": 41,
      "h": 32,
      "offset": [
        -20,
        -33
      ],
      "rect": [
        559,
        216,
        41,
        32
      ]
    },
    "ground.3": {
      "file": "sprites/decor/ground_3.png",
      "w": 41,
      "h": 33,
      "offset": [
        -20,
        -33
      ],
      "rect": [
        222,
        216,
        41,
        33
      ]
    },
    "ground.4": {
      "file": "sprites/decor/ground_4.png",
      "w": 41,
      "h": 33,
      "offset": [
        -20,
        -33
      ],
      "rect": [
        264,
        216,
        41,
        33
      ]
    },
    "ground.5": {
      "file": "sprites/decor/ground_5.png",
      "w": 41,
      "h": 33,
      "offset": [
        -20,
        -33
      ],
      "rect": [
        306,
        216,
        41,
        33
      ]
    },
    "wall.0": {
      "file": "sprites/decor/wall_0.png",
      "w": 42,
      "h": 33,
      "offset": [
        -20,
        -33
      ],
      "rect": [
        348,
        216,
        42,
        33
      ]
    },
    "wall.1": {
      "file": "sprites/decor/wall_1.png",
      "w": 41,
      "h": 33,
      "offset": [
        -20,
        -32
      ],
      "rect": [
        391,
        216,
        41,
        33
      ]
    },
    "wall.2": {
      "file": "sprites/decor/wall_2.png",
      "w": 40,
      "h": 33,
      "offset": [
        -19,
        -33
      ],
      "rect": [
        433,
        216,
        40,
        33
      ]
    },
    "wall.3": {
      "file": "sprites/decor/wall_3.png",
      "w": 39,
      "h": 30,
      "offset": [
        -19,
        -30
      ],
      "rect": [
        637,
        216,
        39,
        30
      ]
    },
    "wall.4": {
      "file": "sprites/decor/wall_4.png",
      "w": 39,
      "h": 30,
      "offset": [
        -19,
        -30
      ],
      "rect": [
        677,
        216,
        39,
        30
      ]
    },
    "wall.5": {
      "file": "sprites/decor/wall_5.png",
      "w": 39,
      "h": 29,
      "offset": [
        -19,
        -30
      ],
      "rect": [
        717,
        216,
        39,
        29
      ]
    },
    "fx.spark.0": {
      "file": "sprites/decor/fx_spark_0.png",
      "w": 39,
      "h": 42,
      "offset": [
        -20,
        -42
      ],
      "rect": [
        388,
        170,
        39,
        42
      ]
    },
    "fx.spark.1": {
      "file": "sprites/decor/fx_spark_1.png",
      "w": 24,
      "h": 24,
      "offset": [
        -12,
        -24
      ],
      "rect": [
        911,
        216,
        24,
        24
      ]
    },
    "fx.spark.2": {
      "file": "sprites/decor/fx_spark_2.png",
      "w": 13,
      "h": 14,
      "offset": [
        -7,
        -14
      ],
      "rect": [
        206,
        254,
        13,
        14
      ]
    },
    "fx.dust.0": {
      "file": "sprites/decor/fx_dust_0.png",
      "w": 35,
      "h": 32,
      "offset": [
        -18,
        -32
      ],
      "rect": [
        601,
        216,
        35,
        32
      ]
    },
    "fx.dust.1": {
      "file": "sprites/decor/fx_dust_1.png",
      "w": 20,
      "h": 19,
      "offset": [
        -10,
        -19
      ],
      "rect": [
        115,
        254,
        20,
        19
      ]
    },
    "fx.dust.2": {
      "file": "sprites/decor/fx_dust_2.png",
      "w": 11,
      "h": 10,
      "offset": [
        -6,
        -10
      ],
      "rect": [
        708,
        254,
        11,
        10
      ]
    },
    "bonus.0": {
      "file": "sprites/decor/bonus_0.png",
      "w": 39,
      "h": 35,
      "offset": [
        -20,
        -35
      ],
      "rect": [
        79,
        216,
        39,
        35
      ]
    },
    "bonus.1": {
      "file": "sprites/decor/bonus_1.png",
      "w": 21,
      "h": 49,
      "offset": [
        -11,
        -49
      ],
      "rect": [
        364,
        119,
        21,
        49
      ]
    },
    "bonus.2": {
      "file": "sprites/decor/bonus_2.png",
      "w": 39,
      "h": 35,
      "offset": [
        -20,
        -35
      ],
      "rect": [
        119,
        216,
        39,
        35
      ]
    },
    "bonus.3": {
      "file": "sprites/decor/bonus_3.png",
      "w": 37,
      "h": 38,
      "offset": [
        -19,
        -38
      ],
      "rect": [
        846,
        170,
        37,
        38
      ]
    },
    "bonus.4": {
      "file": "sprites/decor/bonus_4.png",
      "w": 38,
      "h": 36,
      "offset": [
        -19,
        -36
      ],
      "rect": [
        40,
        216,
        38,
        36
      ]
    },
    "bonus.5": {
      "file": "sprites/decor/bonus_5.png",
      "w": 7,
      "h": 17,
      "offset": [
        -4,
        -17
      ],
      "rect": [
        190,
        254,
        7,
        17
      ]
    },
    "bonus.6": {
      "file": "sprites/decor/bonus_6.png",
      "w": 10,
      "h": 29,
      "offset": [
        -5,
        -29
      ],
      "rect": [
        757,
        216,
        10,
        29
      ]
    },
    "bonus.7": {
      "file": "sprites/decor/bonus_7.png",
      "w": 7,
      "h": 15,
      "offset": [
        -4,
        -15
      ],
      "rect": [
        198,
        254,
        7,
        15
      ]
    },
    "ground.asphalt": {
      "file": "sprites/decor/ground_asphalt.png",
      "w": 40,
      "h": 52,
      "offset": [
        -19,
        -52
      ],
      "rect": [
        671,
        0,
        40,
        52
      ]
    },
    "ground.marking": {
      "file": "sprites/decor/ground_marking.png",
      "w": 41,
      "h": 52,
      "offset": [
        -20,
        -52
      ],
      "rect": [
        712,
        0,
        41,
        52
      ]
    },
    "ground.dirt": {
      "file": "sprites/decor/ground_dirt.png",
      "w": 41,
      "h": 52,
      "offset": [
        -20,
        -52
      ],
      "rect": [
        754,
        0,
        41,
        52
      ]
    },
    "ground.gutter": {
      "file": "sprites/decor/ground_gutter.png",
      "w": 41,
      "h": 52,
      "offset": [
        -22,
        -52
      ],
      "rect": [
        796,
        0,
        41,
        52
      ]
    },
    "wall.notrespassing.0": {
      "file": "sprites/decor/wall_notrespassing_0.png",
      "w": 39,
      "h": 45,
      "offset": [
        -17,
        -45
      ],
      "rect": [
        81,
        170,
        39,
        45
      ]
    },
    "wall.notrespassing.1": {
      "file": "sprites/decor/wall_notrespassing_1.png",
      "w": 39,
      "h": 45,
      "offset": [
        -19,
        -45
      ],
      "rect": [
        121,
        170,
        39,
        45
      ]
    },
    "wall.cracked.0": {
      "file": "sprites/decor/wall_cracked_0.png",
      "w": 40,
      "h": 52,
      "offset": [
        -19,
        -52
      ],
      "rect": [
        838,
        0,
        40,
        52
      ]
    },
    "wall.cracked.1": {
      "file": "sprites/decor/wall_cracked_1.png",
      "w": 40,
      "h": 52,
      "offset": [
        -19,
        -52
      ],
      "rect": [
        879,
        0,
        40,
        52
      ]
    },
    "wall.brick": {
      "file": "sprites/decor/wall_brick.png",
      "w": 41,
      "h": 52,
      "offset": [
        -20,
        -52
      ],
      "rect": [
        920,
        0,
        41,
        52
      ]
    },
    "wall.skatearea": {
      "file": "sprites/decor/wall_skatearea.png",
      "w": 42,
      "h": 52,
      "offset": [
        -21,
        -52
      ],
      "rect": [
        962,
        0,
        42,
        52
      ]
    },
    "atmo.0": {
      "file": "sprites/decor/atmo_0.png",
      "w": 40,
      "h": 63,
      "offset": [
        -20,
        -63
      ],
      "rect": [
        37,
        0,
        40,
        63
      ]
    },
    "atmo.1": {
      "file": "sprites/decor/atmo_1.png",
      "w": 78,
      "h": 52,
      "offset": [
        -39,
        -52
      ],
      "rect": [
        0,
        66,
        78,
        52
      ]
    },
    "atmo.2": {
      "file": "sprites/decor/atmo_2.png",
      "w": 24,
      "h": 53,
      "offset": [
        -12,
        -53
      ],
      "rect": [
        523,
        0,
        24,
        53
      ]
    },
    "atmo.3": {
      "file": "sprites/decor/atmo_3.png",
      "w": 26,
      "h": 50,
      "offset": [
        -13,
        -50
      ],
      "rect": [
        226,
        119,
        26,
        50
      ]
    },
    "atmo.4": {
      "file": "sprites/decor/atmo_4.png",
      "w": 36,
      "h": 65,
      "offset": [
        -18,
        -65
      ],
      "rect": [
        0,
        0,
        36,
        65
      ]
    },
    "street.0": {
      "file": "sprites/decor/street_0.png",
      "w": 40,
      "h": 63,
      "offset": [
        -20,
        -63
      ],
      "rect": [
        78,
        0,
        40,
        63
      ]
    },
    "street.1": {
      "file": "sprites/decor/street_1.png",
      "w": 31,
      "h": 44,
      "offset": [
        -16,
        -44
      ],
      "rect": [
        261,
        170,
        31,
        44
      ]
    },
    "street.2": {
      "file": "sprites/decor/street_2.png",
      "w": 36,
      "h": 41,
      "offset": [
        -18,
        -41
      ],
      "rect": [
        566,
        170,
        36,
        41
      ]
    },
    "street.3": {
      "file": "sprites/decor/street_3.png",
      "w": 32,
      "h": 59,
      "offset": [
        -16,
        -59
      ],
      "rect": [
        185,
        0,
        32,
        59
      ]
    },
    "street.4": {
      "file": "sprites/decor/street_4.png",
      "w": 30,
      "h": 54,
      "offset": [
        -15,
        -54
      ],
      "rect": [
        298,
        0,
        30,
        54
      ]
    },
    "street.5": {
      "file": "sprites/decor/street_5.png",
      "w": 25,
      "h": 60,
      "offset": [
        -13,
        -60
      ],
      "rect": [
        159,
        0,
        25,
        60
      ]
    },
    "connector.0": {
      "file": "sprites/decor/connector_0.png",
      "w": 39,
      "h": 37,
      "offset": [
        -20,
        -37
      ],
      "rect": [
        0,
        216,
        39,
        37
      ]
    },
    "connector.1": {
      "file": "sprites/decor/connector_1.png",
      "w": 35,
      "h": 41,
      "offset": [
        -18,
        -41
      ],
      "rect": [
        603,
        170,
        35,
        41
      ]
    },
    "connector.2": {
      "file": "sprites/decor/connector_2.png",
      "w": 37,
      "h": 42,
      "offset": [
        -19,
        -42
      ],
      "rect": [
        428,
        170,
        37,
        42
      ]
    },
    "connector.3": {
      "file": "sprites/decor/connector_3.png",
      "w": 37,
      "h": 42,
      "offset": [
        -19,
        -42
      ],
      "rect": [
        466,
        170,
        37,
        42
      ]
    },
    "connector.4": {
      "file": "sprites/decor/connector_4.png",
      "w": 79,
      "h": 46,
      "offset": [
        -40,
        -46
      ],
      "rect": [
        861,
        119,
        79,
        46
      ]
    },
    "curb.0": {
      "file": "sprites/decor/curb_0.png",
      "w": 60,
      "h": 39,
      "offset": [
        -30,
        -39
      ],
      "rect": [
        724,
        170,
        60,
        39
      ]
    },
    "curb.1": {
      "file": "sprites/decor/curb_1.png",
      "w": 60,
      "h": 39,
      "offset": [
        -30,
        -39
      ],
      "rect": [
        785,
        170,
        60,
        39
      ]
    },
    "curb.2": {
      "file": "sprites/decor/curb_2.png",
      "w": 39,
      "h": 38,
      "offset": [
        -20,
        -38
      ],
      "rect": [
        884,
        170,
        39,
        38
      ]
    },
    "curb.3": {
      "file": "sprites/decor/curb_3.png",
      "w": 39,
      "h": 40,
      "offset": [
        -20,
        -40
      ],
      "rect": [
        639,
        170,
        39,
        40
      ]
    },
    "curb.4": {
      "file": "sprites/decor/curb_4.png",
      "w": 37,
      "h": 34,
      "offset": [
        -19,
        -34
      ],
      "rect": [
        184,
        216,
        37,
        34
      ]
    }
  },
  "anims": {
    "skate.roll": {
      "frames": [
        "skate.roll.0",
        "skate.roll.1",
        "skate.roll.2",
        "skate.roll.3",
        "skate.roll.4"
      ],
      "fps": 14,
      "loop": true
    },
    "skate.ollie": {
      "frames": [
        "skate.ollie.0",
        "skate.ollie.1",
        "skate.ollie.2",
        "skate.ollie.3",
        "skate.ollie.4"
      ],
      "fps": 18,
      "loop": false
    },
    "skate.flip": {
      "frames": [
        "skate.flip.0",
        "skate.flip.1",
        "skate.flip.2",
        "skate.flip.3",
        "skate.flip.4",
        "skate.flip.5",
        "skate.flip.6"
      ],
      "fps": 20,
      "loop": false
    },
    "skate.nocomply": {
      "frames": [
        "skate.nocomply.0",
        "skate.nocomply.1",
        "skate.nocomply.2",
        "skate.nocomply.3",
        "skate.nocomply.4",
        "skate.nocomply.5"
      ],
      "fps": 16,
      "loop": false
    },
    "skate.crash": {
      "frames": [
        "skate.crash.0",
        "skate.crash.1",
        "skate.crash.2",
        "skate.crash.3",
        "skate.crash.4",
        "skate.crash.5"
      ],
      "fps": 12,
      "loop": false
    },
    "skate.grind": {
      "frames": [
        "skate.grind.0",
        "skate.grind.1",
        "skate.grind.2"
      ],
      "fps": 12,
      "loop": true
    },
    "skate.idle": {
      "frames": [
        "skate.idle.0",
        "skate.idle.1",
        "skate.idle.2"
      ],
      "fps": 6,
      "loop": true
    },
    "roller.roll": {
      "frames": [
        "roller.roll.0",
        "roller.roll.1",
        "roller.roll.2",
        "roller.roll.3",
        "roller.roll.4"
      ],
      "fps": 14,
      "loop": true
    },
    "roller.ollie": {
      "frames": [
        "roller.ollie.0",
        "roller.ollie.1",
        "roller.ollie.2",
        "roller.ollie.3",
        "roller.ollie.4"
      ],
      "fps": 18,
      "loop": false
    },
    "roller.flip": {
      "frames": [
        "roller.flip.0",
        "roller.flip.1",
        "roller.flip.2",
        "roller.flip.3",
        "roller.flip.4",
        "roller.flip.5",
        "roller.flip.6"
      ],
      "fps": 20,
      "loop": false
    },
    "roller.manual": {
      "frames": [
        "roller.manual.0",
        "roller.manual.1",
        "roller.manual.2",
        "roller.manual.3",
        "roller.manual.4",
        "roller.manual.5"
      ],
      "fps": 10,
      "loop": true
    },
    "roller.crash": {
      "frames": [
        "roller.crash.0",
        "roller.crash.1",
        "roller.crash.2",
        "roller.crash.3",
        "roller.crash.4",
        "roller.crash.5"
      ],
      "fps": 12,
      "loop": false
    },
    "roller.grind": {
      "frames": [
        "roller.grind.0",
        "roller.grind.1",
        "roller.grind.2"
      ],
      "fps": 12,
      "loop": true
    },
    "roller.idle": {
      "frames": [
        "roller.idle.0",
        "roller.idle.1",
        "roller.idle.2"
      ],
      "fps": 6,
      "loop": true
    },
    "fx.spark": {
      "frames": [
        "fx.spark.0",
        "fx.spark.1",
        "fx.spark.2"
      ],
      "fps": 24,
      "loop": false
    },
    "fx.dust": {
      "frames": [
        "fx.dust.0",
        "fx.dust.1",
        "fx.dust.2"
      ],
      "fps": 18,
      "loop": false
    }
  }
};

return { default: __default };
})();
__mod["src/core/assets.js"] = (function () {
// Chargement des assets.
//
// L'atlas est importé en module ES, pas récupéré par fetch : le jeu doit aussi
// démarrer depuis file://, où fetch() d'un fichier local est bloqué. Les images,
// elles, se chargent bien via <img> quel que soit le protocole.

const ATLAS = __mod["assets/atlas.js"].default;

// Chemin relatif au document, pas au module : le bundle file:// est un script
// classique, où import.meta n'existe pas.
const BASE = 'assets/';

let sheet = null;

const atlas = ATLAS;

function loadAssets() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { sheet = img; resolve(); };
    img.onerror = () => reject(new Error(`texture introuvable : ${ATLAS.sheet}`));
    img.src = BASE + ATLAS.sheet;
  });
}

function sheetImage() {
  return sheet;
}

/** Métadonnées d'une frame, ou null si la clé n'existe pas. */
function frame(key) {
  return ATLAS.frames[key] || null;
}

function anim(key) {
  return ATLAS.anims[key] || null;
}

function hasFrame(key) {
  return key in ATLAS.frames;
}

return { atlas, loadAssets, sheetImage, frame, anim, hasFrame };
})();
__mod["src/core/rng.js"] = (function () {
// PRNG seedé (mulberry32) — reproductible : un run endless peut être rejoué à
// l'identique à partir de sa seed affichée (§6.7).

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

return { mulberry32 };
})();
__mod["src/render/renderer.js"] = (function () {
// Rendu : canvas, mise à l'échelle, orientation.
//
// Le jeu raisonne toujours dans un espace virtuel fixe — 480 × 270 en paysage,
// 270 × 480 en portrait — que le renderer projette sur le canvas réel. L'échelle
// est entière dès qu'elle le peut : c'est la condition pour que le pixel art
// reste net. Le reste de l'écran est comblé par des bandes de fond.

const LANDSCAPE = { w: 480, h: 270 };
const PORTRAIT = { w: 270, h: 480 };

const MAX_DPR = 3; // au-delà, on paie des pixels que personne ne distingue

function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });

  const view = {
    w: LANDSCAPE.w,
    h: LANDSCAPE.h,
    scale: 1,
    ox: 0,
    oy: 0,
    portrait: false,
    dpr: 1,
    cssW: 0,
    cssH: 0,
  };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const cssW = Math.max(1, window.innerWidth);
    const cssH = Math.max(1, window.innerHeight);
    const pw = Math.round(cssW * dpr);
    const ph = Math.round(cssH * dpr);

    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const portrait = ph > pw;
    const base = portrait ? PORTRAIT : LANDSCAPE;
    view.portrait = portrait;
    view.w = base.w;
    view.h = base.h;
    view.dpr = dpr;
    view.cssW = cssW;
    view.cssH = cssH;

    const raw = Math.min(pw / view.w, ph / view.h);
    // Échelle entière quand c'est possible ; en dessous de 1 on n'a pas le choix,
    // mieux vaut un rendu légèrement flou qu'un jeu qui déborde de l'écran.
    view.scale = raw >= 1 ? Math.floor(raw) : raw;
    view.ox = Math.floor((pw - view.w * view.scale) / 2);
    view.oy = Math.floor((ph - view.h * view.scale) / 2);

    // imageSmoothingEnabled se réinitialise à chaque changement de taille.
    ctx.imageSmoothingEnabled = false;
  }

  /** Ouvre une frame : fond, cadrage, clipping sur l'espace virtuel. */
  function begin(background = '#12131a') {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    ctx.beginPath();
    ctx.rect(0, 0, view.w, view.h);
    ctx.clip();
  }

  function end() {
    ctx.restore();
  }

  /** Convertit un point de l'écran (px CSS) en coordonnées de l'espace virtuel. */
  function toVirtual(clientX, clientY) {
    return {
      x: (clientX * view.dpr - view.ox) / view.scale,
      y: (clientY * view.dpr - view.oy) / view.scale,
    };
  }

  resize();
  return { ctx, view, resize, begin, end, toVirtual };
}

return { LANDSCAPE, PORTRAIT, createRenderer };
})();
__mod["src/render/sprite.js"] = (function () {
// Dessin des frames de l'atlas.
//
// Chaque frame porte un offset par rapport à son ancre — le milieu-bas de la
// case d'origine, c'est-à-dire les pieds du rider. C'est ce qui permet de dessiner
// n'importe quelle frame en donnant simplement la position au sol : les frames
// aériennes gardent leur hauteur au lieu de retomber sur le sol.

const { frame, sheetImage } = __mod["src/core/assets.js"];

// Malgré son nom, la version « Droite » des planches (§3) dessine le
// personnage visage tourné vers la GAUCHE — vérifié sur skate.roll.0, jambe
// d'appel et tête pointent à gauche. Le nommage Gauche/Droite désigne le sens
// de niveau voulu (§3, §6.2 : « niveaux impairs vers la droite »), pas
// l'orientation réelle du dessin. Isolée ici pour qu'un test la verrouille :
// sans ce flip inversé, le rider semblait avancer à reculons.
function flipPourDirection(direction) {
  return direction > 0;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} key      clé de frame dans l'atlas
 * @param {number} x        position de l'ancre, espace virtuel
 * @param {number} y        position de l'ancre (le sol), espace virtuel
 * @param {object} [opts]
 * @param {boolean} [opts.flip]    miroir horizontal (§3 : on ne stocke que la droite)
 * @param {number} [opts.alpha]
 * @param {number} [opts.scaleY]   écrasement vertical, pour le squash d'atterrissage
 */
function drawFrame(ctx, key, x, y, opts = {}) {
  const f = frame(key);
  const img = sheetImage();
  if (!f || !img) { drawMissing(ctx, x, y); return; }

  const { flip = false, alpha = 1, scaleY = 1 } = opts;
  const [rx, ry, rw, rh] = f.rect;
  const [ox, oy] = f.offset;

  // Cas courant : ni miroir, ni squash, ni transparence — un seul drawImage.
  if (!flip && scaleY === 1 && alpha === 1) {
    ctx.drawImage(img, rx, ry, rw, rh, Math.round(x) + ox, Math.round(y) + oy, rw, rh);
    return;
  }

  ctx.save();
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(y));
  // Le miroir et le squash partent tous deux de l'ancre : le rider reste centré
  // sur ses pieds, qui restent collés au sol.
  ctx.scale(flip ? -1 : 1, scaleY);
  ctx.drawImage(img, rx, ry, rw, rh, flip ? -ox - rw : ox, oy, rw, rh);
  ctx.restore();
}

/** Placeholder d'asset manquant : magenta barré, impossible à confondre (C6). */
function drawMissing(ctx, x, y, w = 16, h = 16) {
  ctx.save();
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(Math.round(x - w / 2), Math.round(y - h), w, h);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y - h);
  ctx.lineTo(x + w / 2, y);
  ctx.moveTo(x + w / 2, y - h);
  ctx.lineTo(x - w / 2, y);
  ctx.stroke();
  ctx.restore();
}

return { flipPourDirection, drawFrame, drawMissing };
})();
__mod["src/game/state.js"] = (function () {
// Machine à états des écrans.
//
// Un seul état actif à la fois. Les transitions passent toutes par `go()`, ce qui
// donne un point unique où purger le tampon d'entrées : sans ça, l'appui qui
// ferme un menu déclenche un saut dans l'écran suivant.

const State = {
  BOOT: 'BOOT',
  MENU: 'MENU',
  PLAY: 'PLAY',
  PAUSE: 'PAUSE',
  GAMEOVER: 'GAMEOVER',
  SCORES: 'SCORES',
};

function createStateMachine(initial, handlers = {}) {
  let current = initial;
  let previous = null;
  let elapsed = 0;

  function go(next, payload) {
    if (next === current) return;
    handlers[current]?.exit?.(next);
    previous = current;
    current = next;
    elapsed = 0;
    handlers[current]?.enter?.(previous, payload);
  }

  return {
    get current() { return current; },
    get previous() { return previous; },
    /** Temps écoulé dans l'état courant, en secondes. */
    get elapsed() { return elapsed; },
    is(...states) { return states.includes(current); },
    go,
    update(dt) {
      elapsed += dt;
      handlers[current]?.update?.(dt);
    },
    render(alpha) {
      handlers[current]?.render?.(alpha);
    },
  };
}

return { State, createStateMachine };
})();
__mod["src/data/riders.js"] = (function () {
// Caractéristiques des deux riders (§7).
//
// Les deux partagent la même machine à états : seuls les coefficients et la
// table d'animations changent. Ajouter un rider revient à ajouter une entrée ici
// et les animations correspondantes dans l'atlas.

const RIDERS = {
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

const RIDER_PAR_DEFAUT = 'skate';

function getRider(id) {
  return RIDERS[id] || RIDERS[RIDER_PAR_DEFAUT];
}

return { RIDERS, RIDER_PAR_DEFAUT, getRider };
})();
__mod["src/data/anims.js"] = (function () {
// Table des animations du rider (§5).
//
// L'atlas fournit déjà les frames et un fps ; ce fichier ajoute la couche
// gameplay : le découpage d'une animation de saut en phases.
//
// Pourquoi ce découpage. Une anim d'ollie fait 5 frames à 18 fps, soit 0,28 s,
// alors que le saut dure 0,56 s — et bien davantage pour un boost. Jouer
// l'animation « au chronomètre » la ferait finir en plein vol, rider figé sur
// une pose d'atterrissage à un mètre du sol. On la pilote donc par la phase du
// saut : le pop se joue une fois au décollage, l'air boucle tant que le rider
// est en l'air, la réception se joue au contact. L'animation reste ainsi
// synchrone avec la physique quelle que soit la hauteur du saut.

const PHASES = {
  ollie: { pop: [0, 1], air: [2, 3], land: [4] },
  flip: { pop: [0, 1, 2], air: [3, 4, 5], land: [6] },
  nocomply: { pop: [0, 1], air: [2, 3, 4], land: [5] },
  manual: { pop: [0, 1], air: [2, 3, 4], land: [5] },
};

// §6.4 : le trick ne compte que si le rider est dans la partie « trick en l'air »
// de son animation ; c'est aussi la fenêtre du perfect landing.
const FENETRE_TRICK = {
  ollie: [2, 3],
  flip: [3, 5],
  nocomply: [2, 4],
  manual: [2, 4],
};

const FPS = {
  idle: 6,
  roll: 14,
  ollie: 18,
  flip: 20,
  nocomply: 16,
  manual: 10,
  grind: 12,
  crash: 12,
};

// §5 : la vitesse de l'animation de roulé suit la vitesse du rider.
function fpsRoulé(vitesse) {
  return Math.max(8, Math.min(20, 8 + vitesse / 40));
}

// §5 : la dernière frame de chute reste affichée avant la réapparition.
const DUREE_CRASH_FIGE = 0.9;

// §5 : pas de frame de réception dédiée — un écrasement vertical bref suffit à
// vendre l'impact.
const SQUASH_RECEPTION = 0.88;
const DUREE_RECEPTION = 0.1;

return { PHASES, FENETRE_TRICK, FPS, fpsRoulé, DUREE_CRASH_FIGE, SQUASH_RECEPTION, DUREE_RECEPTION };
})();
__mod["src/game/player.js"] = (function () {
// Le rider : physique et machine à états d'animation.
//
// Un seul objet pour les deux personnages — seuls les coefficients de riders.js
// et le préfixe d'animation changent (§7).

const { Action } = __mod["src/core/input.js"];
const { getRider } = __mod["src/data/riders.js"];
const { PHASES, FENETRE_TRICK, FPS, fpsRoulé, DUREE_CRASH_FIGE, SQUASH_RECEPTION, DUREE_RECEPTION } = __mod["src/data/anims.js"];

const RiderState = {
  IDLE: 'IDLE',
  ROLL: 'ROLL',
  AIR: 'AIR',
  LAND: 'LAND',
  CRASH: 'CRASH',
};

const GRAVITE = 2200;
const GRAVITE_BOOST = 1400;   // §6.3 : montée du boost seulement
const CHUTE_MAX = 1400;

const COYOTE = 0.09;          // §6.3
const FENETRE_CONVERSION = 0.14;     // voir commentaire sur le double tap

// §6.2 : vitesse de défilement.
const VITESSE_BASE = 240;
const VITESSE_GAIN = 8;              // par palier
const PALIER = 10;                   // secondes
const VITESSE_MAX = 460;
const LEAN = 0.15;

// §6.3 : les trois sauts.
const SAUTS = {
  ollie: { v0: -620, gravite: GRAVITE, anim: 'ollie', points: 50 },
  flip: { v0: -820, gravite: GRAVITE, anim: 'flip', points: 150 },
  boost: { v0: -700, gravite: GRAVITE_BOOST, anim: null, points: 200 },
};

const hauteurSommet = (v0, g) => (v0 * v0) / (2 * g);

function createPlayer({ rider = 'skate', direction = 1 } = {}) {
  const stats = getRider(rider);

  const p = {
    stats,
    direction,                 // +1 vers la droite, -1 vers la gauche (§6.2)

    x: 0, y: 0, vy: 0,
    prevX: 0, prevY: 0,

    state: RiderState.IDLE,
    auSol: true,
    coyote: 0,
    tempsVol: 0,
    sautEnCours: null,         // clé de SAUTS
    animSaut: 'ollie',         // anim jouée pendant le vol
    bonusRampe: 1,             // §6.5 : une rampe majore le prochain saut

    tempsAnim: 0,
    tempsEtat: 0,
    squash: 1,

    vitesse: VITESSE_BASE,
    tempsCourse: 0,
    distance: 0,

    /** Réinitialise le rider au sol, sans toucher aux compteurs de run. */
    poser(x, y) {
      p.x = p.prevX = x;
      p.y = p.prevY = y;
      p.vy = 0;
      p.auSol = true;
      p.coyote = 0;
      p.tempsVol = 0;
      p.sautEnCours = null;
      p.squash = 1;
      setState(RiderState.ROLL);
    },

    update(dt, { input, solY }) {
      p.prevX = p.x;
      p.prevY = p.y;
      p.tempsEtat += dt;
      p.tempsAnim += dt;

      if (p.state === RiderState.CRASH) {
        majChute(dt, solY);
        return;
      }

      majVitesse(dt, input);
      majSaut(input);
      majPhysique(dt, solY);
      majAnim(dt);
    },

    /** Clé de frame à dessiner. */
    frameKey() {
      const pre = stats.prefixe;
      switch (p.state) {
        case RiderState.IDLE: return `${pre}.idle.${indexBoucle('idle', 3)}`;
        case RiderState.ROLL: return `${pre}.roll.${indexRoulé()}`;
        case RiderState.AIR: return `${pre}.${p.animSaut}.${indexVol()}`;
        case RiderState.LAND: return `${pre}.${p.animSaut}.${dernierePhase()}`;
        case RiderState.CRASH: return `${pre}.crash.${indexCrash()}`;
        default: return `${pre}.idle.0`;
      }
    },

    /** §6.4 : le rider est-il dans la fenêtre de trick de son animation ? */
    dansFenetreTrick() {
      if (p.state !== RiderState.AIR) return false;
      const f = FENETRE_TRICK[p.animSaut];
      if (!f) return false;
      const i = indexVol();
      return i >= f[0] && i <= f[1];
    },

    /** Déclenche la chute (§6.7). */
    crasher() {
      if (p.state === RiderState.CRASH) return;
      setState(RiderState.CRASH);
      p.vy = Math.min(p.vy, -180); // le rider est projeté avant de retomber
    },

    get crashTermine() {
      return p.state === RiderState.CRASH && p.tempsEtat >= DUREE_CRASH_FIGE;
    },
  };

  // ── Interne ────────────────────────────────────────────────────────────────

  function setState(s) {
    if (p.state === s) return;
    p.state = s;
    p.tempsEtat = 0;
    p.tempsAnim = 0;
  }

  function majVitesse(dt, input) {
    p.tempsCourse += dt;
    const paliers = Math.floor(p.tempsCourse / PALIER);
    const base = Math.min(VITESSE_MAX, VITESSE_BASE + paliers * VITESSE_GAIN);

    let facteur = 1;
    if (input.isDown(Action.LEAN_FWD)) facteur = 1 + LEAN;
    else if (input.isDown(Action.LEAN_BACK)) facteur = 1 - LEAN;

    p.vitesse = base * stats.vitesse * facteur;
    p.distance += p.vitesse * dt;
  }

  function lancerSaut(type) {
    const saut = SAUTS[type];
    // Le boost n'a pas d'animation propre : il emprunte le spécial du rider,
    // no-comply pour le skate, manual pour le roller (§7).
    p.animSaut = saut.anim || stats.special;
    p.sautEnCours = type;
    p.vy = saut.v0 * stats.hauteurSaut * p.bonusRampe;
    p.graviteMontee = saut.gravite;
    p.auSol = false;
    p.coyote = 0;
    p.tempsVol = 0;
    p.bonusRampe = 1;
    setState(RiderState.AIR);
  }

  /** Recale le saut en cours pour culminer à `cible` px au-dessus du sol. */
  function convertirVers(type, solY) {
    const saut = SAUTS[type];
    const cible = hauteurSommet(saut.v0 * stats.hauteurSaut, saut.gravite);
    const acquise = solY - p.y;
    p.vy = -Math.sqrt(2 * saut.gravite * Math.max(0, cible - acquise));
    p.graviteMontee = saut.gravite;
    p.animSaut = saut.anim || stats.special;
    p.sautEnCours = type;
  }

  function majSaut(input) {
    // Note d'implémentation — « variable jump height » (§6.3).
    //
    // La règle « relâcher tôt coupe la vitesse verticale à 45 % » ne peut
    // s'appliquer à aucun des trois sauts de ce jeu, parce que le schéma
    // d'entrées du §11 la contredit :
    //   • l'ollie part *au relâchement* d'un tap court — la touche est déjà
    //     lâchée à l'instant du décollage, la coupure serait systématique ;
    //   • le boost naît d'un double tap ou d'un Shift+Espace, gestes brefs par
    //     nature — même problème ;
    //   • le flip part au franchissement du seuil de 150 ms. Y appliquer la
    //     coupure obligeait à maintenir ~500 ms pour obtenir la hauteur
    //     nominale : essayé, mesuré à 122 px au lieu de 153. Un joueur qui fait
    //     exactement le geste demandé par le brief rate son saut.
    //
    // Les trois sauts gardent donc une hauteur fixe — ce que le tableau du §6.3
    // spécifie au pixel près, et ce qui sert le cœur du design : trois sauts
    // lisibles dont on choisit un pour ses contraintes, pas une modulation
    // continue. La profondeur de jeu vient du choix du saut et de l'airtime
    // qu'il coûte, pas d'un dosage de la touche.
    const peutSauter = p.auSol || p.coyote > 0;

    if (peutSauter) {
      if (input.consume(Action.JUMP_LONG)) return lancerSaut('boost');
      if (input.consume(Action.JUMP_HIGH)) return lancerSaut('flip');
      if (input.consume(Action.JUMP_SHORT)) return lancerSaut('ollie');
      return;
    }

    // Le premier tap d'un double tap est forcément parti en ollie : attendre la
    // fenêtre de double tap pour trancher ajouterait 250 ms de latence à chaque
    // saut. Le second tap convertit donc le saut à peine amorcé — même geste,
    // pas un double saut.
    if (p.tempsVol < FENETRE_CONVERSION && p.vy < 0
        && p.sautEnCours !== 'boost' && input.consume(Action.JUMP_LONG)) {
      convertirVers('boost', p.solY);
    }
  }

  function majPhysique(dt, solY) {
    p.solY = solY;

    if (p.auSol) {
      p.y = solY;
      p.vy = 0;
      return;
    }

    p.tempsVol += dt;
    if (p.coyote > 0) p.coyote = Math.max(0, p.coyote - dt);

    const g = p.vy < 0 ? (p.graviteMontee || GRAVITE) : GRAVITE;
    p.vy = Math.min(p.vy + g * dt, CHUTE_MAX);
    p.y += p.vy * dt;

    if (p.y >= solY) {
      p.y = solY;
      p.vy = 0;
      p.auSol = true;
      p.tempsVol = 0;
      p.sautEnCours = null;
      if (p.state === RiderState.AIR) setState(RiderState.LAND);
    }
  }

  function majChute(dt, solY) {
    p.vy = Math.min(p.vy + GRAVITE * dt, CHUTE_MAX);
    p.y = Math.min(solY, p.y + p.vy * dt);
    if (p.y >= solY) { p.y = solY; p.vy = 0; p.auSol = true; }
  }

  function majAnim(dt) {
    if (p.state === RiderState.LAND) {
      // §5 : écrasement vertical bref, qui se relâche progressivement.
      const t = Math.min(1, p.tempsEtat / DUREE_RECEPTION);
      p.squash = SQUASH_RECEPTION + (1 - SQUASH_RECEPTION) * t;
      if (p.tempsEtat >= DUREE_RECEPTION) {
        p.squash = 1;
        setState(RiderState.ROLL);
      }
      return;
    }
    p.squash = 1;
  }

  // ── Sélection de frame ─────────────────────────────────────────────────────

  function indexBoucle(nom, nbFrames) {
    return Math.floor(p.tempsAnim * FPS[nom]) % nbFrames;
  }

  function indexRoulé() {
    return Math.floor(p.tempsAnim * fpsRoulé(p.vitesse)) % 5;
  }

  function phases() {
    return PHASES[p.animSaut] || PHASES.ollie;
  }

  function dernierePhase() {
    const ph = phases();
    return ph.land[ph.land.length - 1];
  }

  function indexVol() {
    const ph = phases();
    const fps = FPS[p.animSaut] || 16;
    const iPop = Math.floor(p.tempsAnim * fps);
    if (iPop < ph.pop.length) return ph.pop[iPop];
    // Le pop est joué, on boucle sur les frames aériennes jusqu'au contact.
    const iAir = iPop - ph.pop.length;
    return ph.air[iAir % ph.air.length];
  }

  function indexCrash() {
    // §5 : l'animation se joue une fois puis se fige sur la dernière frame.
    return Math.min(5, Math.floor(p.tempsEtat * FPS.crash));
  }

  /** Le rider vient de quitter le sol sans sauter : il garde sa fenêtre coyote. */
  p.quitterLeSol = function quitterLeSol() {
    if (!p.auSol) return;
    p.auSol = false;
    p.coyote = COYOTE;
    p.tempsVol = 0;
    if (p.state === RiderState.ROLL) setState(RiderState.AIR);
    p.animSaut = 'ollie';
  };

  return p;
}

return { RiderState, GRAVITE, GRAVITE_BOOST, CHUTE_MAX, COYOTE, SAUTS, createPlayer };
})();
__mod["src/data/tuning.js"] = (function () {
// Constantes de vitesse partagées (§6.2).
//
// Sorties ici plutôt que dans player.js : game/chunks.js en a besoin pour
// calculer le rab de sécurité entre chunks (§8) sans importer tout le module
// du rider — et sans risquer que les deux dérivent si on change un chiffre
// dans un seul des deux fichiers.

const VITESSE_BASE = 240;
const VITESSE_GAIN = 8;     // par palier
const PALIER = 10;          // secondes
const VITESSE_MAX = 460;
const LEAN = 0.15;          // ±15 % (§6.2)

// Vitesse la plus haute jamais atteignable, lean compris : c'est elle qui sert
// de référence de sécurité pour l'invariant du §8 (voir game/chunks.js).
const VITESSE_MAX_LEAN = VITESSE_MAX * (1 + LEAN);

return { VITESSE_BASE, VITESSE_GAIN, PALIER, VITESSE_MAX, LEAN, VITESSE_MAX_LEAN };
})();
__mod["src/game/chunks.js"] = (function () {
// Séquencement des chunks : tirage en sac et placement garanti sans piège (§8).
//
// Note d'implémentation — l'invariant du §8, comment il est réellement tenu.
//
// « La distance entre le dernier obstacle d'un chunk et le premier du suivant
// doit toujours être ≥ speed × 0.9. » Un chunk fait 480 px de large. À la
// vitesse plafond avec lean (§6.2 : 460 × 1.15 ≈ 529 px/s), le gap requis est
// de ~476 px — quasiment la largeur d'un chunk entier. Si on demandait à
// CHAQUE chunk de rester sûr contre N'IMPORTE QUEL voisin par construction
// statique (dernier obstacle proche du bord gauche ET premier obstacle proche
// du bord droit, pour survivre aux deux rôles), il ne resterait qu'une bande
// utile d'une centaine de pixels au centre de chaque chunk — invivable pour du
// contenu varié, et ça contredit l'exemple même du brief (obstacles à
// x=120, 260, 380, qui ne passerait pas ce test statique).
//
// Le placement compense donc dynamiquement, au moment d'accoler deux chunks :
// l'écart réel entre le dernier obstacle du chunk qui se termine et le premier
// du chunk qui commence est mesuré, et un « rab » silencieux est inséré si
// besoin pour toujours atteindre le gap requis à la vitesse plafond — quelle
// que soit la vitesse réelle au moment où le rider y arrivera. Un chunk vide
// (respiration) n'a pas de dernier obstacle : rien à garantir, rab nul. Ça
// laisse les chunks libres d'être aussi riches que le brief le suggère, tout
// en rendant l'invariant vrai par construction, pas par une contrainte
// d'auteur difficile à respecter et impossible à vérifier à l'œil.

const { VITESSE_MAX_LEAN } = __mod["src/data/tuning.js"];

function dernierObstacleX(chunk) {
  let max = -Infinity;
  for (const e of chunk.entities) if (e.x > max) max = e.x;
  return max === -Infinity ? null : max;
}

function premierObstacleX(chunk) {
  let min = Infinity;
  for (const e of chunk.entities) if (e.x < min) min = e.x;
  return min === Infinity ? null : min;
}

/**
 * Offset du chunk `suivant`, en insérant le rab nécessaire pour respecter
 * l'invariant du §8 à `vitesse` px/s (par défaut, la vitesse plafond avec
 * lean : c'est la seule qui rend la garantie valable "à toutes les vitesses"
 * sans avoir à connaître la vitesse réelle au moment du passage).
 */
function placerSuivant(precedent, precedentOffset, suivant, vitesse = VITESSE_MAX_LEAN) {
  const finPrecedent = precedentOffset + precedent.width;
  const dernier = dernierObstacleX(precedent);
  const premier = premierObstacleX(suivant);
  if (dernier === null || premier === null) return finPrecedent;

  const requis = vitesse * 0.9;
  const actuel = (precedent.width - dernier) + premier;
  const rab = Math.max(0, requis - actuel);
  return finPrecedent + rab;
}

/** Sac : pioche sans remise dans `chunks`, remélange une fois épuisé (§8). */
function createSac(chunks, rng) {
  let pioche = [];
  function remplir() {
    pioche = chunks.slice();
    for (let i = pioche.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pioche[i], pioche[j]] = [pioche[j], pioche[i]];
    }
  }
  return {
    tirer() {
      if (pioche.length === 0) remplir();
      return pioche.pop();
    },
  };
}

return { dernierObstacleX, premierObstacleX, placerSuivant, createSac };
})();
__mod["src/data/chunks.js"] = (function () {
// Bibliothèque de chunks (§8) : segments de 480 px, purement déclaratifs.
//
// `entities[].x` est une position LOCALE au chunk (0..480) ; game/chunks.js se
// charge de l'espacement entre chunks (voir son commentaire d'en-tête pour le
// pourquoi de l'invariant §8). Ici, on écrit du contenu naturel, sans se
// soucier des bords — exactement comme l'exemple du brief lui-même.
//
// Les collectibles (`coin`) n'existent pas encore : le scoring arrive en P4
// (§6.6). Le format accueillera le champ sans changer de forme.
//
// Structure demandée par le brief : 6 chunks par palier de difficulté (1 à 5),
// plus 3 chunks « respiration » (vides) et 3 chunks « bonus » (combo garanti).

const chunk = (id, difficulty, requires, entities) => ({
  id, width: 480, difficulty, requires, ground: 'concrete', entities, decor: [],
});

// ─── Palier 1 — Ollie seul, obstacles bas isolés ─────────────────────────────
const PALIER_1 = [
  chunk('p1_curb_seul', 1, ['ollie'], [{ type: 'curb', x: 220 }]),
  chunk('p1_cone_seul', 1, ['ollie'], [{ type: 'cone', x: 260 }]),
  chunk('p1_hydrant_seul', 1, ['ollie'], [{ type: 'hydrant', x: 200 }]),
  chunk('p1_deux_curbs', 1, ['ollie'], [{ type: 'curb', x: 120 }, { type: 'curb', x: 340 }]),
  chunk('p1_cone_hydrant', 1, ['ollie'], [{ type: 'cone', x: 150 }, { type: 'hydrant', x: 330 }]),
  chunk('p1_triple_bas', 1, ['ollie'], [
    { type: 'curb', x: 100 }, { type: 'cone', x: 240 }, { type: 'hydrant', x: 380 },
  ]),
];

// ─── Palier 2 — Flip, obstacles hauts ────────────────────────────────────────
const PALIER_2 = [
  chunk('p2_poubelle_seule', 2, ['ollie', 'flip'], [{ type: 'bin', x: 220 }]),
  chunk('p2_banc_seul', 2, ['ollie', 'flip'], [{ type: 'bench', x: 240 }]),
  chunk('p2_distributeur', 2, ['ollie', 'flip'], [{ type: 'vending', x: 200 }]),
  chunk('p2_mix_bas_haut', 2, ['ollie', 'flip'], [
    { type: 'curb', x: 90 }, { type: 'planter', x: 260 },
  ]),
  chunk('p2_jardiniere_poubelle', 2, ['ollie', 'flip'], [
    { type: 'planter', x: 140 }, { type: 'bin', x: 340 },
  ]),
  chunk('p2_enchainement_hauts', 2, ['ollie', 'flip'], [
    { type: 'bench', x: 110 }, { type: 'cone', x: 220 }, { type: 'vending', x: 360 },
  ]),
];

// ─── Palier 3 — Boost, gaps ───────────────────────────────────────────────────
const PALIER_3 = [
  chunk('p3_gap_seul', 3, ['ollie', 'flip', 'boost'], [{ type: 'gap', x: 220, w: 90 }]),
  chunk('p3_gap_large', 3, ['ollie', 'flip', 'boost'], [{ type: 'gap', x: 200, w: 120 }]),
  chunk('p3_curb_gap', 3, ['ollie', 'flip', 'boost'], [
    { type: 'curb', x: 80 }, { type: 'gap', x: 260, w: 90 },
  ]),
  chunk('p3_gap_poubelle', 3, ['ollie', 'flip', 'boost'], [
    { type: 'gap', x: 150, w: 80 }, { type: 'bin', x: 360 },
  ]),
  chunk('p3_double_gap', 3, ['ollie', 'flip', 'boost'], [
    { type: 'gap', x: 110, w: 70 }, { type: 'gap', x: 320, w: 70 },
  ]),
  chunk('p3_mix_complet', 3, ['ollie', 'flip', 'boost'], [
    { type: 'cone', x: 70 }, { type: 'gap', x: 200, w: 90 }, { type: 'bench', x: 380 },
  ]),
];

// ─── Palier 4 — Rampes, grinds ────────────────────────────────────────────────
const PALIER_4 = [
  chunk('p4_rampe_seule', 4, ['ollie', 'flip', 'boost'], [{ type: 'quarterpipe', x: 200 }]),
  chunk('p4_escalier', 4, ['ollie', 'flip', 'boost'], [{ type: 'stairs', x: 220 }]),
  chunk('p4_rail_droit', 4, ['ollie', 'flip', 'boost'], [{ type: 'rail', x: 190, y: 4 }]),
  chunk('p4_rail_kinked', 4, ['ollie', 'flip', 'boost'], [{ type: 'railKinked', x: 190, y: 4 }]),
  chunk('p4_rampe_rail', 4, ['ollie', 'flip', 'boost'], [
    { type: 'quarterpipe', x: 80 }, { type: 'rail', x: 280, y: 4 },
  ]),
  chunk('p4_escalier_gap', 4, ['ollie', 'flip', 'boost'], [
    { type: 'stairs', x: 90 }, { type: 'gap', x: 280, w: 80 },
  ]),
];

// ─── Palier 5 — Densité maximale, tout mélangé ───────────────────────────────
const PALIER_5 = [
  chunk('p5_gauntlet_1', 5, ['ollie', 'flip', 'boost'], [
    { type: 'curb', x: 60 }, { type: 'bin', x: 160 }, { type: 'gap', x: 280, w: 80 }, { type: 'rail', x: 400, y: 4 },
  ]),
  chunk('p5_gauntlet_2', 5, ['ollie', 'flip', 'boost'], [
    { type: 'cone', x: 50 }, { type: 'quarterpipe', x: 150 }, { type: 'planter', x: 300 }, { type: 'hydrant', x: 400 },
  ]),
  chunk('p5_gauntlet_3', 5, ['ollie', 'flip', 'boost'], [
    { type: 'gap', x: 70, w: 70 }, { type: 'bench', x: 220 }, { type: 'stairs', x: 340 },
  ]),
  chunk('p5_gauntlet_4', 5, ['ollie', 'flip', 'boost'], [
    { type: 'railKinked', x: 60, y: 4 }, { type: 'cone', x: 250 }, { type: 'gap', x: 360, w: 70 },
  ]),
  chunk('p5_gauntlet_5', 5, ['ollie', 'flip', 'boost'], [
    { type: 'vending', x: 60 }, { type: 'curb', x: 180 }, { type: 'planter', x: 300 }, { type: 'hydrant', x: 400 },
  ]),
  chunk('p5_gauntlet_6', 5, ['ollie', 'flip', 'boost'], [
    { type: 'quarterpipe', x: 60 }, { type: 'gap', x: 200, w: 80 }, { type: 'bin', x: 340 }, { type: 'cone', x: 420 },
  ]),
];

// ─── Respiration — vides, pour laisser souffler après une séquence dure ─────
const RESPIRATION = [
  chunk('respiration_1', 0, [], []),
  chunk('respiration_2', 0, [], []),
  chunk('respiration_3', 0, [], []),
];

// ─── Bonus — rail long, ligne de coins (les coins arrivent en P4) ────────────
const BONUS = [
  chunk('bonus_rail_long', 0, ['ollie', 'flip', 'boost'], [
    { type: 'rail', x: 130, y: 4 }, { type: 'rail', x: 260, y: 4 },
  ]),
  chunk('bonus_combo_garanti', 0, ['ollie', 'flip', 'boost'], [
    { type: 'quarterpipe', x: 80 }, { type: 'rail', x: 220, y: 4 }, { type: 'quarterpipe', x: 380 },
  ]),
  chunk('bonus_ligne_bas', 0, ['ollie'], [
    { type: 'curb', x: 100 }, { type: 'cone', x: 220 }, { type: 'hydrant', x: 340 },
  ]),
];

const CHUNKS_PAR_PALIER = {
  1: PALIER_1, 2: PALIER_2, 3: PALIER_3, 4: PALIER_4, 5: PALIER_5,
};

const TOUS_LES_CHUNKS = [
  ...PALIER_1, ...PALIER_2, ...PALIER_3, ...PALIER_4, ...PALIER_5,
  ...RESPIRATION, ...BONUS,
];

return { RESPIRATION, BONUS, CHUNKS_PAR_PALIER, TOUS_LES_CHUNKS };
})();
__mod["src/game/level.js"] = (function () {
// Séquenceur de niveau : file de chunks placés, générée au fur et à mesure que
// le rider avance (§2, §8, §9).
//
// Les chunks de respiration et bonus rejoignent le tirage de CHAQUE palier :
// ils sont sûrs à toute vitesse (respiration = aucun obstacle, bonus = contenu
// dont l'espacement suit les mêmes règles que le reste), donc rien n'interdit
// de les mélanger partout — contrairement aux chunks numérotés, qui restent
// groupés par palier de difficulté (§8 : « on tire sans remise dans le paquet
// de chunks du palier courant »).

const { createSac, placerSuivant } = __mod["src/game/chunks.js"];
const { CHUNKS_PAR_PALIER, RESPIRATION, BONUS } = __mod["src/data/chunks.js"];

const CHUNKS_PAR_CHECKPOINT = 5; // §6.7

function createLevel({ rng, palierInitial = 1 } = {}) {
  const sacsParPalier = new Map();
  function sacDuPalier(p) {
    if (!sacsParPalier.has(p)) {
      const pool = [...(CHUNKS_PAR_PALIER[p] || CHUNKS_PAR_PALIER[1]), ...RESPIRATION, ...BONUS];
      sacsParPalier.set(p, createSac(pool, rng));
    }
    return sacsParPalier.get(p);
  }

  const placés = [];        // { chunk, offset }
  const checkpoints = [];   // worldX de chaque checkpoint franchi (§6.7)
  let palier = palierInitial;
  let finPlacée = 0;
  let depuisCheckpoint = 0;

  function pousserUnChunk() {
    const chunk = sacDuPalier(palier).tirer();
    const dernier = placés[placés.length - 1];
    const offset = dernier ? placerSuivant(dernier.chunk, dernier.offset, chunk) : 0;
    placés.push({ chunk, offset });
    finPlacée = offset + chunk.width;

    depuisCheckpoint++;
    if (depuisCheckpoint >= CHUNKS_PAR_CHECKPOINT) {
      checkpoints.push(finPlacée);
      depuisCheckpoint = 0;
    }
  }

  return {
    placés,
    checkpoints,
    get palier() { return palier; },
    set palier(p) { palier = Math.max(1, Math.min(5, p)); },

    /** Génère assez de chunks pour couvrir jusqu'à `scroll + marge`. */
    assurerJusque(scroll, marge = 960) {
      while (finPlacée < scroll + marge) pousserUnChunk();
    },

    /** Dernier checkpoint déjà franchi par le rider (0 s'il n'y en a pas). */
    dernierCheckpointFranchi(scroll) {
      let dernier = 0;
      for (const cp of checkpoints) {
        if (cp > scroll) break;
        dernier = cp;
      }
      return dernier;
    },
  };
}

return { createLevel };
})();
__mod["src/data/entities.js"] = (function () {
// Registre des types d'obstacles et de décor (§6.5).
//
// Chaque hitbox est tracée à la main, jamais déduite de la taille du sprite
// (§3) : les décors sont dessinés en perspective isométrique légère, qui
// gonfle leur hauteur visuelle bien au-delà de leur encombrement réel au sol.
// curb.0 dessine par exemple un bloc de 39 px de haut pour un rebord qui ne
// doit bloquer le rider que sur ses 14 derniers pixels.
//
// La classification par famille suit le tableau nommé du §6.5 (curb/cône/
// borne = bas, poubelle/banc/jardinière/distributeur = haut), pas le seuil
// « h ≤ 28 px » qu'il donne en regard : ce seuil est une indication de lecture
// du tableau, pas une règle à vérifier contre des hitbox déjà volontairement
// réduites — le banc par exemple (37×21 en sprite) est classé « haut » par le
// tableau nommé alors que 21 px passerait sous le seuil ; sa hitbox est donc
// portée à 30 px de haut pour rester cohérente avec les deux à la fois.
//
// Les collectibles (coins) n'existent pas encore ici : ils arrivent avec le
// scoring en P4 (§6.6). Le format de chunk les accueillera sans changer de
// forme le moment venu.

const Family = {
  LOW: 'LOW',     // Ollie suffit — collision latérale, dessus franchissable
  HIGH: 'HIGH',    // Flip ou Boost obligatoires
  GAP: 'GAP',      // Boost obligatoire — chute si abordé au sol
  RAMP: 'RAMP',    // Jamais de crash — bonus de trajectoire (§6.5)
  RAIL: 'RAIL',    // Grindable par le dessus, crash par le côté
  DECOR: 'DECOR',  // Aucune collision — pure profondeur visuelle
};

const ENTITIES = {
  // Solide bas — Ollie suffit.
  curb: { family: Family.LOW, frame: 'curb.0', hitbox: { w: 44, h: 14 } },
  cone: { family: Family.LOW, frame: 'connector.0', hitbox: { w: 26, h: 18 } },
  hydrant: { family: Family.LOW, frame: 'street.2', hitbox: { w: 22, h: 22 } },

  // Solide haut — Flip ou Boost.
  bin: { family: Family.HIGH, frame: 'urban.2', hitbox: { w: 20, h: 32 } },
  planter: { family: Family.HIGH, frame: 'urban.4', hitbox: { w: 28, h: 34 } },
  bench: { family: Family.HIGH, frame: 'urban.5', hitbox: { w: 32, h: 30 } },
  vending: { family: Family.HIGH, frame: 'prop.0', hitbox: { w: 24, h: 40 } },

  // Gap — largeur fournie par le chunk (`w` sur l'entité), pas de sprite :
  // c'est un trou dans le sol, rendu procéduralement comme le sol lui-même
  // en attendant les vraies tuiles de P5.
  gap: { family: Family.GAP, frame: null, hitbox: { w: null, h: 0 } },

  // Rampes — jamais de crash, bonus de trajectoire.
  quarterpipe: { family: Family.RAMP, frame: 'park.1', hitbox: { w: 40, h: 14 } },
  stairs: { family: Family.RAMP, frame: 'bonus.3', hitbox: { w: 30, h: 10 } },

  // Rails — grindables par le dessus (mécanique complète en P4).
  rail: { family: Family.RAIL, frame: 'rail.0', hitbox: { w: 92, h: 10 } },
  railKinked: { family: Family.RAIL, frame: 'rail.5', hitbox: { w: 90, h: 10 } },

  // Décor — aucune collision.
  pole: { family: Family.DECOR, frame: 'prop.2' },
  palm: { family: Family.DECOR, frame: 'atmo.3' },
  sign: { family: Family.DECOR, frame: 'street.3' },
};

return { Family, ENTITIES };
})();
__mod["src/game/entities.js"] = (function () {
// Instanciation des entités de niveau à partir des chunks (§6.5, §8).
//
// Les chunks ne bougent jamais : ce sont des positions fixes dans l'espace du
// monde (worldX, en pixels depuis le départ du niveau). C'est le défilement
// qui fait apparaître et disparaître les entités à l'écran. La liste plate est
// donc calculée une seule fois, au chargement du niveau — aucune allocation
// par frame dans la boucle chaude (§14).

const { ENTITIES } = __mod["src/data/entities.js"];

/** Aplatit une séquence de chunks placés (voir game/chunks.js) en entités. */
function construireEntites(chunksPlaces) {
  const liste = [];
  for (const { chunk, offset } of chunksPlaces) {
    for (const e of chunk.entities) {
      const def = ENTITIES[e.type];
      if (!def) throw new Error(`type d'entité inconnu : ${e.type}`);
      liste.push({
        type: e.type,
        family: def.family,
        frame: def.frame,
        worldX: offset + e.x,
        hitbox: { w: e.w ?? def.hitbox.w, h: def.hitbox.h },
        elevation: e.y || 0, // hauteur au-dessus du sol (rails suspendus, §8)
      });
    }
  }
  liste.sort((a, b) => a.worldX - b.worldX);
  return liste;
}

/**
 * Sous-ensemble des entités dont le worldX tombe dans [scroll-marge, scroll+marge].
 * `liste` est triée par worldX et `indexDepart` est le curseur renvoyé par
 * l'appel précédent : comme le rider n'avance que dans un sens, ce curseur ne
 * recule jamais et chaque frame ne refiltre qu'une fenêtre, pas tout le niveau.
 */
function entitesActives(liste, indexDepart, scroll, marge = 600) {
  let i = indexDepart;
  while (i < liste.length && liste[i].worldX < scroll - marge) i++;
  const actives = [];
  for (let j = i; j < liste.length && liste[j].worldX < scroll + marge; j++) {
    actives.push(liste[j]);
  }
  return { actives, indexSuivant: i };
}

return { construireEntites, entitesActives };
})();
__mod["src/game/physics.js"] = (function () {
// Collisions swept AABB entre le rider et les entités de jeu (§6.5).
//
// Le rider ne se déplace jamais en X à l'écran : c'est le monde qui défile
// sous lui (§6.2), player.x reste fixe à 30 % de l'écran. La collision se
// ramène donc à un test d'intervalle : à quel moment, pendant le pas de
// simulation, l'intervalle X (mobile, porté par le défilement) de l'entité
// a-t-il recoupé la bande X (fixe) du rider ? Sans ce test « balayé » — pas
// seulement échantillonné au début et à la fin du pas — un obstacle pourrait
// franchir la bande du rider *entre* deux frames à 460+ px/s sans jamais
// déclencher de collision : c'est le tunneling que le §6.5 demande d'éviter.
//
// Vertical, le même principe s'applique en sens inverse : les pieds du rider
// sont balayés entre prevY et y, comparés à la tranche verticale [sommet, bas]
// de l'obstacle. Trois issues possibles : passé par-dessus (jamais descendu
// sous le sommet), passé par-dessous (jamais monté au-dessus du bas — le cas
// d'un rail élevé sous lequel on roule), ou collision.

const { Family } = __mod["src/data/entities.js"];

const LARGEUR_RIDER = 14; // hitbox du rider, plus étroite que le sprite (§3)
const TOLERANCE = 2; // px, absorbe les arrondis de rendu

/** Position écran d'une entité à `t` ∈ [0,1] du pas, entre deux positions de scroll. */
function screenX(worldX, playerX, scrollAvant, scrollApres, direction, t) {
  const scroll = scrollAvant + (scrollApres - scrollAvant) * t;
  return playerX + direction * (worldX - scroll);
}

/** Vrai si l'intervalle X balayé de l'entité a pu croiser la bande du rider. */
function balayageX(entity, playerX, scrollAvant, scrollApres, direction) {
  const demiLargeur = entity.hitbox.w / 2;
  const x0 = screenX(entity.worldX, playerX, scrollAvant, scrollApres, direction, 0) - demiLargeur;
  const x1 = screenX(entity.worldX, playerX, scrollAvant, scrollApres, direction, 1) - demiLargeur;
  const xMin = Math.min(x0, x1);
  const xMax = Math.max(x0, x1) + entity.hitbox.w;
  const pMin = playerX - LARGEUR_RIDER / 2;
  const pMax = playerX + LARGEUR_RIDER / 2;
  return xMin < pMax && xMax > pMin;
}

/**
 * Résout la collision rider/entité pour ce pas de simulation.
 * @param {number} scrollAvant  défilement du monde au début du pas
 * @param {number} scrollApres  défilement du monde à la fin du pas
 * @returns {'none'|'crash'|'ramp'|'clear'}
 *   none  — aucun contact
 *   crash — collision, §6.7
 *   ramp  — contact avec une rampe : bonus de trajectoire, jamais de crash
 *   clear — franchi sans dommage (par-dessus un solide/rail, par-dessous un rail élevé)
 */
function resoudre(entity, player, solY, scrollAvant, scrollApres) {
  if (entity.family === Family.DECOR) return 'none';
  if (!balayageX(entity, player.x, scrollAvant, scrollApres, player.direction)) {
    return 'none';
  }

  if (entity.family === Family.GAP) {
    // §6.5 : tomber dedans exige d'être au sol ; un saut par-dessus n'y touche pas.
    return player.auSol && player.y >= solY - TOLERANCE ? 'crash' : 'none';
  }

  const bas = solY - (entity.elevation || 0);
  const piedsMax = Math.max(player.prevY, player.y); // point le plus bas atteint pendant le pas

  if (entity.family === Family.RAMP) {
    // Contact seulement si le rider est proche du sol/de la rampe — survoler
    // sa tranche X en plein vol ne déclenche pas le bonus.
    return piedsMax >= bas - TOLERANCE ? 'ramp' : 'none';
  }

  // LOW, HIGH, RAIL : trois issues selon où sont passés les pieds pendant le pas.
  const sommet = bas - entity.hitbox.h;
  const piedsMin = Math.min(player.prevY, player.y); // point le plus haut atteint pendant le pas
  if (piedsMax <= sommet + TOLERANCE) return 'clear'; // resté au-dessus tout le pas

  // « Passé par-dessous » n'a de sens que s'il existe un vrai espace physique
  // sous l'obstacle (elevation > 0, un rail suspendu par exemple). Un obstacle
  // posé au sol a bas === solY : un rider au sol a alors piedsMin === bas à
  // l'exacte tolérance près, ce qui validerait à tort "passé dessous" pour un
  // simple curb qu'on n'a pas sauté.
  if (entity.elevation > 0 && piedsMin >= bas - TOLERANCE) return 'clear';

  return 'crash';
}

return { LARGEUR_RIDER, resoudre };
})();
__mod["src/main.js"] = (function () {
// Maxence Rider — amorçage.

const { createLoop } = __mod["src/core/loop.js"];
const { createInput, Action } = __mod["src/core/input.js"];
const { loadAssets, atlas, frame: frameInfo } = __mod["src/core/assets.js"];
const { mulberry32 } = __mod["src/core/rng.js"];
const { createRenderer } = __mod["src/render/renderer.js"];
const { drawFrame, flipPourDirection } = __mod["src/render/sprite.js"];
const { createStateMachine, State } = __mod["src/game/state.js"];
const { createPlayer, RiderState } = __mod["src/game/player.js"];
const { createLevel } = __mod["src/game/level.js"];
const { construireEntites, entitesActives } = __mod["src/game/entities.js"];
const { resoudre } = __mod["src/game/physics.js"];
const { Family, ENTITIES } = __mod["src/data/entities.js"];

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

return {  };
})();
})();
