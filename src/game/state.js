// Machine à états des écrans.
//
// Un seul état actif à la fois. Les transitions passent toutes par `go()`, ce qui
// donne un point unique où purger le tampon d'entrées : sans ça, l'appui qui
// ferme un menu déclenche un saut dans l'écran suivant.

export const State = {
  BOOT: 'BOOT',
  MENU: 'MENU',
  PLAY: 'PLAY',
  PAUSE: 'PAUSE',
  GAMEOVER: 'GAMEOVER',
  SCORES: 'SCORES',
};

export function createStateMachine(initial, handlers = {}) {
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
