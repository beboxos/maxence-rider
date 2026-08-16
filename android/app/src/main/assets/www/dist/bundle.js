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
  TOGGLE_MUTE: 'TOGGLE_MUTE',
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
      case 'KeyM': press(Action.TOGGLE_MUTE); break;
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
        246,
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
        291,
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
        736,
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
        323,
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
        424,
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
        837,
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
        524,
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
        624,
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
        236,
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
        222,
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
        724,
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
        214,
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
    },
    "cone": {
      "file": "sprites/decor/cone.png",
      "w": 15,
      "h": 17,
      "offset": [
        -8,
        -17
      ],
      "rect": [
        198,
        254,
        15,
        17
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
let heroImg = null;

const atlas = ATLAS;

function loadAssets() {
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

function sheetImage() {
  return sheet;
}

function menuHeroImage() {
  return heroImg;
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

return { atlas, loadAssets, sheetImage, menuHeroImage, frame, anim, hasFrame };
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
__mod["src/game/player.js"] = (function () {
// Le rider : physique et machine à états d'animation.
//
// Un seul objet pour les deux personnages — seuls les coefficients de riders.js
// et le préfixe d'animation changent (§7).

const { Action } = __mod["src/core/input.js"];
const { getRider } = __mod["src/data/riders.js"];
const { PHASES, FENETRE_TRICK, FPS, fpsRoulé, DUREE_CRASH_FIGE, SQUASH_RECEPTION, DUREE_RECEPTION } = __mod["src/data/anims.js"];
const { VITESSE_BASE, VITESSE_GAIN, PALIER, VITESSE_MAX, LEAN } = __mod["src/data/tuning.js"];

const RiderState = {
  IDLE: 'IDLE',
  ROLL: 'ROLL',
  AIR: 'AIR',
  LAND: 'LAND',
  CRASH: 'CRASH',
  GRIND: 'GRIND',   // §6.4
  MANUAL: 'MANUAL', // §6.4, roller uniquement
};

const GRAVITE = 2200;
const GRAVITE_BOOST = 1400;   // §6.3 : montée du boost seulement
const CHUTE_MAX = 1400;

const COYOTE = 0.09;          // §6.3
const FENETRE_CONVERSION = 0.14;     // voir commentaire sur le double tap
const DELAI_SAUT_MANUAL = 0.08;      // §6.4 : « délai de saut +80 ms » en manual

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
    perfectLandingDernier: false,

    grindEntite: null,         // entité en cours de grind (§6.4)
    grindY: 0,
    sautDiffere: null,         // { type, delai } — manual, §6.4

    tempsAnim: 0,
    tempsEtat: 0,
    squash: 1,

    vitesse: VITESSE_BASE,
    tempsCourse: 0,
    distance: 0,
    boosts: [], // Liste de { timer, facteur }
    niveauPalier: 1,

    ajouterBoost(duree = 1.0, facteur = 0.30) {
      p.boosts.push({ timer: duree, facteur });
    },

    get boostGrindTimer() {
      if (p.boosts.length === 0) return 0;
      let maxT = 0;
      for (const b of p.boosts) if (b.timer > maxT) maxT = b.timer;
      return maxT;
    },

    set boostGrindTimer(val) {
      p.boosts = val > 0 ? [{ timer: val, facteur: 0.35 }] : [];
    },

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
      p.grindEntite = null;
      p.sautDiffere = null;
      p.boosts = [];
      p.niveauPalier = 1;
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

      // Un saut différé (déclenché pendant un manual) prime sur tout le reste
      // tant qu'il n'a pas abouti : on ne relit pas les entrées entre-temps,
      // le geste est déjà pris en compte, seul son exécution est retardée.
      if (p.sautDiffere) {
        p.sautDiffere.delai -= dt;
        if (p.sautDiffere.delai <= 0) {
          const { type } = p.sautDiffere;
          p.sautDiffere = null;
          lancerSaut(type);
        }
      } else if (p.state === RiderState.GRIND) {
        majSautDepuisGrind(input);
      } else if (p.state === RiderState.MANUAL) {
        majSautDepuisManual(input);
      } else {
        majSaut(input);
      }

      majPhysique(dt, solY);
      majAnim(dt);
    },

    /** Clé de frame à dessiner. */
    frameKey() {
      const pre = p.stats.prefixe;
      switch (p.state) {
        case RiderState.IDLE: return `${pre}.idle.${indexBoucle('idle', 3)}`;
        case RiderState.ROLL: return `${pre}.roll.${indexRoulé()}`;
        case RiderState.AIR: return `${pre}.${p.animSaut}.${indexVol()}`;
        case RiderState.LAND: return `${pre}.${p.animSaut}.${dernierePhase()}`;
        case RiderState.CRASH: return `${pre}.crash.${indexCrash()}`;
        case RiderState.GRIND: return `${pre}.grind.${indexBoucle('grind', 3)}`;
        case RiderState.MANUAL: return `${pre}.manual.${indexBoucle('manual', 6)}`;
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
      p.grindEntite = null;
      p.sautDiffere = null;
    },

    get crashTermine() {
      return p.state === RiderState.CRASH && p.tempsEtat >= DUREE_CRASH_FIGE;
    },

    /**
     * Passage en grind (§6.4) : le rider se colle au sommet de l'entité,
     * gravité suspendue, jusqu'ai un saut volontaire ou la fin du rail (décidés
     * par l'appelant — player.js ne connaît ni le défilement ni les entités).
     */
    entrerGrind(entite, solY) {
      p.grindEntite = entite;
      p.grindY = solY - (entite.elevation || 0) - (entite.hitbox?.h || 0);
      p.y = p.grindY;
      p.vy = 0;
      p.auSol = false;
      if (p.state === RiderState.AIR) {
        const ph = phases();
        const fps = FPS[p.animSaut] || 16;
        const dureeAnim = (ph.pop.length + ph.air.length) / fps;
        p.perfectLandingDernier = p.tempsAnim <= dureeAnim + 0.03;
        p.dernierSautReussi = p.sautEnCours;
      }
      p.sautEnCours = null;
      setState(RiderState.GRIND);
    },

    /**
     * Sort du grind. `chute` distingue un rail élevé (on retombe, §6.5 : les
     * rails sont grindables par le dessus mais rien ne les prolonge jusqu'au
     * sol) d'un curb au ras du sol (on continue de rouler directement).
     */
    sortirGrind({ chute = true } = {}) {
      p.grindEntite = null;
      p.ajouterBoost(1.0, 0.35); // Boost de vitesse de sortie de grind
      if (chute) {
        p.auSol = false;
        p.animSaut = 'ollie'; // retombée neutre, l'anim n'est pas le point ici
        p.vy = 0;
        setState(RiderState.AIR);
      } else {
        p.auSol = true;
        p.vy = 0;
        if (p.solY) p.y = p.solY;
        setState(RiderState.ROLL);
      }
    },

    /** §6.4 : manual, roller uniquement, déclenché au sol. */
    activerManual() {
      if (p.stats.special !== 'manual' || p.state !== RiderState.ROLL) return;
      setState(RiderState.MANUAL);
    },

    get enGrind() { return p.state === RiderState.GRIND; },
    get enManual() { return p.state === RiderState.MANUAL; },
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

    // Accumulation de tous les boosts actifs
    let bonusBoost = 0;
    for (let i = p.boosts.length - 1; i >= 0; i--) {
      const b = p.boosts[i];
      b.timer -= dt;
      if (b.timer > 0) {
        bonusBoost += b.facteur;
      } else {
        p.boosts.splice(i, 1);
      }
    }
    facteur *= (1 + bonusBoost);

    // Légère augmentation de la vitesse globale par niveau (+6% par niveau au-dessus du niveau 1)
    const bonusNiveau = 1 + ((p.niveauPalier || 1) - 1) * 0.06;

    p.vitesse = base * p.stats.vitesse * facteur * bonusNiveau;
    p.distance += p.vitesse * dt;
  }

  function lancerSaut(type) {
    const saut = SAUTS[type];
    // Le boost n'a pas d'animation propre : il emprunte le spécial du rider,
    // no-comply pour le skate, manual pour le roller (§7).
    p.animSaut = saut.anim || p.stats.special;
    p.sautEnCours = type;
    p.vy = saut.v0 * p.stats.hauteurSaut * p.bonusRampe;
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
    const cible = hauteurSommet(saut.v0 * p.stats.hauteurSaut, saut.gravite);
    const acquise = solY - p.y;
    p.vy = -Math.sqrt(2 * saut.gravite * Math.max(0, cible - acquise));
    p.graviteMontee = saut.gravite;
    p.animSaut = saut.anim || p.stats.special;
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
      if (p.auSol && p.stats.special === 'manual' && input.isDown(Action.CROUCH_MANUAL)) {
        return p.activerManual();
      }
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

  /** Pendant un grind : n'importe quel saut sort du rail et décolle aussitôt. */
  function majSautDepuisGrind(input) {
    if (input.consume(Action.JUMP_LONG)) { p.grindEntite = null; p.ajouterBoost(1.0, 0.35); lancerSaut('boost'); return; }
    if (input.consume(Action.JUMP_HIGH)) { p.grindEntite = null; p.ajouterBoost(1.0, 0.35); lancerSaut('flip'); return; }
    if (input.consume(Action.JUMP_SHORT)) { p.grindEntite = null; p.ajouterBoost(1.0, 0.35); lancerSaut('ollie'); return; }
    // Sans saut, la fin naturelle du rail est détectée par l'appelant
    // (comparaison de position au monde), pas ici : player.js ne le sait pas.
  }

  /** Pendant un manual : le saut est différé de 80 ms (§6.4), sinon relâcher ↓ y met fin. */
  function majSautDepuisManual(input) {
    if (input.consume(Action.JUMP_LONG)) { p.sautDiffere = { type: 'boost', delai: DELAI_SAUT_MANUAL }; return; }
    if (input.consume(Action.JUMP_HIGH)) { p.sautDiffere = { type: 'flip', delai: DELAI_SAUT_MANUAL }; return; }
    if (input.consume(Action.JUMP_SHORT)) { p.sautDiffere = { type: 'ollie', delai: DELAI_SAUT_MANUAL }; return; }
    if (!input.isDown(Action.CROUCH_MANUAL)) setState(RiderState.ROLL);
  }

  function majPhysique(dt, solY) {
    p.solY = solY;

    if (p.state === RiderState.GRIND) {
      p.y = p.grindY; // collé au rail : la gravité ne s'applique pas (§6.4)
      p.vy = 0;
      return;
    }

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
      if (p.state === RiderState.AIR) {
        // Note d'implémentation — perfect landing (§6.4).
        const ph = phases();
        const fps = FPS[p.animSaut] || 16;
        const dureeAnim = (ph.pop.length + ph.air.length) / fps;
        p.perfectLandingDernier = p.tempsAnim <= dureeAnim + 0.03;
        p.dernierSautReussi = p.sautEnCours;
        setState(RiderState.LAND);
      }
      p.sautEnCours = null;
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
    // §5 : animation « non-loop ». Le pop puis les frames aériennes se jouent
    // une fois, linéairement, puis le rider reste posé sur la dernière pose
    // aérienne jusqu'au contact — un modulo ici ferait battre les bras en
    // boucle pendant tout le vol (repéré à l'œil : ça ressemblait à un
    // tremblement, pas à un saut qui monte puis plane).
    const iAir = Math.min(iPop - ph.pop.length, ph.air.length - 1);
    return ph.air[iAir];
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
__mod["src/data/entities.js"] = (function () {
// Registre des types d'obstacles et de décor (§6.5).
//
// Hitbox calibrées au pixel pour une précision arcade sans tunneling.

const Family = {
  LOW: 'LOW',                 // Ollie suffit — collision latérale, dessus franchissable
  HIGH: 'HIGH',               // Flip ou Boost obligatoires
  GAP: 'GAP',                 // Boost obligatoire — chute si abordé au sol
  RAMP: 'RAMP',               // Jamais de crash — bonus de trajectoire (§6.5)
  RAIL: 'RAIL',               // Grindable par le dessus, crash par le côté
  DECOR: 'DECOR',             // Aucune collision — pure profondeur visuelle
  COLLECTIBLE: 'COLLECTIBLE', // Canettes (+100 pts) et Bonus de vie Croix Verte (+1 VIE)
};

const ENTITIES = {
  // Solide bas — Ollie suffit (dessus grindable pour le curb).
  curb: { family: Family.LOW, frame: 'curb.0', hitbox: { w: 44, h: 14 }, grindable: true },
  cone: { family: Family.LOW, frame: 'cone', hitbox: { w: 15, h: 17 } },
  hydrant: { family: Family.LOW, frame: 'street.2', hitbox: { w: 22, h: 22 } },

  // Solide haut — Flip ou Boost.
  bin: { family: Family.HIGH, frame: 'urban.2', hitbox: { w: 20, h: 32 } },
  planter: { family: Family.HIGH, frame: 'urban.4', hitbox: { w: 28, h: 34 } },
  bench: { family: Family.HIGH, frame: 'urban.5', hitbox: { w: 32, h: 30 } },
  vending: { family: Family.HIGH, frame: 'prop.0', hitbox: { w: 24, h: 40 } },

  // Gap — largeur fournie par le chunk (`w` sur l'entité).
  gap: { family: Family.GAP, frame: null, hitbox: { w: null, h: 0 } },

  // Rampes — jamais de crash, bonus de trajectoire.
  quarterpipe: { family: Family.RAMP, frame: 'park.1', hitbox: { w: 40, h: 14 } },
  stairs: { family: Family.RAMP, frame: 'bonus.3', hitbox: { w: 30, h: 10 } },

  // Rails — grindables par le dessus (§6.4, §6.5).
  rail: { family: Family.RAIL, frame: 'rail.0', hitbox: { w: 92, h: 10 }, grindable: true },
  railKinked: { family: Family.RAIL, frame: 'rail.5', hitbox: { w: 90, h: 10 }, grindable: true },
  railLong: { family: Family.RAIL, frame: 'rail.0', hitbox: { w: 160, h: 10 }, grindable: true },

  // Collectibles — canettes (+100 pts) et bonus de vie (+1 VIE).
  coin: { family: Family.COLLECTIBLE, frame: null, hitbox: { w: 12, h: 12 } },
  life_cross: { family: Family.COLLECTIBLE, frame: null, hitbox: { w: 16, h: 16 } },

  // Décor — aucune collision.
  pole: { family: Family.DECOR, frame: 'prop.2' },
  palm: { family: Family.DECOR, frame: 'atmo.3' },
  sign: { family: Family.DECOR, frame: 'street.3' },
};

return { Family, ENTITIES };
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
const { ENTITIES, Family } = __mod["src/data/entities.js"];

function estObstacle(e) {
  const def = ENTITIES[e.type];
  if (!def) return false;
  return def.family !== Family.DECOR && def.family !== Family.COLLECTIBLE;
}

function dernierObstacleX(chunk) {
  let max = -Infinity;
  for (const e of chunk.entities) {
    if (estObstacle(e) && e.x > max) max = e.x;
  }
  return max === -Infinity ? null : max;
}

function premierObstacleX(chunk) {
  let min = Infinity;
  for (const e of chunk.entities) {
    if (estObstacle(e) && e.x < min) min = e.x;
  }
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
// Bibliothèque de chunks enrichie (§8) : segments de 480 px.
//
// Variété maximale : double grinds, triple grinds, rails longs,
// et bonus de vie croix verte géré à raison de STRICTEMENT 1 par niveau.

const chunk = (id, difficulty, requires, entities) => ({
  id, width: 480, difficulty, requires, ground: 'concrete', entities, decor: [],
});

// ─── Palier 1 — Ollie seul, obstacles bas variés ─────────────────────────────
const PALIER_1 = [
  chunk('p1_curb_seul', 1, ['ollie'], [
    { type: 'curb', x: 220 },
    { type: 'coin', x: 190, y: 25 }, { type: 'coin', x: 220, y: 55 }, { type: 'coin', x: 250, y: 25 },
  ]),
  chunk('p1_cone_seul', 1, ['ollie'], [
    { type: 'cone', x: 260 },
    { type: 'coin', x: 230, y: 25 }, { type: 'coin', x: 260, y: 55 }, { type: 'coin', x: 290, y: 25 },
  ]),
  chunk('p1_hydrant_seul', 1, ['ollie'], [
    { type: 'hydrant', x: 200 },
    { type: 'coin', x: 170, y: 25 }, { type: 'coin', x: 200, y: 55 }, { type: 'coin', x: 230, y: 25 },
  ]),
  chunk('p1_deux_curbs', 1, ['ollie'], [
    { type: 'curb', x: 120 }, { type: 'curb', x: 340 },
    { type: 'coin', x: 120, y: 45 }, { type: 'coin', x: 340, y: 45 },
  ]),
  chunk('p1_cone_hydrant', 1, ['ollie'], [
    { type: 'cone', x: 150 }, { type: 'hydrant', x: 330 },
    { type: 'coin', x: 150, y: 45 }, { type: 'coin', x: 330, y: 50 },
  ]),
  chunk('p1_triple_bas', 1, ['ollie'], [
    { type: 'curb', x: 100 }, { type: 'cone', x: 240 }, { type: 'hydrant', x: 380 },
    { type: 'coin', x: 100, y: 45 }, { type: 'coin', x: 240, y: 45 }, { type: 'coin', x: 380, y: 50 },
  ]),
  chunk('p1_curb_long_grind', 1, ['ollie'], [
    { type: 'curb', x: 140 }, { type: 'curb', x: 220 }, { type: 'cone', x: 380 },
    { type: 'coin', x: 140, y: 35 }, { type: 'coin', x: 220, y: 35 }, { type: 'coin', x: 380, y: 45 },
  ]),
];

// ─── Palier 2 — Flip, obstacles hauts & premiers grinds ──────────────────────
const PALIER_2 = [
  chunk('p2_poubelle_seule', 2, ['ollie', 'flip'], [
    { type: 'bin', x: 220 },
    { type: 'coin', x: 180, y: 40 }, { type: 'coin', x: 220, y: 80 }, { type: 'coin', x: 260, y: 40 },
  ]),
  chunk('p2_banc_seul', 2, ['ollie', 'flip'], [
    { type: 'bench', x: 240 },
    { type: 'coin', x: 200, y: 40 }, { type: 'coin', x: 240, y: 75 }, { type: 'coin', x: 280, y: 40 },
  ]),
  chunk('p2_distributeur', 2, ['ollie', 'flip'], [
    { type: 'vending', x: 200 },
    { type: 'coin', x: 160, y: 50 }, { type: 'coin', x: 200, y: 95 }, { type: 'coin', x: 240, y: 50 },
  ]),
  chunk('p2_mix_bas_haut', 2, ['ollie', 'flip'], [
    { type: 'curb', x: 90 }, { type: 'planter', x: 260 },
    { type: 'coin', x: 90, y: 45 }, { type: 'coin', x: 260, y: 80 },
  ]),
  chunk('p2_jardiniere_poubelle', 2, ['ollie', 'flip'], [
    { type: 'planter', x: 140 }, { type: 'bin', x: 340 },
    { type: 'coin', x: 140, y: 80 }, { type: 'coin', x: 340, y: 80 },
  ]),
  chunk('p2_enchainement_hauts', 2, ['ollie', 'flip'], [
    { type: 'bench', x: 110 }, { type: 'cone', x: 220 }, { type: 'vending', x: 360 },
    { type: 'coin', x: 110, y: 75 }, { type: 'coin', x: 220, y: 45 }, { type: 'coin', x: 360, y: 95 },
  ]),
  chunk('p2_banc_grind_curb', 2, ['ollie', 'flip'], [
    { type: 'curb', x: 110 }, { type: 'bench', x: 260 }, { type: 'curb', x: 400 },
    { type: 'coin', x: 110, y: 45 }, { type: 'coin', x: 260, y: 80 }, { type: 'coin', x: 400, y: 45 },
  ]),
];

// ─── Palier 3 — Boost, gaps & rails combinés ─────────────────────────────────
const PALIER_3 = [
  chunk('p3_gap_seul', 3, ['ollie', 'flip', 'boost'], [
    { type: 'gap', x: 220, w: 90 },
    { type: 'coin', x: 170, y: 35 }, { type: 'coin', x: 220, y: 85 }, { type: 'coin', x: 270, y: 35 },
  ]),
  chunk('p3_gap_large', 3, ['ollie', 'flip', 'boost'], [
    { type: 'gap', x: 200, w: 120 },
    { type: 'coin', x: 140, y: 35 }, { type: 'coin', x: 200, y: 95 }, { type: 'coin', x: 260, y: 35 },
  ]),
  chunk('p3_curb_gap', 3, ['ollie', 'flip', 'boost'], [
    { type: 'curb', x: 80 }, { type: 'gap', x: 260, w: 90 },
    { type: 'coin', x: 80, y: 45 }, { type: 'coin', x: 260, y: 85 },
  ]),
  chunk('p3_gap_poubelle', 3, ['ollie', 'flip', 'boost'], [
    { type: 'gap', x: 150, w: 80 }, { type: 'bin', x: 360 },
    { type: 'coin', x: 150, y: 85 }, { type: 'coin', x: 360, y: 80 },
  ]),
  chunk('p3_double_gap', 3, ['ollie', 'flip', 'boost'], [
    { type: 'gap', x: 110, w: 70 }, { type: 'gap', x: 320, w: 70 },
    { type: 'coin', x: 110, y: 80 }, { type: 'coin', x: 215, y: 45 }, { type: 'coin', x: 320, y: 80 },
  ]),
  chunk('p3_mix_complet', 3, ['ollie', 'flip', 'boost'], [
    { type: 'cone', x: 70 }, { type: 'gap', x: 200, w: 90 }, { type: 'bench', x: 380 },
    { type: 'coin', x: 70, y: 45 }, { type: 'coin', x: 200, y: 85 }, { type: 'coin', x: 380, y: 75 },
  ]),
  chunk('p3_gap_rail_jump', 3, ['ollie', 'flip', 'boost'], [
    { type: 'rail', x: 120, y: 4 }, { type: 'gap', x: 300, w: 80 },
    { type: 'coin', x: 120, y: 30 }, { type: 'coin', x: 300, y: 85 },
  ]),
];

// ─── Palier 4 — Rampes, doubles et triples grinds ────────────────────────────
const PALIER_4 = [
  chunk('p4_rampe_seule', 4, ['ollie', 'flip', 'boost'], [
    { type: 'quarterpipe', x: 200 },
    { type: 'coin', x: 200, y: 55 }, { type: 'coin', x: 230, y: 75 }, { type: 'coin', x: 260, y: 55 },
  ]),
  chunk('p4_escalier', 4, ['ollie', 'flip', 'boost'], [
    { type: 'stairs', x: 220 },
    { type: 'coin', x: 200, y: 35 }, { type: 'coin', x: 240, y: 50 },
  ]),
  chunk('p4_rail_long', 4, ['ollie', 'flip', 'boost'], [
    { type: 'railLong', x: 220, y: 4 },
    { type: 'coin', x: 160, y: 25 }, { type: 'coin', x: 220, y: 25 }, { type: 'coin', x: 280, y: 25 },
  ]),
  // ⚡ Double Grind avec saut au milieu
  chunk('p4_double_grind', 4, ['ollie', 'flip', 'boost'], [
    { type: 'rail', x: 120, y: 4 }, { type: 'rail', x: 340, y: 4 },
    { type: 'coin', x: 120, y: 25 }, { type: 'coin', x: 230, y: 55 }, { type: 'coin', x: 340, y: 25 },
  ]),
  // ⚡ Triple Grind successif (Rail -> Curb -> Rail)
  chunk('p4_triple_grind', 4, ['ollie', 'flip', 'boost'], [
    { type: 'rail', x: 90, y: 4 }, { type: 'curb', x: 230 }, { type: 'rail', x: 370, y: 4 },
    { type: 'coin', x: 90, y: 25 }, { type: 'coin', x: 230, y: 35 }, { type: 'coin', x: 370, y: 25 },
  ]),
  chunk('p4_rampe_double_rail', 4, ['ollie', 'flip', 'boost'], [
    { type: 'quarterpipe', x: 70 }, { type: 'rail', x: 210, y: 4 }, { type: 'rail', x: 370, y: 4 },
    { type: 'coin', x: 70, y: 60 }, { type: 'coin', x: 210, y: 25 }, { type: 'coin', x: 370, y: 25 },
  ]),
  chunk('p4_escalier_gap', 4, ['ollie', 'flip', 'boost'], [
    { type: 'stairs', x: 90 }, { type: 'gap', x: 280, w: 80 },
    { type: 'coin', x: 90, y: 45 }, { type: 'coin', x: 280, y: 85 },
  ]),
];

// ─── Palier 5 — Gauntlets ultra-rythmés, combos extrêmes ─────────────────────
const PALIER_5 = [
  chunk('p5_gauntlet_1', 5, ['ollie', 'flip', 'boost'], [
    { type: 'curb', x: 60 }, { type: 'bin', x: 160 }, { type: 'gap', x: 280, w: 80 }, { type: 'rail', x: 400, y: 4 },
    { type: 'coin', x: 60, y: 45 }, { type: 'coin', x: 160, y: 80 }, { type: 'coin', x: 280, y: 85 }, { type: 'coin', x: 400, y: 25 },
  ]),
  // ⚡ Triple Grind Gauntlet
  chunk('p5_triple_grind_gauntlet', 5, ['ollie', 'flip', 'boost'], [
    { type: 'railKinked', x: 80, y: 4 }, { type: 'curb', x: 230 }, { type: 'railLong', x: 380, y: 4 },
    { type: 'coin', x: 80, y: 25 }, { type: 'coin', x: 230, y: 55 }, { type: 'coin', x: 380, y: 25 },
  ]),
  chunk('p5_gauntlet_2', 5, ['ollie', 'flip', 'boost'], [
    { type: 'cone', x: 50 }, { type: 'quarterpipe', x: 150 }, { type: 'planter', x: 300 }, { type: 'hydrant', x: 400 },
    { type: 'coin', x: 50, y: 45 }, { type: 'coin', x: 150, y: 65 }, { type: 'coin', x: 300, y: 80 }, { type: 'coin', x: 400, y: 50 },
  ]),
  chunk('p5_gauntlet_3', 5, ['ollie', 'flip', 'boost'], [
    { type: 'gap', x: 70, w: 70 }, { type: 'bench', x: 220 }, { type: 'stairs', x: 340 },
    { type: 'coin', x: 70, y: 80 }, { type: 'coin', x: 220, y: 75 }, { type: 'coin', x: 340, y: 45 },
  ]),
  chunk('p5_gauntlet_4', 5, ['ollie', 'flip', 'boost'], [
    { type: 'railLong', x: 100, y: 4 }, { type: 'cone', x: 260 }, { type: 'gap', x: 370, w: 70 },
    { type: 'coin', x: 100, y: 25 }, { type: 'coin', x: 260, y: 45 }, { type: 'coin', x: 370, y: 80 },
  ]),
  chunk('p5_gauntlet_5', 5, ['ollie', 'flip', 'boost'], [
    { type: 'vending', x: 60 }, { type: 'curb', x: 180 }, { type: 'planter', x: 300 }, { type: 'hydrant', x: 400 },
    { type: 'coin', x: 60, y: 95 }, { type: 'coin', x: 180, y: 45 }, { type: 'coin', x: 300, y: 80 }, { type: 'coin', x: 400, y: 50 },
  ]),
  chunk('p5_gauntlet_6', 5, ['ollie', 'flip', 'boost'], [
    { type: 'quarterpipe', x: 60 }, { type: 'gap', x: 200, w: 80 }, { type: 'bin', x: 340 }, { type: 'cone', x: 420 },
    { type: 'coin', x: 60, y: 65 }, { type: 'coin', x: 200, y: 85 }, { type: 'coin', x: 340, y: 80 }, { type: 'coin', x: 420, y: 45 },
  ]),
];

// ─── Respiration — vides, pour souffler après une séquence intense ──────────
const RESPIRATION = [
  chunk('respiration_1', 0, [], []),
  chunk('respiration_2', 0, [], []),
  chunk('respiration_3', 0, [], []),
];

// ─── Bonus — rails longs et lignes de pièces ────────────────────────────────
const BONUS = [
  chunk('bonus_super_grind', 0, ['ollie', 'flip', 'boost'], [
    { type: 'railLong', x: 140, y: 4 }, { type: 'railLong', x: 340, y: 4 },
    { type: 'coin', x: 80, y: 25 }, { type: 'coin', x: 140, y: 25 }, { type: 'coin', x: 240, y: 45 },
    { type: 'coin', x: 300, y: 25 }, { type: 'coin', x: 360, y: 25 },
  ]),
  chunk('bonus_combo_garanti', 0, ['ollie', 'flip', 'boost'], [
    { type: 'quarterpipe', x: 80 }, { type: 'rail', x: 220, y: 4 }, { type: 'quarterpipe', x: 380 },
    { type: 'coin', x: 80, y: 65 }, { type: 'coin', x: 150, y: 35 }, { type: 'coin', x: 220, y: 25 },
    { type: 'coin', x: 290, y: 35 }, { type: 'coin', x: 380, y: 65 },
  ]),
  chunk('bonus_ligne_bas', 0, ['ollie'], [
    { type: 'curb', x: 100 }, { type: 'cone', x: 220 }, { type: 'hydrant', x: 340 },
    { type: 'coin', x: 100, y: 45 }, { type: 'coin', x: 160, y: 20 }, { type: 'coin', x: 220, y: 45 },
    { type: 'coin', x: 280, y: 20 }, { type: 'coin', x: 340, y: 50 },
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
// Les bonus de vie (croix verte type pharmacie) sont distribués à raison
// de STRICTEMENT UNE FOIS par niveau / palier.

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
  const viePlaceeParPalier = new Set();
  let palier = palierInitial;
  let dernierPalierVu = palierInitial;
  let chunksDansCePalier = 0;
  let finPlacée = 0;
  let depuisCheckpoint = 0;

  function pousserUnChunk() {
    if (palier !== dernierPalierVu) {
      dernierPalierVu = palier;
      chunksDansCePalier = 0;
    }
    chunksDansCePalier++;

    let chunk = sacDuPalier(palier).tirer();

    // Exactement UN bonus de vie croix verte par niveau / palier
    if (!viePlaceeParPalier.has(palier) && chunksDansCePalier >= 4) {
      viePlaceeParPalier.add(palier);
      const entitiesAvecVie = [...chunk.entities, { type: 'life_cross', x: 240, y: 55 }];
      chunk = { ...chunk, entities: entitiesAvecVie };
    }

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
    const chunkInstance = {
      id: chunk.id,
      offset,
      totalCoins: 0,
      coinsRamasses: 0,
      cleanLineAccordee: false,
    };

    // Compter d'abord les coins du chunk
    for (const e of chunk.entities) {
      if (e.type === 'coin') chunkInstance.totalCoins++;
    }

    for (const e of chunk.entities) {
      const def = ENTITIES[e.type];
      if (!def) throw new Error(`type d'entité inconnu : ${e.type}`);
      liste.push({
        type: e.type,
        family: def.family,
        frame: def.frame,
        grindable: def.grindable || false,
        worldX: offset + e.x,
        hitbox: { w: e.w ?? def.hitbox.w, h: def.hitbox.h },
        elevation: e.y || 0, // hauteur au-dessus du sol (rails suspendus, §8)
        collected: false,
        chunkInstance,
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
const HAUTEUR_RIDER = 45;
const TOLERANCE = 2; // px, absorbe les arrondis de rendu
const SEUIL_OVERLAP_GRIND = 0.60; // §6.4 : chevauchement horizontal ≥ 60 %

/** Position écran d'une entité à `t` ∈ [0,1] du pas, entre deux positions de scroll. */
function screenX(worldX, playerX, scrollAvant, scrollApres, direction, t) {
  const scroll = scrollAvant + (scrollApres - scrollAvant) * t;
  return playerX + direction * (worldX - scroll);
}

/** Vrai si l'intervalle X balayé de l'entité a pu croiser la bande du rider. */
function balayageX(entity, playerX, scrollAvant, scrollApres, direction) {
  const demiLargeur = (entity.hitbox?.w || 12) / 2;
  const x0 = screenX(entity.worldX, playerX, scrollAvant, scrollApres, direction, 0) - demiLargeur;
  const x1 = screenX(entity.worldX, playerX, scrollAvant, scrollApres, direction, 1) - demiLargeur;
  const xMin = Math.min(x0, x1);
  const xMax = Math.max(x0, x1) + (entity.hitbox?.w || 12);
  const pMin = playerX - LARGEUR_RIDER / 2;
  const pMax = playerX + LARGEUR_RIDER / 2;
  return xMin < pMax && xMax > pMin;
}

/** Ratio de chevauchement horizontal entre le rider et l'entité. */
function chevauchementHorizontal(entity, playerX, scroll, direction) {
  const demiLargeur = (entity.hitbox?.w || 12) / 2;
  const ex = playerX + direction * (entity.worldX - scroll);
  const eMin = ex - demiLargeur;
  const eMax = ex + demiLargeur;
  const pMin = playerX - LARGEUR_RIDER / 2;
  const pMax = playerX + LARGEUR_RIDER / 2;
  const inter = Math.max(0, Math.min(pMax, eMax) - Math.max(pMin, eMin));
  return inter / LARGEUR_RIDER;
}

/**
 * Résout la collision rider/entité pour ce pas de simulation.
 * @param {number} scrollAvant  défilement du monde au début du pas
 * @param {number} scrollApres  défilement du monde à la fin du pas
 * @returns {'none'|'crash'|'ramp'|'clear'|'grind'|'collect'}
 *   none    — aucun contact
 *   crash   — collision, §6.7
 *   ramp    — contact avec une rampe : bonus de trajectoire, jamais de crash
 *   clear   — franchi sans dommage (par-dessus un solide/rail, par-dessous un rail élevé)
 *   grind   — atterrissage descendant sur rail/curb avec overlap ≥ 60 %, §6.4
 *   collect — pièce / canette ramassée au vol, §6.6
 */
function resoudre(entity, player, solY, scrollAvant, scrollApres) {
  if (entity.family === Family.DECOR) return 'none';
  if (!balayageX(entity, player.x, scrollAvant, scrollApres, player.direction)) {
    return 'none';
  }

  // §6.6 : Collectibles (canettes / coins)
  if (entity.family === Family.COLLECTIBLE) {
    if (entity.collected) return 'none';
    const cY = solY - (entity.elevation || 0);
    const halfH = (entity.hitbox?.h || 12) / 2;
    const cMinY = cY - halfH;
    const cMaxY = cY + halfH;
    const pMinY = Math.min(player.prevY, player.y) - HAUTEUR_RIDER;
    const pMaxY = Math.max(player.prevY, player.y);
    if (pMaxY >= cMinY && pMinY <= cMaxY) {
      return 'collect';
    }
    return 'none';
  }

  if (entity.family === Family.GAP) {
    // §6.5 : tomber dedans exige d'être au sol ; un saut par-dessus n'y touche pas.
    return player.auSol && player.y >= solY - TOLERANCE ? 'crash' : 'none';
  }

  const bas = solY - (entity.elevation || 0);
  const piedsMax = Math.max(player.prevY, player.y); // point le plus bas atteint pendant le pas
  const piedsMin = Math.min(player.prevY, player.y); // point le plus haut atteint pendant le pas

  if (entity.family === Family.RAMP) {
    // Contact seulement si le rider est proche du sol/de la rampe — survoler
    // sa tranche X en plein vol ne déclenche pas le bonus.
    return piedsMax >= bas - TOLERANCE ? 'ramp' : 'none';
  }

  const sommet = bas - entity.hitbox.h;

  // §6.4 : Détection du Grind sur rail / curb
  // Condition : obstacle grindable, en l'air, vitesse descendante (vy >= 0),
  // et les pieds franchissent la surface supérieure [sommet - TOLERANCE, sommet + TOLERANCE].
  const estGrindable = entity.grindable || entity.family === Family.RAIL;
  if (estGrindable && !player.auSol && (player.vy >= 0 || player.y >= player.prevY)) {
    const toucheSommet = piedsMin <= sommet + TOLERANCE && piedsMax >= sommet - TOLERANCE;
    if (toucheSommet) {
      const ratio = chevauchementHorizontal(entity, player.x, scrollApres, player.direction);
      if (ratio >= SEUIL_OVERLAP_GRIND) {
        return 'grind';
      }
    }
  }

  // LOW, HIGH, RAIL : trois issues selon où sont passés les pieds pendant le pas.
  if (piedsMax <= sommet + TOLERANCE) return 'clear'; // resté au-dessus tout le pas

  // « Passé par-dessous » n'a de sens que s'il existe un vrai espace physique
  // sous l'obstacle (elevation > 0, un rail suspendu par exemple). Un obstacle
  // posé au sol a bas === solY : un rider au sol a alors piedsMin === bas à
  // l'exacte tolérance près, ce qui validerait à tort "passé dessous" pour un
  // simple curb qu'on n'a pas sauté.
  if (entity.elevation > 0 && piedsMin >= bas - TOLERANCE) return 'clear';

  return 'crash';
}

return { LARGEUR_RIDER, chevauchementHorizontal, resoudre };
})();
__mod["src/core/pool.js"] = (function () {
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

function createPool(fabrique, taille) {
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

return { createPool };
})();
__mod["src/game/scoring.js"] = (function () {
// Score, combo, multiplicateur, bandeaux flottants (§6.4, §6.6).
//
// Note d'implémentation — la fenêtre de grâce du grind.
//
// Le §6.4 dit : combo vidé après 1,8 s sans trick/grind/manual, et « sortie de
// rail : maintenir le combo si le joueur enchaîne un saut dans les 200 ms ».
// Si le grind se contentait de suspendre le délai standard comme le manual, la
// mention spécifique des 200 ms n'aurait pas de raison d'exister. La lecture
// retenue ici : pendant le grind, le délai d'expiration ne progresse pas (on
// score activement) ; à la SORTIE du rail, une fenêtre courte et stricte de
// 200 ms s'ouvre — un nouveau trick dans cette fenêtre garde le combo, sinon
// il est encaissé immédiatement, sans attendre les 1,8 s normales. Ça évite
// qu'un grind interminable serve à figer indéfiniment un combo sans risque, et
// ça donne un sens concret à la mention des 200 ms.
//
// Le manual n'a pas cette mention de fenêtre courte : à son relâchement, le
// délai standard de 1,8 s reprend simplement son cours.

const { createPool } = __mod["src/core/pool.js"];

const PLAFOND_MULTI = 10;
const DELAI_EXPIRATION = 1.8;       // §6.4
const DELAI_GRACE_GRIND = 0.2;      // §6.4 : sortie de rail
const DUREE_BANDEAU = 0.7;          // §6.6
const MONTEE_BANDEAU = 20;          // px, §6.6
const TAILLE_POOL_BANDEAUX = 16;

const TICK_GRIND = 0.1;             // §6.4 : +20 pts / 0.1 s
const POINTS_GRIND = 20;
const TICK_MANUAL = 0.1;            // §6.4 : +10 pts / 0.1 s
const POINTS_MANUAL = 10;

const POINTS_COIN = 100;            // §6.6
const POINTS_CLEAN_LINE = 500;      // §6.6

function creerBandeau() {
  return { texte: '', x: 0, y: 0, age: 0, couleur: '#ffc93c' };
}

function createScoring() {
  const bandeaux = createPool(creerBandeau, TAILLE_POOL_BANDEAUX);

  const etat = {
    score: 0,              // déjà encaissé : tricks encaissés + collectibles + clean line
    multiplicateur: 1,
    enAttente: 0,
    tempsDepuisAction: Infinity, // Infinity = pas de combo en cours, rien à expirer
    grace: false,
    tempsGrace: 0,
    meilleurCombo: 1,
  };

  function emettreBandeau(texte, x, y, couleur = '#ffc93c') {
    const b = bandeaux.acquire();
    if (!b) return;
    b.texte = texte; b.x = x; b.y = y; b.age = 0; b.couleur = couleur;
  }

  /** §6.3/§6.4 : un trick (ollie/flip/boost) réussi. */
  function enregistrerTrick(label, points, x, y, { perfect = false } = {}) {
    const gain = Math.round(points * (perfect ? 1.5 : 1));
    etat.enAttente += gain * etat.multiplicateur;
    etat.multiplicateur = Math.min(PLAFOND_MULTI, etat.multiplicateur + 1);
    etat.meilleurCombo = Math.max(etat.meilleurCombo, etat.multiplicateur);
    etat.tempsDepuisAction = 0;
    etat.grace = false;

    const suffixe = etat.multiplicateur > 1 ? ` ×${etat.multiplicateur - 1}` : '';
    emettreBandeau(`${label} +${gain}${suffixe}`, x, y, perfect ? '#4ed4c4' : '#ffc93c');
  }

  /** §6.4 : accumulateurs pour grind et manual — tick discret, pas de taux continu. */
  function creerAccumulateurTick(intervalle, points) {
    let t = 0;
    return {
      /** Appelé chaque frame tant que l'action est active. */
      update(dt) {
        etat.tempsDepuisAction = 0; // reste vivant tant que l'action continue
        etat.grace = false;
        t += dt;
        while (t >= intervalle) {
          t -= intervalle;
          etat.enAttente += points * etat.multiplicateur;
        }
      },
      reset() { t = 0; },
    };
  }
  const grindTick = creerAccumulateurTick(TICK_GRIND, POINTS_GRIND);
  const manualTick = creerAccumulateurTick(TICK_MANUAL, POINTS_MANUAL);

  function grinding(dt) { grindTick.update(dt); }
  function manualing(dt) { manualTick.update(dt); }

  /** Sortie de rail : ouvre la fenêtre de grâce de 200 ms (voir en-tête). */
  function finGrind() {
    grindTick.reset();
    if (etat.enAttente > 0) { etat.grace = true; etat.tempsGrace = 0; }
  }

  function finManual() {
    manualTick.reset();
    // Pas de fenêtre de grâce spécifique : le délai standard reprend simplement.
    if (etat.enAttente > 0) etat.tempsDepuisAction = 0;
  }

  function encaisser() {
    etat.score += etat.enAttente;
    etat.enAttente = 0;
    etat.multiplicateur = 1;
    etat.tempsDepuisAction = Infinity;
    etat.grace = false;
  }

  /** §6.7 : un crash fait tout perdre, rien n'est encaissé. */
  function perdreCombo() {
    etat.enAttente = 0;
    etat.multiplicateur = 1;
    etat.tempsDepuisAction = Infinity;
    etat.grace = false;
  }

  /** §6.6 : collectible, hors combo — encaissé immédiatement. */
  function ramasserCollectible(x, y) {
    etat.score += POINTS_COIN;
    emettreBandeau(`+${POINTS_COIN}`, x, y, '#ffc93c');
  }

  /** §6.6 : chunk de collectibles entièrement ramassé sans en rater un. */
  function cleanLine(x, y) {
    etat.score += POINTS_CLEAN_LINE;
    emettreBandeau(`CLEAN LINE +${POINTS_CLEAN_LINE}`, x, y, '#4ed4c4');
  }

  function update(dt) {
    if (etat.grace) {
      etat.tempsGrace += dt;
      if (etat.tempsGrace >= DELAI_GRACE_GRIND) encaisser();
    } else if (etat.tempsDepuisAction < Infinity) {
      etat.tempsDepuisAction += dt;
      if (etat.tempsDepuisAction >= DELAI_EXPIRATION) encaisser();
    }

    bandeaux.forEachActive((b) => {
      b.age += dt;
      if (b.age >= DUREE_BANDEAU) bandeaux.release(b);
    });
  }

  /** Position/opacité d'un bandeau pour le rendu. */
  function etatBandeau(b) {
    const t = b.age / DUREE_BANDEAU;
    return { y: b.y - MONTEE_BANDEAU * t, alpha: 1 - t };
  }

  return {
    etat,
    bandeaux,
    enregistrerTrick,
    grinding,
    manualing,
    finGrind,
    finManual,
    perdreCombo,
    ramasserCollectible,
    cleanLine,
    emettreBandeau,
    afficherBandeau: emettreBandeau,
    update,
    etatBandeau,
    /** §6.6 : score_run complet, distance comprise. */
    scoreTotal(distanceM) {
      return etat.score + Math.round(distanceM * 2);
    },
  };
}

return { createScoring };
})();
__mod["src/game/particles.js"] = (function () {
// Particules : poussière et étincelles (§5, §14).
//
// Poolées (core/pool.js) : en combo actif, poussée + atterrissages + grind +
// perfect landing peuvent en émettre plusieurs par seconde — zéro allocation
// après le chargement.
//
// fx.dust : à la poussée (un cycle de roulé complet) et à tout atterrissage.
// fx.spark : en continu pendant un grind, et en gerbe au perfect landing (§6.4).
// Le brief ne détaille pas la cadence exacte de « poussée » ni « en continu
// pendant le grind » au-delà de la table du §5 ; les intervalles ci-dessous
// sont un choix raisonnable, documenté ici plutôt que dans le brief.

const { createPool } = __mod["src/core/pool.js"];
const { anim: animInfo } = __mod["src/core/assets.js"];

const TAILLE_POOL = 48;
const INTERVALLE_GRIND = 0.09; // étincelles pendant un grind, en continu

function creerParticule() {
  return { type: '', x: 0, y: 0, tempsAnim: 0, direction: 1 };
}

function createParticleSystem() {
  const pool = createPool(creerParticule, TAILLE_POOL);
  let depuisEtincelleGrind = 0;

  function emettre(type, x, y, direction = 1) {
    const p = pool.acquire();
    if (!p) return; // pool saturé : particule silencieusement perdue, pas de crash
    p.type = type;
    p.x = x;
    p.y = y;
    p.tempsAnim = 0;
    p.direction = direction;
  }

  function poussiere(x, y, direction) { emettre('fx.dust', x, y, direction); }
  function etincelle(x, y, direction) { emettre('fx.spark', x, y, direction); }

  /** À appeler chaque frame tant que le rider grinde : cadence l'émission. */
  function etincellesDeGrind(dt, x, y, direction) {
    depuisEtincelleGrind += dt;
    if (depuisEtincelleGrind >= INTERVALLE_GRIND) {
      depuisEtincelleGrind = 0;
      etincelle(x, y, direction);
    }
  }

  function reinitGrind() { depuisEtincelleGrind = 0; }

  function update(dt) {
    pool.forEachActive((p) => {
      p.tempsAnim += dt;
      const anim = animInfo(p.type);
      const duree = anim ? anim.frames.length / anim.fps : 0;
      if (p.tempsAnim >= duree) pool.release(p);
    });
  }

  /** Clé de frame à dessiner pour une particule, ou null si son anim est vide. */
  function frameKey(p) {
    const anim = animInfo(p.type);
    if (!anim) return null;
    const i = Math.min(anim.frames.length - 1, Math.floor(p.tempsAnim * anim.fps));
    return anim.frames[i];
  }

  return { poussiere, etincelle, etincellesDeGrind, reinitGrind, update, frameKey, pool };
}

return { createParticleSystem };
})();
__mod["src/game/camera.js"] = (function () {
// Caméra dynamique : anticipation de vitesse et micro-secousses (§6.2, §10, §14).
//
// §6.2 : le rider est placé à 30 % de l'écran dans le sens de la marche, et la
// caméra anticipe de speed × 0.25 px.
// §10 : prefers-reduced-motion désactive le screen shake pour l'accessibilité.

function createCamera() {
  let shakeIntensite = 0;
  let shakeDuree = 0;
  let shakeTemps = 0;

  function prefersReducedMotion() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function shake(intensite = 6, duree = 0.25) {
    if (prefersReducedMotion()) return;
    shakeIntensite = intensite;
    shakeDuree = duree;
    shakeTemps = 0;
  }

  function update(dt) {
    if (shakeTemps < shakeDuree) {
      shakeTemps += dt;
      if (shakeTemps >= shakeDuree) {
        shakeIntensite = 0;
      }
    }
  }

  function getOffset(vitesse, direction) {
    // Anticipation (§6.2)
    const anticipationX = direction * vitesse * 0.25;

    // Shake amorti
    let sx = 0, sy = 0;
    if (shakeIntensite > 0 && shakeDuree > 0) {
      const amorti = 1 - Math.min(1, shakeTemps / shakeDuree);
      const angle = Math.random() * Math.PI * 2;
      const dist = shakeIntensite * amorti;
      sx = Math.cos(angle) * dist;
      sy = Math.sin(angle) * dist;
    }

    return {
      anticipationX,
      shakeX: sx,
      shakeY: sy,
      x: anticipationX + sx,
      y: sy,
    };
  }

  function reset() {
    shakeIntensite = 0;
    shakeDuree = 0;
    shakeTemps = 0;
  }

  return { shake, update, getOffset, reset, prefersReducedMotion };
}

return { createCamera };
})();
__mod["src/render/parallax.js"] = (function () {
// Rendu du décor et de la parallaxe 3 couches (§9, §14).
//
// 5 thèmes graphiques complets avec bâtiments et décors spécifiques :
// 1. Le Skatepark & Avenue (Cyan & Bleu Nuit)
// 2. Pâté de Maisons & Résidences (Briques & Toits chauds)
// 3. Le Campus & L'École (Façade scolaire, horloges, cloches & Pourpre)
// 4. Le Chantier & Lofts (Échafaudages, grues, béton & Ambre de sécurité)
// 5. Le Quartier Cyber Arcade (Mégastructures néon & Nuit étoilée)

const { drawFrame, flipPourDirection } = __mod["src/render/sprite.js"];
const { frame: frameInfo } = __mod["src/core/assets.js"];

const LARGEUR_BATIMENT_SKYLINE = 36;
const ESPACEMENT_BATIMENT_MOYEN = 80;

function createParallaxRenderer() {
  // 1. Étoiles fixes déterministes
  const etoiles = [];
  for (let i = 0; i < 50; i++) {
    etoiles.push({
      x: (i * 37 + 13) % 480,
      y: (i * 23 + 7) % 130,
      taille: (i % 4 === 0) ? 2 : 1,
      brillance: 0.35 + ((i % 5) * 0.13),
    });
  }

  // 2. Skyline lointaine (gratte-ciels et toitures)
  const skyline = [];
  for (let i = 0; i < 60; i++) {
    const h = 45 + ((i * 19 + 7) % 60); // 45 à 105 px
    const fenetres = [];
    const etages = Math.floor((h - 12) / 8);
    for (let e = 0; e < etages; e++) {
      for (let col = 0; col < 3; col++) {
        if ((i * 5 + e * 3 + col) % 3 !== 0) {
          fenetres.push({
            dx: 5 + col * 9,
            dy: 6 + e * 8,
            allumee: ((i * 11 + e * 7 + col) % 4 === 0),
          });
        }
      }
    }
    skyline.push({ h, fenetres });
  }

  // 3. Immeubles de la couche moyenne
  const batimentsMoyens = [];
  for (let i = 0; i < 40; i++) {
    const type = i % 5;
    const w = 56 + ((i * 13) % 24); // 56 à 80 px
    const h = 55 + ((i * 17) % 35); // 55 à 90 px
    batimentsMoyens.push({ type, w, h, propIdx: i % 4 });
  }

  function dessinerCiel(ctx, view, theme, scroll, direction) {
    if (typeof ctx.createLinearGradient === 'function') {
      const grad = ctx.createLinearGradient(0, 0, 0, view.h);
      grad.addColorStop(0, theme.cielHaut);
      grad.addColorStop(0.6, theme.cielBas);
      grad.addColorStop(1, theme.solFond);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = theme.cielBas;
    }
    ctx.fillRect(0, 0, view.w, view.h);

    // Étoiles scintillantes
    if (theme.etoiles) {
      ctx.fillStyle = '#f2f0e6';
      const decalageEtoiles = ((scroll * 0.04 * direction) % view.w + view.w) % view.w;
      for (const e of etoiles) {
        const ex = (e.x - decalageEtoiles + view.w) % view.w;
        if (e.y < view.h * 0.5) {
          ctx.globalAlpha = e.brillance;
          ctx.fillRect(Math.round(ex), Math.round(e.y), e.taille, e.taille);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  function dessinerSkylineLointaine(ctx, view, theme, solY, scroll, direction) {
    const vitesseSkyline = 0.12;
    const scrollSkyline = scroll * vitesseSkyline;
    const debut = Math.floor((scrollSkyline - view.w) / LARGEUR_BATIMENT_SKYLINE);
    const fin = Math.ceil((scrollSkyline + view.w * 2) / LARGEUR_BATIMENT_SKYLINE);

    for (let i = debut; i <= fin; i++) {
      const idx = Math.abs(i) % skyline.length;
      const b = skyline[idx];
      const mondeX = i * LARGEUR_BATIMENT_SKYLINE;
      const ecranX = Math.round(view.w * 0.3 + direction * (mondeX - scrollSkyline));

      if (ecranX < -LARGEUR_BATIMENT_SKYLINE || ecranX > view.w + LARGEUR_BATIMENT_SKYLINE) continue;

      const sommetY = solY - b.h;

      // Silhouette sombre
      ctx.fillStyle = theme.id === 'maisons' ? '#1c120c' : (theme.id === 'chantier' ? '#18120c' : '#10121c');
      ctx.fillRect(ecranX, sommetY, LARGEUR_BATIMENT_SKYLINE - 2, b.h);

      // Grues industrielles dans le ciel pour le chantier
      if (theme.id === 'chantier' && i % 4 === 0) {
        ctx.fillStyle = '#ff9f1a';
        ctx.fillRect(ecranX + 10, sommetY - 22, 2, 22);
        ctx.fillRect(ecranX - 10, sommetY - 22, 35, 2);
        ctx.fillRect(ecranX + 20, sommetY - 22, 1, 12);
      } else if (b.h > 70) {
        // Antennes lumineuses
        ctx.fillStyle = theme.accent || '#4ed4c4';
        ctx.fillRect(ecranX + Math.floor(LARGEUR_BATIMENT_SKYLINE / 2) - 1, sommetY - 6, 2, 6);
        ctx.fillStyle = '#f2f0e6';
        ctx.fillRect(ecranX + Math.floor(LARGEUR_BATIMENT_SKYLINE / 2) - 1, sommetY - 7, 2, 1);
      }

      // Fenêtres éclairées
      for (const f of b.fenetres) {
        if (f.allumee) {
          ctx.fillStyle = (i % 2 === 0) ? theme.accent : '#f2f0e6';
          ctx.globalAlpha = 0.75;
          ctx.fillRect(ecranX + f.dx, sommetY + f.dy, 4, 3);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  function dessinerBatimentMoyen(ctx, type, ecranX, sommetY, w, h, solY, i, theme) {
    const accent = theme.accent || '#4ed4c4';

    if (theme.id === 'ecole') {
      // 🏫 Bâtiment d'école / Campus avec horloge centrale et cloche
      ctx.fillStyle = '#3c2648';
      ctx.fillRect(ecranX, sommetY, w, h);
      ctx.fillStyle = '#2a1634';
      ctx.fillRect(ecranX, sommetY, w, 3);

      // Fronton triangulaire d'école
      ctx.fillStyle = '#e056fd';
      ctx.fillRect(ecranX + Math.floor(w / 2) - 12, sommetY - 6, 24, 6);

      // Horloge de l'école (🕒 15:30)
      const hx = ecranX + Math.floor(w / 2);
      const hy = sommetY + 10;
      ctx.fillStyle = '#f2f0e6';
      ctx.fillRect(hx - 5, hy - 5, 10, 10);
      ctx.fillStyle = '#140c1a';
      ctx.fillRect(hx - 4, hy - 4, 8, 8);
      ctx.fillStyle = '#e056fd';
      ctx.fillRect(hx, hy - 3, 1, 4); // aiguille
      ctx.fillRect(hx, hy, 3, 1);

      // Grandes fenêtres d'école
      for (let r = 0; r < Math.floor((h - 26) / 14); r++) {
        for (let c = 0; c < Math.floor((w - 12) / 14); c++) {
          const fx = ecranX + 8 + c * 14;
          const fy = sommetY + 22 + r * 14;
          ctx.fillStyle = (i + r + c) % 3 === 0 ? '#ffc93c' : '#1e1026';
          ctx.fillRect(fx, fy, 8, 9);
          ctx.fillStyle = '#e056fd';
          ctx.fillRect(fx + 3, fy, 1, 9);
        }
      }
      return;
    }

    if (theme.id === 'chantier') {
      // 🏗️ Bâtiment industriel & Échafaudages de chantier
      ctx.fillStyle = '#2c221a';
      ctx.fillRect(ecranX, sommetY, w, h);

      // Échafaudages en métal jaune
      ctx.fillStyle = '#ff9f1a';
      ctx.fillRect(ecranX + 4, sommetY, 2, h);
      ctx.fillRect(ecranX + w - 6, sommetY, 2, h);
      for (let r = sommetY + 12; r < solY; r += 14) {
        ctx.fillRect(ecranX + 4, r, w - 10, 2);
      }

      // Palissade de chantier au sol avec bande de sécurité
      const palH = 14;
      ctx.fillStyle = '#1e1610';
      ctx.fillRect(ecranX + 2, solY - palH, w - 4, palH);
      for (let s = 4; s < w - 6; s += 8) {
        ctx.fillStyle = (Math.floor(s / 8) % 2 === 0) ? '#ff9f1a' : '#120e0a';
        ctx.fillRect(ecranX + s, solY - palH + 2, 6, palH - 4);
      }
      return;
    }

    if (theme.id === 'maisons') {
      // 🏡 Maison de ville chaleureuse en briques avec perron et toit mansardé
      ctx.fillStyle = '#6b3220';
      ctx.fillRect(ecranX, sommetY, w, h);
      ctx.fillStyle = '#4c1e10';
      ctx.fillRect(ecranX, sommetY, w, 4);

      // Fenêtres avec encadrements
      for (let r = 0; r < Math.floor((h - 22) / 14); r++) {
        for (let c = 0; c < Math.floor((w - 12) / 16); c++) {
          const fx = ecranX + 8 + c * 16;
          const fy = sommetY + 8 + r * 14;
          ctx.fillStyle = '#ffc93c';
          ctx.fillRect(fx, fy, 8, 9);
          ctx.fillStyle = '#3c180e';
          ctx.fillRect(fx + 3, fy, 1, 9);
          ctx.fillRect(fx, fy + 4, 8, 1);
        }
      }

      // Porte d'entrée avec perron
      ctx.fillStyle = '#2a1208';
      ctx.fillRect(ecranX + Math.floor(w / 2) - 6, solY - 18, 12, 18);
      ctx.fillStyle = '#ffc93c';
      ctx.fillRect(ecranX + Math.floor(w / 2) + 2, solY - 10, 2, 2);
      return;
    }

    // Themes Skatepark (1) et Cyber (5)
    if (type === 0) {
      // Immeuble d'habitation moderne avec corniches
      ctx.fillStyle = theme.id === 'cyber' ? '#180816' : '#22283a';
      ctx.fillRect(ecranX, sommetY, w, h);
      ctx.fillStyle = accent;
      ctx.fillRect(ecranX, sommetY, w, 2);

      const nbCols = Math.max(2, Math.floor((w - 12) / 14));
      const nbLignes = Math.max(2, Math.floor((h - 16) / 14));
      for (let r = 0; r < nbLignes; r++) {
        for (let c = 0; c < nbCols; c++) {
          const fx = ecranX + 8 + c * 14;
          const fy = sommetY + 8 + r * 14;
          const allumee = (i * 7 + r * 3 + c) % 3 !== 0;
          ctx.fillStyle = allumee ? accent : '#0e1018';
          ctx.fillRect(fx, fy, 7, 8);
        }
      }
    } else if (type === 1) {
      // Boutique / Store avec vitrine
      ctx.fillStyle = '#1c202e';
      ctx.fillRect(ecranX, sommetY, w, h);
      ctx.fillStyle = '#141620';
      ctx.fillRect(ecranX, sommetY, w, 3);

      const vitrineW = w - 12;
      const vitrineH = 24;
      const vitrineX = ecranX + 6;
      const vitrineY = solY - vitrineH - 4;
      ctx.fillStyle = '#121e28';
      ctx.fillRect(vitrineX, vitrineY, vitrineW, vitrineH);
      ctx.fillStyle = accent;
      ctx.fillRect(vitrineX, vitrineY, vitrineW, 1);

      // Store rayé
      const auventH = 6;
      const auventY = vitrineY - auventH;
      for (let s = 0; s < vitrineW; s += 6) {
        ctx.fillStyle = (Math.floor(s / 6) % 2 === 0) ? accent : '#f2f0e6';
        ctx.fillRect(vitrineX + s, auventY, Math.min(6, vitrineW - s), auventH);
      }
    } else if (type === 2) {
      // Skate shop / Enseigne néon
      ctx.fillStyle = '#242838';
      ctx.fillRect(ecranX, sommetY, w, h);

      ctx.fillStyle = accent;
      ctx.fillRect(ecranX + 6, sommetY + 8, w - 12, 8);
      ctx.fillStyle = '#f2f0e6';
      ctx.fillRect(ecranX + 8, sommetY + 10, w - 16, 4);

      // Tags néon
      ctx.fillStyle = accent;
      ctx.fillRect(ecranX + 8, solY - 20, 16, 8);
      ctx.fillStyle = '#ff5c3a';
      ctx.fillRect(ecranX + 20, solY - 24, 18, 10);
    } else {
      // Façade loft avec grilles de fenêtres
      ctx.fillStyle = '#1a1e2a';
      ctx.fillRect(ecranX, sommetY, w, h);
      ctx.fillStyle = accent;
      ctx.fillRect(ecranX, sommetY, w, 2);

      for (let r = 0; r < Math.floor((h - 18) / 13); r++) {
        for (let c = 0; c < Math.floor((w - 10) / 13); c++) {
          const fx = ecranX + 6 + c * 13;
          const fy = sommetY + 8 + r * 13;
          const active = (i * 3 + r * 2 + c) % 4 === 0;
          ctx.fillStyle = active ? accent : '#0e121a';
          ctx.fillRect(fx, fy, 7, 7);
        }
      }
    }
  }

  function dessinerCoucheMoyenne(ctx, view, theme, solY, scroll, direction) {
    const vitesseCouche = 0.45;
    const scrollCouche = scroll * vitesseCouche;
    const debut = Math.floor((scrollCouche - view.w) / ESPACEMENT_BATIMENT_MOYEN);
    const fin = Math.ceil((scrollCouche + view.w * 2) / ESPACEMENT_BATIMENT_MOYEN);

    for (let i = debut; i <= fin; i++) {
      const idx = Math.abs(i) % batimentsMoyens.length;
      const b = batimentsMoyens[idx];
      const mondeX = i * ESPACEMENT_BATIMENT_MOYEN;
      const ecranX = Math.round(view.w * 0.3 + direction * (mondeX - scrollCouche));

      if (ecranX < -b.w || ecranX > view.w + b.w) continue;

      const sommetY = solY - b.h;

      // 1. Façade de bâtiment
      dessinerBatimentMoyen(ctx, b.type, ecranX, sommetY, b.w, b.h, solY, i, theme);

      // 2. Sprite de décor urbain réel
      if (theme.murs && theme.murs.length > 0) {
        const propKey = theme.murs[Math.abs(i * 3 + b.propIdx) % theme.murs.length];
        if (frameInfo(propKey)) {
          const propX = ecranX + b.w + 6;
          if (propX > -40 && propX < view.w + 40) {
            ctx.save();
            ctx.globalAlpha = 0.95;
            drawFrame(ctx, propKey, propX, solY, {
              flip: flipPourDirection(direction),
            });
            ctx.restore();
          }
        }
      }
    }
  }

  function dessinerSolEtPremierPlan(ctx, view, theme, solY, scroll, direction, entitesGaps = []) {
    // 1. Sol bitumé sous la ligne de ride
    ctx.fillStyle = theme.solFond;
    ctx.fillRect(0, solY, view.w, view.h - solY);

    // 2. Texture de chaussée et trottoir
    const ESPACEMENT_LIGNES_SOL = 70;
    const debutMarquages = Math.floor((scroll - view.w) / ESPACEMENT_LIGNES_SOL);
    const finMarquages = Math.ceil((scroll + view.w * 2) / ESPACEMENT_LIGNES_SOL);

    for (let i = debutMarquages; i <= finMarquages; i++) {
      const mondeX = i * ESPACEMENT_LIGNES_SOL;
      const ecranX = Math.round(view.w * 0.3 + direction * (mondeX - scroll));

      if (ecranX < -40 || ecranX > view.w + 40) continue;

      // Joints de bitume verticaux
      ctx.fillStyle = '#0a0c12';
      ctx.fillRect(ecranX, solY + 1, 1, view.h - solY);

      // Trait de marquage routier
      if (i % 2 === 0) {
        ctx.fillStyle = theme.accent || '#f2f0e6';
        ctx.globalAlpha = 0.40;
        ctx.fillRect(ecranX + 12, solY + 8, 24, 2);
        ctx.globalAlpha = 1;
      }
    }

    // 3. Ligne néon lumineuse de sol
    ctx.fillStyle = theme.solLigne;
    ctx.fillRect(0, solY, view.w, 1);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(0, solY + 1, view.w, 1);
    ctx.globalAlpha = 1;

    // 4. Découpe nette des trous (GAPS)
    for (const gap of entitesGaps) {
      const gapX = Math.round(view.w * 0.3 + direction * (gap.worldX - scroll));
      const w = gap.hitbox.w || 60;
      ctx.fillStyle = '#06070a';
      ctx.fillRect(Math.round(gapX - w / 2), solY, w, view.h - solY);
    }
  }

  function render(ctx, view, theme, solY, scroll, direction, entitesGaps = []) {
    dessinerCiel(ctx, view, theme, scroll, direction);
    dessinerSkylineLointaine(ctx, view, theme, solY, scroll, direction);
    dessinerCoucheMoyenne(ctx, view, theme, solY, scroll, direction);
    dessinerSolEtPremierPlan(ctx, view, theme, solY, scroll, direction, entitesGaps);
  }

  return { render };
}

return { createParallaxRenderer };
})();
__mod["src/core/audio.js"] = (function () {
// Moteur audio synthétisé Web Audio API (§12).
//
// 100 % génératif, zéro asset audio externe lourd, chargement instantané.
// Musique chiptune / MIDI 8-bit entraînante et effets sonores percutants.

const STORAGE_KEY = 'maxence_mute';

function createAudio() {
  let ctx = null;
  let masterGain = null;
  let sfxGain = null;
  let musicGain = null;
  let muted = false;
  let musicRunning = false;
  let musicTimer = null;
  let noteIndex = 0;

  // Récupérer le réglage persistant
  try {
    if (typeof localStorage !== 'undefined') {
      muted = localStorage.getItem(STORAGE_KEY) === '1';
    }
  } catch {}

  function init() {
    if (ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();

    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(ctx.destination);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(masterGain);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.25;
    musicGain.connect(masterGain);
  }

  function ensureResumed() {
    init();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  function setMuted(val) {
    muted = !!val;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
      }
    } catch {}
    if (masterGain && ctx) {
      masterGain.gain.setValueAtTime(muted ? 0 : 1, ctx.currentTime);
    }
  }

  function toggleMute() {
    setMuted(!muted);
    return muted;
  }

  // ─── Effets Sonores (SFX) ──────────────────────────────────────────────────

  function playTone(freqStart, freqEnd, type, duration, gain = 0.3) {
    if (muted || !ctx) return;
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const t = ctx.currentTime;

      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, t);
      if (freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + duration);
      }

      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + duration);

      osc.connect(g);
      g.connect(sfxGain);

      osc.start(t);
      osc.stop(t + duration);
    } catch {}
  }

  function playNoise(duration, gain = 0.3, highpass = 800) {
    if (muted || !ctx) return;
    try {
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = highpass;

      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + duration);

      noise.connect(filter);
      filter.connect(g);
      g.connect(sfxGain);

      noise.start(t);
      noise.stop(t + duration);
    } catch {}
  }

  const sfx = {
    jump(type = 'ollie') {
      ensureResumed();
      if (type === 'boost') {
        playTone(180, 720, 'square', 0.22, 0.4);
      } else if (type === 'flip') {
        playTone(220, 580, 'triangle', 0.16, 0.35);
      } else {
        playTone(160, 420, 'triangle', 0.12, 0.3);
      }
    },

    land(perfect = false) {
      ensureResumed();
      if (perfect) {
        playTone(880, 1320, 'sine', 0.15, 0.35);
        playNoise(0.08, 0.2, 1200);
      } else {
        playTone(120, 60, 'triangle', 0.08, 0.25);
      }
    },

    grindTick() {
      ensureResumed();
      playNoise(0.04, 0.15, 2000);
    },

    coin() {
      ensureResumed();
      if (muted || !ctx) return;
      const t = ctx.currentTime;
      // Double bip cristallin (B5 -> E6)
      playTone(987, 987, 'sine', 0.08, 0.25);
      setTimeout(() => playTone(1318, 1318, 'sine', 0.12, 0.3), 50);
    },

    cleanLine() {
      ensureResumed();
      // Fanfare 4 notes C5 -> E5 -> G5 -> C6
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        setTimeout(() => playTone(freq, freq, 'triangle', 0.18, 0.35), i * 70);
      });
    },

    crash() {
      ensureResumed();
      playTone(120, 35, 'sawtooth', 0.35, 0.5);
      playNoise(0.35, 0.4, 300);
    },

    combo(multiplier) {
      ensureResumed();
      const baseFreq = 440 + Math.min(8, multiplier) * 60;
      playTone(baseFreq, baseFreq * 1.5, 'triangle', 0.14, 0.25);
    },
  };

  // ─── Musique Chiptune MIDI / 8-Bit entraînante ──────────────────────────────
  // Progression d'accords énergique style skate arcade (135 BPM)
  const BPM = 135;
  const STEP_TIME = (60 / BPM) / 4; // double croche (16th note)

  // Séquence de notes : Mélodie (Hz), Basse (Hz), Drum (0: silence, 1: kick, 2: snare, 3: hat)
  // Scale: Pentatonique mineure / Dorian (La, Do, Ré, Mi, Sol)
  const A3 = 220, C4 = 261.63, D4 = 293.66, E4 = 329.63, G4 = 392, A4 = 440, B4 = 493.88, C5 = 523.25, D5 = 587.33, E5 = 659.25;
  const A2 = 110, F2 = 87.31, C3 = 130.81, G2 = 98.00, D3 = 146.83, E2 = 82.41;

  const PATTERN = [
    // Mesure 1 (Am)
    { mel: A4, bass: A2, drum: 1 },
    { mel: 0,  bass: A2, drum: 3 },
    { mel: C5, bass: A2, drum: 3 },
    { mel: D5, bass: A2, drum: 2 },
    { mel: E5, bass: A2, drum: 1 },
    { mel: 0,  bass: A2, drum: 3 },
    { mel: D5, bass: A2, drum: 3 },
    { mel: C5, bass: A2, drum: 2 },
    // Mesure 2 (F / Dm)
    { mel: D5, bass: F2, drum: 1 },
    { mel: 0,  bass: F2, drum: 3 },
    { mel: C5, bass: F2, drum: 3 },
    { mel: A4, bass: F2, drum: 2 },
    { mel: G4, bass: D3, drum: 1 },
    { mel: A4, bass: D3, drum: 3 },
    { mel: C5, bass: D3, drum: 3 },
    { mel: D5, bass: D3, drum: 2 },
    // Mesure 3 (C)
    { mel: E5, bass: C3, drum: 1 },
    { mel: 0,  bass: C3, drum: 3 },
    { mel: G4, bass: C3, drum: 3 },
    { mel: C5, bass: C3, drum: 2 },
    { mel: D5, bass: C3, drum: 1 },
    { mel: E5, bass: C3, drum: 3 },
    { mel: G4, bass: C3, drum: 3 },
    { mel: C5, bass: C3, drum: 2 },
    // Mesure 4 (G / Em turnaround)
    { mel: D5, bass: G2, drum: 1 },
    { mel: 0,  bass: G2, drum: 3 },
    { mel: C5, bass: G2, drum: 3 },
    { mel: B4 || 493.88, bass: G2, drum: 2 },
    { mel: A4, bass: E2, drum: 1 },
    { mel: G4, bass: E2, drum: 3 },
    { mel: E4, bass: E2, drum: 3 },
    { mel: G4, bass: E2, drum: 2 },
  ];

  function playStep() {
    if (!musicRunning || muted || !ctx) return;
    const step = PATTERN[noteIndex % PATTERN.length];
    noteIndex++;
    const t = ctx.currentTime;

    // 1. Basse funky (Triangle / Sawtooth)
    if (step.bass) {
      try {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(step.bass, t);
        g.gain.setValueAtTime(0.28, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + STEP_TIME * 0.9);
        osc.connect(g);
        g.connect(musicGain);
        osc.start(t);
        osc.stop(t + STEP_TIME * 0.9);
      } catch {}
    }

    // 2. Mélodie lead (Pulse / Square douce)
    if (step.mel) {
      try {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(step.mel, t);
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.005, t + STEP_TIME * 1.5);
        osc.connect(g);
        g.connect(musicGain);
        osc.start(t);
        osc.stop(t + STEP_TIME * 1.5);
      } catch {}
    }

    // 3. Batterie 8-bit
    if (step.drum === 1) {
      // Kick
      try {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.08);
        g.gain.setValueAtTime(0.35, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(g);
        g.connect(musicGain);
        osc.start(t);
        osc.stop(t + 0.08);
      } catch {}
    } else if (step.drum === 2) {
      // Snare
      playNoise(0.07, 0.18, 1000);
    } else if (step.drum === 3) {
      // Hi-Hat
      playNoise(0.02, 0.08, 4000);
    }
  }

  function startMusic() {
    ensureResumed();
    if (musicRunning) return;
    musicRunning = true;
    noteIndex = 0;
    musicTimer = setInterval(playStep, STEP_TIME * 1000);
  }

  function stopMusic() {
    musicRunning = false;
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  return {
    init,
    ensureResumed,
    isMuted: () => muted,
    setMuted,
    toggleMute,
    sfx,
    startMusic,
    stopMusic,
  };
}

return { createAudio };
})();
__mod["src/render/obstacles.js"] = (function () {
// Rendu procédural 2D pur (vue de profil stricte en pixel art) pour les obstacles clés.
//
// 100 % pixel-art à base de rectangles sans anti-aliasing flou, adaptatif selon le thème de niveau.

function dessinerCurb2D(ctx, x, y, direction, theme = {}) {
  const w = 44;
  const h = 14;
  const gauche = Math.round(x - w / 2);
  const sommet = Math.round(y - h);

  const curbBg = theme.curbColor || '#424554';
  const copingColor = theme.curbBorder || '#4ed4c4';

  // Bloc de base
  ctx.fillStyle = curbBg;
  ctx.fillRect(gauche, sommet, w, h);

  // Ombrage inférieur et biseau
  ctx.fillStyle = '#1c1e28';
  ctx.fillRect(gauche, sommet + h - 3, w, 3);

  // Coping métallique sur le dessus (arête grindable visible)
  ctx.fillStyle = copingColor;
  ctx.fillRect(gauche, sommet, w, 2);
  ctx.fillStyle = '#f2f0e6';
  ctx.fillRect(gauche, sommet, w, 1);

  // Rainures verticales de séparation de dalles
  ctx.fillStyle = '#181a24';
  ctx.fillRect(gauche + 14, sommet + 2, 1, h - 2);
  ctx.fillRect(gauche + 29, sommet + 2, 1, h - 2);
}

function dessinerRampe2D(ctx, x, y, direction, theme = {}) {
  const w = 40;
  const h = 18;
  const gauche = Math.round(x - w / 2);
  const bas = Math.round(y);
  const topColor = theme.rampTop || '#4ed4c4';

  // Profil en courbe quadratique pixel art
  ctx.fillStyle = '#3a3d4e';
  for (let col = 0; col < w; col++) {
    const u = direction === 1 ? (col / (w - 1)) : (1 - col / (w - 1));
    const ch = Math.round(Math.pow(u, 2) * h);
    if (ch > 0) {
      ctx.fillRect(gauche + col, bas - ch, 1, ch);
    }
  }

  // Ombrage intérieur de la rampe
  ctx.fillStyle = '#222430';
  for (let col = 0; col < w; col++) {
    const u = direction === 1 ? (col / (w - 1)) : (1 - col / (w - 1));
    const ch = Math.round(Math.pow(u, 2) * h);
    if (ch >= 4) {
      ctx.fillRect(gauche + col, bas - 2, 1, 2);
    }
  }

  // Coping métallique néon au sommet
  ctx.fillStyle = topColor;
  const topX = direction === 1 ? gauche + w - 4 : gauche;
  ctx.fillRect(topX, bas - h, 4, 3);

  // Plaque métallique au ras du sol
  ctx.fillStyle = '#8a8d9e';
  const botX = direction === 1 ? gauche : gauche + w - 5;
  ctx.fillRect(botX, bas - 2, 5, 2);
}

function dessinerCone2D(ctx, x, y, theme = {}) {
  const cx = Math.round(x);
  const bas = Math.round(y);
  const coneCol = theme.coneColor || '#ff5c3a';

  // Base en caoutchouc noir/gris foncé (18×3)
  ctx.fillStyle = '#181a24';
  ctx.fillRect(cx - 9, bas - 3, 18, 3);
  ctx.fillStyle = '#282b3a';
  ctx.fillRect(cx - 8, bas - 3, 16, 1);

  // Profil du cône avec bande blanche réfléchissante (#f2f0e6)
  const rows = [
    [-4, 14, coneCol],
    [-5, 14, coneCol],
    [-6, 12, coneCol],
    [-7, 12, coneCol],
    [-8, 10, coneCol],
    [-9, 10, '#f2f0e6'], // bande blanche
    [-10, 8, '#f2f0e6'],
    [-11, 8, '#f2f0e6'],
    [-12, 8, '#f2f0e6'],
    [-13, 6, '#f2f0e6'],
    [-14, 6, '#f2f0e6'],
    [-15, 6, coneCol],
    [-16, 4, coneCol],
    [-17, 4, coneCol],
    [-18, 4, coneCol],
    [-19, 2, coneCol],
    [-20, 2, coneCol],
    [-21, 2, coneCol],
  ];

  for (const [dy, w, col] of rows) {
    ctx.fillStyle = col;
    ctx.fillRect(cx - Math.floor(w / 2), bas + dy, w, 1);
  }
}

return { dessinerCurb2D, dessinerRampe2D, dessinerCone2D };
})();
__mod["src/data/themes.js"] = (function () {
// 5 ambiances graphiques de Maxence Rider — Changement tous les 10 000 points (§9, §14).
//
// 1 (0-10k)   : Le Skatepark & Avenue (Cyan & Bleu Nuit)
// 2 (10k-20k) : Pâté de Maisons & Résidences (Briques & Doré chaleureux)
// 3 (20k-30k) : Le Campus & L'École (Façades scolaires, horloges, dalles & Pourpre)
// 4 (30k-40k) : Le Chantier & Lofts (Échafaudages, grues, béton & Ambre de sécurité)
// 5 (40k+)    : Le Quartier Cyber Arcade (Néons rouge/cyan, gratte-ciels & Nuit étoilée)

const THEMES = {
  1: {
    id: 'skatepark',
    nom: 'Le Skatepark & Avenue',
    cielHaut: '#080c16',
    cielBas: '#121e2c',
    solLigne: '#4ed4c4',
    solFond: '#0c121a',
    tuilesSol: ['ground.asphalt', 'ground.asphalt', 'ground.marking', 'ground.asphalt'],
    murs: ['street.0', 'wall.brick', 'prop.0', 'wall.skatearea', 'atmo.3', 'street.3', 'prop.1'],
    atmo: ['atmo.0', 'atmo.4', 'atmo.1'],
    etoiles: true,
    accent: '#4ed4c4',
    curbColor: '#424554',
    curbBorder: '#4ed4c4',
    coneColor: '#ff5c3a',
    rampTop: '#4ed4c4',
  },
  2: {
    id: 'maisons',
    nom: 'Pâté de Maisons & Résidences',
    cielHaut: '#1a0e08',
    cielBas: '#341c10',
    solLigne: '#ffc93c',
    solFond: '#1a100a',
    tuilesSol: ['ground.0', 'ground.1', 'ground.gutter', 'ground.0'],
    murs: ['wall.brick', 'street.0', 'prop.1', 'wall.brick', 'atmo.3', 'prop.0'],
    atmo: ['atmo.1', 'atmo.2', 'atmo.0'],
    etoiles: false,
    accent: '#ffc93c',
    curbColor: '#5a382c',
    curbBorder: '#ffc93c',
    coneColor: '#ff9f1a',
    rampTop: '#ffc93c',
  },
  3: {
    id: 'ecole',
    nom: 'Le Campus & École',
    cielHaut: '#14081c',
    cielBas: '#2c1038',
    solLigne: '#e056fd',
    solFond: '#140c1a',
    tuilesSol: ['ground.2', 'ground.5', 'ground.2', 'ground.5'],
    murs: ['prop.0', 'street.0', 'wall.brick', 'street.3', 'atmo.3', 'prop.1'],
    atmo: ['atmo.3', 'atmo.4', 'atmo.1'],
    etoiles: false,
    accent: '#e056fd',
    curbColor: '#443454',
    curbBorder: '#e056fd',
    coneColor: '#e056fd',
    rampTop: '#e056fd',
  },
  4: {
    id: 'chantier',
    nom: 'Le Chantier & Lofts',
    cielHaut: '#140f0a',
    cielBas: '#2a1a10',
    solLigne: '#ff9f1a',
    solFond: '#16100a',
    tuilesSol: ['ground.dirt', 'ground.3', 'ground.dirt', 'ground.4'],
    murs: ['wall.cracked.0', 'street.4', 'wall.cracked.1', 'prop.2', 'wall.brick', 'street.5'],
    atmo: ['atmo.0', 'atmo.2', 'atmo.4'],
    etoiles: false,
    accent: '#ff9f1a',
    curbColor: '#3c3832',
    curbBorder: '#ff9f1a',
    coneColor: '#ff5c3a',
    rampTop: '#ff9f1a',
  },
  5: {
    id: 'cyber',
    nom: 'Le Quartier Cyber Arcade',
    cielHaut: '#160410',
    cielBas: '#320a22',
    solLigne: '#ff3366',
    solFond: '#14060e',
    tuilesSol: ['ground.asphalt', 'ground.dirt', 'ground.gutter', 'ground.asphalt'],
    murs: ['wall.skatearea', 'street.0', 'wall.brick', 'street.3', 'prop.0', 'atmo.3'],
    atmo: ['atmo.0', 'atmo.1', 'atmo.4'],
    etoiles: true,
    accent: '#ff3366',
    curbColor: '#361828',
    curbBorder: '#ff3366',
    coneColor: '#ff3366',
    rampTop: '#ff3366',
  },
};

function getTheme(palier = 1) {
  const p = Math.max(1, Math.min(5, Math.floor(palier)));
  return THEMES[p] || THEMES[1];
}

return { THEMES, getTheme };
})();
__mod["src/main.js"] = (function () {
const { createLoop } = __mod["src/core/loop.js"];
const { createInput, Action } = __mod["src/core/input.js"];
const { loadAssets, atlas, menuHeroImage, frame: frameInfo } = __mod["src/core/assets.js"];
const { mulberry32 } = __mod["src/core/rng.js"];
const { createRenderer } = __mod["src/render/renderer.js"];
const { drawFrame, flipPourDirection } = __mod["src/render/sprite.js"];
const { createStateMachine, State } = __mod["src/game/state.js"];
const { createPlayer, RiderState, SAUTS } = __mod["src/game/player.js"];
const { createLevel } = __mod["src/game/level.js"];
const { construireEntites, entitesActives } = __mod["src/game/entities.js"];
const { resoudre } = __mod["src/game/physics.js"];
const { createScoring } = __mod["src/game/scoring.js"];
const { createParticleSystem } = __mod["src/game/particles.js"];
const { createCamera } = __mod["src/game/camera.js"];
const { createParallaxRenderer } = __mod["src/render/parallax.js"];
const { createAudio } = __mod["src/core/audio.js"];
const { dessinerCurb2D, dessinerRampe2D, dessinerCone2D } = __mod["src/render/obstacles.js"];
const { THEMES, getTheme } = __mod["src/data/themes.js"];
const { Family, ENTITIES } = __mod["src/data/entities.js"];

const { getRider } = __mod["src/data/riders.js"];

const DEBUG = new URLSearchParams(location.search).has('debug');

const canvas = document.getElementById('jeu');
const boutonPause = document.getElementById('pause');
const boutonSon = document.getElementById('son');
const chargement = document.getElementById('chargement');
const panne = document.getElementById('panne');

const renderer = createRenderer(canvas);
const { ctx, view } = renderer;

const SOL = 40; // hauteur du sol depuis le bas de l'espace virtuel
const MARGE_VUE = 80; // px hors écran avant de considérer une entité invisible

const player = createPlayer({ rider: 'skate', direction: 1 });
const scoring = createScoring();
const particles = createParticleSystem();
const camera = createCamera();
const parallax = createParallaxRenderer();
const audio = createAudio();
const monde = { defilement: 0, prevDefilement: 0 };

let dernierSautAudio = null;
let dernierComboAudio = 1;

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

function demarrerRun(seed = nouvelleSeed(), { obstacles = true, rider = 'skate', direction = 1 } = {}) {
  run.seed = seed;
  run.vies = 3;
  run.tempsTotal = 0;
  run.invincibleJusque = 1.8; // Invincibilité clignotante de 1.8s dès le départ de la run

  scoring.perdreCombo();
  scoring.etat.score = 0;
  scoring.etat.meilleurCombo = 1;
  particles.reinitGrind();
  camera.reset();
  audio.startMusic();

  player.stats = getRider(rider);
  player.direction = direction;

  level = createLevel({ rng: mulberry32(seed) });
  level.assurerJusque(0);
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
  run.invincibleJusque = run.tempsTotal + 1.8;
  curseurEntites = 0;
  camera.reset();
}

function labelTrick(trickType) {
  if (player.stats.id === 'roller') {
    if (trickType === 'boost') return 'BOOST';
    if (trickType === 'flip') return 'HEELFLIP';
    return 'OLLIE';
  }
  if (trickType === 'boost') return 'NO-COMPLY';
  if (trickType === 'flip') return 'KICKFLIP';
  return 'OLLIE';
}

function enregistrerTrickReussi() {
  if (!player.dernierSautReussi) return;
  const trickType = player.dernierSautReussi;
  player.dernierSautReussi = null;
  const defSaut = SAUTS[trickType];
  if (!defSaut) return;

  const label = labelTrick(trickType);
  const points = Math.round(defSaut.points * player.stats.pointsTrick);
  const perfect = !!player.perfectLandingDernier;
  scoring.enregistrerTrick(label, points, player.x, player.y - 25, { perfect });
  audio.sfx.land(perfect);

  if (perfect) {
    camera.shake(3, 0.15);
    for (let k = 0; k < 3; k++) particles.etincelle(player.x, player.y, player.direction);
  } else {
    particles.poussiere(player.x, player.y, player.direction);
  }
}

function majCollisions(scrollAvant, scrollApres) {
  if (run.tempsTotal < run.invincibleJusque) return; // §6.7 : invincibilité au respawn

  const { actives, indexSuivant } = entitesActives(entites, curseurEntites, monde.defilement, 600);
  curseurEntites = indexSuivant;

  for (const entite of actives) {
    const resultat = resoudre(entite, player, solY(), scrollAvant, scrollApres);

    if (resultat === 'crash') {
      player.crasher();
      scoring.perdreCombo();
      particles.reinitGrind();
      camera.shake(8, 0.35); // §10 : shake d'impact
      audio.sfx.crash();
      return;
    }

    if (resultat === 'clear') {
      if ((entite.family === Family.LOW || entite.family === Family.HIGH || entite.family === Family.GAP || entite.family === Family.RAIL) && !entite.cleared) {
        entite.cleared = true;
        player.ajouterBoost(1.0, 0.25); // +25% de vitesse pendant 1s par obstacle sauté (s'accumule !)
        scoring.enregistrerTrick('JUMP OVER', 50, player.x, player.y - 22, { perfect: false });
        audio.sfx.combo(2);
        for (let k = 0; k < 2; k++) particles.etincelle(player.x, player.y, player.direction);
      }
    }

    if (resultat === 'ramp') {
      player.bonusRampe = BONUS_RAMPE;
    }

    if (resultat === 'grind') {
      enregistrerTrickReussi();
      player.entrerGrind(entite, solY());
      particles.etincelle(player.x, player.y, player.direction);
      audio.sfx.grindTick();
    }

    if (resultat === 'collect') {
      entite.collected = true;
      const cx = screenXDe(entite.worldX, monde.defilement);
      const cy = solY() - (entite.elevation || 0);

      if (entite.type === 'life_cross') {
        run.vies = Math.min(5, run.vies + 1);
        scoring.afficherBandeau('+1 VIE ! 💚', '#2ed573', cx, cy - 25);
        audio.sfx.coin();
        for (let k = 0; k < 6; k++) particles.etincelle(player.x, player.y, player.direction);
      } else {
        scoring.ramasserCollectible(cx, cy);
        audio.sfx.coin();

        if (entite.chunkInstance) {
          entite.chunkInstance.coinsRamasses++;
          if (
            entite.chunkInstance.coinsRamasses === entite.chunkInstance.totalCoins
            && entite.chunkInstance.totalCoins > 0
            && !entite.chunkInstance.cleanLineAccordee
          ) {
            entite.chunkInstance.cleanLineAccordee = true;
            scoring.cleanLine(player.x, player.y - 30);
            audio.sfx.cleanLine();
          }
        }
      }
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
    monde.defilement += player.vitesse * dt;
  }
  player.x = Math.round(view.w * 0.3);
  player.prevX = player.x;

  level.assurerJusque(monde.defilement);
  if (entites.length < level.placés.reduce((n, p) => n + p.chunk.entities.length, 0)) {
    entites = construireEntites(level.placés);
  }

  // Changement de niveau tous les 10 000 points & gain d'une vie
  const distM = Math.floor(player.distance / 10);
  const scoreTotal = scoring.scoreTotal(distM);
  const palierCalcule = Math.min(5, Math.floor(scoreTotal / 10000) + 1);
  if (level && palierCalcule > level.palier) {
    level.palier = palierCalcule;
    player.niveauPalier = palierCalcule;
    run.vies = Math.min(5, run.vies + 1); // +1 vie gagnée tous les 10 000 points !
    const themeNiveau = getTheme(palierCalcule);
    scoring.afficherBandeau(`⚡ NIVEAU ${palierCalcule} : ${themeNiveau.nom.toUpperCase()} ! +1 VIE 💚`, '#2ed573', player.x, player.y - 45);
    audio.sfx.cleanLine();
    camera.shake(5, 0.3);
    for (let k = 0; k < 8; k++) particles.etincelle(player.x, player.y, player.direction);
  } else if (level) {
    player.niveauPalier = level.palier;
  }

  // Déclenchement son de saut
  if (player.state === RiderState.AIR && player.sautEnCours && player.sautEnCours !== dernierSautAudio) {
    dernierSautAudio = player.sautEnCours;
    audio.sfx.jump(player.sautEnCours);
  } else if (player.state !== RiderState.AIR) {
    dernierSautAudio = null;
  }

  // §6.4 : Atterrissage d'un trick au sol
  if (player.state === RiderState.LAND) {
    enregistrerTrickReussi();
  }

  // §6.4 : Actions continues (Grind & Manual)
  if (player.state === RiderState.GRIND) {
    scoring.grinding(dt);
    particles.etincellesDeGrind(dt, player.x, player.y, player.direction);
    if (Math.floor(run.tempsTotal * 15) % 2 === 0) {
      audio.sfx.grindTick();
    }

    // Détection de fin naturelle de rail
    if (player.grindEntite) {
      const ex = screenXDe(player.grindEntite.worldX, monde.defilement);
      const demiW = (player.grindEntite.hitbox?.w || 12) / 2;
      const entiteMin = ex - demiW;
      const entiteMax = ex + demiW;
      const riderMin = player.x - 14 / 2;
      const riderMax = player.x + 14 / 2;
      const encoreDessus = riderMax > entiteMin && riderMin < entiteMax;
      if (!encoreDessus) {
        const chute = (player.grindEntite.elevation || 0) > 0 || (solY() - player.grindY) > 2;
        player.sortirGrind({ chute });
        scoring.finGrind();
        particles.reinitGrind();
      }
    }
  } else if (player.state === RiderState.MANUAL) {
    scoring.manualing(dt);
  }

  // Déclenchement son de combo
  if (scoring.etat.multiplicateur > dernierComboAudio) {
    audio.sfx.combo(scoring.etat.multiplicateur);
  }
  dernierComboAudio = scoring.etat.multiplicateur;

  scoring.update(dt);
  particles.update(dt);
  camera.update(dt);

  if (player.state === RiderState.CRASH) {
    if (player.crashTermine) {
      run.vies--;
      if (run.vies <= 0) jeu.go(State.GAMEOVER);
      else respawn();
    }
  } else {
    majCollisions(scrollAvant, monde.defilement);
  }

  if (input.consume(Action.TOGGLE_MUTE)) basculerSon();
  if (input.consume(Action.RESTART)) demarrerRun();
}

// ── Rendu ────────────────────────────────────────────────────────────────────

function screenXDe(worldX, scroll) {
  return player.x + player.direction * (worldX - scroll);
}

/** Canette de soda / collectible procédural pixel art (§6.6). */
function dessinerCollectible(cx, cy) {
  const bob = Math.sin(run.tempsTotal * 6 + cx * 0.05) * 1.5;
  const y = Math.round(cy + bob);
  const x = Math.round(cx);
  ctx.fillStyle = '#ffc93c';
  ctx.fillRect(x - 4, y - 5, 8, 10);
  ctx.fillStyle = '#4ed4c4';
  ctx.fillRect(x - 4, y - 2, 8, 4);
  ctx.fillStyle = '#f2f0e6';
  ctx.fillRect(x - 3, y - 5, 6, 1);
  ctx.fillStyle = '#12131a';
  ctx.fillRect(x - 4, y + 4, 8, 1);
}

function dessinerBonusVie(x, y) {
  const t = performance.now() / 1000;
  const bob = Math.sin(t * 5 + x * 0.05) * 3;
  const cy = Math.round(y + bob);
  const cx = Math.round(x);
  const pulse = Math.sin(t * 8) * 0.2 + 0.8;

  ctx.save();
  // Halo vert
  ctx.fillStyle = `rgba(46, 213, 115, ${0.35 * pulse})`;
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.fill();

  // Disque vert extérieur (15×15)
  ctx.fillStyle = '#2ed573';
  ctx.beginPath();
  ctx.arc(cx, cy, 7.5, 0, Math.PI * 2);
  ctx.fill();

  // Disque blanc intérieur
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
  ctx.fill();

  // Croix verte type pharmacie (✚)
  ctx.fillStyle = '#2ed573';
  ctx.fillRect(cx - 1.5, cy - 4, 3, 8);
  ctx.fillRect(cx - 4, cy - 1.5, 8, 3);
  ctx.restore();
}

function dessinerEntites(sol, scroll, theme) {
  const { actives } = entitesActives(entites, 0, scroll, view.w / 2 + MARGE_VUE);
  for (const entite of actives) {
    const x = screenXDe(entite.worldX, scroll);
    if (x < -MARGE_VUE || x > view.w + MARGE_VUE) continue;

    if (entite.family === Family.GAP) {
      continue; // Les gaps sont gérés par le renderer de sol/parallaxe
    }

    if (entite.family === Family.COLLECTIBLE) {
      if (!entite.collected) {
        if (entite.type === 'life_cross') {
          dessinerBonusVie(x, sol - (entite.elevation || 0));
        } else {
          dessinerCollectible(x, sol - (entite.elevation || 0));
        }
      }
      continue;
    }

    // Rendu 2D profil pur pour les obstacles clés
    if (entite.type === 'curb') {
      dessinerCurb2D(ctx, x, sol - (entite.elevation || 0), player.direction, theme);
      continue;
    }
    if (entite.type === 'cone') {
      dessinerCone2D(ctx, x, sol - (entite.elevation || 0), theme);
      continue;
    }
    if (entite.type === 'quarterpipe') {
      dessinerRampe2D(ctx, x, sol - (entite.elevation || 0), player.direction, theme);
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

function dessinerParticules() {
  particles.pool.forEachActive((p) => {
    const key = particles.frameKey(p);
    if (!key) return;
    drawFrame(ctx, key, p.x, p.y, {
      flip: flipPourDirection(p.direction),
    });
  });
}

function dessinerBandeaux() {
  scoring.bandeaux.forEachActive((b) => {
    const { y, alpha } = scoring.etatBandeau(b);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillStyle = b.couleur;
    ctx.font = 'bold 8px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.texte, b.x, y);
    ctx.restore();
  });
}

function dessinerHUD(theme) {
  const distM = Math.floor(player.distance / 10);
  const scoreTotal = scoring.scoreTotal(distM);

  // Score en haut à droite
  ctx.fillStyle = '#f2f0e6';
  ctx.font = 'bold 9px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`${scoreTotal} PTS`, view.w - 8, 8);

  // Distance et Thème
  ctx.fillStyle = '#8a8d9e';
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'left';
  const hudY = DEBUG ? view.h - 14 : 8;
  ctx.fillText(`${distM} m · ${theme.nom}`, 8, hudY);

  // Vies en haut à gauche
  ctx.fillStyle = '#2ed573';
  ctx.font = 'bold 8px ui-monospace, monospace';
  ctx.textAlign = 'left';
  let coeurs = '';
  for (let i = 0; i < run.vies; i++) coeurs += '💚 ';
  ctx.fillText(coeurs.trim(), 8, 22);

  // Multiplicateur / Combo actif au centre-haut
  if (scoring.etat.multiplicateur > 1 || scoring.etat.enAttente > 0) {
    ctx.save();
    ctx.fillStyle = scoring.etat.multiplicateur >= 10 ? '#ff5c3a' : (scoring.etat.grace ? '#4ed4c4' : '#ffc93c');
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const comboTexte = `COMBO ×${scoring.etat.multiplicateur}`;
    ctx.fillText(comboTexte, view.w / 2, 8);

    if (scoring.etat.enAttente > 0) {
      ctx.font = '7px ui-monospace, monospace';
      ctx.fillStyle = '#f2f0e6';
      ctx.fillText(`+${scoring.etat.enAttente}`, view.w / 2, 20);
    }
    ctx.restore();
  }
}

function dessinerJeu(alpha) {
  const y = player.prevY + (player.y - player.prevY) * alpha;
  const scroll = monde.prevDefilement + (monde.defilement - monde.prevDefilement) * alpha;
  const sol = solY();
  const theme = getTheme(level?.palier || 1);
  const cam = camera.getOffset(player.vitesse, player.direction);

  ctx.save();
  // Application du screen shake sur le monde (le HUD reste stable)
  ctx.translate(Math.round(cam.shakeX), Math.round(cam.shakeY));

  // Gaps actifs pour le trou dans le sol
  const { actives } = entitesActives(entites, 0, scroll, view.w);
  const gaps = actives.filter((e) => e.family === Family.GAP);

  // Parallaxe 3 couches (§14)
  parallax.render(ctx, view, theme, sol, scroll, player.direction, gaps);

  dessinerEntites(sol, scroll, theme);

  const invincible = run.tempsTotal < run.invincibleJusque;
  const visible = !invincible || Math.floor(run.tempsTotal * 12) % 2 === 0;
  if (visible) {
    drawFrame(ctx, player.frameKey(), player.x, y, {
      flip: flipPourDirection(player.direction),
      scaleY: player.squash,
    });
  }

  // Traînées de vitesse cyan pendant le boost après grind
  if (player.boostGrindTimer > 0) {
    const alphaBoost = Math.min(1, player.boostGrindTimer);
    ctx.save();
    ctx.strokeStyle = `rgba(78, 212, 196, ${0.6 * alphaBoost})`;
    ctx.lineWidth = 1.5;
    const dir = player.direction;
    for (let k = 0; k < 3; k++) {
      const ly = y - 8 - k * 8;
      const lx = player.x - dir * (14 + k * 5);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx - dir * 16, ly);
      ctx.stroke();
    }
    ctx.restore();
  }

  dessinerParticules();
  dessinerBandeaux();

  if (DEBUG) {
    ctx.fillStyle = 'rgba(255,201,60,0.9)';
    ctx.fillRect(player.x - 3, Math.round(y), 7, 1);
    ctx.fillRect(player.x, Math.round(y) - 3, 1, 7);
  }

  ctx.restore();

  dessinerHUD(theme);
}

// ── Records & Persistance ───────────────────────────────────────────────────

const STORAGE_HIGHSCORE = 'maxence_highscore';
let highscore = 0;
try {
  if (typeof localStorage !== 'undefined') {
    highscore = parseInt(localStorage.getItem(STORAGE_HIGHSCORE) || '0', 10) || 0;
  }
} catch {}

function verifierNouveauRecord(score) {
  if (score > highscore) {
    highscore = score;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_HIGHSCORE, String(highscore));
      }
    } catch {}
    return true;
  }
  return false;
}

let selectedRider = 'skate';
let nouveauRecordPartie = false;

function lancerPartie() {
  demarrerRun(nouvelleSeed(), { rider: selectedRider });
  jeu.go(State.PLAY);
}

// ── Écrans ───────────────────────────────────────────────────────────────────

const jeu = createStateMachine(State.BOOT, {
  [State.MENU]: {
    enter: () => { input.clear(); audio.stopMusic(); },
    update: (dt) => {
      input.update();
      monde.defilement += 50 * dt;
      if (input.consume(Action.CONFIRM)) {
        lancerPartie();
      }
    },
    render: () => {
      const theme = getTheme(1);
      parallax.render(ctx, view, theme, solY(), monde.defilement, 1, []);

      // Voile sombre
      ctx.fillStyle = 'rgba(12, 14, 22, 0.82)';
      ctx.fillRect(0, 0, view.w, view.h);

      ctx.save();
      const hero = menuHeroImage();
      const t = performance.now() / 1000;
      const floatY = Math.sin(t * 2.5) * 3;

      // ── CARTE HÉROS MAXENCE (GAUCHE) ──
      const cardW = 126;
      const cardH = 164;
      const cardX = 24;
      const cardY = Math.round(36 + floatY);

      // Fond de carte sombre
      ctx.fillStyle = '#10131e';
      ctx.fillRect(cardX, cardY, cardW, cardH);
      ctx.fillStyle = '#181d2e';
      ctx.fillRect(cardX + 2, cardY + 2, cardW - 4, cardH - 4);

      // Bordure néon cyan
      ctx.strokeStyle = '#4ed4c4';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1);

      // Illustration de Maxence
      if (hero && hero.complete && hero.naturalWidth > 0) {
        ctx.drawImage(hero, cardX + 5, cardY + 5, cardW - 10, cardH - 30);
      } else {
        ctx.fillStyle = '#4ed4c4';
        ctx.font = 'bold 24px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🛹', cardX + cardW / 2, cardY + cardH / 2 - 10);
      }

      // Badge sous le portrait
      ctx.fillStyle = '#ffc93c';
      ctx.fillRect(cardX + 4, cardY + cardH - 22, cardW - 8, 16);
      ctx.fillStyle = '#12131a';
      ctx.font = 'bold 8px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡ MAXENCE RIDER', cardX + cardW / 2, cardY + cardH - 14);

      // ── TITRE ET BOUTONS (DROITE) ──
      const rightX = 310;

      // Ombre néon orange
      ctx.fillStyle = '#ff5c3a';
      ctx.font = 'bold 20px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('MAXENCE RIDER', rightX + 2, 34 + floatY + 2);

      // Titre cyan
      ctx.fillStyle = '#4ed4c4';
      ctx.fillText('MAXENCE RIDER', rightX, 34 + floatY);

      // Sous-titre
      ctx.fillStyle = '#ffc93c';
      ctx.font = 'bold 8px ui-monospace, monospace';
      ctx.fillText('ARCADE 2D ACTION · SKATE & ROLLER', rightX, 52 + floatY);

      // Record
      if (highscore > 0) {
        ctx.fillStyle = '#f2f0e6';
        ctx.font = '8px ui-monospace, monospace';
        ctx.fillText(`🏆 RECORD : ${highscore} PTS`, rightX, 68);
      }

      // Sélecteur de Rider (boutons tactiles larges)
      const rw = 100, rh = 28;
      const rx1 = Math.round(rightX - rw - 8);
      const rx2 = Math.round(rightX + 8);
      const ry = 86;

      // Bouton Skate
      ctx.fillStyle = selectedRider === 'skate' ? '#4ed4c4' : '#242838';
      ctx.fillRect(rx1, ry, rw, rh);
      ctx.fillStyle = selectedRider === 'skate' ? '#10131e' : '#141724';
      ctx.fillRect(rx1 + 2, ry + 2, rw - 4, rh - 4);
      ctx.fillStyle = selectedRider === 'skate' ? '#4ed4c4' : '#8a8d9e';
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.fillText('🛹 SKATE', rx1 + rw / 2, ry + rh / 2);

      // Bouton Roller
      ctx.fillStyle = selectedRider === 'roller' ? '#4ed4c4' : '#242838';
      ctx.fillRect(rx2, ry, rw, rh);
      ctx.fillStyle = selectedRider === 'roller' ? '#10131e' : '#141724';
      ctx.fillRect(rx2 + 2, ry + 2, rw - 4, rh - 4);
      ctx.fillStyle = selectedRider === 'roller' ? '#4ed4c4' : '#8a8d9e';
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.fillText('🛼 ROLLER', rx2 + rw / 2, ry + rh / 2);

      // Gros Bouton Jouer
      const bw = 216, bh = 32;
      const bx = Math.round(rightX - bw / 2);
      const by = 126;
      const pulse = Math.sin(t * 6) > 0 ? '#ff5c3a' : '#ffc93c';
      ctx.fillStyle = pulse;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#12131a';
      ctx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
      ctx.fillStyle = '#f2f0e6';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillText('▶  COMMENCER LA PARTIE', rightX, by + bh / 2);

      // Contrôles
      ctx.fillStyle = '#8a8d9e';
      ctx.font = '7px ui-monospace, monospace';
      ctx.fillText('ESPACE : SAUT / FLIP   ·   BAS : MANUAL   ·   GRINDS SUR RAILS', rightX, view.h - 22);
      ctx.fillText('TOUCHEZ OU APPUYEZ SUR ESPACE POUR JOUER', rightX, view.h - 10);

      ctx.restore();
    },
  },
  [State.PLAY]: {
    enter: () => { input.clear(); audio.startMusic(); },
    update: majJeu,
    render: dessinerJeu,
  },
  [State.PAUSE]: {
    enter: () => { input.clear(); audio.stopMusic(); },
    update: () => { input.update(); },
    render: (alpha) => {
      dessinerJeu(alpha);
      ctx.fillStyle = 'rgba(18,19,26,0.72)';
      ctx.fillRect(0, 0, view.w, view.h);
      texteCentre('PAUSE', view.h / 2 - 4, '#f2f0e6');
      texteCentre('Reprendre : Échap, P, ou le bouton', view.h / 2 + 10, '#8a8d9e');
    },
  },
  [State.GAMEOVER]: {
    enter: () => {
      input.clear();
      audio.stopMusic();
      const distM = Math.floor(player.distance / 10);
      const total = scoring.scoreTotal(distM);
      nouveauRecordPartie = verifierNouveauRecord(total);
    },
    update: () => {
      input.update();
      if (input.consume(Action.RESTART) || input.consume(Action.CONFIRM)) {
        lancerPartie();
      }
      if (input.consume(Action.PAUSE)) {
        jeu.go(State.MENU);
      }
    },
    render: (alpha) => {
      dessinerJeu(alpha);
      ctx.fillStyle = 'rgba(18,19,26,0.85)';
      ctx.fillRect(0, 0, view.w, view.h);

      if (nouveauRecordPartie) {
        texteCentre('🏆 NOUVEAU RECORD !', view.h / 2 - 36, '#ffc93c');
      }
      texteCentre('GAME OVER', view.h / 2 - 20, '#ff5c3a');

      const distM = Math.floor(player.distance / 10);
      const scoreTotal = scoring.scoreTotal(distM);
      texteCentre(`Score : ${scoreTotal} pts`, view.h / 2 - 6, '#f2f0e6');
      texteCentre(`Distance : ${distM} m · Record : ${highscore} pts`, view.h / 2 + 6, '#8a8d9e');

      // Boutons interactifs : Rejouer & Menu Principal / Choix Rider
      const bw1 = 96, bw2 = 136, bh = 24;
      const bx1 = Math.round(view.w / 2 - bw1 - 6);
      const bx2 = Math.round(view.w / 2 + 6);
      const by = Math.round(view.h / 2 + 18);

      // Bouton 1 : ↺ REJOUER
      ctx.fillStyle = '#ff5c3a';
      ctx.fillRect(bx1, by, bw1, bh);
      ctx.fillStyle = '#12131a';
      ctx.fillRect(bx1 + 1, by + 1, bw1 - 2, bh - 2);
      ctx.fillStyle = '#ff5c3a';
      ctx.font = 'bold 8px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('↺  REJOUER', bx1 + bw1 / 2, by + bh / 2);

      // Bouton 2 : 🏠 MENU / RIDER
      ctx.fillStyle = '#4ed4c4';
      ctx.fillRect(bx2, by, bw2, bh);
      ctx.fillStyle = '#12131a';
      ctx.fillRect(bx2 + 1, by + 1, bw2 - 2, bh - 2);
      ctx.fillStyle = '#4ed4c4';
      ctx.font = 'bold 8px ui-monospace, monospace';
      ctx.fillText('🏠  MENU / RIDER', bx2 + bw2 / 2, by + bh / 2);

      // Raccourcis
      ctx.fillStyle = '#8a8d9e';
      ctx.font = '7px ui-monospace, monospace';
      ctx.fillText('R : REJOUER   ·   ÉCHAP : RETOUR AU MENU', view.w / 2, view.h / 2 + 54);
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

function basculerSon() {
  const mute = audio.toggleMute();
  if (boutonSon) {
    boutonSon.textContent = mute ? '🔇' : '🔊';
    boutonSon.setAttribute('aria-label', mute ? 'Activer le son' : 'Couper le son');
  }
}

const input = createInput(canvas, { onPause: basculerPause });
boutonPause.addEventListener('click', basculerPause);
if (boutonSon) {
  boutonSon.textContent = audio.isMuted() ? '🔇' : '🔊';
  boutonSon.addEventListener('click', (e) => {
    e.stopPropagation();
    basculerSon();
  });
}

canvas.addEventListener('pointerdown', () => {
  audio.ensureResumed();
});

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect
    ? canvas.getBoundingClientRect()
    : { left: 0, top: 0, width: canvas.width || 960, height: canvas.height || 540 };
  const clientX = e.clientX ?? (rect.left + rect.width / 2);
  const clientY = e.clientY ?? (rect.top + rect.height / 2);
  const scaleX = view.w / (rect.width || 1);
  const scaleY = view.h / (rect.height || 1);
  const cx = (clientX - rect.left) * scaleX;
  const cy = (clientY - rect.top) * scaleY;
  const centreX = view.w / 2;

  if (jeu.is(State.MENU)) {
    const rightX = 310;
    const rw = 100, rh = 28, ry = 86;
    const rx1 = Math.round(rightX - rw - 8);
    const rx2 = Math.round(rightX + 8);

    // Clic / Touch sur Bouton Skate
    if (cx >= rx1 - 15 && cx <= rx1 + rw + 8 && cy >= ry - 8 && cy <= ry + rh + 8) {
      selectedRider = 'skate';
      audio.ensureResumed();
      audio.sfx.coin();
      return;
    }
    // Clic / Touch sur Bouton Roller
    if (cx >= rx2 - 8 && cx <= rx2 + rw + 15 && cy >= ry - 8 && cy <= ry + rh + 8) {
      selectedRider = 'roller';
      audio.ensureResumed();
      audio.sfx.coin();
      return;
    }
    // Clic / Touch sur COMMENCER ou bas de l'écran
    const bw = 216, bh = 32, by = 126;
    if (cx >= rightX - bw / 2 - 14 && cx <= rightX + bw / 2 + 14 && cy >= by - 6 && cy <= by + bh + 10) {
      lancerPartie();
      return;
    }
    if (cy > 120) {
      lancerPartie();
    }
  } else if (jeu.is(State.GAMEOVER)) {
    const bw1 = 96, bw2 = 136, bh = 24;
    const bx1 = Math.round(centreX - bw1 - 6);
    const bx2 = Math.round(centreX + 6);
    const by = Math.round(view.h / 2 + 18);

    // Clic sur "↺ REJOUER"
    if (cx >= bx1 - 8 && cx <= bx1 + bw1 + 4 && cy >= by - 6 && cy <= by + bh + 6) {
      lancerPartie();
      return;
    }
    // Clic sur "🏠 MENU / RIDER" ou ailleurs sur l'écran
    jeu.go(State.MENU);
  }
});

// ── Orientation et redimensionnement ─────────────────────────────────────────

function surRedimensionnement() {
  const ancienSol = solY();
  renderer.resize();
  const nouveauSol = solY();
  if (nouveauSol !== ancienSol) {
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
  const distM = Math.floor(player.distance / 10);
  const lignes = [
    `${boucle.stats.fps} fps · ${boucle.stats.updates} maj`,
    `${view.w}x${view.h} x${view.scale} ${view.portrait ? 'portrait' : 'paysage'}`,
    `${player.state} ${player.frameKey()}`,
    `v ${player.vitesse.toFixed(0)} px/s · ${distM} m`,
    `score ${scoring.scoreTotal(distM)} (combo x${scoring.etat.multiplicateur} +${scoring.etat.enAttente})`,
    `palier ${level?.palier ?? '-'} · vies ${run.vies} · cp ${level?.checkpoints.length ?? 0}`,
    `entités ${entites.length} · pool part: ${particles.pool.count}/${particles.pool.capacite}`,
    player.state === RiderState.AIR ? `vol ${player.tempsVol.toFixed(2)}s` : '',
  ].filter(Boolean);
  ctx.font = '6px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(18,19,26,0.7)';
  ctx.fillRect(2, 2, 160, lignes.length * 8 + 4);
  ctx.fillStyle = '#ffc93c';
  lignes.forEach((l, i) => ctx.fillText(l, 5, 6 + i * 8));
}

// ── Démarrage ────────────────────────────────────────────────────────────────

if (DEBUG) {
  window.__maxence = {
    player, monde, view, jeu, boucle, input, atlas, run, scoring, particles, camera, parallax, audio,
    Action, State, RiderState, Family, ENTITIES, SAUTS, THEMES, getTheme, solY,
    get level() { return level; },
    get entites() { return entites; },
    demarrerRun, respawn,
  };
}

loadAssets()
  .then(() => {
    chargement.hidden = true;
    demarrerRun();
    jeu.go(State.MENU);
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
