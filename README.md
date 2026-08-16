# Maxence Rider

Jeu de skate/roller 2D en pixel art, 100 % web statique : HTML + CSS + JavaScript
vanilla, zéro dépendance au runtime.

Le brief complet du projet est dans [docs/BRIEF.md](docs/BRIEF.md).

## Lancer

```bash
python3 -m http.server 8000
```

Puis ouvrir <http://localhost:8000>. Le jeu fonctionne aussi en ouvrant
`index.html` directement (`file://`).

## État d'avancement

| Phase | Contenu | État |
|---|---|---|
| P0 | Pipeline assets : découpe des planches, atlas | ✅ |
| P1 | Shell, boucle, rendu, input abstrait | ✅ |
| P2 | Rider animé, physique, trois sauts | ✅ |
| P3 | Chunks, obstacles, collisions, crash | ✅ |
| P4 | Grind, manual, combos, scoring, particules | ✅ |
| P5 | Décors, parallaxe 3 couches, caméra & ambiances | ✅ |
| P6 | Menus, HUD, persistance | ✅ |
| P7 | Rider roller débloqué à 25 000 pts · niveaux scriptés | partiel — voir écart ci-dessous |
| P8 | Audio, haptique, réglages, polish | ✅ |

## Vérifier le jeu

```bash
node tools/test.mjs
```

Les tests font tourner le vrai jeu dans un harnais headless
([tools/harness.mjs](tools/harness.mjs)) : DOM minimal, contexte 2D qui rastérise
pour de bon, et surtout **temps piloté à la main**. Chaque exécution est donc
reproductible au pas de simulation près, ce qui permet d'affirmer des choses comme
« le rider ne traverse jamais un obstacle » sans dépendre du timing d'un vrai
navigateur. Les entrées sont injectées sous forme d'événements réels : c'est bien
le code d'input du jeu qui est exercé.

Pour regarder une image du rendu sans navigateur :

```bash
node tools/shot.mjs --portrait --debug --jump
```

## Ouvrir en file://

Chrome et Safari refusent `<script type="module">` sur `file://`. Le code source
reste en modules ES ; pour l'ouverture par double-clic, régénérer le bundle après
toute modification de `src/` :

```bash
node tools/bundle.mjs
```

`index.html` choisit tout seul : modules ES sur un serveur, `dist/bundle.js` en
`file://`.

## Pipeline d'assets

Les cinq planches contact fournies vivent dans `assets/raw/`. Elles sont la source
de vérité : tout ce qui est dans `assets/sprites/`, `assets/atlas.png` et
`assets/atlas.json` en est dérivé et peut être régénéré.

```bash
node tools/slice.mjs
```

Cela produit :

- `assets/sprites/<catégorie>/*.png` — une frame par fichier, fond transparent, trimmée ;
- `assets/atlas.png` — les mêmes frames packées en une texture unique, ce que
  charge le jeu (une requête au lieu de 155) ;
- `assets/atlas.json` — index des frames (taille, offset d'ancrage, rectangle
  dans la texture) et table des animations ;
- `assets/atlas.js` — le même index en module ES, pour démarrer depuis `file://`
  où `fetch()` d'un JSON local est bloqué.

