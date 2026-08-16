#!/usr/bin/env node
// Découpeur de planches contact → frames individuelles + atlas.
//
//   node tools/slice.mjs
//
// Outil de développement, exécuté une fois. Rien de tout ceci ne tourne au
// runtime du jeu : le jeu ne charge que assets/sprites/ et assets/atlas.json.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';
import { SHEETS } from './layout.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'assets/raw');
const OUT = join(ROOT, 'assets/sprites');
const SCALE = Number(process.env.SCALE || 4);

// ─── Détection des repères ────────────────────────────────────────────────────

// Le cadre des planches est magenta ; le JPEG l'a délavé, d'où les marges larges.
function isMagenta(d, i) {
  const r = d[i], g = d[i + 1], b = d[i + 2];
  return r > 105 && b > 105 && Math.abs(r - b) < 75 && r - g > 40 && b - g > 40;
}

// Variante permissive, pour le nettoyage seulement : le JPEG délave les bords du
// cadre en rose très pâle, ni magenta franc ni damier. Le critère b > g écarte
// la peau et le rouge des baskets, r > 140 écarte le violet de la veste.
function isMagentaSoft(d, i) {
  const r = d[i], g = d[i + 1], b = d[i + 2];
  return r > 140 && b > 118 && Math.abs(r - b) < 90 && r - g > 16 && b - g > 9;
}

// Le fond « transparent » est un damier blanc / gris clair peint en dur dans le
// JPEG. Un pixel candidat est neutre et clair ; c'est la présence des DEUX
// teintes dans une même composante connexe qui prouve que c'est bien le damier.
function isNeutralLight(d, i) {
  const r = d[i], g = d[i + 1], b = d[i + 2];
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max - min <= 16 && min >= 198;
}
const LIGHT_HI = 242; // teinte claire du damier
const LIGHT_LO = 234; // teinte grise du damier

/** Position du pic de magenta le plus proche de `guess`, sinon `guess`. */
function refine(img, guess, axis, span, radius = 16) {
  const { width: W, data: D } = img;
  let best = guess, bestScore = -1;
  for (let p = guess - radius; p <= guess + radius; p++) {
    let c = 0, n = 0;
    for (let q = span[0]; q < span[1]; q++) {
      const [x, y] = axis === 'v' ? [p, q] : [q, p];
      if (x < 0 || y < 0 || x >= W || y >= img.height) continue;
      n++;
      if (isMagenta(D, (y * W + x) * 4)) c++;
    }
    const score = n ? c / n : 0;
    // À score égal on garde le candidat le plus proche de l'estimation.
    if (score > bestScore + 1e-6) { bestScore = score; best = p; }
  }
  return bestScore >= 0.35 ? best : guess;
}

// ─── Extraction d'une région ──────────────────────────────────────────────────

/**
 * Copie la région [x0,x1[ × [y0,y1[ en RGBA, damier converti en alpha 0.
 * Le damier est identifié par flood fill 4-connexe : les composantes qui
 * touchent le bord de la région, ou qui contiennent les deux teintes du damier,
 * sont effacées. Les aplats blancs internes d'un sprite ne contiennent qu'une
 * teinte et survivent.
 */
