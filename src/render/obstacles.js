// Rendu procédural 2D pur (vue de profil stricte en pixel art) pour les obstacles clés.
//
// 100 % pixel-art à base de rectangles sans anti-aliasing flou, adaptatif selon le thème de niveau.

export function dessinerCurb2D(ctx, x, y, direction, theme = {}) {
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

export function dessinerRampe2D(ctx, x, y, direction, theme = {}) {
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

export function dessinerCone2D(ctx, x, y, theme = {}) {
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
