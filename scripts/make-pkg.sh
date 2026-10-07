#!/bin/bash
# Crea l'installer guidato di macOS (.pkg) a partire da Fluidigram.app.
# Uso: scripts/make-pkg.sh <percorso/Fluidigram.app> <versione> <file-di-uscita.pkg>
set -euo pipefail
APP="$1"; VERSION="$2"; OUT="$3"
HERE="$(cd "$(dirname "$0")" && pwd)"
export COPYFILE_DISABLE=1
xattr -cr "$HERE/pkg" 2>/dev/null || true
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
ID="it.fluidigram.app"

mkdir -p "$WORK/root/Applications"
cp -R "$APP" "$WORK/root/Applications/Fluidigram.app"

# componente: non «rilocabile», altrimenti l'installer aggiornerebbe una copia dell'app trovata altrove
pkgbuild --analyze --root "$WORK/root" "$WORK/components.plist" >/dev/null
for key in BundleIsRelocatable BundleIsVersionChecked; do
  /usr/libexec/PlistBuddy -c "Set :0:$key false" "$WORK/components.plist" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :0:$key bool false" "$WORK/components.plist"
done
pkgbuild --root "$WORK/root" --component-plist "$WORK/components.plist" --identifier "$ID" --version "$VERSION" \
  --install-location / --scripts "$HERE/pkg/scripts" "$WORK/component.pkg" >/dev/null

cat > "$WORK/distribution.xml" <<XML
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
  <title>Fluidigram</title>
  <welcome file="welcome.html" mime-type="text/html"/>
  <conclusion file="conclusion.html" mime-type="text/html"/>
  <options customize="never" require-scripts="false" hostArchitectures="arm64,x86_64"/>
  <!-- tipo di installazione: per tutti gli utenti, solo per me (~/Applications) o su un altro disco -->
  <domains enable_anywhere="true" enable_currentUserHome="true" enable_localSystem="true"/>
  <choices-outline><line choice="default"><line choice="$ID"/></line></choices-outline>
  <choice id="default"/>
  <choice id="$ID" visible="false"><pkg-ref id="$ID"/></choice>
  <pkg-ref id="$ID" version="$VERSION" onConclusion="none">component.pkg</pkg-ref>
</installer-gui-script>
XML

productbuild --distribution "$WORK/distribution.xml" --resources "$HERE/pkg/resources" --package-path "$WORK" "$OUT" >/dev/null
echo "creato $OUT"
