# Prompt — atlas de décors (fonds parallaxe)

À générer **une planche par ambiance** (5 au total) avec un générateur d'images
(Gemini, comme les planches de `assets/raw/`). Même convention que les planches
existantes, pour réutiliser `tools/slice.mjs` / `tools/layout.mjs` :
cadres magenta `#C020C0`, fond damier transparent, un numéro dans le coin
haut-gauche de chaque case.

Contexte technique : espace virtuel du jeu 480 × 270 px (paysage) et 270 × 480
(portrait), le rider fait ~35 × 51 px. Les décors doivent donc être dessinés **à
l'échelle réelle du jeu** (1 px de l'image = 1 px du jeu), pas en grand.

---

## Bloc commun (à coller au début de chaque génération)

```
Create ONE pixel-art sprite sheet ("contact sheet") of side-scrolling BACKGROUND
elements for a 2D skate/roller runner game set in a city at night.

STYLE
- Crisp pixel art, NO anti-aliasing, NO blur, NO gradients except dithered ones.
- Same look as a polished 16-bit/32-bit arcade game: 1-px dark outline on props,
  3-4 tone shading per material, warm lit windows, subtle rim light on the edge
  facing the neon/streetlight.
- Strict limited palette: max 24 colors for the whole sheet, taken from the
  THEME PALETTE below. No pure black, no pure white.
- Flat 2D side view (orthographic, no perspective, no isometric). Light comes
  from the bottom/side (streetlights, neon), never from above.
- Everything is original: no real brands, no logos, no readable copyrighted text.
  Short invented signs only (e.g. "DINER", "PIZZA", "OPEN", "24H", "ARCADE").

SHEET FORMAT (important, an automatic slicer reads it)
- BACKGROUND = ONE FLAT SOLID COLOR, pure chroma green #00FF00, everywhere
  (inside and outside the cells). NO checkerboard, NO gradient, NO shadow on the
  background, and the green must not appear anywhere inside the artwork.
- NO frames, NO cell borders, NO grid lines, NO numbers. Items are laid out in
  clean horizontal rows, each item separated from its neighbours by at least
  30 px of empty green, never touching or overlapping another item.
- NO text labels, NO captions, NO titles anywhere on the sheet (shop signs
  inside the artwork are fine).
- Every item is bottom-aligned on a common baseline within its row.
- Items are drawn at their FINAL pixel size (given below), no upscaling, then
  the whole sheet may be shown enlarged with nearest-neighbor only.
- Buildings/props are bottom-aligned inside their cell (their base touches the
  bottom of the cell) so they can be planted on the ground line.
- Provide ONLY the right-facing version (the game mirrors it for the left).

ROW 1 — FAR SKYLINE, 4 strips, each 480 x 110 px, SEAMLESS horizontally
(left edge and right edge must match so the strip tiles). Dark, low-contrast
silhouettes of distant towers/roofs with a few tiny lit windows and aviation
lights. Colored in the theme's dark blue/violet tones (NOT pure black). No
ground, no sky, bottom edge flat. Each strip a different rhythm of
heights.

ROW 2 — MID BUILDINGS, 6 buildings, widths 56-96 px, heights 70-115 px.
Full facades with entrance/shopfront at the bottom, 2-4 floors of windows
(some lit, some dark, some with curtains), roof details (water tank, AC units,
antenna, signboard). Each one clearly different in silhouette and color.

ROW 3 — NEAR STREET PROPS, 8 items, heights 28-75 px: streetlamp (with soft
light halo drawn in dithered pixels), shop awning, neon sign on a bracket,
bus stop sign, tree or planter, fence/hoarding with posters, scaffolding or
kiosk, electric pole with wires. Theme-specific, see below.

ROW 4 — SKY ELEMENTS, 6 items: moon or sun disc (48 px), 3 cloud/haze strips
(sizes 64x20, 96x28, 140x36, semi-transparent look via dithering), 2 small
flying things (birds / bats / drones / paper lanterns depending on theme),
8 x 8 px each frame, 3 wing frames per flyer.

ROW 5 — GROUND, 4 seamless tiles, 48 x 48 px: sidewalk with curb line on top,
2 variants; road asphalt with a worn marking; a manhole/grate variant. The top
2-px row of every tile is the bright "ground line" using the theme accent
color, identical on all tiles so they connect.
```

