# MAXENCE RIDER — Brief de développement complet

> Document de référence du projet. Source : brief fourni au démarrage.

---

## 0. Mission

Développer **Maxence Rider**, un jeu de skate/roller 2D en pixel art, jouable dans un navigateur, sans build tool, sans framework, sans dépendance externe. Vue de profil, défilement latéral, scoring à combos, sauvegarde locale des scores. Jouable au clavier sur desktop et au tactile sur smartphone, en **portrait comme en paysage**.

Les sprite sheets pixel art (personnage skate, personnage roller, décors, obstacles, effets) sont fournies dans `assets/raw/`. Elles sont livrées sous forme de « planches contact » avec titres, cadres magenta et libellés : **elles doivent être découpées** (voir §4).

---

## 1. Contraintes non négociables

| # | Contrainte |
|---|---|
| C1 | 100 % web statique : HTML + CSS + JS vanilla (ES modules). Zéro npm au runtime, zéro CDN, zéro framework. Doit tourner depuis un simple `python -m http.server`. |
| C2 | Rendu **Canvas 2D** uniquement, `imageSmoothingEnabled = false` (pixel art net). |
| C3 | Jouable au doigt : portrait **et** paysage, avec relayout à chaud sur `resize` / `orientationchange`. Aucune zone de contrôle sous la barre système iOS (`env(safe-area-inset-*)`). |
| C4 | Scores, réglages et progression persistés en `localStorage`, avec migration de schéma versionné. |
| C5 | 60 fps sur un smartphone milieu de gamme. Boucle à pas fixe, pas de GC en boucle chaude (pooling des particules et entités). |
| C6 | Aucun asset hors de ceux fournis. Si un asset manque, générer un placeholder procédural clairement identifiable (aplat magenta + croix), jamais télécharger. |
| C7 | Le jeu doit être jouable de bout en bout après **chaque** phase de dev (§15). Pas de big bang final. |

---

## 2. Stack & arborescence

```
maxence-rider/
├── index.html                  # shell + canvas + overlays DOM (menus, HUD texte)
├── style.css                   # layout responsive, safe-areas, thème
├── assets/
│   ├── raw/                    # planches contact fournies (source de vérité)
│   ├── sprites/                # frames découpées (généré, versionné)
│   ├── atlas.png               # texture unique (généré)
│   └── atlas.json              # index des frames + anims (généré)
├── tools/
│   ├── png.mjs                 # codec PNG sans dépendance
│   ├── layout.mjs              # description des planches
│   ├── slice.mjs               # découpeur de planches (Node, exécuté une fois)
│   ├── contact.mjs             # planche de contrôle PNG (vérification hors navigateur)
│   └── preview.html            # visualisation des frames dans le navigateur
├── src/
│   ├── main.js                 # bootstrap, orientation, resize, boucle
│   ├── core/                   # loop, input, assets, audio, storage, rng, pool
│   ├── game/                   # state, player, physics, chunks, level, entities,
│   │                           # scoring, particles, camera
│   ├── render/                 # renderer, sprite, hud
│   └── data/                   # anims, chunks, levels, riders
└── docs/BRIEF.md               # ce fichier
```

---

## 3. Pipeline assets — découpe des planches

`tools/slice.mjs` (Node ≥ 18, sans dépendance : décodage PNG maison).

Algorithme :

1. Charger la planche, détecter les **cadres magenta** (`#C020C0` ± tolérance) qui délimitent chaque case.
2. Pour chaque case : ignorer le coin haut-gauche (numéro de case), rogner les bordures.
3. Détecter le fond damier transparent → convertir en alpha 0.
4. **Trim** : rogner aux pixels opaques, mémoriser l'offset pour préserver l'ancrage.
5. Exporter chaque frame en PNG individuel dans `assets/sprites/<categorie>/` **et** générer `assets/atlas.json`.

Règles :

