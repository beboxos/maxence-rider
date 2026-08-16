// Entrées → actions abstraites.
//
// Aucun code de gameplay ne lit un événement clavier ou tactile : tout passe par
// les actions ci-dessous. C'est ce qui permet d'avoir exactement les mêmes règles
// de jeu au doigt et au clavier, et de tester une action sans simuler un geste.

export const Action = {
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

export function createInput(target, { onPause } = {}) {
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
