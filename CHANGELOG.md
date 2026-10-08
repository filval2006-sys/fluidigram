# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.5.1] - 2026-10-08

### Fixed
- **macOS installer replaces the existing app** instead of creating a second copy: it always installs into `/Applications` (asking for the password once), and removes the duplicate that 0.5.0 could leave in `~/Applications`.
- The app is given to the installing user, so *Update now* can replace it without a password.

## [0.5.0] - 2026-10-08

### Added
- **In-app updates.** Settings → Updates checks for a newer version (manually, and automatically once a day unless turned off); a red dot on the Settings button shows when one is out. *Update now* downloads, verifies the signature, installs and restarts the app. The updates are signed with a project key (not an Apple/Microsoft certificate).
- A *What's new* button opens the release notes of the new version.

### Changed
- **Installers install for the current user only** (macOS `~/Applications`, Windows per user, no administrator rights) so the app can replace itself. An app installed for all users falls back to a manual download.
- The update check is the only network request the app makes; it is described in Settings and the README.

## [0.4.0] - 2026-10-07

### Added
- **Two work steps, Design and Operation.** A steps bar switches between drawing the diagram (with the bill of materials) and describing its operating phases; each step has its own Export.
- **Operation step:** phase strip, per-phase valve states (open / closed / unspecified) set with buttons or by clicking the valve in the diagram, *All closed* / *All open* / *Clear*, rename / reorder / delete phases, a typical hybrid-rocket phase set, and a table of all phases.
- **Operating phases PDF:** one page per phase with colored valve badges, faded unsupplied lines, a phase timeline and a written state table, plus a summary matrix. PDF, SVG and PNG, Italian or English, color or black and white.
- **Interface in English and Italian**, following the system language and changeable in Settings → Language; the native menu follows it.
- New check: valves without a state in a phase.
- Windows: own document icon for `.fluidigram` files.

### Changed
- The Checks panel shows only real problems; optional *suggestions* (trapped volumes, size mismatches, lines without a size) are off by default.
- Any warning can be ignored and restored; the choice is saved in the project file.
- Phases moved from a side panel to their own step.
- Unified control styling (height, radius, spacing) across toolbar, step bar and panels.
- Internal: English code base and documentation, dead code removed, large UI files split, lint in CI, Dependabot, issue and pull-request templates.

### Fixed
- Wrongly reported "trapped volume" warnings no longer appear by default.
- `npm run version:set` now updates `Cargo.lock` too.

## [0.3.0] - 2026-10-07

### Added
- Home page with recent files, unsaved-work recovery and a pinned Home tab.
- Document icon for `.fluidigram` files (macOS and Windows).
- Guided installers: macOS `.pkg` and Windows setup wizard.

### Changed
- The `.fluidigram` type is declared as plain data, so Finder shows the icon instead of a text preview.
- macOS releases ship only the `.pkg`.

## [0.2.1] - 2026-10-07
### Changed
- Installer wizards, first-launch instructions and release notes in English and Italian.

## [0.2.0] - 2026-10-07
### Added
- Editable, grouped bill of materials (also in the PDF), sensors mounted on vessels and chamber, declared open port ends, quick valve replacement, native menu bar, autosave of text fields, footer credit and About dialog.

## [0.1.0] - 2026-10-01
### Added
- First version: editor, symbol library, automatic routing, checks, valve states per phase, PDF/SVG/PNG export, IT/EN drawings.

[Unreleased]: https://github.com/filval2006-sys/fluidigram/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/filval2006-sys/fluidigram/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/filval2006-sys/fluidigram/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/filval2006-sys/fluidigram/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/filval2006-sys/fluidigram/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/filval2006-sys/fluidigram/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/filval2006-sys/fluidigram/releases/tag/v0.2.0