function extractRegion(img, x0, y0, x1, y1) {
  const { width: W, data: D } = img;
  const w = x1 - x0, h = y1 - y0;
  const out = new Uint8Array(w * h * 4);
  const cand = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((y + y0) * W + (x + x0)) * 4, d = (y * w + x) * 4;
      out[d] = D[s]; out[d + 1] = D[s + 1]; out[d + 2] = D[s + 2]; out[d + 3] = 255;
      cand[y * w + x] = isNeutralLight(D, s) ? 1 : 0;
    }
  }

  // Composantes connexes de pixels candidats.
  const label = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  const comps = [];
  for (let start = 0; start < w * h; start++) {
    if (!cand[start] || label[start] >= 0) continue;
    const id = comps.length;
    const comp = { size: 0, hi: 0, lo: 0, edge: false, pixels: [] };
    let sp = 0;
    stack[sp++] = start;
    label[start] = id;
    while (sp > 0) {
      const p = stack[--sp];
      const px = p % w, py = (p / w) | 0;
      comp.size++;
      comp.pixels.push(p);
      if (px === 0 || py === 0 || px === w - 1 || py === h - 1) comp.edge = true;
      const lum = out[p * 4 + 1];
      if (lum >= LIGHT_HI) comp.hi++;
      else if (lum <= LIGHT_LO) comp.lo++;
      if (px > 0 && cand[p - 1] && label[p - 1] < 0) { label[p - 1] = id; stack[sp++] = p - 1; }
      if (px < w - 1 && cand[p + 1] && label[p + 1] < 0) { label[p + 1] = id; stack[sp++] = p + 1; }
      if (py > 0 && cand[p - w] && label[p - w] < 0) { label[p - w] = id; stack[sp++] = p - w; }
      if (py < h - 1 && cand[p + w] && label[p + w] < 0) { label[p + w] = id; stack[sp++] = p + w; }
    }
    comps.push(comp);
  }

  for (const c of comps) {
    const damier = c.hi >= c.size * 0.15 && c.lo >= c.size * 0.15;
    if (!(c.edge || (damier && c.size >= 200))) continue;
    for (const p of c.pixels) out[p * 4 + 3] = 0;
  }

  // Les traits magenta du cadre traversent la région et relieraient tous les
  // objets en une seule composante. On les efface, halo JPEG compris. Le halo
  // pâle n'est retiré que s'il jouxte du magenta franc : appliqué seul, le
  // critère permissif mordrait dans les sprites.
  const mag = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) if (isMagenta(out, p * 4)) mag[p] = 2;
  for (let p = 0; p < w * h; p++) if (!mag[p] && isMagentaSoft(out, p * 4)) mag[p] = 1;

  const queue = [];
  for (let p = 0; p < w * h; p++) if (mag[p] === 2) queue.push(p);
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi];
    const px = p % w, py = (p / w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = px + dx, ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = ny * w + nx;
      if (mag[q] === 1) { mag[q] = 2; queue.push(q); }
    }
  }
  const erased = new Uint8Array(w * h);
  for (const p of queue) {
    const px = p % w, py = (p / w) | 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = px + dx, ny = py + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) {
        out[(ny * w + nx) * 4 + 3] = 0;
        erased[ny * w + nx] = 1;
      }
    }
  }

  return { width: w, height: h, data: out, erased };
}

/**
 * Recoud les objets tranchés par un trait du cadre. Un rail ou un curb court sur
 * trois cases : effacer le trait le laisse troué. On ne repeint que les pixels
 * retirés par ce nettoyage — jamais le damier — et seulement si les deux bords
 * de la brèche sont proches et opaques.
 */
function healGaps(img, maxGap = 16) {
  const { width: w, height: h, data, erased } = img;
  if (!erased) return;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!erased[p] || data[p * 4 + 3] > 0) continue;
      let l = x - 1;
      while (l >= 0 && data[(y * w + l) * 4 + 3] === 0 && x - l <= maxGap) l--;
      if (l < 0 || x - l > maxGap) continue;
      let r = x + 1;
      while (r < w && data[(y * w + r) * 4 + 3] === 0 && r - x <= maxGap) r++;
      if (r >= w || r - x > maxGap) continue;
      const t = (x - l) / (r - l);
      const a = (y * w + l) * 4, b = (y * w + r) * 4, d = p * 4;
      for (let c = 0; c < 3; c++) data[d + c] = data[a + c] * (1 - t) + data[b + c] * t;
      data[d + 3] = 255;
    }
  }
}

/**
 * Efface les échardes : composantes opaques minuscules ou filiformes. Ce sont
 * les restes du cadre de la planche, que le JPEG a blanchis par endroits — ni
 * magenta reconnaissable, ni damier. Un trait de cadre fait 2 à 4 px de large
 * sur des dizaines de long ; aucun élément de sprite n'a cette signature.
 */
function removeSlivers(img, { minArea = 90, minThickness = 8 } = {}) {
  const { width: w, height: h, data } = img;
  const label = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (data[start * 4 + 3] <= 24 || label[start] >= 0) continue;
    const pixels = [];
    let x0 = w, y0 = h, x1 = -1, y1 = -1, sp = 0;
    stack[sp++] = start;
    label[start] = 1;
    while (sp > 0) {
      const p = stack[--sp];
      const px = p % w, py = (p / w) | 0;
      pixels.push(p);
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (label[q] < 0 && data[q * 4 + 3] > 24) { label[q] = 1; stack[sp++] = q; }
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (pixels.length >= minArea && Math.min(bw, bh) >= minThickness) continue;
    for (const p of pixels) data[p * 4 + 3] = 0;
  }
}