Le facteur de réduction est réglable : `SCALE=2 node tools/slice.mjs` (défaut 4,
qui ramène le rider à ~51 px de haut dans l'espace virtuel 480 × 270).

### Vérifier une découpe

Deux moyens, l'un dans le navigateur, l'autre sans :

```bash
node tools/contact.mjs skate      # → tools/contact.png, planche de contrôle
```

La planche montre chaque frame sur damier sombre avec une croix rouge à son point
d'ancrage : tout résidu de fond clair et tout ancrage qui dérive sautent aux yeux.
Passer un préfixe (`skate`, `rail`, `urban`, …) pour ne sortir qu'une famille.

Sinon, servir le dossier et ouvrir `tools/preview.html` : mêmes frames, plus les
animations en lecture.

### Ajuster la découpe

Toute la description des planches est dans [tools/layout.mjs](tools/layout.mjs) :
bandes, blocs, mode de découpe, noms. Aucun réglage n'est en dur dans
`slice.mjs`. Deux modes :

- `grid` — n cases régulières, une frame par case. Pour les planches personnage
  et les tuiles de sol/mur.
- `objects` — segmentation par composantes connexes sur toute la bande. Pour les
  décors, où plusieurs objets partagent une case et où les rails débordent sur
  trois cases.

## Ajouter un chunk

Les chunks vivent dans [src/data/chunks.js](src/data/chunks.js), groupés par
palier de difficulté (`PALIER_1` à `PALIER_5`, plus `RESPIRATION` et `BONUS`).
Un chunk se déclare avec le helper `chunk(id, difficulty, requires, entities)` :

```js
chunk('mon_chunk', 2, ['ollie', 'flip'], [
  { type: 'bin', x: 220 },                 // obstacle (voir src/data/entities.js)
  { type: 'coin', x: 190, y: 55 },          // collectible, y = hauteur au-dessus du sol
]),
```

`x` va de 0 à 480 (largeur du chunk) ; pas besoin de laisser de la marge aux
bords pour la sécurité entre chunks — `game/chunks.js` insère automatiquement
l'espacement requis par l'invariant du §8 au moment d'accoler deux chunks entre
eux (voir le commentaire d'en-tête de ce fichier pour le pourquoi). Ajouter le
chunk au tableau `PALIER_N` correspondant suffit ; il rejoint le sac de tirage
de ce palier. Les types d'obstacles et leurs familles de collision (§6.5) sont
dans [src/data/entities.js](src/data/entities.js).

Après modification : `node tools/test.mjs` revalide l'invariant sur toutes les
paires de chunks à la vitesse plafond — c'est ce test qui protège contre un
chunk dont les obstacles seraient placés d'une façon qui, combinée à un autre
chunk, deviendrait infranchissable.

## Ajouter un rider

Les deux riders (skate, roller) sont déclarés dans
[src/data/riders.js](src/data/riders.js) :

```js
export const RIDERS = {
  nouveauRider: {
    id: 'nouveauRider',
    nom: 'Maxence (nouveau)',
    prefixe: 'nouveau',          // doit matcher le préfixe des clés d'atlas :
                                  // nouveau.roll.0, nouveau.ollie.0, etc.
    special: 'manual',           // 'nocomply' ou 'manual' (§7)
    vitesse: 1.00, hauteurSaut: 1.00, pointsTrick: 1.00, grind: 1.00,
    debloqueA: 0,                 // score cumulé requis pour le débloquer (§7)
  },
};
```

Deux prérequis pour qu'un rider soit jouable :

1. **Les animations existent dans l'atlas** sous le préfixe déclaré — la même
   table que pour skate/roller (roll, ollie, flip, crash, grind, idle, plus
   nocomply ou manual selon `special`). Sans planche source pour ce rider, il
   n'y a rien à découper : voir [tools/layout.mjs](tools/layout.mjs) si de
   nouvelles planches doivent entrer dans le pipeline.
2. **Le menu propose le nouveau bouton** — `main.js` gère actuellement deux
   boutons câblés en dur (skate/roller) ; un 3e rider demande d'étendre cette
   UI (`ITEMS_MENU`, le rendu des boutons, la détection de clic).

Le déblocage lui-même (`debloqueA`) est générique : `debloquerRidersEligibles()`
dans `main.js` boucle sur `RIDERS` et compare `debloqueA` au score cumulé —
rien à toucher côté logique de déblocage pour un rider de plus.

## Écart assumé au brief : niveaux vs run continu

Le §9 du brief demande 6 niveaux scriptés sélectionnables (nom, direction,
longueur, 3 objectifs → étoiles) plus un mode Endless séparé avec seed
affichée. Le jeu retient un design différent : un run continu unique où le
décor et la difficulté changent de thème tous les 10 000 points, sans écran
de sélection de niveau. Décision explicite, pas un oubli — le design plaisait
déjà en l'état lors de l'arbitrage, et le restructurer aurait été un
changement de portée conséquent (chunks, objectifs, étoiles, UI de sélection)
pour un bénéfice pas évident face à ce qui fonctionne. À rouvrir si besoin.

## Packaging Android / PWA (hors brief)

Le projet inclut aussi un manifest PWA (`manifest.json`, `sw.js`) et un projet
Android natif (`android/`, WebView autour du build web) — voir
[docs/ANDROID.md](docs/ANDROID.md). C'est une extension au-delà du §1 du brief
(« 100 % web statique »), gardée car fonctionnelle et indépendante : le jeu web
lui-même reste jouable sans rien de tout ça, `python3 -m http.server` ou
`file://` suffisent toujours. `node tools/sync_android.mjs` recopie les
derniers assets web dans le projet Android ; `node tools/build_apk.sh`
compile l'APK (non commité, régénérable — voir `.gitignore`).

## Structure

```
assets/raw/        planches contact fournies (source de vérité)
assets/sprites/    frames découpées (généré)
tools/             pipeline d'assets et outils de contrôle
src/core/          boucle, entrées, chargement, audio, stockage, RNG, pooling
src/game/          états, joueur, physique, chunks, niveaux, score
src/render/        rendu, sprites, HUD
src/data/          animations, chunks, niveaux, riders
docs/BRIEF.md      cahier des charges
```
