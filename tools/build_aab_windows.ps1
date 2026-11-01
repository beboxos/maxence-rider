# Construit le bundle Play Store signé (.aab) SANS Gradle, avec les outils du SDK Android.
#
#   powershell -ExecutionPolicy Bypass -File tools\build_aab_windows.ps1
#
# Pourquoi : Gradle ne démarre pas partout (socket local bloqué), et le build d'origine était fait sur Mac.
# Ce script refait la même chose pour cette appli (une activité Java, des ressources, le jeu dans assets/) :
#   aapt2 (format proto) -> javac -> d8 -> bundletool -> jarsigner.
# Version, SDK min/cible et identifiant sont lus dans android/app/build.gradle (source unique).
# Le résultat est dans dist/app-release.aab. Rien n'est envoyé à Google.
param(
    [string]$Sdk = 'E:\workspace\android-tools\android-sdk',
    [string]$Jdk = 'E:\workspace\android-tools\jdk17',
    [string]$Bundletool = 'E:\workspace\android-tools\bundletool\bundletool-all-1.18.3.jar',
    [string]$BuildTools = '36.0.0',
    [string]$Platform = 'android-36'
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$android = Join-Path $root 'android'
$src = Join-Path $android 'app\src\main'
$work = Join-Path $android 'build_aab'
$bt = Join-Path $Sdk "build-tools\$BuildTools"
$androidJar = Join-Path $Sdk "platforms\$Platform\android.jar"
$java = Join-Path $Jdk 'bin\java.exe'
$javac = Join-Path $Jdk 'bin\javac.exe'
$jarsigner = Join-Path $Jdk 'bin\jarsigner.exe'
foreach ($p in @($bt, $androidJar, $java, $javac, $jarsigner, $Bundletool)) {
    if (-not (Test-Path $p)) { throw "Introuvable : $p" }
}
$env:JAVA_HOME = $Jdk

# --- Paramètres de l'appli, lus dans build.gradle
$gradle = Get-Content -Raw (Join-Path $android 'app\build.gradle')
function Grab($pattern) { $m = [regex]::Match($gradle, $pattern); if (-not $m.Success) { throw "Valeur introuvable dans build.gradle : $pattern" }; $m.Groups[1].Value }
$appId = Grab 'applicationId\s+"([^"]+)"'
$minSdk = Grab 'minSdk\s+(\d+)'
$targetSdk = Grab 'targetSdk\s+(\d+)'
$versionCode = Grab 'versionCode\s+(\d+)'
$versionName = Grab 'versionName\s+"([^"]+)"'
Write-Host "Appli $appId  version $versionName (code $versionCode)  min $minSdk  cible $targetSdk"
if ([int]$targetSdk -lt 36) { throw "targetSdk $targetSdk : Google Play exige 36 (Android 16) ou plus" }

# --- Signature : keystore.properties (local, jamais commité)
$props = @{}
Get-Content (Join-Path $android 'keystore.properties') | ForEach-Object { if ($_ -match '^\s*([^#=]+)=(.*)$') { $props[$matches[1].Trim()] = $matches[2].Trim() } }
$keystore = Join-Path $android $props['storeFile']
if (-not (Test-Path $keystore)) { throw "Keystore introuvable : $keystore" }

# --- Dossier de travail propre (les fichiers ._* AppleDouble venus du Mac sont ignorés)
if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Force "$work\res", "$work\gen", "$work\classes", "$work\dex", "$work\base" | Out-Null
Get-ChildItem $src -Recurse -File | Where-Object { $_.Name -notlike '._*' -and $_.FullName -notlike "*\assets\*" -and $_.FullName -like "*\res\*" } | ForEach-Object {
    $rel = $_.FullName.Substring("$src\res\".Length)
    $dest = Join-Path "$work\res" $rel
    New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
    Copy-Item $_.FullName $dest
}

# --- 1. Manifeste final (ce que fait Gradle : package, versions et SDK injectés)
$manifest = Get-Content -Raw (Join-Path $src 'AndroidManifest.xml')
$manifest = $manifest -replace '<manifest ', "<manifest package=`"$appId`" android:versionCode=`"$versionCode`" android:versionName=`"$versionName`" "
$manifest = $manifest -replace '(<manifest[^>]*>)', "`$1`n    <uses-sdk android:minSdkVersion=`"$minSdk`" android:targetSdkVersion=`"$targetSdk`" />"
[IO.File]::WriteAllText("$work\AndroidManifest.xml", $manifest, (New-Object Text.UTF8Encoding($false)))

# --- 2. Ressources (aapt2, format proto exigé par les bundles)
& "$bt\aapt2.exe" compile --dir "$work\res" -o "$work\res.zip"
if ($LASTEXITCODE) { throw 'aapt2 compile a échoué' }
& "$bt\aapt2.exe" link --proto-format --auto-add-overlay --min-sdk-version $minSdk --target-sdk-version $targetSdk `
    --version-code $versionCode --version-name $versionName -I $androidJar --manifest "$work\AndroidManifest.xml" `
    -R "$work\res.zip" --java "$work\gen" -o "$work\base.apk"
if ($LASTEXITCODE) { throw 'aapt2 link a échoué' }

# --- 3. Code Java -> dex
$javaFiles = @(Get-ChildItem "$src\java" -Recurse -Filter *.java | Where-Object { $_.Name -notlike '._*' } | ForEach-Object FullName)
$javaFiles += @(Get-ChildItem "$work\gen" -Recurse -Filter *.java | ForEach-Object FullName)
& $javac -source 8 -target 8 -Xlint:-options -classpath $androidJar -d "$work\classes" $javaFiles
if ($LASTEXITCODE) { throw 'javac a échoué' }
$classFiles = @(Get-ChildItem "$work\classes" -Recurse -Filter *.class | ForEach-Object FullName)
& "$bt\d8.bat" --release --min-api $minSdk --lib $androidJar --output "$work\dex" @classFiles
if ($LASTEXITCODE) { throw 'd8 a échoué' }

# --- 4. Module « base » : manifeste, ressources proto, dex, assets
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zipPath = "$work\base.zip"
$apk = [IO.Compression.ZipFile]::OpenRead("$work\base.apk")
$out = [IO.Compression.ZipFile]::Open($zipPath, 'Create')
function AddFile($zip, $entry, $path) { [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $path, $entry, 'Optimal') }
foreach ($e in $apk.Entries) {
    if ($e.FullName.EndsWith('/')) { continue }
    $name = if ($e.FullName -eq 'AndroidManifest.xml') { 'manifest/AndroidManifest.xml' } else { $e.FullName }
    $tmp = Join-Path $work 'entry.tmp'
    [IO.Compression.ZipFileExtensions]::ExtractToFile($e, $tmp, $true)
    AddFile $out $name $tmp
}
$apk.Dispose()
AddFile $out 'dex/classes.dex' "$work\dex\classes.dex"
$assets = Join-Path $src 'assets'
Get-ChildItem $assets -Recurse -File | Where-Object { $_.Name -notlike '._*' } | ForEach-Object {
    $rel = $_.FullName.Substring($assets.Length + 1).Replace('\', '/')
    AddFile $out "assets/$rel" $_.FullName
}
$out.Dispose()

# --- 5. Bundle puis signature
$aab = Join-Path $root 'dist\app-release.aab'
if (Test-Path $aab) { Remove-Item -Force $aab }
& $java -jar $Bundletool build-bundle --modules=$zipPath --output=$aab
if ($LASTEXITCODE) { throw 'bundletool a échoué' }
& $jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore $keystore -storepass $props['storePassword'] -keypass $props['keyPassword'] $aab $props['keyAlias']
if ($LASTEXITCODE) { throw 'jarsigner a échoué' }
$verif = (& $jarsigner -verify $aab) -join "`n"
if ($verif -notmatch 'jar verified') { throw "Signature non vérifiée : $verif" }
Write-Host 'Signature vérifiée (jarsigner).'
$global:LASTEXITCODE = 0
Remove-Item -Recurse -Force $work
$f = Get-Item $aab
Write-Host ("Bundle prêt : {0} ({1:N0} Ko), version {2} (code {3})" -f $f.FullName, ($f.Length / 1KB), $versionName, $versionCode)
