#!/usr/bin/env bash
# Composes the body of a GitHub release: the bilingual notes of the version (docs/releases/<tag>.md)
# followed by the shared download and installation instructions (docs/release-install.md).
# Usage: scripts/release-notes.sh v0.4.0
set -euo pipefail
cd "$(dirname "$0")/.."
tag="${1:?usage: release-notes.sh <tag>}"
version="${tag#v}"
notes="docs/releases/${tag}.md"
[ -f "$notes" ] || { echo "Missing $notes: write the release notes before tagging." >&2; exit 1; }
cat "$notes"
echo
sed "s/{VERSION}/${version}/g" docs/release-install.md
