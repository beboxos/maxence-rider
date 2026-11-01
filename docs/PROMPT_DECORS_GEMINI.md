# Prompts décors — version Gemini (remplace PROMPT_DECORS.md)

Validé sur le thème 1 (`atlas/theme1/Gemini_Generated_Image_*.jpeg`) : pixel art net,
fond vert uni, enseignes lisibles. Deux planches par thème, **dans la même
conversation Gemini** et en joignant l'image du thème 1 comme référence de style
(« same pixel size, same outline weight, same shading as the attached sheet »).
Demander un export **PNG** si possible.

Échelle du jeu : espace virtuel 480 × 270, rider ≈ 35 × 51 px. 1 pixel de l'image
= 1 pixel du jeu après réduction (le rendu est carré 2048², on réduira à ÷4 environ).

---

## Bloc STYLE (à coller dans chaque prompt)

```
Pixel art sprite sheet for a 2D side-scrolling skate/roller runner set in a
city at night. Crisp pixel art, no anti-aliasing, no blur, 1-px dark outlines,
3-4 tone shading, dithering only for glows. Flat 2D side view, no perspective.
Max 24 colors taken from the THEME PALETTE. No real brands or logos; short
invented signs only. Light comes from streetlights and neon, not from above.

LAYOUT (an automatic tool cuts the objects out):
- Background: ONE flat solid chroma green #00FF00 everywhere. No gradient,
  no shadow, no checkerboard. That green is used nowhere in the artwork.
- No frames, no grid lines, no numbers, no captions, no titles.
- Objects in clean horizontal rows, at least 40 px of empty green between any
  two objects, never touching or overlapping. Nothing behind a building: NO
  skyline or sky behind the buildings (only green).
- All objects in a row share a bottom baseline.
Export as PNG.
```

## Planche A — bâtiments + skylines

```
[BLOC STYLE]
THEME: [coller la variante du thème ci-dessous]

Content:
ROW 1: 3 distant skyline strips, each 480 px wide x 110 px high, SEAMLESS
horizontally (left and right edges identical so the strip repeats), dark theme
tones (not black), tiny lit windows, aviation lights, flat bottom.
ROW 2: 6 mid-ground buildings, widths 60-100 px, heights 70-115 px, each with a
different silhouette, color and a shop/entrance at the bottom.
ROW 3: 6 more buildings, different from row 2 (low houses, a corner store, a
tall tower, a building with a water tank, a garage, a kiosk).
```

## Planche B — props, ciel, sol

```
[BLOC STYLE]
THEME: [coller la variante du thème ci-dessous]

Content:
ROW 1: 10 street props, heights 28-75 px: 2 streetlamps (one with a dithered
light cone), bus stop sign, electric pole with sagging wires (wires 120 px
wide), 2 chain-link fence segments (90 px), billboard or graffiti wall,
planter, trash bin, bench.
ROW 2: sky elements: moon or sun (48 px), 4 clouds (64x20, 96x28, 140x36,
180x40, dithered edges), 2 flyers with 3 wing frames each (10x8 px).
ROW 3: ground, 6 seamless tiles 48x48: sidewalk with a curb line, 2 variants;
asphalt with a faded marking, 2 variants; manhole; grate. The top 2 pixel rows
use the theme accent color and match across tiles.
```

---

## Variantes de thème (palettes de `src/data/themes.js`)

1. **Skatepark & Avenue** — ciel #080c16→#121e2c, accent cyan #4ed4c4, fenêtres #ffc93c, béton #424554 #6b6f82. Diner, laundromat, skate shop néon, briques, chauves-souris, lune. (déjà généré)
2. **Pâté de Maisons & Résidences** — ciel #1a0e08→#341c10, accent ambre #ffc93c, briques #5a382c #8a4a32, lueur #ffd27a. Maisons de ville, toits à pignon, cheminées, boulangerie, librairie, balcons fleuris. Props : clôtures en bois, boîtes aux lettres, arbres, lampadaires chauds. Ciel : lune orange basse, fumée de cheminée, oiseaux.
3. **Campus & École** — ciel #14081c→#2c1038, accent violet #e056fd, crème #cdbfae, ardoise #3b3350. Tour de l'horloge, bibliothèque à colonnes, gymnase, résidences, amphi. Props : râteliers à vélos, panneau plan du campus, bannières, bancs. Ciel : lune pâle, nuages violets, lucioles.
4. **Chantier & Lofts** — ciel #140f0a→#2a1a10, accent ambre sécurité #ff9f1a, béton #6d6a64, acier #4a5058, poussière #a8957a. Grues à tour, structures béton avec armatures, échafaudages, lofts à grandes verrières, cheminées en brique, conteneurs. Props : barrières de chantier avec feu orange, bétonnière, tuyaux empilés, projecteurs. Ciel : brume orange, fumées, drones.
5. **Quartier Cyber Arcade** — ciel #160410→#320a22, accent néon #ff3366, cyan #35e6ff, violet #2a0f3d, fenêtres #ff5fa8. Méga-tours aux enseignes verticales, panneaux holographiques, salles d'arcade, bars à ramen, antennes. Props : enseignes néon (ARCADE, 24H, RAMEN), distributeurs lumineux, flaques reflétant le néon, câbles, drones. Ciel : grosse lune rose, étoiles, smog néon.

---

## Ensuite

1. Déposer les PNG dans `atlas/theme<N>/`.
2. Demander à Claude de découper (détourage du vert, séparation des objets, réduction ÷4, quantification de palette) puis d'intégrer à l'atlas et à `parallax.js`.
