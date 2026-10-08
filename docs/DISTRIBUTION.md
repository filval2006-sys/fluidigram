# Distributing Fluidigram

Users get **a single file** and need nothing else: the app contains everything (interface, PDF fonts, data, icons) and works offline.

| System | File to download | Size | Notes |
|---|---|---|---|
| macOS 11+ (Apple Silicon and Intel) | `Fluidigram_x.y.z_macOS.pkg` | a few MB | guided installer: installs or updates the app in `/Applications` (asks the password once) and gives it to the installing user |
| Windows 10/11 (64-bit) | `Fluidigram_x.y.z_x64-setup.exe` | a few MB | guided installer, installs for the current user (no administrator rights), install folder, Start menu folder, desktop shortcut |

After installation, `.fluidigram` files open with a double click.

## Publishing a version

1. Write the bilingual release notes in `docs/releases/vX.Y.Z.md` (same content in English and Italian: new features, changes, fixes, compatibility) and update `CHANGELOG.md`. The release body is built from these notes plus `docs/release-install.md` (download and installation steps for macOS and Windows) by `scripts/release-notes.sh`; the workflow fails if the notes file is missing.
2. Then:

```bash
npm run version:set 0.4.0                      # same version in package.json, tauri.conf.json, Cargo.toml and Cargo.lock
git commit -am "Release 0.4.0"
git tag v0.4.0
git push && git push origin v0.4.0
```

GitHub Actions builds macOS (universal) and Windows (about 10–15 minutes) after running all checks. Then open **Releases**:
there is a *draft* with the installers; review it and press **Publish release**. The release link is the one to share.

To try a build without publishing: **Actions → Release → Run workflow**; the installers appear as the job's *artifacts*.

## What users see the first time

The app is not yet signed by Apple or Microsoft (official signing costs money: about $99/year for Apple and a code-signing certificate for Windows). It works the same, but the system asks for a confirmation:

- **macOS** ("Apple could not verify Fluidigram is free of malware"): open the app once and press *Done*, then *System Settings → Privacy & Security → Open Anyway*. Alternatively, before opening it, run in Terminal: `xattr -cr /Applications/Fluidigram.app`. The old "right-click → Open" is no longer enough on recent macOS.
- **Windows** ("Windows protected your PC"): *More info* → *Run anyway*.

## In-app updates

The app updates itself from **Settings → Updates**. It reads `latest.json`, which the Release workflow attaches to every release, and verifies the update with a public key embedded in the app (`plugins.updater.pubkey` in `tauri.conf.json`). This is **not** an Apple/Microsoft certificate: it is a free key pair made with `npx tauri signer generate`.

- **Private key:** kept outside the repository (for example `~/.tauri/fluidigram-updater.key`) and stored as the repository secret `TAURI_SIGNING_PRIVATE_KEY` (secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` too, empty if the key has no password). **Back it up**: if it is lost, installed apps can no longer receive updates and users have to install a new version by hand.
- **The installers keep one copy that can replace itself.** macOS: the `.pkg` installs into `/Applications` and the postinstall script gives the app to the installing user (and removes a duplicate left in `~/Applications` by 0.5.0). Windows: per user, no administrator rights. If the app is not writable by the user (for instance a standard, non-admin account on a Mac), the Settings page offers the manual download.
- Local builds (`scripts/update-local-app.command`) do not create update files.
- To change the key pair: generate a new one, update `pubkey`, the secrets, and release; apps installed with the old key must be reinstalled once.

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

- No external dependencies: the interface is embedded in the executable. The only network request is the update check (Settings → Updates), which asks the GitHub API for the latest published release; it runs once a day unless turned off, never downloads or installs anything, and sends only a standard web request.
- Windows uses the system WebView2 component, already present on Windows 11 and updated Windows 10; if missing, the installer downloads it once (internet needed).