/**
 * Efface les numéros de case imprimés le long du bord haut d'une bande : petits
 * glyphes sombres, isolés, dans les premières lignes. Doit passer avant la
 * segmentation, sinon un numéro fusionne avec l'objet qu'il surplombe.
 */
function eraseTopLabels(img, band = 46) {
  const { width: w, height: h, data } = img;
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * Math.min(band, h); start++) {
    if (data[start * 4 + 3] <= 24 || seen[start]) continue;
    const pixels = [];
    let x0 = w, y0 = h, x1 = -1, y1 = -1, sp = 0, dark = 0;
    stack[sp++] = start;
    seen[start] = 1;
    let overflow = false;
    while (sp > 0) {
      const p = stack[--sp];
      const px = p % w, py = (p / w) | 0;
      pixels.push(p);
      if (py > band + 14) overflow = true; // descend trop bas : c'est un objet
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
      if (data[p * 4] < 130 && data[p * 4 + 1] < 130 && data[p * 4 + 2] < 130) dark++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (!seen[q] && data[q * 4 + 3] > 24) { seen[q] = 1; stack[sp++] = q; }
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (overflow || bw > 52 || bh > 52 || dark < pixels.length * 0.5) continue;
    for (const p of pixels) data[p * 4 + 3] = 0;
  }
}

/** Efface une zone (le numéro de case imprimé au coin haut-gauche). */
function eraseCorner(img, w = 48, h = 52) {
  for (let y = 0; y < Math.min(h, img.height); y++)
    for (let x = 0; x < Math.min(w, img.width); x++)
      img.data[(y * img.width + x) * 4 + 3] = 0;
}

/** Boîte englobante des pixels dont l'alpha dépasse le seuil. */
function opaqueBounds(img, alphaMin = 24) {
  const { width: w, height: h, data } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > alphaMin) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

function crop(img, x0, y0, x1, y1) {
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    data.set(
      img.data.subarray(((y + y0) * img.width + x0) * 4, ((y + y0) * img.width + x1 + 1) * 4),
      y * w * 4,
    );
  return { width: w, height: h, data };
}

/**
 * Réduction d'un facteur entier par moyenne de bloc, alpha prémultipliée.
 * Les planches sont rendues en haute résolution alors que l'espace de jeu fait
 * 480×270 : à l'échelle 1 un rider ferait 240 px de haut. Le facteur 4 le ramène
 * à ~60 px, ce qui cale aussi les obstacles sur les seuils du brief (curb ≈ 10 px
 * « bas », poubelle ≈ 37 px « haut »).
 */
function downscale(img, k) {
  if (k <= 1) return img;
  const w = Math.max(1, Math.round(img.width / k));
  const h = Math.max(1, Math.round(img.height / k));
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor((x * img.width) / w), sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * img.width) / w));
      const sy0 = Math.floor((y * img.height) / h), sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * img.height) / h));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
        const i = (sy * img.width + sx) * 4;
        const al = img.data[i + 3] / 255;
        r += img.data[i] * al; g += img.data[i + 1] * al; b += img.data[i + 2] * al;
        a += al; n++;
      }
      const d = (y * w + x) * 4;
      if (a > 0) {
        data[d] = Math.round(r / a); data[d + 1] = Math.round(g / a); data[d + 2] = Math.round(b / a);
      }
      // Seuil sur l'alpha : le pixel art tolère mal les bords semi-transparents,
      // ils créent un halo laiteux au rendu sur fond sombre.
      const av = a / n;
      data[d + 3] = av < 0.35 ? 0 : Math.round(Math.min(1, av * 1.35) * 255);
    }
  }
  return { width: w, height: h, data };
}

// ─── Segmentation en objets ───────────────────────────────────────────────────

/**
 * Isole les objets d'une bande : composantes connexes opaques, puis fusion des
 * boîtes qui se chevauchent ou se frôlent (un poteau et ses isolateurs, un rail
 * et ses pieds, arrivent en plusieurs morceaux).
 */
