# Guide d'Installation Android — Maxence Rider 🛹

Vous pouvez installer **Maxence Rider** sur votre smartphone Android de **deux façons** :

---

## 📱 Méthode 1 : Installation PWA (Recommandée — 1 clic, sans rien compiler)

Le jeu est configuré en **Progressive Web App (PWA)** avec support 100 % hors-ligne (Service Worker) et icônes d'application natives :

1. **Accédez au jeu** depuis le navigateur de votre smartphone Android (Chrome, Brave, Firefox, Edge, etc.) :
   - Si vous êtes sur le même réseau Wi-Fi local : tapez l'adresse IP locale de votre machine (ex: `http://192.168.1.XX:8000`).
   - Ou via votre déploiement web (Vercel, GitHub Pages, Netlify, Cloudflare Pages...).
2. **Installez l'application** :
   - Dans le menu du navigateur (les 3 points `⋮` en haut à droite), appuyez sur **« Installer l'application »** ou **« Ajouter à l'écran d'accueil »**.
3. **Profitez du jeu** :
   - L'icône pixel-art **Maxence Rider** s'ajoute sur votre écran d'accueil d'applications.
   - Le jeu se lance en **vrai plein écran immersif** (sans barre d'adresse de navigateur), à 60 FPS constants avec son Web Audio et fonctionne même **hors-ligne / mode avion**.

---

## 📦 Méthode 2 : Compilation d'un fichier `.apk` autonome

Le projet Android autonome est prêt dans le dossier [`android/`](file:///Volumes/T7/workspace/maxence-rider/android/) :

### Option A : Via Android Studio
1. Lancez **Android Studio**.
2. Cliquez sur **Open** et sélectionnez le dossier `android/` du projet.
3. Allez dans le menu **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
4. L'APK généré se trouvera dans `android/app/build/outputs/apk/debug/app-debug.apk`.
5. Transférez-le sur votre téléphone et touchez le fichier pour l'installer.

### Option B : En ligne de commande (Terminal)
```bash
# 1. Synchroniser les derniers assets web dans le projet Android
node tools/sync_android.mjs

# 2. Compiler l'APK
cd android
./gradlew assembleDebug
```