- **Ancrage aux pieds** (`0.5, 1.0`) pour tous les personnages.
- Les planches contiennent une version **Gauche** et une version **Droite** de chaque anim. **N'importer que la version Droite** et faire un flip horizontal au rendu (`ctx.scale(-1,1)`) pour la gauche.
- Les hitboxes ne sont **jamais** la taille du sprite : les déclarer à la main (voir §6.5).

---

## 4. Inventaire des assets fournis

**`skate_prodigy.png` — rider skate**

| Anim | Frames | Usage |
|---|---|---|
| Roulé (rolling) | 5 | boucle au sol |
| Sauté (ollie) | 5 | saut court |
| Heel Flip / Kickflip | 7 | saut haut + trick |
| No-Comply | 6 | saut long |
| Chute (fall/crash) | 6 | mort/collision, dernière frame = KO au sol |
| Grind | 3 | boucle sur rail |
| Idle | 3 | boucle statique menu/départ |

**`roller_prodigy.png` — rider roller** : mêmes catégories, plus `Manual` (6 frames) qui remplace le No-Comply.

**`decors_obstacles.png` / `decors_obstacles_2.png` / `terrain_atmosphere.png`** : modules skatepark, obstacles urbains, rails & curbs, décors, sols, murs, connecteurs, effets, bonus.

---

## 5. Table des animations

| Clé | fps | Loop | Notes |
|---|---|---|---|
| `rider.idle` | 6 | oui | menu, avant départ |
| `rider.roll` | 14 | oui | `fps = 8 + speed/40`, clampé 8–20 |
| `rider.ollie` | 18 | non | 1-2 crouch/pop, 3-4 air, 5 landing |
| `rider.flip` | 20 | non | 7 frames, 3-5 = fenêtre de scoring |
| `rider.nocomply` | 16 | non | skate uniquement |
| `rider.manual` | 10 | oui | roller uniquement |
| `rider.grind` | 12 | oui | |
| `rider.crash` | 12 | non | se fige sur la dernière frame 900 ms |
| `fx.spark` | 24 | non | 3 frames |
| `fx.dust` | 18 | non | 3 frames |

Pas de frames d'atterrissage dédiées : réutiliser la première frame de `roll` avec un squash vertical de 0.88 pendant 100 ms.

---

## 6. Mécaniques de jeu

### 6.1 Boucle & physique

- Pas fixe **60 Hz**, accumulateur, rendu interpolé. `dt` max clampé à 0.25 s.
- Espace virtuel **480 × 270** (paysage) / **270 × 480** (portrait), échelle entière.
- Gravité `2200 px/s²`, vitesse de chute max `1400 px/s`.

### 6.2 Déplacement & direction des niveaux

Auto-runner : le joueur gère les sauts, les grinds, les combos.

- **Direction par niveau** : niveaux impairs vers la **droite**, pairs vers la **gauche**.
- Vitesse de base `240 px/s`, +`8 px/s` toutes les 10 s, plafond `460 px/s`.
- Modulation ±15 % par inclinaison (← →, ou glissement horizontal).
- Rider à 30 % de l'écran dans le sens de la marche, caméra anticipant de `speed × 0.25` px.

### 6.3 Les trois sauts

| Saut | Desktop | Tactile | v0 | Hauteur | Airtime | Franchit | Points |
|---|---|---|---|---|---|---|---|
| **Ollie** | `Espace` (tap < 150 ms) | tap court | -620 | ~87 px | 0.56 s | obstacles bas | 50 |
| **Flip** | `Espace` ≥ 150 ms | tap long / swipe ↑ | -820 | ~153 px | 0.75 s | obstacles hauts | 150 + 25/rotation |
| **Boost** | `Shift` + `Espace` | double tap | -700, gravité 1400 en montée | ~175 px | 1.0 s | **gaps** | 200 |

- **Coyote time** 90 ms, **input buffer** 120 ms, **variable jump height** (relâcher tôt coupe à 45 %).
- Un seul saut par contact au sol.

### 6.4 Grind, manual, combos

