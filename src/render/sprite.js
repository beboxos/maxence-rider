// Dessin des frames de l'atlas.
//
// Chaque frame porte un offset par rapport à son ancre — le milieu-bas de la
// case d'origine, c'est-à-dire les pieds du rider. C'est ce qui permet de dessiner
// n'importe quelle frame en donnant simplement la position au sol : les frames
// aériennes gardent leur hauteur au lieu de retomber sur le sol.

import { frame, sheetImage } from '../core/assets.js';

// Malgré son nom, la version « Droite » des planches (§3) dessine le
// personnage visage tourné vers la GAUCHE — vérifié sur skate.roll.0, jambe
// d'appel et tête pointent à gauche. Le nommage Gauche/Droite désigne le sens
// de niveau voulu (§3, §6.2 : « niveaux impairs vers la droite »), pas
// l'orientation réelle du dessin. Isolée ici pour qu'un test la verrouille :
// sans ce flip inversé, le rider semblait avancer à reculons.
export function flipPourDirection(direction) {
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
export function drawFrame(ctx, key, x, y, opts = {}) {
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
export function drawMissing(ctx, x, y, w = 16, h = 16) {
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
