// Rendu : canvas, mise à l'échelle, orientation.
//
// Le jeu raisonne toujours dans un espace virtuel fixe — 480 × 270 en paysage,
// 270 × 480 en portrait — que le renderer projette sur le canvas réel. L'échelle
// est entière dès qu'elle le peut : c'est la condition pour que le pixel art
// reste net. Le reste de l'écran est comblé par des bandes de fond.

export const LANDSCAPE = { w: 480, h: 270 };
export const PORTRAIT = { w: 270, h: 480 };

const MAX_DPR = 3; // au-delà, on paie des pixels que personne ne distingue

export function createRenderer(canvas) {
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
