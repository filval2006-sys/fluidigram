#!/bin/zsh
# Ricompila Fluidigram e lo installa in /Applications (l'unica copia), poi lo apre. Doppio clic per usarlo.
# Se l'app è stata installata con il .pkg per tutti gli utenti appartiene al sistema: in quel caso chiede la password del Mac.
cd "$(dirname "$0")" || exit 1
source "$HOME/.cargo/env" 2>/dev/null
APP=src-tauri/target/release/bundle/macos/Fluidigram.app
echo "Compilo Fluidigram (1-2 minuti)…"
pkill -f "Fluidigram.app/Contents/MacOS" 2>/dev/null
if npx tauri build --bundles app; then
  rm -rf "$HOME/Applications/Fluidigram.app"
  if rm -rf /Applications/Fluidigram.app 2>/dev/null && cp -R "$APP" /Applications/; then
    :
  else
    echo "Serve la password del Mac per sostituire l'app installata per tutti gli utenti."
    sudo rm -rf /Applications/Fluidigram.app && sudo cp -R "$APP" /Applications/ && sudo chown -R root:wheel /Applications/Fluidigram.app
  fi
  # la copia di compilazione si toglie, altrimenti la ricerca mostrerebbe due Fluidigram
  rm -rf "$APP"
  echo "Fatto. Apro Fluidigram."
  open /Applications/Fluidigram.app
else
  echo "Compilazione non riuscita: vedi gli errori qui sopra."
  read -r "?Premi Invio per chiudere"
fi
