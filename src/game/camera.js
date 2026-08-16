// Caméra dynamique : anticipation de vitesse et micro-secousses (§6.2, §10, §14).
//
// §6.2 : le rider est placé à 30 % de l'écran dans le sens de la marche, et la
// caméra anticipe de speed × 0.25 px.
// §10 : prefers-reduced-motion désactive le screen shake pour l'accessibilité.

export function createCamera() {
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
