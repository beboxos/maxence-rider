#!/usr/bin/env bash
set -e

export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"

echo "🛹 ─── Compilation de Maxence Rider pour Android (.apk) ───"

SDK_ROOT="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
BUILD_TOOLS_DIR=$(ls -d "$SDK_ROOT/build-tools/"* 2>/dev/null | sort -V | tail -n 1)
PLATFORM_DIR=$(ls -d "$SDK_ROOT/platforms/android-"* 2>/dev/null | sort -V | tail -n 1)

if [ -z "$BUILD_TOOLS_DIR" ] || [ -z "$PLATFORM_DIR" ]; then
  echo "❌ Android SDK ou Build-Tools introuvable dans $SDK_ROOT"
  exit 1
fi

echo "✓ SDK Build-Tools : $BUILD_TOOLS_DIR"
echo "✓ Android Platform : $PLATFORM_DIR"

AAPT2="$BUILD_TOOLS_DIR/aapt2"
D8="$BUILD_TOOLS_DIR/d8"
ZIPALIGN="$BUILD_TOOLS_DIR/zipalign"
APKSIGNER="$BUILD_TOOLS_DIR/apksigner"
ANDROID_JAR="$PLATFORM_DIR/android.jar"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORK_DIR="$ROOT_DIR/android/build_tmp"
OUT_DIR="$ROOT_DIR/dist"

mkdir -p "$WORK_DIR/gen" "$WORK_DIR/obj" "$WORK_DIR/res_compiled" "$OUT_DIR"

echo "1. Synchronisation des assets du jeu..."
node "$ROOT_DIR/tools/sync_android.mjs"

cd "$ROOT_DIR/android"

echo "2. Compilation des ressources avec aapt2..."
"$AAPT2" compile --dir app/src/main/res -o "$WORK_DIR/res_compiled/resources.zip"

echo "3. Liaison des ressources et génération de R.java..."
"$AAPT2" link -o "$WORK_DIR/app-base.apk" \
  -I "$ANDROID_JAR" \
  --manifest app/src/main/AndroidManifest.xml \
  --java "$WORK_DIR/gen" \
  --min-sdk-version 26 \
  --target-sdk-version 35 \
  --version-code 1 \
  --version-name "1.0.0" \
  --auto-add-overlay \
  "$WORK_DIR/res_compiled/resources.zip"

echo "4. Compilation Java (javac)..."
javac -encoding UTF-8 -source 8 -target 8 \
  -cp "$ANDROID_JAR" \
  -d "$WORK_DIR/obj" \
  "$WORK_DIR/gen/com/maxencerider/game/R.java" \
  app/src/main/java/com/maxencerider/game/MainActivity.java

echo "5. Conversion DEX (d8)..."
"$D8" --output "$WORK_DIR" \
  --lib "$ANDROID_JAR" \
  "$WORK_DIR/obj/com/maxencerider/game"/*.class

echo "6. Intégration du DEX et des assets web dans l'APK..."
cd "$WORK_DIR"
cp "$ROOT_DIR/android/build_tmp/app-base.apk" "$WORK_DIR/app-merged.apk"
zip -uj "$WORK_DIR/app-merged.apk" "$WORK_DIR/classes.dex"

cd "$ROOT_DIR/android/app/src/main"
COPYFILE_DISABLE=1 zip -ur "$WORK_DIR/app-merged.apk" assets/www/ -x "*/.*" -x "*__MACOSX*"

echo "7. Alignement 4-octets (zipalign)..."
cd "$WORK_DIR"
"$ZIPALIGN" -f -p 4 "$WORK_DIR/app-merged.apk" "$WORK_DIR/app-aligned.apk"

echo "8. Signature de l'APK (apksigner)..."
KEYSTORE="$ROOT_DIR/android/debug.keystore"
if [ ! -f "$KEYSTORE" ]; then
  echo "Génération de la clé de signature debug..."
  keytool -genkey -v -keystore "$KEYSTORE" \
    -storepass android -alias androiddebugkey -keypass android \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Maxence Rider,O=Arcade,C=FR"
fi

"$APKSIGNER" sign --ks "$KEYSTORE" \
  --ks-pass pass:android \
  --ks-key-alias androiddebugkey \
  --key-pass pass:android \
  --out "$OUT_DIR/maxence-rider.apk" \
  "$WORK_DIR/app-aligned.apk"

# Nettoyage
rm -rf "$WORK_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 APK généré avec succès !"
echo "👉 Fichier : $OUT_DIR/maxence-rider.apk"
echo "Taille : $(du -h "$OUT_DIR/maxence-rider.apk" | cut -f1)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
