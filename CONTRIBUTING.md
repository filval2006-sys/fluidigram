# Contributing

Thanks for your interest in Fluidigram. By contributing you agree that your contribution may be distributed under the project's [LICENSE](LICENSE).

## Setup

```bash
nvm use            # Node.js 22, see .nvmrc
npm ci
npm run dev        # browser
npm run tauri dev  # native app (needs Rust)
```

## Before opening a pull request

```bash
npx tsc -b         # types
npm run lint
npm test
```

CI runs the same checks on every push and pull request.

## Conventions

- **Language:** code, comments, tests, commit messages and documentation are in English. The app interface is currently Italian; exported drawings are available in Italian and English (every user-visible string in a drawing is an `{ it, en }` pair).
- **Architecture:** `core ← state ← ui ← App`. `core` is pure (no React, no browser APIs); optional modules live in `src/modules` and are imported only by `src/App.tsx`. `src/architecture.test.ts` enforces this.
- **Documents:** `.fluidigram` files are versioned JSON validated with zod. A new field needs a default so old files keep opening, and a test.
- **Tests:** put tests next to the code (`*.test.ts`). Anything that touches the model, routing, export or checks needs one.
- **Commits:** short imperative subject ("Add valve replacement"), details in the body when the reason is not obvious. Keep unrelated changes in separate commits.
- **Versions:** [Semantic Versioning](https://semver.org/). Releases are made with `npm run version:set X.Y.Z`, a tag `vX.Y.Z` and the Release workflow (see [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md)). Update [CHANGELOG.md](CHANGELOG.md).

## Reporting problems

Open an issue with the app version (footer), your system, the steps to reproduce and, if possible, the `.fluidigram` file.
