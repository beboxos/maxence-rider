// Caméra dynamique : anticipation de vitesse, micro-secousses et suivi vertical
// (§6.2, §10, §14).
//
// §6.2 : le rider est placé à 30 % de l'écran dans le sens de la marche, et la
// caméra anticipe de speed × 0.25 px.
// §10 : prefers-reduced-motion désactive le screen shake pour l'accessibilité.
//
// Suivi vertical : au-delà d'une certaine hauteur de saut (deadzone), le
// rider sort du cadre virtuel restreint (270 px de haut). La caméra décale
// alors tout le monde vers le bas, lissé, pour garder le rider visible sans
// bouger sur les sauts ordinaires.

const DEADZONE_HAUT = 60; // px depuis le haut de l'espace virtuel : sous ce seuil, pas de suivi
const MARGE_HAUT = 24;    // px de marge gardée au-dessus du rider une fois le suivi actif
const LISSAGE = 10;       // vitesse de rattrapage du lerp, en 1/s

export function createCamera() {
  let shakeIntensite = 0;
  let shakeDuree = 0;
  let shakeTemps = 0;
  let suiviY = 0;

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

  function update(dt, playerY) {
    if (shakeTemps < shakeDuree) {
      shakeTemps += dt;
      if (shakeTemps >= shakeDuree) {
        shakeIntensite = 0;
      }
    }

    if (typeof playerY === 'number') {
      const cible = playerY < DEADZONE_HAUT ? (DEADZONE_HAUT - playerY) + MARGE_HAUT : 0;
      const t = Math.min(1, dt * LISSAGE);
      suiviY += (cible - suiviY) * t;
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
      suiviY,
      x: anticipationX + sx,
      y: sy,
    };
  }

  function reset() {
    shakeIntensite = 0;
    shakeDuree = 0;
    shakeTemps = 0;
    suiviY = 0;
  }

  return { shake, update, getOffset, reset, prefersReducedMotion };
}
