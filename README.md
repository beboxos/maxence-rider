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
| P1 | Shell, boucle, rendu, input abstrait | à venir |
| P2 | Rider animé, physique, trois sauts | à venir |
| P3 | Chunks, obstacles, collisions, crash | à venir |
| P4 | Grind, manual, combos, scoring | à venir |
| P5 | Décors, parallaxe, caméra | à venir |
| P6 | Menus, HUD, persistance | à venir |
| P7 | Niveaux, endless, rider roller | à venir |
| P8 | Audio, haptique, réglages, polish | à venir |

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
