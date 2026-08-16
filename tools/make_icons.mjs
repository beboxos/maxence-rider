#!/usr/bin/env node
// Génération des icônes d'application PWA / Android (192×192 et 512×512)

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { boot, ROOT } from './harness.mjs';

async function genererIcone(taille, fichier) {
  const h = await boot({ width: taille, height: taille, dpr: 1 });
  await new Promise((r) => setTimeout(r, 100));

  const ctx = h.canvas._ctx;
  const M = globalThis.window.__maxence;

  // Fond dégradé sombre
  ctx.fillStyle = '#0e111a';
  ctx.fillRect(0, 0, taille, taille);

  // Bordure arrondie néon cyan / orange
  const marge = Math.round(taille * 0.04);
  const bordure = Math.round(taille * 0.03);
  ctx.fillStyle = '#4ed4c4';
  ctx.fillRect(marge, marge, taille - marge * 2, taille - marge * 2);
  ctx.fillStyle = '#141824';
  ctx.fillRect(marge + bordure, marge + bordure, taille - (marge + bordure) * 2, taille - (marge + bordure) * 2);

  // Sol néon
  const solY = Math.round(taille * 0.72);
  ctx.fillStyle = '#ff5c3a';
  ctx.fillRect(marge + bordure, solY, taille - (marge + bordure) * 2, Math.round(taille * 0.02));

  // Sprite Rider au centre
  const centreX = Math.round(taille / 2);
  const { drawFrame } = await import('../src/render/sprite.js');
  drawFrame(ctx, 'skate.roll.1', centreX, solY, {
    scaleX: taille / 120,
    scaleY: taille / 120,
  });

  // Sauvegarde PNG
  const chemin = join(ROOT, fichier);
  writeFileSync(chemin, h.canvas.toPNG());
  console.log(`Généré : ${fichier} (${taille}×${taille})`);
}

await genererIcone(192, 'assets/icon-192.png');
await genererIcone(512, 'assets/icon-512.png');
