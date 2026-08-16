# Fiche Google Play — Maxence Rider

Tout le texte et les visuels prêts à coller dans la Play Console. Champs marqués
**⚠️ à faire par toi** = étapes que je laisse volontairement de côté (voir
[README.md](../README.md) et le fil de conversation pour le pourquoi).

## Identité

- **Nom de l'application** : Maxence Rider
- **Nom du package** : `com.maxencerider.game`
- **Catégorie** : Jeux > Arcade
- **Contact développeur** : depanet@gmail.com

## Description courte (max 80 caractères)

```
Jeu d'arcade skate & roller pixel art. Gratuit, sans pub, 100% hors-ligne.
```
(74 caractères)

## Description longue (max 4000 caractères)

```
Enfile ton skate ou tes rollers et fonce dans les rues de nuit de Maxence
Rider, un jeu d'arcade 2D en pixel art pensé pour des parties rapides et
nerveuses.

🛹 DEUX STYLES DE GLISSE
Commence au skate, débloque le roller en cumulant des points. Chaque rider a
ses propres sensations, sa figure spéciale et son style d'animation.

🎮 DES TRICKS QUI S'ENCHAÎNENT
Ollie, flip, manual, grinds sur rail : enchaîne les figures pour faire monter
ton combo et grappiller un maximum de points avant la prochaine chute.

🌃 UNE VILLE QUI NE S'ARRÊTE JAMAIS
Avenue commerçante, skatepark, ruelles animées : le décor change de thème au
fil de la partie, avec parallaxe sur trois couches et ambiance sonore propre
à chaque zone.

🏆 PROGRESSION & SCORES
Ton meilleur score, ta progression et le rider débloqué sont sauvegardés sur
ton appareil — reviens quand tu veux, tout est là où tu l'as laissé.

⚡ PENSÉ POUR ÊTRE ACCESSIBLE
Contrôles tactiles ou clavier, retour haptique optionnel, réglages son/
musique séparés, navigation 100 % clavier. Aucune publicité, aucun achat
intégré, aucune connexion internet requise après le premier lancement.

Un seul bouton pour foncer : COMMENCER LA PARTIE.
```

## Visuels

Tous les fichiers sont dans [`dist/store/`](../dist/store/) :

| Fichier | Usage | Format |
|---|---|---|
| `dist/store/01_titre.png` | Capture d'écran 1 | 1920×1080 |
| `dist/store/02_gameplay.png` | Capture d'écran 2 | 1920×1080 |
| `dist/store/03_gameplay2.png` | Capture d'écran 3 | 1920×1080 |
| `dist/store/feature_graphic.jpg` | Image de présentation | 1024×500 |
| `assets/icon-512.png` | Icône de l'application | 512×512, RGBA |

Google Play demande au moins 2 captures d'écran téléphone — les 3 fournies
suffisent. Rajouter d'autres captures (écran Scores, écran Réglages, un crash
avec le bandeau combo, etc.) reste possible via le même procédé : lancer
`python3 -m http.server 8000`, jouer dans un navigateur, extraire
`document.getElementById('jeu').toDataURL('image/png')`.

## Politique de confidentialité

**URL à coller dans la Play Console : https://beboxos.github.io/maxence-rider-privacy/**

Contenu source : [`privacy.html`](../privacy.html) à la racine du dépôt,
publié tel quel sur un dépôt GitHub Pages dédié (`beboxos/maxence-rider-privacy`) pour
avoir une URL publique stable, séparée du code source du jeu.

Résumé : aucune collecte de données, tout reste en `localStorage` sur
l'appareil, pas de tracker, pas de pub, vibration optionnelle uniquement.

## ⚠️ À faire par toi

- **Questionnaire de classification de contenu** (violence, langage, etc.)
  dans la Play Console — lié à ton compte développeur, à remplir toi-même.
- **Créer la fiche d'application** dans la Play Console (Créer une
  application → coller les champs ci-dessus → uploader les visuels).
- **Uploader le bundle signé** : [`dist/app-release.aab`](../dist/app-release.aab)
  dans Production (ou d'abord en test interne, recommandé pour une première
  publication).
- **Clic final « Envoyer pour validation »** : je m'arrête juste avant, comme
  convenu — c'est le geste irréversible qui déclenche la revue Google.

## Notes techniques pour un futur rebuild

- Le volume `T7` (exFAT) recrée des fichiers `._*` AppleDouble à chaque
  copie de ressources par Gradle, ce qui fait planter
  `parseReleaseLocalResources`. Pour rebuilder : copier `android/` vers un
  répertoire sur le volume système (APFS, ex. via `rsync` avec
  `COPYFILE_DISABLE=1`), lancer `gradle bundleRelease --no-daemon` là-bas,
  puis rapatrier `app/build/outputs/bundle/release/app-release.aab`.
- `android/keystore.properties` → `storeFile` doit être relatif à `android/`
  (racine du projet Gradle), pas à `android/app/` : `keystore/nom.keystore`,
  pas `../keystore/nom.keystore`.
- Le mot de passe de la clé de signature release n'est **pas** dans ce
  fichier ni dans le repo (voir `.gitignore`) — à récupérer là où tu l'as
  sauvegardé après la première génération.
