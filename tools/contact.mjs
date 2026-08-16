#!/usr/bin/env node
// Planche de contrôle : recompose toutes les frames découpées en une image PNG,
// alignées sur leur ancre, pour vérifier la découpe sans serveur ni navigateur.
//
//   node tools/contact.mjs [motif]      ex. node tools/contact.mjs skate
//
// Sortie : tools/contact.png

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const atlas = JSON.parse(readFileSync(join(ROOT, 'assets/atlas.json'), 'utf8'));
const filter = process.argv[2] || '';
const OUTFILE = join(ROOT, 'tools', process.argv[3] || 'contact.png');

const PAD = 8;
const groups = new Map();
for (const key of Object.keys(atlas.frames)) {
  if (filter && !key.startsWith(filter)) continue;
  const g = key.replace(/\.\d+$/, '');
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(key);
}
if (!groups.size) { console.error('aucune frame ne correspond'); process.exit(1); }

// Mise en page : une ligne par groupe, cellules calées sur l'ancre.
const rows = [];
for (const [g, keys] of groups) {
  const f = keys.map((k) => atlas.frames[k]);
  const left = Math.min(...f.map((x) => x.offset[0]));
  const right = Math.max(...f.map((x) => x.offset[0] + x.w));
  const top = Math.min(...f.map((x) => x.offset[1]));
  const bottom = Math.max(...f.map((x) => x.offset[1] + x.h));
  rows.push({ g, keys, cw: right - left + PAD, ch: bottom - top + PAD, left, top });
}

const W = Math.max(...rows.map((r) => r.cw * r.keys.length)) + 2 * PAD;
const H = rows.reduce((a, r) => a + r.ch + 22, 0) + 2 * PAD;
const out = new Uint8Array(W * H * 4);

const set = (x, y, r, g, b) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
};
// Fond damier sombre : rend visible tout résidu de damier clair mal découpé.
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const v = (((x >> 3) + (y >> 3)) & 1) ? 40 : 30;
  set(x, y, v, v, v + 4);
}

function blit(sprite, dx, dy) {
  for (let y = 0; y < sprite.height; y++) for (let x = 0; x < sprite.width; x++) {
    const s = (y * sprite.width + x) * 4;
    const a = sprite.data[s + 3];
    if (!a) continue;
    const X = dx + x, Y = dy + y;
    if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    const d = (Y * W + X) * 4;
    const k = a / 255;
    out[d] = sprite.data[s] * k + out[d] * (1 - k);
    out[d + 1] = sprite.data[s + 1] * k + out[d + 1] * (1 - k);
    out[d + 2] = sprite.data[s + 2] * k + out[d + 2] * (1 - k);
    out[d + 3] = 255;
  }
}

let cy = PAD;
for (const row of rows) {
  // Bandeau de séparation + ligne de sol de la rangée.
  for (let x = 0; x < W; x++) for (let y = cy; y < cy + 2; y++) set(x, y, 78, 212, 196);
  const baseY = cy + 20 - row.top;
  for (let i = 0; i < row.keys.length; i++) {
    const fr = atlas.frames[row.keys[i]];
    const sprite = decodePNG(readFileSync(join(ROOT, 'assets', fr.file)));
    const cellX = PAD + i * row.cw;
    // Repère d'ancre : croix rouge à l'origine (milieu-bas de la case source).
    const ax = cellX - row.left, ay = baseY;
    blit(sprite, ax + fr.offset[0], ay + fr.offset[1]);
    for (let k = -4; k <= 4; k++) { set(ax + k, ay, 255, 92, 58); set(ax, ay + k, 255, 92, 58); }
    // Bord droit de cellule.
    for (let y = cy + 2; y < cy + row.ch + 20; y++) set(cellX + row.cw - 1, y, 58, 60, 74);
  }
  cy += row.ch + 22;
}

writeFileSync(OUTFILE, encodePNG({ width: W, height: H, data: out }));
console.log(`${OUTFILE} — ${W}×${H}, ${rows.length} groupes, ${[...groups.values()].flat().length} frames`);
for (const r of rows) console.log(`  ${r.g.padEnd(18)} ${r.keys.length} frames, cellule ${r.cw}×${r.ch}`);
