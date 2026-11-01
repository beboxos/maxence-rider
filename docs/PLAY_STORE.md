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

## État de la Play Console (17/08/2026)

L'application existe dans la Play Console : **Maxence Rider**, package
`com.maxencerider.game`, App ID `4973015503917926705`
(https://play.google.com/console/u/0/developers/5779025965760802751/app/4973015503917926705/app-dashboard).

8 des 11 tâches de configuration sont faites (règles de confidentialité,
informations de connexion, annonces, identifiant publicitaire, applis
gouvernementales, fonctionnalités financières, applis de santé, catégorie +
coordonnées, fiche Play Store complète avec descriptions/captures/icône/image
de présentation). Il reste 3 tâches, toutes chaînées à la même étape :

## ⚠️ À faire par toi

- **Questionnaire de classification de contenu** — Play Console → Contenu de
  l'application → Classification du contenu. Lié à ton compte développeur, à
  remplir toi-même. Débloque automatiquement les deux tâches suivantes :
  - **Cible et contenu** : tranche d'âge visée. Les tranches « 5 ans et moins »,
    « 6-8 » et « 9-12 » ne sont sélectionnables qu'une fois la classification
    du contenu envoyée.
  - **Sécurité des données** : le brouillon est déjà prêt (« Aucune collecte
    de données déclarée », politique de confidentialité liée) — il ne
    manque que la tranche d'âge pour pouvoir l'envoyer définitivement.
- **Tests internes/fermés** : Google exige, pour un nouveau compte développeur,
  un test fermé avec **au moins 12 testeurs pendant 14 jours consécutifs**
  avant de débloquer l'accès en production (visible dans « Tester et publier »
  → Production → « Demander à publier en production », actuellement grisé).
  Prévois d'y penser tôt, ce délai ne se rattrape pas.
- **Uploader le bundle signé** : [`dist/app-release.aab`](../dist/app-release.aab)
  dans un canal de test (interne ou fermé) une fois la classification faite.
- **Clic final « Envoyer pour validation »** : je m'arrête juste avant, comme
  convenu — c'est le geste irréversible qui déclenche la revue Google.

## Notes techniques pour un futur rebuild

- **24/10/2026 — build sans Gradle sous Windows** : `powershell -File tools\build_aab_windows.ps1`
  (aapt2 proto → javac → d8 → bundletool → jarsigner, outils sur `E:\workspace\android-tools`).
  Version, SDK et identifiant sont lus dans `android/app/build.gradle` ; sortie `dist/app-release.aab`.
  Gradle ne démarrait pas sur ce PC (« Unable to establish loopback connection »). Le bundle produit passe
  `bundletool validate`, cible l'API 36 et est signé avec la clé de `android/keystore/`.
  Tests du jeu sous Windows : `node tools/test.mjs` (chemins corrigés en URL `file://`, 224 contrôles).
- **24/10/2026 — version 1.0.4 (code 5)** : correctifs rampes/caméra du 17/08 + décor Halloween léger
  (`src/game/saison.js`, du 27/10 au 04/11 à l'heure de Paris ; aperçu avec `?theme=halloween`).
- **01/11/2026 — version 1.0.5 (code 6)** : décors en sprites (skatepark, chantier, cyber), obstacles/rails/rampes/bonus/trous
  en sprites, hit-stop + flash + éclats, saut tardif au bord d'un gap et corner correction. `dist/app-release.aab` reconstruit
  par `toolsuild_aab_windows.ps1`, **envoyé le 01/11/2026 dans « Tests fermés - Alpha »** (release 6, déploiement complet) et
  mis en examen par Google. Un APK local ne s'installe pas par-dessus la version du Play Store (signature différente) :
  la mise à jour passe par le Store.

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
- **17/08/2026 — mise à jour API 36 (Android 16)** : Google Play exige de
  cibler l'API 36 avant le 31/08/2026 sous peine de blocage des mises à
  jour. `android/build.gradle` (AGP `8.2.0` → `9.3.1`) et
  `android/app/build.gradle` (`compileSdk`/`targetSdk` `35` → `36`,
  `versionCode` `1` → `2`, `versionName` `1.0.0` → `1.0.1`) mis à jour.
  Platform 36 + build-tools 36.1.0 installés dans le SDK local via
  `sdkmanager` (téléchargé depuis `dl.google.com`, le SDK n'avait ni
  cmdline-tools ni platform 36 pré-installés).
  AGP 9+ interdit la balise `<uses-sdk>` dans `AndroidManifest.xml` (doit
  être piloté uniquement par `build.gradle`) — retirée, ainsi que
  l'attribut `package=` redondant avec `namespace` (warning AGP).
  `jarsigner -verify` sur un `.aab` récent affiche des avertissements
  bénins « signed in JarFile but not in JarInputStream » sur les entrées
  Kotlin — normal pour ce format de signature, pas un vrai problème tant
  qu'aucune entrée n'est signalée non signée et que le résumé reste positif.
