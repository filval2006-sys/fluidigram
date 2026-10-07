# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Two working steps, **Design** and **Operation**: the diagram is drawn first, then operating phases and valve states are described.
- Operation step: phase strip, per-phase valve states (open / closed / unspecified), click a valve in the diagram to change its state, all-phases table.
- Operating phases PDF: one page per phase with colored valve badges and a written state table, plus a summary matrix.
- Checks: optional *suggestions* (trapped volumes, size mismatches), off by default; any warning can be ignored and restored; new check for valves without a state in a phase.

### Changed
- The interface is available in **English and Italian**: it follows the system language and can be changed in Settings; the native menu follows it too.
- Unified control styling (height, radius, spacing) across toolbar, step bar and panels.
- Internal cleanup: dead code and unused exports removed, large UI files split, lint warnings fixed.
- Developer documentation moved to English (`docs/`, `CONTRIBUTING.md`).

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

[Unreleased]: https://github.com/filval2006-sys/fluidigram/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/filval2006-sys/fluidigram/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/filval2006-sys/fluidigram/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/filval2006-sys/fluidigram/releases/tag/v0.2.0
