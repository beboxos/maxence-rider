#!/usr/bin/env node
// Capture d'écran du jeu, sans navigateur.
//
//   node tools/shot.mjs                          → paysage, tools/shot.png
//   node tools/shot.mjs --portrait               → portrait
//   node tools/shot.mjs --frames=120 --out=x.png → après 120 frames
//   node tools/shot.mjs --pause                  → écran de pause
//
// Utile pour regarder le rendu réel sans dépendre d'un navigateur pilotable,
// et pour comparer deux états côte à côte pendant une mise au point.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { boot, ROOT } from './harness.mjs';

const args = process.argv.slice(2);
const flag = (nom, défaut) => {
  const trouvé = args.find((a) => a.startsWith(`--${nom}=`));
  return trouvé ? trouvé.split('=')[1] : défaut;
};
const has = (nom) => args.includes(`--${nom}`);

const portrait = has('portrait');
const width = Number(flag('width', portrait ? 540 : 960));
const height = Number(flag('height', portrait ? 960 : 540));
const nbFrames = Number(flag('frames', 90));
const sortie = flag('out', 'tools/shot.png');

const h = await boot({ width, height, dpr: 1, search: has('debug') ? '?debug=1' : '' });
h.frames(nbFrames);

if (has('jump')) {
  h.keyDown('Space');
  h.frames(3);
  h.keyUp('Space');
  h.frames(Number(flag('after', 14)));
}

if (has('pause')) {
  h.keyDown('Escape');
  h.frames(2);
}

const chemin = join(ROOT, sortie);
writeFileSync(chemin, h.canvas.toPNG());
console.log(`${sortie} — ${width}×${height}, ${nbFrames} frames`);
