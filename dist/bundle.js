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
__mod["src/main.js"] = (function () {
// Maxence Rider — amorçage.

const { createLoop } = __mod["src/core/loop.js"];
const { createInput, Action } = __mod["src/core/input.js"];
const { loadAssets, atlas } = __mod["src/core/assets.js"];
const { createRenderer } = __mod["src/render/renderer.js"];
const { createStateMachine, State } = __mod["src/game/state.js"];

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

return {  };
})();
})();
