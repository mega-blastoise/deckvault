#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# migrate-prod.sh — Apply migrations and seed meta decks against RDS
# Usage: POSTGRES_URL=postgresql://... bash scripts/migrate-prod.sh
# ---------------------------------------------------------------------------

if [[ -z "${POSTGRES_URL:-}" ]]; then
  echo "ERROR: POSTGRES_URL is not set"
  exit 1
fi

MIGRATIONS_DIR="apps/rest-api/migrations"
SEED_SCRIPT="database/seeds/meta_decks.ts"

echo ""
echo "============================================================"
echo " DeckVault — Production Migration Runner"
echo "============================================================"
echo " Target: ${POSTGRES_URL//:*@/://***@}"   # mask password in logs
echo ""

# ---------------------------------------------------------------------------
# 1. Migrations
# ---------------------------------------------------------------------------

echo "------------------------------------------------------------"
echo " Phase 1: Migrations"
echo "------------------------------------------------------------"

migration_files=$(ls "$MIGRATIONS_DIR"/*.sql | sort)
total=$(echo "$migration_files" | wc -l | tr -d ' ')
count=0

for f in $migration_files; do
  count=$((count + 1))
  name=$(basename "$f")
  echo ""
  echo "[$count/$total] Applying: $name"
  echo "---"
  psql "$POSTGRES_URL" \
    --echo-all \
    --set ON_ERROR_STOP=1 \
    -f "$f"
  echo "--- ✓ $name complete"
done

echo ""
echo "------------------------------------------------------------"
echo " ✓ All $total migrations applied successfully"
echo "------------------------------------------------------------"

# ---------------------------------------------------------------------------
# 2. Seed meta decks
# ---------------------------------------------------------------------------

echo ""
echo "------------------------------------------------------------"
echo " Phase 2: Seeding meta decks"
echo "------------------------------------------------------------"
echo ""

POSTGRES_URL="$POSTGRES_URL" bun run "$SEED_SCRIPT"

echo ""
echo "============================================================"
echo " ✓ Done — database is ready"
echo "============================================================"
echo ""
