// Boucle de jeu à pas fixe.
//
// La simulation avance toujours par pas de 1/60 s, quel que soit le taux de
// rafraîchissement de l'écran : la physique reste identique sur un 60 Hz, un
// 120 Hz ou une machine qui rame. Le rendu, lui, reçoit le reliquat sous forme
// d'un facteur d'interpolation pour rester fluide entre deux pas.

const STEP = 1 / 60;
const MAX_DELTA = 0.25;   // au-delà, l'onglet était en arrière-plan : on oublie
const MAX_CATCHUP = 5;    // pas de rattrapage par frame, sinon spirale de la mort

export function createLoop({ update, render }) {
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