function segmentObjects(img, { minArea = 400, minSide = 14, gapX = 8, gapY = 8 } = {}) {
  const { width: w, height: h, data } = img;
  const label = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  const boxes = [];

  for (let start = 0; start < w * h; start++) {
    if (data[start * 4 + 3] <= 24 || label[start] >= 0) continue;
    const id = boxes.length;
    const box = { x0: w, y0: h, x1: -1, y1: -1, area: 0 };
    let sp = 0;
    stack[sp++] = start;
    label[start] = id;
    while (sp > 0) {
      const p = stack[--sp];
      const px = p % w, py = (p / w) | 0;
      box.area++;
      if (px < box.x0) box.x0 = px; if (px > box.x1) box.x1 = px;
      if (py < box.y0) box.y0 = py; if (py > box.y1) box.y1 = py;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (label[q] < 0 && data[q * 4 + 3] > 24) { label[q] = id; stack[sp++] = q; }
      }
    }
    boxes.push(box);
  }

  // Fusion transitive des boîtes proches.
  let merged = true;
  let list = boxes.filter((b) => b.area >= 60);
  while (merged) {
    merged = false;
    outer:
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.x0 - gapX <= b.x1 && b.x0 - gapX <= a.x1 && a.y0 - gapY <= b.y1 && b.y0 - gapY <= a.y1) {
          list[i] = {
            x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
            x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1),
            area: a.area + b.area,
          };
          list.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  return list
    .filter((b) => b.area >= minArea && b.x1 - b.x0 >= minSide && b.y1 - b.y0 >= minSide)
    .sort((a, b) => (a.x0 - b.x0) || (a.y0 - b.y0));
}

// ─── Programme principal ──────────────────────────────────────────────────────

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const frames = {};
const bitmaps = new Map();
const counters = {};
let written = 0;

for (const sheet of SHEETS) {
  const img = decodePNG(readFileSync(join(RAW, sheet.file)));
  process.stdout.write(`\n${sheet.file} (${img.width}×${img.height})\n`);

  for (const band of sheet.bands) {
    // Bornes affinées sur les traits magenta réels.
    const y0 = refine(img, band.row[0], 'h', [band.block[0] + 20, band.block[1] - 20]) + 1;
    const y1 = refine(img, band.row[1], 'h', [band.block[0] + 20, band.block[1] - 20]) - 1;
    const bx0 = refine(img, band.block[0], 'v', [y0, y1]) + 1;
    const bx1 = refine(img, band.block[1], 'v', [y0, y1]) - 1;

    const dir = join(OUT, sheet.category);
    mkdirSync(dir, { recursive: true });

    if (band.mode === 'grid') {
      // Frontières internes réparties puis recalées sur les traits réels.
      const bounds = [bx0];
      for (let i = 1; i < band.count; i++) {
        const guess = Math.round(bx0 + ((bx1 - bx0) * i) / band.count);
        bounds.push(refine(img, guess, 'v', [y0, y1]));
      }
      bounds.push(bx1);

      for (let i = 0; i < band.count; i++) {
        const cx0 = bounds[i] + (i === 0 ? 0 : 1);
        const cx1 = bounds[i + 1] - (i === band.count - 1 ? 0 : 1);
        const cell = extractRegion(img, cx0, y0, cx1, y1);
        eraseCorner(cell);
        removeSlivers(cell);
        const b = opaqueBounds(cell);
        if (!b) { console.warn(`  ! case vide : ${band.name}.${i}`); continue; }
        const sprite = downscale(crop(cell, b.x0, b.y0, b.x1, b.y1), SCALE);

        // Ancrage aux pieds : origine au milieu-bas de la case source. L'offset
        // conserve la position relative de la frame, sinon les frames aériennes
        // retomberaient au sol au rendu.
        const label = band.names ? band.names[i] : `${band.name}.${i}`;
        if (!label) continue; // case écartée (doublon ou hors sujet)
        const key = label;
        const rel = `sprites/${sheet.category}/${label.replace(/\./g, '_')}.png`;
        writeFileSync(join(ROOT, 'assets', rel), encodePNG(sprite));
        bitmaps.set(key, sprite);
        frames[key] = {
          file: rel,
          w: sprite.width,
          h: sprite.height,
          offset: [
            Math.round((b.x0 - cell.width / 2) / SCALE),
            Math.round((b.y0 - cell.height) / SCALE),
          ],
        };
        written++;
      }
      console.log(`  ${band.name} → ${band.count} frames`);
    } else {
      const region = extractRegion(img, bx0, y0, bx1, y1);
      if (band.heal) healGaps(region, band.heal);
      eraseTopLabels(region);
      removeSlivers(region);
      // Les numéros de case sont imprimés le long du bord haut de la bande.
      const objs = segmentObjects(region, band.segment).filter(
        (b) => !(b.y0 < 40 && b.y1 - b.y0 < 46 && b.x1 - b.x0 < 46),
      );
      let n = counters[band.name] || 0;
      for (const b of objs) {
        const sprite = downscale(crop(region, b.x0, b.y0, b.x1, b.y1), SCALE);
        const key = `${band.name}.${n}`;
        const rel = `sprites/${sheet.category}/${band.name.replace(/\./g, '_')}_${n}.png`;
        writeFileSync(join(ROOT, 'assets', rel), encodePNG(sprite));
        bitmaps.set(key, sprite);
        frames[key] = {
          file: rel,
          w: sprite.width,
          h: sprite.height,
          offset: [-Math.round(sprite.width / 2), -sprite.height],
        };
        n++; written++;
      }
      counters[band.name] = n;
      console.log(`  ${band.name} → ${objs.length} objets`);
    }
  }
}

