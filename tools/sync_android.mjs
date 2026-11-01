#!/usr/bin/env node
// Synchronise les assets web et le bundle vers le projet Android assets/www/

import { cpSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './harness.mjs';

const wwwDir = join(ROOT, 'android/app/src/main/assets/www');
mkdirSync(wwwDir, { recursive: true });
mkdirSync(join(wwwDir, 'dist'), { recursive: true });
mkdirSync(join(wwwDir, 'assets'), { recursive: true });

const mipmapDir = join(ROOT, 'android/app/src/main/res/mipmap');
mkdirSync(mipmapDir, { recursive: true });

// 1. Fichiers clés
copyFileSync(join(ROOT, 'index.html'), join(wwwDir, 'index.html'));
copyFileSync(join(ROOT, 'style.css'), join(wwwDir, 'style.css'));
copyFileSync(join(ROOT, 'manifest.json'), join(wwwDir, 'manifest.json'));
copyFileSync(join(ROOT, 'dist/bundle.js'), join(wwwDir, 'dist/bundle.js'));

// 2. Atlas, visuels et icônes
copyFileSync(join(ROOT, 'assets/atlas.png'), join(wwwDir, 'assets/atlas.png'));
mkdirSync(join(wwwDir, 'assets/bg'), { recursive: true });
for (const n of ['theme1', 'theme4', 'theme5', 'obstacles']) {
  copyFileSync(join(ROOT, `assets/bg/${n}.png`), join(wwwDir, `assets/bg/${n}.png`));
}
copyFileSync(join(ROOT, 'assets/menu_hero.png'), join(wwwDir, 'assets/menu_hero.png'));
copyFileSync(join(ROOT, 'assets/icon-192.png'), join(wwwDir, 'assets/icon-192.png'));
copyFileSync(join(ROOT, 'assets/icon-512.png'), join(wwwDir, 'assets/icon-512.png'));

// 3. Icône launcher Android
copyFileSync(join(ROOT, 'assets/icon-192.png'), join(mipmapDir, 'ic_launcher.png'));

console.log('✅ Projet Android synchronisé avec succès dans android/app/src/main/assets/www !');
