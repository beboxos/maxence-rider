// Décor en sprites (fonds générés, atlas assets/bg/<thème>.png) pour la parallaxe.
//
// Remplace, pour les ambiances qui ont leur atlas, la skyline et les immeubles dessinés
// en rectangles par parallax.js. Les autres ambiances gardent le rendu procédural.
//
// Quatre couches, de la plus lointaine à la plus proche :
//   skyline  (0.12) : bandes qui se répètent en miroir (jamais de raccord visible)
//   ciel     (0.03) : lune fixe, nuages qui dérivent lentement
//   façades  (0.45) : immeubles posés à la suite, ordre pseudo-aléatoire stable
//   mobilier (0.70) : lampadaires, clôtures, bancs… clairsemés devant les façades
//
// Tout est déterministe (aucun Math.random) : une même position de défilement donne
// toujours la même image.

import BG_THEME1 from '../../assets/bg/theme1.js';
import BG_THEME2 from '../../assets/bg/theme2.js';
import BG_THEME3 from '../../assets/bg/theme3.js';
import BG_THEME4 from '../../assets/bg/theme4.js';
import BG_THEME5 from '../../assets/bg/theme5.js';

const BASE = 'assets/';
const FACTEUR = { skyline: 0.12, ciel: 0.03, facade: 0.45, mobilier: 0.70 };

// Ambiance (theme.id) → atlas, et composition des couches.
const AMBIANCES = {
  skatepark: {
    atlas: BG_THEME1,
    skyline: ['sky.0', 'sky.1', 'sky.2'],
    // Un nom répété = deux fois plus de chances : les immeubles hauts dominent, les petits
    // commerces (kiosque, garage, maison) ponctuent.
    facades: ['cafe', 'cafe', 'skateshop', 'skateshop', 'market', 'arcade', 'arcade', 'laundry', 'laundry',
      'pharmacy', 'pharmacy', 'brick', 'brick', 'cornerstore', 'garage', 'kiosk', 'house'],
    mobilier: ['lamp.0', 'fence.0', 'lamp.1', 'bench', 'busstop', 'fence.1', 'bin', 'pole', 'wall',
      'planter', 'lamp.1', 'lamp.0', 'watertower'],
    lumineux: ['lamp.0', 'lamp.1'],
    lune: 'moon',
    nuages: ['cloud.0', 'cloud.1', 'cloud.2', 'cloud.3', 'cloud.4', 'cloud.5'],
  },
  maisons: {
    atlas: BG_THEME2,
    skyline: ['sky.0'],
    facades: ['pair.0', 'pair.1', 'bakery', 'books', ...Array.from({ length: 16 }, (_, i) => `h.${i}`)],
    mobilier: ['lamp.0', 'tree.0', 'fence.0', 'mailbox.0', 'lamp.1', 'tree.1', 'fence.1', 'bin', 'laundry',
      'mailbox.1', 'fence.2'],
    lumineux: ['lamp.0', 'lamp.1'],
    lune: 'sun',
    nuages: ['cloud.0'],
  },
  ecole: {
    atlas: BG_THEME3,
    skyline: ['sky.0'],
    facades: ['clocktower', 'library', 'dorm', 'hall', ...Array.from({ length: 12 }, (_, i) => `c.${i}`)],
    mobilier: ['lamp.1', 'bench.0', 'banner.0', 'bikes.0', 'lamp.2', 'map', 'bin.0', 'banner.1', 'bench.1',
      'sign', 'bikes.1', 'lamp.0', 'bin.1'],
    lumineux: ['lamp.1', 'lamp.2'],
    lune: 'moon',
    nuages: ['cloud.0', 'cloud.1', 'lantern.1', 'lantern.3', 'lantern.0'],
  },
  chantier: {
    atlas: BG_THEME4,
    skyline: ['sky.0', 'sky.1', 'sky.2'],
    facades: ['frame', 'frame', 'scaffold', 'scaffold', 'factory', 'factory', 'warehouse', 'warehouse',
      'cranetower', 'cranetower', 'office', 'cabin', 'containers', 'containers', 'workshop', 'silo',
      'chimney', 'hoarding'],
    mobilier: ['flood.0', 'barrier', 'mixer', 'fence.0', 'pipes', 'pole', 'sandbags', 'flood.1', 'fence.1',
      'dumpster', 'boarding', 'barrier', 'pole'],
    lumineux: ['flood.0', 'flood.1'],
    lune: 'moon',
    nuages: ['cloud.0', 'drones'],
  },
  cyber: {
    atlas: BG_THEME5,
    skyline: ['sky.0', 'sky.1', 'sky.2'],
    facades: ['arcade', 'arcade', 'ramen', 'conbini', 'conbini', 'billboard', 'billboard', 'tech',
      'tower', 'tower', 'karaoke', 'karaoke', 'noodle', 'garage', 'machine', 'vending', 'izakaya'],
    mobilier: ['lamp.0', 'vendo', 'rail', 'lamp.1', 'sign', 'pole', 'bench', 'screen', 'bin', 'cart', 'sign'],
    lumineux: [],
    lune: 'moon',
    nuages: ['cloud.0', 'cloud.1', 'smoke.0', 'cloud.2', 'drone.0', 'smoke.1', 'drone.1', 'drone.2'],
  },
};

