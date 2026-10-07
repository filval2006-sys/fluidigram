#!/bin/zsh
# Ricompila Fluidigram e lo installa in /Applications (l'unica copia), poi lo apre. Doppio clic per usarlo.
cd "$(dirname "$0")" || exit 1
source "$HOME/.cargo/env" 2>/dev/null
APP=src-tauri/target/release/bundle/macos/Fluidigram.app
echo "Compilo Fluidigram (1-2 minuti)…"
pkill -f "Fluidigram.app/Contents/MacOS" 2>/dev/null
if npx tauri build --bundles app; then
  rm -rf /Applications/Fluidigram.app "$HOME/Applications/Fluidigram.app"
  cp -R "$APP" /Applications/
  # la copia di compilazione si toglie, altrimenti la ricerca mostrerebbe due Fluidigram
  rm -rf "$APP"
  echo "Fatto. Apro Fluidigram."
  open /Applications/Fluidigram.app
else
  echo "Compilazione non riuscita: vedi gli errori qui sopra."
  read -r "?Premi Invio per chiudere"
fi
