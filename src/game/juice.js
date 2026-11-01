// « Juice » : hit-stop, flash plein écran et éclats procéduraux.
//
// Complète camera.js (shake) et particles.js (sprites de l'atlas) sans les
// toucher. Tout est poolé : aucun objet alloué en jeu.
//
// Réglage « Réduire les effets » (storage.settings.reducedFx) : plus de flash,
// de hit-stop ni d'éclats — pour l'accessibilité (§10).

const NB_ECLATS = 64;
const GRAVITE = 380; // px/s² dans l'espace virtuel
// Le tampon d'input dure peu (core/input.js) : un hit-stop long ferait perdre
// un appui. On plafonne donc à 80 ms.
const HIT_STOP_MAX = 0.08;

export function createJuice({ reduit = () => false } = {}) {
  let hitStopRestant = 0;
  let flashAlpha = 0;
  let flashCouleur = '#ffffff';
  const eclats = Array.from({ length: NB_ECLATS }, () => ({
    vie: 0, duree: 1, x: 0, y: 0, vx: 0, vy: 0, taille: 1, couleur: '#fff', gravite: 1,
  }));

  /** Gèle la simulation `duree` secondes (le rendu continue). */
  function hitStop(duree) {
    if (reduit()) return;
    hitStopRestant = Math.max(hitStopRestant, Math.min(HIT_STOP_MAX, duree));
  }

  /** Flash plein écran qui s'estompe vite. */
  function flash(couleur = '#ffffff', alpha = 0.5) {
    if (reduit()) return;
    flashCouleur = couleur;
    flashAlpha = Math.max(flashAlpha, alpha);
  }

  /**
   * Gerbe d'éclats. `dirX` (-1, 0, 1) oriente le jet ; `force` en px/s.
   * Tailles, vitesses et durées varient : un lot de copies identiques se voit.
   */
  function gerbe(x, y, { n = 8, couleurs = ['#ffffff', '#ffc93c'], force = 120, dirX = 0, gravite = 1 } = {}) {
    if (reduit()) return;
    let restant = n;
    for (const e of eclats) {
      if (restant === 0) break;
      if (e.vie > 0) continue;
      const angle = dirX === 0
        ? Math.random() * Math.PI * 2
        : (-Math.PI / 2) + dirX * (0.3 + Math.random() * 1.1);
      const v = force * (0.4 + Math.random() * 0.8);
      e.x = x; e.y = y;
      e.vx = Math.cos(angle) * v + dirX * force * 0.3;
      e.vy = Math.sin(angle) * v;
      e.duree = e.vie = 0.25 + Math.random() * 0.4;
      e.taille = Math.random() < 0.25 ? 2 : 1;
      e.couleur = couleurs[(Math.random() * couleurs.length) | 0];
      e.gravite = gravite;
      restant--;
    }
  }

  /**
   * À appeler au début de chaque pas de simulation.
   * Renvoie true si ce pas est gelé (le caller doit alors sortir).
   */
  function gele(dt) {
    if (hitStopRestant <= 0) return false;
    hitStopRestant -= dt;
    return true;
  }

  /** Éclats et flash vivent en temps réel, même pendant un hit-stop. */
  function update(dt) {
    flashAlpha = Math.max(0, flashAlpha - dt * 4);
    for (const e of eclats) {
      if (e.vie <= 0) continue;
      e.vie -= dt;
      e.vx *= 1 - Math.min(1, dt * 1.5);
      e.vy += GRAVITE * e.gravite * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    }
  }

  function dessinerEclats(ctx) {
    for (const e of eclats) {
      if (e.vie <= 0) continue;
      ctx.globalAlpha = Math.min(1, (e.vie / e.duree) * 1.6);
      ctx.fillStyle = e.couleur;
      ctx.fillRect(Math.round(e.x), Math.round(e.y), e.taille, e.taille);
    }
    ctx.globalAlpha = 1;
  }

  function dessinerFlash(ctx, view) {
    if (flashAlpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, flashAlpha);
    ctx.fillStyle = flashCouleur;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.restore();
  }

  function reset() {
    hitStopRestant = 0;
    flashAlpha = 0;
    for (const e of eclats) e.vie = 0;
  }

  return { hitStop, flash, gerbe, gele, update, dessinerEclats, dessinerFlash, reset };
}