- **Grind** : atterrissage descendant sur rail/curb avec chevauchement ≥ 60 % → `+20 pts / 0.1 s`.
- **Manual** (roller) : `+10 pts / 0.1 s`, délai de saut +80 ms.
- **Combo** : ×1 → ×10, vidé après **1,8 s** d'inactivité. Encaissé en fin de combo ; un crash fait tout perdre.
- **Perfect landing** : 3 dernières frames du trick → ×1.5 + étincelles.

### 6.5 Obstacles & collisions

| Famille | Exemples | Comportement |
|---|---|---|
| **Solide bas** (h ≤ 28 px) | curb, cône, borne | Ollie suffit. Dessus grindable. |
| **Solide haut** (h > 28 px) | poubelle, banc, jardinière, distributeur | Flip ou Boost obligatoires. |
| **Gap** | trou, bouche d'égout | Boost obligatoire. |
| **Rampes** | quarter pipe, kicker, funbox | Pas de crash, bonus ×1.4 sur le prochain saut. |
| **Rails / curbs** | droits, ondulés, kinked | Grindables par le dessus, crash par le côté. |
| **Décor** | poteaux, palmiers, panneaux, murs | Aucune collision. |

Swept AABB, résolution X (crash) puis Y (atterrissage/grind).

### 6.6 Scoring

```
score_run = Σ (points_trick × multiplicateur) + (distance_m × 2) + (collectibles × 100)
```

- Collectibles en arcs au-dessus des obstacles ; chunk complet → `+500 "CLEAN LINE"`.
- Bandeau flottant par trick (`OLLIE +50 ×3`), monte de 20 px, se dissout en 700 ms.

### 6.7 Vies, checkpoints, fin de run

- 3 vies par niveau, crash → 900 ms d'anim → checkpoint + 1,2 s d'invincibilité.
- Checkpoints tous les 5 chunks (panneau « SKATE AREA » comme repère).
- Endless : une seule vie, seed affichée.

---

## 7. Personnages

| | **Maxence (skate)** | **Maxence (roller)** |
|---|---|---|
| Débloqué | dès le départ | à 25 000 pts cumulés |
| Vitesse de base | ×1.00 | ×1.10 |
| Hauteur de saut | ×1.00 | ×0.92 |
| Points de trick | ×1.00 | ×0.85 |
| Spécial | **No-Comply** | **Manual** |
| Grind | ×1.0 | ×1.25 |

---

## 8. Level design : les chunks

Un **chunk** = segment de 480 px décrit en données, jamais en code. Au moins **24 chunks** : 6 par palier de difficulté, 3 « respiration », 3 « bonus ».

Sélection par bag shuffle. **Invariant de validité** : distance entre le dernier obstacle d'un chunk et le premier du suivant ≥ `speed × 0.9`, vérifié par test automatisé sur toutes les paires.

---

## 9. Niveaux

| # | Nom | Direction | Décor | Longueur | Introduit |
|---|---|---|---|---|---|
| 1 | Le parking | → | asphalte, grillage | 30 chunks | Ollie, coins |
| 2 | La rue commerçante | ← | pavés, distributeurs | 35 | Flip, obstacles hauts |
| 3 | Le chantier | → | béton fissuré, cônes | 40 | Boost, gaps |
| 4 | Le skatepark | ← | modules bois/béton | 40 | Rampes, grinds |
| 5 | Le quartier interdit | → | briques, graffitis | 45 | Tout, densité +50 % |
| 6 | La ligne parfaite | ← | mix | 50 | Finir sans crash |
| ∞ | Endless | alterne / 20 chunks | mix | ∞ | Difficulté croissante |

3 objectifs par niveau (finir / score cible / zéro crash) → 3 étoiles.

---

## 10. UI, HUD, écrans

