#!/usr/bin/env node
// Concatène les modules ES en un script classique, pour l'ouverture en file://.
//
//   node tools/bundle.mjs
//
// Chrome et Safari refusent `<script type="module">` sur file:// (origine null),
// alors que le brief demande que le jeu s'ouvre aussi par un double-clic. Le code
// source reste donc en modules ES — c'est lui qui fait foi — et ce script en
// produit une version équivalente à plat dans dist/bundle.js.
//
// Le bundler ne comprend qu'un sous-ensemble volontairement étroit de la syntaxe
// des modules ; il échoue bruyamment sur le reste plutôt que de produire un
// bundle silencieusement faux.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'src/main.js');

const RE_IMPORT_NAMED = /^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?\s*$/;
// Les identifiants du projet sont en français : `fpsRoulé` doit être capturé
// entier. \w s'arrête au premier caractère accentué et produirait un export
// tronqué, donc un bundle cassé sans la moindre erreur au moment de la génération.
const ID = '[\\p{L}_$][\\p{L}\\p{N}_$]*';
const RE_IMPORT_DEFAULT = new RegExp(`^import\\s+(${ID})\\s+from\\s*['"]([^'"]+)['"];?\\s*$`, 'u');
const RE_EXPORT_DECL = new RegExp(`^export\\s+(?:async\\s+)?(function|const|let|class)\\s+(${ID})`, 'u');
const RE_EXPORT_DEFAULT = /^export\s+default\s+/;

const modules = new Map(); // chemin absolu → { id, code, deps, exports, hasDefault }
const order = [];

function analyser(fichier) {
  if (modules.has(fichier)) return;

  // Les imports nommés à rallonge s'écrivent sur plusieurs lignes ; on les
  // remet à plat avant l'analyse, qui raisonne ligne par ligne.
  const source = readFileSync(fichier, 'utf8').replace(
    /^import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?/gm,
    (m) => m.replace(/\s+/g, ' '),
  );
  const id = relative(ROOT, fichier).split('\\').join('/');
  const deps = [];
  const exports = [];
  let hasDefault = false;

  const lignes = source.split('\n');
  const corps = [];

  for (const ligne of lignes) {
    const nommé = ligne.match(RE_IMPORT_NAMED);
    const defaut = ligne.match(RE_IMPORT_DEFAULT);

    if (nommé || defaut) {
      const spec = (nommé || defaut)[2];
      const cible = resolve(dirname(fichier), spec);
      deps.push(cible);
      analyser(cible);
      const cibleId = relative(ROOT, cible).split('\\').join('/');
      if (nommé) {
        const noms = nommé[1].split(',').map((s) => s.trim()).filter(Boolean);
        for (const nom of noms) {
          if (nom.includes(' as ')) throw new Error(`${id} : « import … as » non géré (${nom})`);
        }
        corps.push(`const { ${noms.join(', ')} } = __mod[${JSON.stringify(cibleId)}];`);
      } else {
        corps.push(`const ${defaut[1]} = __mod[${JSON.stringify(cibleId)}].default;`);
      }
      continue;
    }

    if (/^\s*import\s/.test(ligne) && !/^\s*\/\//.test(ligne)) {
      throw new Error(`${id} : forme d'import non gérée → ${ligne.trim()}`);
    }

    if (ligne.includes('import.meta') && !/^\s*(\/\/|\*|\/\*)/.test(ligne)) {
      throw new Error(`${id} : import.meta n'existe pas dans un script classique`);
    }

    const decl = ligne.match(RE_EXPORT_DECL);
    if (decl) {
      exports.push(decl[2]);
      corps.push(ligne.replace(/^export\s+/, ''));
      continue;
    }
    if (RE_EXPORT_DEFAULT.test(ligne)) {
      hasDefault = true;
      corps.push(ligne.replace(RE_EXPORT_DEFAULT, 'const __default = '));
      continue;
    }
    if (/^export\s/.test(ligne)) {
      throw new Error(`${id} : forme d'export non gérée → ${ligne.trim()}`);
    }

    corps.push(ligne);
  }

  modules.set(fichier, { id, corps: corps.join('\n'), deps, exports, hasDefault });
  order.push(fichier); // les dépendances sont déjà empilées : ordre topologique
}

analyser(ENTRY);

const morceaux = [
  '// Généré par tools/bundle.mjs — ne pas éditer. Source : src/',
  '(function () {',
  '"use strict";',
  'const __mod = Object.create(null);',
];

for (const fichier of order) {
  const m = modules.get(fichier);
  const rendus = m.exports.map((n) => `${n}`);
  if (m.hasDefault) rendus.push('default: __default');
  morceaux.push(
    `__mod[${JSON.stringify(m.id)}] = (function () {`,
    m.corps,
    `return { ${rendus.join(', ')} };`,
    '})();',
  );
}

morceaux.push('})();', '');

mkdirSync(join(ROOT, 'dist'), { recursive: true });
const sortie = morceaux.join('\n');
writeFileSync(join(ROOT, 'dist/bundle.js'), sortie);

console.log(
  `dist/bundle.js — ${order.length} modules, ${(sortie.length / 1024).toFixed(0)} Ko`,
);
for (const f of order) console.log(`  ${modules.get(f).id}`);