---

## Variantes par ambiance (à ajouter sous le bloc commun)

Palettes extraites de `src/data/themes.js`.

### 1 — Le Skatepark & Avenue
```
THEME PALETTE: sky #080c16 -> #121e2c, accent cyan #4ed4c4, warm window yellow
#ffc93c, concrete grays #424554 #6b6f82, cone orange #ff5c3a.
MOOD: cool teal night, empty avenue next to a skatepark. Mid buildings: diner
with striped awning, laundromat, small apartment blocks, skate shop with a
board-shaped neon. Props: chain-link fence, halfpipe silhouette in the far
distance, graffiti wall, streetlamps with cyan light.
Sky: full moon, thin clouds, bats.
```

### 2 — Pâté de Maisons & Résidences
```
THEME PALETTE: sky #1a0e08 -> #341c10, accent amber #ffc93c, brick reds
#5a382c #8a4a32, warm window glow #ffd27a.
MOOD: cozy warm evening in a residential block. Brick townhouses, pitched
roofs with chimneys, bakery, bookstore, balconies with plants, drying laundry
lines. Props: wooden fences, mailboxes, street trees, warm streetlamps.
Sky: low orange moon, smoke from chimneys, small birds.
```

### 3 — Le Campus & L'École
```
THEME PALETTE: sky #14081c -> #2c1038, accent violet #e056fd, school-wall
cream #cdbfae, slate roofs #3b3350.
MOOD: university campus at dusk. Clock tower, library with columns, gym,
dorm blocks, lecture hall with big arched windows. Props: bike racks, campus
map board, banner flags, lamp posts with violet glow, benches.
Sky: pale moon, violet clouds, paper lanterns/fireflies.
```

### 4 — Le Chantier & Lofts
```
THEME PALETTE: sky #140f0a -> #2a1a10, accent safety amber #ff9f1a, raw
concrete #6d6a64, steel #4a5058, dust beige #a8957a.
MOOD: construction site and industrial lofts. Tower cranes (tall silhouettes
in the far strip), unfinished concrete frames with rebar, scaffolding, loft
buildings with big factory windows, brick chimneys, shipping containers.
Props: hazard barriers with amber blinking lights, cement mixer, stacked pipes,
floodlight poles, hoarding with "WORK ZONE" posters.
Sky: dusty orange haze, smoke plumes, drones.
```

### 5 — Le Quartier Cyber Arcade
```
THEME PALETTE: sky #160410 -> #320a22, accent neon pink-red #ff3366, neon
cyan #35e6ff, deep purple #2a0f3d, window magenta #ff5fa8.
MOOD: dense neon cyber-arcade district, rain-slick night. Mega-towers with
glowing vertical signs, holographic billboards, arcade fronts, ramen bars,
rooftop antennas. Props: neon signs on brackets ("ARCADE", "24H", "RAMEN"),
vending machines glow, glowing puddle reflections drawn as short horizontal
strokes, cables, drones.
Sky: huge pink moon, starfield (single pixels), neon smog, flying drones.
```

---

## Après génération

1. Déposer les 5 PNG dans `assets/raw/` (`decors_theme1.png` … `decors_theme5.png`).
2. Demander à Claude : « intègre les planches décors dans l'atlas » — il
   décrira les bandes dans `tools/layout.mjs`, régénérera `atlas.png/json/js`,
   puis remplacera le dessin procédural de `src/render/parallax.js`
   (rectangles + fenêtres) par ces sprites, avec des clés `bg.<thème>.far|mid|near|sky|ground`
   dans `src/data/themes.js`.
3. Vérifier avec `node tools/shot.mjs` (capture) et sur mobile (poids de l'atlas).

Conseils de génération : si le modèle n'arrive pas à tenir toute la planche,
générer ligne par ligne (une image par ROW) en gardant le même bloc STYLE ;
redemander en cas de dégradés lisses ou d'anti-aliasing (incompatibles avec le pixel art).
