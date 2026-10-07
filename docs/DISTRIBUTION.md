# Distributing Fluidigram

Users get **a single file** and need nothing else: the app contains everything (interface, PDF fonts, data, icons) and works offline.

| System | File to download | Size | Notes |
|---|---|---|---|
| macOS 11+ (Apple Silicon and Intel) | `Fluidigram_x.y.z_macOS.pkg` | a few MB | guided installer (for everyone, only you, or another disk) |
| Windows 10/11 (64-bit) | `Fluidigram_x.y.z_x64-setup.exe` | a few MB | guided installer: for you or for everyone, install folder, Start menu folder, desktop shortcut |

After installation, `.fluidigram` files open with a double click.

## Publishing a version

1. Write the bilingual release notes in `docs/releases/vX.Y.Z.md` (same content in English and Italian: new features, changes, fixes, compatibility) and update `CHANGELOG.md`. The release body is built from these notes plus `docs/release-install.md` (download and installation steps for macOS and Windows) by `scripts/release-notes.sh`; the workflow fails if the notes file is missing.
2. Then:

```bash
npm run version:set 0.4.1                      # same version in package.json, tauri.conf.json, Cargo.toml and Cargo.lock
git commit -am "Release 0.4.1"
git tag v0.4.1
git push && git push origin v0.4.1
```

GitHub Actions builds macOS (universal) and Windows (about 10–15 minutes) after running all checks. Then open **Releases**:
there is a *draft* with the installers; review it and press **Publish release**. The release link is the one to share.

To try a build without publishing: **Actions → Release → Run workflow**; the installers appear as the job's *artifacts*.

## What users see the first time

The app is not yet signed by Apple or Microsoft (official signing costs money: about $99/year for Apple and a code-signing certificate for Windows). It works the same, but the system asks for a confirmation:

- **macOS** ("Apple could not verify Fluidigram is free of malware"): open the app once and press *Done*, then *System Settings → Privacy & Security → Open Anyway*. Alternatively, before opening it, run in Terminal: `xattr -cr /Applications/Fluidigram.app`. The old "right-click → Open" is no longer enough on recent macOS.
- **Windows** ("Windows protected your PC"): *More info* → *Run anyway*.

## Code signing (optional, later)

- **macOS**: with an Apple Developer account add the repository secrets `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` and uncomment the matching lines in `.github/workflows/release.yml`: the app is signed and notarized and the warning disappears.
- **Windows**: a code-signing certificate is needed (see the [Tauri guide](https://tauri.app/distribute/sign/windows/)). Open source projects can apply for free signing from [SignPath Foundation](https://signpath.org/terms) (requires an OSI-approved license).

## Building locally (macOS only, for your own architecture)

```bash
npx tauri build          # src-tauri/target/release/bundle/macos/Fluidigram.app
```

`scripts/update-local-app.command` does the same and installs the app in `/Applications`.

## Changing the icons

Edit `scripts/icon.svg` and run `npm run icon` to regenerate all app icons (macOS, Windows, PNG). `npm run file-icon` regenerates the `.fluidigram` document icon and `npm run installer-art` the installer artwork.

## What the app contains

- No external dependencies: the interface is embedded in the executable and makes no network requests.
- Windows uses the system WebView2 component, already present on Windows 11 and updated Windows 10; if missing, the installer downloads it once (internet needed).