/** Suite pseudo-aléatoire stable : même indice → même valeur dans [0, 1). */
function bruit(i, graine = 0) {
  const x = Math.sin((i + graine) * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function createDecorRenderer() {
  const images = new Map(); // atlas → HTMLImageElement
  const compo = new Map();  // theme.id → composition calculée une fois

  function image(atlas) {
    let img = images.get(atlas);
    if (!img) {
      img = new Image();
      img.src = BASE + atlas.sheet + (atlas.v ? `?v=${atlas.v}` : '');
      images.set(atlas, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  /** Place les immeubles à la suite : ordre et écarts stables, période = longueur totale. */
  function composer(def) {
    const { frames } = def.atlas;
    const facades = [];
    let x = 0;
    for (let i = 0; i < 48; i++) {
      const nom = def.facades[Math.floor(bruit(i, 3) * def.facades.length)];
      const f = frames[nom];
      facades.push({ nom, f, x });
      x += f.w + 4 + Math.floor(bruit(i, 9) * 26);
    }
    const mobilier = [];
    let mx = 0;
    for (let i = 0; def.mobilier.length > 0 && i < 40; i++) {
      const nom = def.mobilier[Math.floor(bruit(i, 17) * def.mobilier.length)];
      const f = frames[nom];
      mobilier.push({ nom, f, x: mx });
      mx += f.w + 90 + Math.floor(bruit(i, 23) * 160);
    }
    return { facades, longueurFacades: x, mobilier, longueurMobilier: mx };
  }

  function pour(theme) {
    const def = AMBIANCES[theme.id];
    if (!def) return null;
    let c = compo.get(theme.id);
    if (!c) {
      c = composer(def);
      compo.set(theme.id, c);
    }
    return { def, c };
  }

  /** Dessine une frame de l'atlas, ancrée par son bord bas (sy) et son bord « avant » (sx). */
  function dessiner(ctx, img, f, sx, sy, direction, alpha = 1) {
    if (alpha !== 1) ctx.globalAlpha = alpha;
    if (direction < 0) {
      ctx.save();
      ctx.translate(Math.round(sx), 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, f.x, f.y, f.w, f.h, 0, Math.round(sy - f.h), f.w, f.h);
      ctx.restore();
    } else {
      ctx.drawImage(img, f.x, f.y, f.w, f.h, Math.round(sx), Math.round(sy - f.h), f.w, f.h);
    }
    if (alpha !== 1) ctx.globalAlpha = 1;
  }

  function dessinerSkyline(ctx, view, img, def, solY, scroll, direction) {
    const { frames } = def.atlas;
    const bandes = def.skyline.map((n) => frames[n]);
    const lw = bandes[0].w;
    const s = scroll * FACTEUR.skyline;
    // Bandes numérotées k ; les impaires sont retournées → bords toujours raccordés.
    const k0 = Math.floor((s - view.w) / lw);
    const k1 = Math.ceil((s + view.w * 2) / lw);
    for (let k = k0; k <= k1; k++) {
      const f = bandes[((Math.floor(k / 2) % bandes.length) + bandes.length) % bandes.length];
      const sx = view.w * 0.3 + direction * (k * lw - s);
      const gauche = direction > 0 ? sx : sx - lw;
      if (gauche > view.w || gauche + lw < 0) continue;
      const miroir = (((k % 2) + 2) % 2 === 1) !== (direction < 0);
      ctx.save();
      if (miroir) {
        ctx.translate(Math.round(gauche) + lw, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, f.x, f.y, f.w, f.h, 0, solY - f.h, f.w, f.h);
      } else {
        ctx.drawImage(img, f.x, f.y, f.w, f.h, Math.round(gauche), solY - f.h, f.w, f.h);
      }
      ctx.restore();
    }
  }

  function dessinerCiel(ctx, view, img, def, scroll, direction) {
    const { frames } = def.atlas;
    const lune = def.lune && frames[def.lune];
    if (lune) ctx.drawImage(img, lune.x, lune.y, lune.w, lune.h, Math.round(view.w * 0.76), 22, lune.w, lune.h);
    const dérive = scroll * FACTEUR.ciel * direction;
    const periode = view.w + 140;
    def.nuages.forEach((nom, i) => {
      const f = frames[nom];
      const base = (i * 97 + bruit(i, 5) * 160) % periode;
      const x = (((base - dérive) % periode) + periode) % periode - 70;
      const y = 14 + Math.floor(bruit(i, 11) * 70);
      ctx.globalAlpha = 0.85;
      ctx.drawImage(img, f.x, f.y, f.w, f.h, Math.round(x), y, f.w, f.h);
    });
    ctx.globalAlpha = 1;
  }

  /** Dessine une couche d'objets posés au sol, sur [scroll-…, scroll+…] avec bouclage de période. */
  function dessinerCouche(ctx, view, img, def, liste, longueur, solY, scroll, direction, facteur, lumineux) {
    const s = scroll * facteur;
    const cycle0 = Math.floor((s - view.w) / longueur);
    const cycle1 = Math.ceil((s + view.w * 2) / longueur);
    for (let cycle = cycle0; cycle <= cycle1; cycle++) {
      for (const o of liste) {
        const mondeX = cycle * longueur + o.x;
        const sx = view.w * 0.3 + direction * (mondeX - s);
        const gauche = direction > 0 ? sx : sx - o.f.w;
        if (gauche > view.w || gauche + o.f.w < 0) continue;
        const alpha = lumineux && lumineux.includes(o.nom) ? 0.85 : 1;
        dessiner(ctx, img, o.f, sx, solY, direction, alpha);
      }
    }
  }

  /** @returns {boolean} faux si l'ambiance n'a pas d'atlas (ou s'il n'est pas encore chargé) */
  function render(ctx, view, theme, solY, scroll, direction) {
    const p = pour(theme);
    if (!p) return false;
    const img = image(p.def.atlas);
    if (!img) return false;
    const { def, c } = p;
    dessinerSkyline(ctx, view, img, def, solY, scroll, direction);
    dessinerCiel(ctx, view, img, def, scroll, direction);
    dessinerCouche(ctx, view, img, def, c.facades, c.longueurFacades, solY, scroll, direction, FACTEUR.facade);
    if (c.mobilier.length > 0) {
      dessinerCouche(ctx, view, img, def, c.mobilier, c.longueurMobilier, solY, scroll, direction, FACTEUR.mobilier, def.lumineux);
    }
    return true;
  }

  return { render };
}
