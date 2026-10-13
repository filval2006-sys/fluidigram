# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.5.2] - 2026-10-13

### Changed
- **Thicker, size-aware lines.** Pipes were too thin, especially in PDF exports. Lines are now thicker overall and their stroke grows with the pipe size (e.g. Ø2 mm thinner than Ø12 mm), so different pipe sizes can be told apart. Electrical signals stay thin.
- **Pipe labels no longer sit on the lines.** The fluid/size text keeps clear of the pipe stroke whatever its thickness; when the full text does not fit on a short segment, only the size is shown.
- **Readable exports.** Texts on the drawing (tags, pipe labels, sheet-continuation arrows) are enlarged when the drawing is shrunk to fit the sheet, so on paper they stay legible (tags 3 mm and pipe labels 2.4 mm when the drawing fits at full size; up to 2.2× larger when it is shrunk). Labels are placed so they never overlap each other, lines or symbols: tags try more positions around their component, and a pipe label that finds no free spot is left out. Legend, bill of materials, valve-state tables, title block and revision table use larger text and roomier rows. The automatic layout now fits a schematic on one sheet down to a smaller scale (A4 30%, A3 40%, A2 50%; was 60% for all), because the enlarged texts stay legible; only larger drawings are split. The legend column is narrower on small sheets.

## [0.5.1] - 2026-10-08

### Changed
- The macOS installer text now says that the app is visible to every user of the Mac while projects and settings stay in each user's account.
- Maintenance release, also used to test the in-app update from 0.5.0.

## [0.5.0] - 2026-10-08

### Added
- **In-app updates.** Settings → Updates checks for a newer version (manually, and automatically once a day unless turned off); a red dot on the Settings button shows when one is out. *Update now* downloads, verifies the signature, installs and restarts the app. The updates are signed with a project key (not an Apple/Microsoft certificate).
- A *What's new* button opens the release notes of the new version.

### Changed
- **Installers keep a single copy that can replace itself.** macOS: always `/Applications` (password asked once), replaces the previous version, hands the app to the installing user and removes a duplicate left in `~/Applications`. Windows: per user (no administrator rights); it warns if an older copy installed for all users exists and says how to remove it.
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

[Unreleased]: https://github.com/filval2006-sys/fluidigram/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/filval2006-sys/fluidigram/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/filval2006-sys/fluidigram/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/filval2006-sys/fluidigram/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/filval2006-sys/fluidigram/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/filval2006-sys/fluidigram/releases/tag/v0.2.0
