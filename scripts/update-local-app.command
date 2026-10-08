#!/bin/zsh
# Rebuilds Fluidigram and installs it as the only copy in /Applications, then opens it. Double-click to use.
# If the app was installed for all users with the .pkg it belongs to the system: macOS then asks for your password.
cd "$(dirname "$0")/.." || exit 1
source "$HOME/.cargo/env" 2>/dev/null
APP=src-tauri/target/release/bundle/macos/Fluidigram.app
echo "Building Fluidigram (1-2 minutes)…"
pkill -f "Fluidigram.app/Contents/MacOS" 2>/dev/null
# local builds do not need the signed update files (they need the private update key)
if npx tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'; then
  rm -rf "$HOME/Applications/Fluidigram.app"
  if rm -rf /Applications/Fluidigram.app 2>/dev/null && cp -R "$APP" /Applications/; then
    :
  else
    echo "Your Mac password is needed to replace the app installed for all users."
    sudo rm -rf /Applications/Fluidigram.app && sudo cp -R "$APP" /Applications/ && sudo chown -R root:wheel /Applications/Fluidigram.app
  fi
  # the build copy is removed, otherwise Spotlight would list two Fluidigram apps
  rm -rf "$APP"
  echo "Done. Opening Fluidigram."
  open /Applications/Fluidigram.app
else
  echo "Build failed: see the errors above."
  read -r "?Press Enter to close"
fi