// ─── Atlas ────────────────────────────────────────────────────────────────────

// Les animations sont dérivées des frames : toute clé « famille.anim.N »
// contiguë depuis 0 forme une animation.
const ANIM_FPS = {
  'skate.roll': [14, true], 'skate.ollie': [18, false], 'skate.flip': [20, false],
  'skate.nocomply': [16, false], 'skate.crash': [12, false], 'skate.grind': [12, true],
  'skate.idle': [6, true],
  'roller.roll': [14, true], 'roller.ollie': [18, false], 'roller.flip': [20, false],
  'roller.manual': [10, true], 'roller.crash': [12, false], 'roller.grind': [12, true],
  'roller.idle': [6, true],
  'fx.spark': [24, false], 'fx.dust': [18, false],
};

const anims = {};
for (const [name, [fps, loop]] of Object.entries(ANIM_FPS)) {
  const list = [];
  for (let i = 0; frames[`${name}.${i}`]; i++) list.push(`${name}.${i}`);
  if (list.length) anims[name] = { frames: list, fps, loop };
}

// ─── Texture unique ───────────────────────────────────────────────────────────
// Les PNG individuels restent le livrable lisible ; le jeu, lui, charge une
// seule image : 155 requêtes au démarrage coûteraient bien plus cher que les
// quelques kilo-octets gagnés.
const PAD = 1; // marge anti-bavure lors du filtrage
const keysByHeight = [...bitmaps.keys()].sort(
  (a, b) => bitmaps.get(b).height - bitmaps.get(a).height,
);
const SHEET_W = 1024;
let shelfY = 0, shelfH = 0, penX = 0;
for (const key of keysByHeight) {
  const bm = bitmaps.get(key);
  if (penX + bm.width + PAD > SHEET_W) { shelfY += shelfH + PAD; shelfH = 0; penX = 0; }
  frames[key].rect = [penX, shelfY, bm.width, bm.height];
  penX += bm.width + PAD;
  shelfH = Math.max(shelfH, bm.height);
}
const SHEET_H = shelfY + shelfH;
const sheetData = new Uint8Array(SHEET_W * SHEET_H * 4);
for (const key of keysByHeight) {
  const bm = bitmaps.get(key);
  const [rx, ry] = frames[key].rect;
  for (let y = 0; y < bm.height; y++) {
    sheetData.set(
      bm.data.subarray(y * bm.width * 4, (y + 1) * bm.width * 4),
      ((ry + y) * SHEET_W + rx) * 4,
    );
  }
}
writeFileSync(join(ROOT, 'assets/atlas.png'), encodePNG({ width: SHEET_W, height: SHEET_H, data: sheetData }));

const atlas = { version: 1, sheet: 'atlas.png', sheetSize: [SHEET_W, SHEET_H], frames, anims };
const json = JSON.stringify(atlas, null, 2);
writeFileSync(join(ROOT, 'assets/atlas.json'), json);
// Variante module ES : le jeu doit aussi démarrer depuis file://, où fetch()
// d'un JSON local est bloqué.
writeFileSync(join(ROOT, 'assets/atlas.js'), `export default ${json};\n`);

console.log(`\n${written} frames écrites, ${Object.keys(anims).length} animations.`);
console.log(`texture unique : assets/atlas.png ${SHEET_W}×${SHEET_H}`);
