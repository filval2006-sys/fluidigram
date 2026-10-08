# Fluidigram

**Fluid system (P&ID) diagrams for model rocketry** — draw valves, tanks, sensors and lines, check the schematic, and export
professional drawings (title block, legend, bill of materials, automatic multi-sheet layout) as PDF, SVG or PNG, in Italian or English.
Works fully offline; your projects stay on your computer. The only network request is the optional check for a new version (see below).

*Schemi fluidici (P&ID) per il razzomodellismo: valvole, serbatoi, strumenti e collegamenti, controlli sullo schema ed esportazione
professionale (cartiglio, legenda, distinta, più fogli) in PDF, SVG e PNG, in italiano e inglese. Funziona offline.*

Created by **Filippo Valentini**. Free to use; see [LICENSE](LICENSE).

## Download

Get the latest installer from the **[Releases page](../../releases/latest)**:

| System | File |
|---|---|
| macOS 11+ (Apple Silicon and Intel) | `Fluidigram_x.y.z_macOS.pkg` — guided installer (choose for everyone, only you, or another disk) |
| Windows 10/11 (64-bit) | `Fluidigram_x.y.z_x64-setup.exe` — guided installer: for you or for everyone, install folder, Start menu folder, desktop shortcut |

The app is not code-signed or notarized by Apple/Microsoft yet (that costs money), so the first time your system warns you. It is safe to continue:
- **macOS** ("Apple could not verify Fluidigram is free of malware"): drag the app to Applications, open it once and press *Done*, then go to **System Settings → Privacy & Security**, scroll to *Security* and press **Open Anyway**. Or, before opening it, run this in Terminal: `xattr -cr /Applications/Fluidigram.app`
- **Windows** ("Windows protected your PC"): *More info* → *Run anyway*.

Questa è l'avviso normale per un'app non firmata, non indica un virus. Su Mac: Impostazioni di Sistema → Privacy e sicurezza → **Apri comunque**.

The interface is available in English and Italian (it follows your system language; you can change it in Settings). Exported drawings can be in Italian or English, independently.

## Updates and privacy

In **Settings → Updates** you can check whether a newer version is available, and the app does it by itself once a day (you can turn that off). A red dot on the Settings button tells you when a new version is out. The check asks `github.com` for the latest published release: only a standard web request (your IP address and the app name) leaves your computer. The app never downloads or installs anything by itself: you download the new installer and install it over the old one.

## About

Desktop app (macOS and Windows, built with [Tauri](https://tauri.app/)) for drawing **fluid diagrams** in P&ID style, made for model rocketry:
symbols and lines, checks on the schematic, valve states per operating phase, and professional export
(PDF/SVG/PNG with title block, legend, bill of materials and automatic multi-sheet layout, in Italian and English).
The interface is available in English and Italian and follows the system language (changeable in Settings).

The app **draws fluid diagrams and nothing else**. Everything else is an optional module, off by default.

*Italiano: app desktop per disegnare schemi fluidici in stile P&ID, con controlli sullo schema, stati delle valvole per fase di funzionamento ed esportazione professionale in PDF, SVG e PNG.*

## Project structure

```
src/
  core/      diagram model, symbols, routing, checks, layout and export (pure, no React)
  state/     app state: project tabs, undo/redo, session and settings
  ui/        editor: canvas, library, inspector, steps, export, settings
  modules/   OPTIONAL MODULES, independent from the diagram
    calc/      calculators: N₂O injector (SPI/HEM/Dyer), gas orifices, pressure drop, Cv
  platform/  desktop integration (files, menu, exporters)
  App.tsx    the only place that knows about the modules
src-tauri/   native shell (Rust): file association, native menu, installers
docs/        distribution and release notes for maintainers
scripts/     icon, installer art, version and packaging scripts
```

Dependency rule: `core ← state ← ui ← App`. Modules may use `core`, `state` and `ui`, but **nothing depends on them except `App.tsx`**.
`src/architecture.test.ts` checks it on every run. Without the `modules` folder the diagram works the same: modules are
switched on in Settings, load only when needed and never change `.fluidigram` files.

## Development

Requirements: Node.js 22 (see `.nvmrc`) and, for the native app, [Rust](https://rustup.rs/) and the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

| Command | What it does |
|---|---|
| `npm ci` | install dependencies |
| `npm run dev` | browser only, at http://localhost:5173 |
| `npm run tauri dev` | native app in development |
| `npm test` | tests (model, routing, export, checks, architecture) |
| `npx tsc -b` | type check (the root `tsc --noEmit` checks nothing: it uses project references) |
| `npm run lint` | lint |
| `npm run tauri build` | installable app (`src-tauri/target/release/bundle`) |

On macOS, `scripts/update-local-app.command` rebuilds and reinstalls the app in `/Applications` with a double click.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, [CHANGELOG.md](CHANGELOG.md) for release notes and
[docs/DISTRIBUTION.md](docs/DISTRIBUTION.md) for building and publishing the installers.
