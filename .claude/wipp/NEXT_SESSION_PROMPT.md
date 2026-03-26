# Next Session Prompt

Copy-paste this as your opening message in the new session.

---

We're continuing the **competitive parity workstream** for Project Johto (DeckVault — Pokemon TCG platform). Read the following context files before doing anything else:

- `.claude/wipp/TIER_PARITY_CONTEXT.md` — full history, current app surface, key technical facts
- `.claude/specs/competitive-parity/SPEC_PARITY_TIER2_TIER3.md` — full spec (Tier 1+2 reference, Tier 3 done)
- `.claude/guides/LOCAL_DEV_SETUP.md` — local dev workflow (`bun run db:dev` + `bun run dev`)

**Where we are:**

Tier 1, Tier 2, and Tier 3 are fully implemented and type-checked (133/133 tests pass, 13/13 check-types clean). All features need QA on a running dev stack.

**What's been implemented (Tier 3, this session):**

1. **T3-A: Archetype tier list** ✅ — Migration 011 adds `tier VARCHAR(2)` to `meta_decks`. `listMetaDecks` returns `tier`. `MetaDeckCard` shows S/A/B/C/D tier badges. `MetaDeckBrowserPage` has tier filter pills (All|S|A|B|C|D). Seed data updated with tiers.
2. **T3-B: Rotation calendar** ✅ — Static `/rotation` page (`RotationPage`). `apps/web/src/web/lib/rotation-data.ts` has `ROTATION_HISTORY` (2024-2025 + 2025-2026). Season selector. Legal/Rotated sets listed with marks. Navbar: CalendarDays icon.
3. **T3-C: CP tracker** ✅ — Migration 012 (`cp_entries` table). REST CRUD at `/api/v1/cp` (auth-required). `CpTrackerPage` at `/cp` (auth-gated). Running total, Day2/Worlds thresholds, Add Event form, delete entries, season selector. Navbar: Trophy icon (authenticated only).

**What to do next — QA and post-Tier-3 work:**

1. Run dev stack: `bun run db:dev && bun run dev`
2. QA Tier 3 features (restart rest-api to apply migrations 011+012)
3. Update seed data `tier` values after reviewing current meta standings
4. Consider fast-follow: TCGPlayer mass entry UX polish on DeckDetailPage

**Known fast-follow (not blocking):**
- TCGPlayer mass entry UX on DeckDetailPage "💰 Price Check" — currently opens `tcgplayer.com/massentry` with list on clipboard, but could be more guided