- Palette : `#12131A`, `#F2F0E6`, `#FF5C3A`, `#4ED4C4`, `#FFC93C`.
- Typo bitmap dessinée dans le canvas, pas de webfont. Fallback `ui-monospace`.
- **Élément signature** : le HUD est peint comme un **sticker de deck** — score en autocollant de travers (−2°), bord découpé, usure. Multiplicateur en tampon qui grossit.
- Écrans : `MENU`, `SÉLECTION RIDER`, `SÉLECTION NIVEAU`, `JEU`, `PAUSE`, `GAME OVER`, `MEILLEURS SCORES`, `RÉGLAGES`.
- Textes en français. Tableau vide : « Aucun run enregistré. Fais-en un. »
- `prefers-reduced-motion` : couper shake et transitions.

---

## 11. Contrôles

Actions abstraites : `JUMP_SHORT`, `JUMP_HIGH`, `JUMP_LONG`, `CROUCH_MANUAL`, `LEAN_FWD`, `LEAN_BACK`, `PAUSE`.

**Desktop** : `Espace` (tap/maintien), `Shift+Espace`, `↓`, `←/→`, `Échap`/`P`, `R`.

**Tactile** : tap court → Ollie ; tap long ≥ 150 ms ou swipe ↑ → Flip ; double tap < 250 ms → Boost ; maintien au sol → Manual ; swipe ←/→ → Lean ; bouton pause ≥ 48 px hors safe-area ; `navigator.vibrate(12)` / `[40,30,40]`.

**Portrait vs paysage** : portrait 270×480, caméra dézoomée de 15 %, vitesse −8 %. **Classements séparés par orientation**. Zéro rechargement au changement d'orientation.

---

## 12. Persistance

Clé `maxence-rider.v1`, schéma versionné, top 10 par catégorie, écriture débouncée 500 ms, `try/catch` partout (navigation privée iOS → store mémoire + message unique), bouton « Effacer mes données ».

---

## 13. Audio

WebAudio, sons synthétisés (oscillateurs + bruit filtré), aucun fichier. `AudioContext` créé au premier geste utilisateur, suspendu hors focus.

---

## 14. Performance

Pooling, culling (viewport + 64 px), parallaxe 3 couches pré-rendues, un seul `requestAnimationFrame`, pause sur `visibilitychange`, `?debug=1` (fps, entités, hitboxes).

---

## 15. Phases de développement

| Phase | Livrable | Critère d'acceptation |
|---|---|---|
| **P0** | `tools/slice.mjs` + `atlas.json` + `assets/sprites/` | Toutes les frames découpées, transparentes, trimmées, visualisables |
| **P1** | Shell + boucle + rendu + input abstrait | Carré rouge à 60 fps, saut tap/clavier, portrait et paysage |
| **P2** | Rider animé + physique + 3 sauts | Anims correctes, courbes distinctes, coyote time et buffer |
| **P3** | Sol, chunks, obstacles, collisions, crash | Run infini, crash et respawn, invariant §8 testé |
| **P4** | Grind, manual, combos, scoring, particules | Combo ×10 atteignable |
| **P5** | Décors, parallaxe, caméra, effets | 5 ambiances distinctes |
| **P6** | Menus, HUD sticker, localStorage, scores | Fermer/rouvrir conserve tout |
| **P7** | 6 niveaux + endless + roller + étoiles | Progression complète |
| **P8** | Audio, haptique, polish, réglages | Passe la checklist §16 |

---

## 16. Definition of done

- [ ] Se lance sur `file://` **et** sur serveur statique, sans erreur console
- [ ] 60 fps stables sur mobile milieu de gamme (`?debug=1`)
- [ ] Rotation en pleine partie : aucun glitch, aucune perte d'état
- [ ] Aucune configuration infranchissable (test automatisé)
- [ ] Le rider ne traverse jamais un obstacle, même à vitesse max
- [ ] Scores persistants, échec propre en navigation privée
- [ ] Toutes les actions accessibles au tactile **et** au clavier
- [ ] Focus clavier visible sur tous les boutons
- [ ] `prefers-reduced-motion` respecté
- [ ] Zéro requête réseau après le chargement initial
- [ ] Textes en français
- [ ] `README.md` : lancer, ajouter un chunk, ajouter un rider
