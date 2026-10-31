#!/usr/bin/env bash
# Create the Kvasir repository from a clean import of LearnHarness.
#
# Usage: bash bootstrap-kvasir.sh <target-dir> [github-owner/repo]
# Run from the unzipped build pack folder (the folder that holds CLAUDE.md).
#
# Result: a new git repository with two commits:
#   1. the upstream tree at the pinned commit, unchanged
#   2. the Kvasir build pack
# If a GitHub repo is given, it is created private with gh and pushed.

set -euo pipefail

UPSTREAM_URL="https://github.com/amosblomqvist/learnharness.git"
UPSTREAM_SHA="dc4c398d5167865b84b0ccb3ec809eb88bf8f65f"
PACK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:?target directory required}"
GH_REPO="${2:-}"

if [ -e "$TARGET" ]; then
	echo "Target $TARGET already exists. Choose a new folder." >&2
	exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "Fetching upstream at $UPSTREAM_SHA"
git init -q "$WORK/upstream"
git -C "$WORK/upstream" fetch -q --depth 1 "$UPSTREAM_URL" "$UPSTREAM_SHA"
git -C "$WORK/upstream" checkout -q FETCH_HEAD

echo "Creating $TARGET with fresh history"
mkdir -p "$TARGET"
git -C "$WORK/upstream" archive FETCH_HEAD | tar -x -C "$TARGET"
cd "$TARGET"
git init -q -b main
git add -A
git commit -q -m "chore: import LearnHarness ${UPSTREAM_SHA:0:7} (AGPL-3.0)

Source: $UPSTREAM_URL
Commit: $UPSTREAM_SHA
Copyright Amos Blomqvist. Licensed AGPL-3.0-only. Unmodified in this commit."

echo "Adding the Kvasir build pack"
cp "$PACK_DIR/CLAUDE.md" .
mkdir -p docs .claude .github scripts
cp -R "$PACK_DIR/docs/kvasir" docs/
cp -R "$PACK_DIR/.claude/commands" .claude/
cp "$PACK_DIR/.github/pull_request_template.md" .github/
mkdir -p .github/ISSUE_TEMPLATE .github/workflows
cp "$PACK_DIR/.github/ISSUE_TEMPLATE/task.md" .github/ISSUE_TEMPLATE/
cp "$PACK_DIR/.github/workflows/house-style.yml" .github/workflows/
cp "$PACK_DIR/scripts/house-style-check.mjs" scripts/
cp "$PACK_DIR/scripts/bootstrap-kvasir.sh" scripts/

# Keep the upstream AGENTS.md (Next.js rules and "No guessing"); point it at CLAUDE.md.
printf '\n# Kvasir\n\nThis repository is Kvasir. Read `CLAUDE.md` before anything else.\n' >> AGENTS.md

git add -A
git commit -q -m "docs: add Kvasir build pack (product brief, roadmap, workflow, phase briefs, agent files)"

if [ -n "$GH_REPO" ]; then
	echo "Creating private GitHub repo $GH_REPO"
	gh repo create "$GH_REPO" --private --source . --push
	echo "Set branch protection on main in GitHub settings: require a PR and passing checks."
fi

echo "Done. Next: cd $TARGET && npm ci && npm run typecheck && npm run lint && npm test && npm run build"
