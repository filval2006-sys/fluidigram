#!/bin/zsh
# Ricompila Fluidigram e lo reinstalla in ~/Applications, poi lo apre. Doppio clic per usarlo.
cd "$(dirname "$0")" || exit 1
source "$HOME/.cargo/env" 2>/dev/null
echo "Compilo Fluidigram (1-2 minuti)…"
pkill -f "Fluidigram.app/Contents/MacOS" 2>/dev/null
if npx tauri build --bundles app; then
  mkdir -p "$HOME/Applications"
  rm -rf "$HOME/Applications/Fluidigram.app"
  cp -R src-tauri/target/release/bundle/macos/Fluidigram.app "$HOME/Applications/"
  echo "Fatto. Apro Fluidigram."
  open "$HOME/Applications/Fluidigram.app"
else
  echo "Compilazione non riuscita: vedi gli errori qui sopra."
  read -r "?Premi Invio per chiudere"
fi
