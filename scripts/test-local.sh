#!/bin/bash
set -e

REPO_DIR="${1:-.}"
OUT="${2:-/tmp/qm-plan.json}"

echo "=== Quartermaster Local Test ==="
echo "Repo: $REPO_DIR"
echo "Output: $OUT"
echo

# Step 1: Scan (produces plan JSON)
echo "--- Step 1: Scan ---"
bun run src/cli.ts scan --repo-dir "$REPO_DIR" --output "$OUT" --verbose
echo

# Step 2: Validate
echo "--- Step 2: Validate ---"
bun run src/cli.ts validate "$OUT" --verbose
echo

# Step 3: Dry-run execute
echo "--- Step 3: Execute (dry-run) ---"
bun run src/cli.ts execute "$OUT" --verbose
echo

echo "=== Done. Plan at $OUT ==="
