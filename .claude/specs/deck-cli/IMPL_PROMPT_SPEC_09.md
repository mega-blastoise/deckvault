# Implementation Prompt — SPEC_09 (Phases 1–4: Foundation)

Paste this prompt into a new Claude Code session opened at the **monorepo root**.

SPEC_09 has nine phases. **This session covers Phases 1–4 only** — the package
topology, build pipeline, `@johto/card-data`, and runtime path resolution
refactor. Phases 5–9 (subcommand surface, CI release workflow, Docker, curl
installer, docs) are a separate session. Stop after Phase 4 verification passes.

---

## Context

`johto` is a competitive Pokémon TCG deck refinement CLI at `apps/deck-cli/`.
It talks to a Rust MCP server at `apps/mcp-server/` over JSON-RPC stdio. Both
work end-to-end in the monorepo today.

The goal of SPEC_09 is to publish `johto` as a public CLI installable from
npm, Docker, and a curl script — without requiring a monorepo checkout, a
Rust toolchain, or Bun on the host.

Phases 1–4 lay the foundation:

1. **Workspace + package topology** — scaffold `dist-packages/` for 9 published
   packages, set up the homegrown change/release coordinator
2. **Build pipeline** — per-platform `bun build --compile` for the CLI, per-platform
   cargo cross-compile for the MCP server, assemble platform packages
3. **`@johto/card-data` package** — extract the JSON-to-SQLite scaffold into a
   standalone package that ships the prebuilt DB and supports `--rebuild`
4. **Runtime path resolution** — replace the monorepo-relative hardcoding in
   `apps/deck-cli/src/args.ts` and plumb `DATABASE_PATH` through to the spawned
   MCP child process

After Phase 4, `bun run dev` in the monorepo must still work unchanged, and a
manually-assembled tarball produced by the new build pipeline must be installable
via `npm install -g ./tarball.tgz` on the host's platform and run a
`--dry-run` end-to-end.

---

## Read First (in this order)

### Spec
1. `.claude/specs/deck-cli/SPEC_09_PACKAGING_AND_DISTRIBUTION.md` — the source of truth
   for everything below. Read **Phases 1–4** carefully and skim Phase 6 (release
   workflow) for context on how the artifacts you produce will be consumed.

### Existing code that will be refactored or referenced
2. `apps/deck-cli/package.json` — current `bin` entries and `files[]`; understand
   what shifts to `dist-packages/cli/`
3. `apps/deck-cli/build/index.ts` — current single-target build; you will replace it
   with the per-platform `bun build --compile` driver
4. `apps/deck-cli/src/args.ts` — line 95–98 contains the `resolveDefaultMcpPath`
   you must rewrite (Phase 4.1)
5. `apps/deck-cli/src/index.ts` — line 28 (`new McpClient(args.mcpServerPath)`)
   must pass `DATABASE_PATH` through
6. `apps/deck-cli/src/mcp/client.ts` — the constructor must accept an optional
   `dbPath` and inject `DATABASE_PATH` into the spawned child's env
7. `apps/mcp-server/src/main.rs` — lines 29–32 read `DATABASE_PATH`; confirm the
   env-var path is already correct, only the error message needs improving
8. `apps/mcp-server/Cargo.toml` — confirm the target triples Phase 2.2 expects
9. `turbo.json` (root) — see existing task structure before adding `pack:*` tasks
10. `.claude/specs/deck-cli/IMPL_PROMPT_SPEC_07_08.md` — example of the verification
    style expected after each phase

Do not write a single line of code until you have read all ten files.

---

## Important Constraints

- **Do not break the monorepo dev flow.** `bun run dev` from `apps/deck-cli`
  must continue to start a working session against the in-repo MCP binary and
  the in-repo SQLite DB. The Phase 4 refactor is additive: `JOHTO_MCP_SERVER_PATH`
  is the new override path; the monorepo-relative fallback is preserved for
  source-file invocations (where `import.meta.url` starts with `file://`).
- **Do not publish anything.** This session produces the assemblies and verifies
  them locally. No `npm publish`. No GitHub Release. No Docker push. The CI
  workflow that publishes lives in Phase 6 (next session).
- **Do not add `@changesets/*` dependencies.** The spec replaces changesets with
  a homegrown `scripts/changes.ts`. If you find yourself reaching for changesets,
  re-read the "Change coordination — hand-rolled, not @changesets" section.
- **Workspace deps are `workspace:*`.** The `dist-packages/*` package.json files
  reference each other and `@johto/card-data` via `workspace:*`. The CI
  `stamp-release-versions.ts` script (Phase 6, not this session) rewrites them
  to concrete versions before publish. For this session, validate that
  `bun install` resolves them correctly and that `bun pack` produces a tarball
  with the rewritten versions.

---

## Implementation Order

Work through phases in sequence. Run the verification at the end of each phase
before proceeding.

---

### Phase 1 — Workspace and Package Topology

**Directories to create:**
- `dist-packages/cli/`                          ← meta package
- `dist-packages/cli-platforms/_template/`      ← per-platform package.json template
- `dist-packages/mcp-server-platforms/_template/`
- `dist-packages/card-data/`
- `.changes/`                                    ← empty, with `.gitkeep`
- `scripts/`                                     ← if not already present at repo root

**Files to create (Phase 1 scope only):**
- `dist-packages/cli/package.json`               ← meta, optionalDependencies + dep on card-data
- `dist-packages/cli/bin/johto.js`               ← shim (full contents in SPEC_09 Phase 2.4)
- `dist-packages/cli/lib/resolve.js`             ← binary + data resolver
- `dist-packages/cli/README.md`                  ← short public-facing readme
- `dist-packages/cli-platforms/_template/package.json.tmpl`
- `dist-packages/cli-platforms/_template/README.md.tmpl`
- `dist-packages/mcp-server-platforms/_template/package.json.tmpl`
- `dist-packages/mcp-server-platforms/_template/README.md.tmpl`
- `.changes/.gitkeep`
- `scripts/changes-config.ts`                    ← cohort definitions (SPEC_09 change-coordination section)
- `scripts/changes.ts`                           ← `add` / `list` / `release` subcommands
- `scripts/stamp-release-versions.ts`            ← copy from SPEC_09 Phase 6

**Files to modify:**
- `turbo.json`                                   ← add `pack:cli-shim`, `pack:cli-platform`, `pack:mcp-platform`, `pack:card-data` tasks
- `package.json` (root)                          ← add top-level scripts `changes:add`, `changes:list`, `changes:release`, `pack:all`
- `.gitignore`                                   ← add `dist-packages/*/data/*.db`, `dist-packages/cli/node_modules`, `dist-packages/cli-platforms/*/bin`, `dist-packages/mcp-server-platforms/*/bin`

**Implementation notes:**
- The `dist-packages/cli-platforms/` and `dist-packages/mcp-server-platforms/`
  directories will be populated by the Phase 2 build scripts. For Phase 1, only
  the `_template/` subdirectories exist.
- `scripts/changes.ts` and `scripts/changes-config.ts` follow the implementation
  shown in SPEC_09 — the script is ~200 lines including `loadPending`,
  `rollUpBumps`, `nextVersion`, `release`, plus `add` and `list` subcommands and
  the `Bun.argv[2]` dispatch.
- `dist-packages/cli/bin/johto.js` uses CommonJS (`require`) deliberately — it
  must run on Node 20+ without transpilation. Do not write it in ESM.

**Verify:**
```bash
# Tree structure
test -d dist-packages/cli/bin && echo "✓ cli/bin"
test -d dist-packages/cli/lib && echo "✓ cli/lib"
test -d dist-packages/cli-platforms/_template && echo "✓ cli-platforms/_template"
test -d dist-packages/mcp-server-platforms/_template && echo "✓ mcp-server-platforms/_template"
test -d dist-packages/card-data && echo "✓ card-data"
test -d .changes && echo "✓ .changes"

# JSON parses
node -e "JSON.parse(require('fs').readFileSync('dist-packages/cli/package.json'))" && echo "✓ cli/package.json valid"

# Shim runs (without backing platform packages it must error cleanly, not crash)
node dist-packages/cli/bin/johto.js --help 2>&1 | grep -q "Missing package\|Unsupported platform\|johto" && echo "✓ shim error path works"

# Change coordinator dispatches
bun scripts/changes.ts list 2>&1 | grep -q "No pending changes" && echo "✓ changes.ts list works"

# Turbo tasks defined
bun x turbo run pack:cli-shim --dry-run 2>&1 | grep -q "pack:cli-shim" && echo "✓ turbo task registered"
```

---

### Phase 2 — Build Pipeline

**Files to create:**
- `apps/deck-cli/build/compile.ts`               ← per-platform `bun build --compile` driver
- `apps/mcp-server/build/pack-platform.sh`       ← per-platform cargo build + packaging script

**Files to modify:**
- `apps/deck-cli/package.json`                   ← replace `build` script to invoke `bun build/compile.ts <suffix>`; keep `dev` unchanged

**Implementation notes:**
- `compile.ts` accepts a target suffix argument (e.g. `linux-x64`) and
  produces the binary + stamped package.json at
  `dist-packages/cli-platforms/<suffix>/`. The package.json is generated from
  `_template/package.json.tmpl` by `replaceAll('${SUFFIX}', ...)` etc.
- `pack-platform.sh` is bash, not Bun. It uses `cross build` for Linux targets
  and `cargo build` for darwin targets. Output: `dist-packages/mcp-server-platforms/<suffix>/bin/pokemon-mcp-server` + stamped `package.json`.
- For local Phase 2 verification you only need to build the host's native
  platform. Cross-compilation is exercised in CI (Phase 6, next session). Do
  not install `cross` locally unless you want to test Linux ARM builds on x64.
- **Bun cross-compile note:** `bun build --compile --target=bun-linux-x64`
  works from any host. If `setup-bun@v2` is not installed and `bun` is on the
  PATH at < 1.3, fail the build with a clear error pointing at the engines
  field in `apps/deck-cli/package.json`.

**Verify (host-platform only):**
```bash
# Detect host suffix
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)   HOST=linux-x64 ;;
  Linux-aarch64)  HOST=linux-arm64 ;;
  Darwin-x86_64)  HOST=darwin-x64 ;;
  Darwin-arm64)   HOST=darwin-arm64 ;;
  *) echo "Unsupported host"; exit 1 ;;
esac
echo "Host suffix: $HOST"

# Build CLI for host platform
bun apps/deck-cli/build/compile.ts $HOST

test -x "dist-packages/cli-platforms/$HOST/bin/johto" && echo "✓ CLI binary produced"
test -f "dist-packages/cli-platforms/$HOST/package.json" && echo "✓ CLI package.json stamped"

# Binary should run and respond to --help
"dist-packages/cli-platforms/$HOST/bin/johto" --help 2>&1 | grep -q "johto" && echo "✓ CLI binary responds"

# Pack MCP server for host platform
case "$HOST" in
  linux-x64)   TRIPLE=x86_64-unknown-linux-gnu ;;
  linux-arm64) TRIPLE=aarch64-unknown-linux-gnu ;;
  darwin-x64)  TRIPLE=x86_64-apple-darwin ;;
  darwin-arm64) TRIPLE=aarch64-apple-darwin ;;
esac

bash apps/mcp-server/build/pack-platform.sh $TRIPLE $HOST

test -x "dist-packages/mcp-server-platforms/$HOST/bin/pokemon-mcp-server" && echo "✓ MCP binary produced"
test -f "dist-packages/mcp-server-platforms/$HOST/package.json" && echo "✓ MCP package.json stamped"

# MCP binary should print tool list when given a stdio initialize
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
  | DATABASE_PATH=database/pokemon-data.sqlite3.db \
    "dist-packages/mcp-server-platforms/$HOST/bin/pokemon-mcp-server" 2>/dev/null \
  | grep -q "load_deck" && echo "✓ MCP binary functional"
```

---

### Phase 3 — `@johto/card-data` Package

**Files to create:**
- `dist-packages/card-data/package.json`
- `dist-packages/card-data/scripts/rebuild.ts`    ← top-level pipeline entry
- `dist-packages/card-data/scripts/sets.ts`       ← set inserts
- `dist-packages/card-data/scripts/cards.ts`      ← card inserts
- `dist-packages/card-data/scripts/schema.sql`    ← DDL
- `dist-packages/card-data/README.md`

**Implementation notes:**
- The pipeline takes a `--source <dir>` (the pokemon-tcg-data JSON tree) and a
  `--out <path>` (the output SQLite file). For Phase 3 verification, the source
  is the existing `database/seeds/` tree in the monorepo.
- The schema must produce a SQLite file byte-compatible with the existing
  `database/pokemon-data.sqlite3.db` — same column names, same JSON column
  encoding (subtypes, types, attacks, etc. stored as JSON text). Refer to
  `apps/mcp-server/src/domains/db.rs` `row_to_card` / `row_to_set` to confirm
  column names and types the consumer expects.
- The rebuild script is the ONLY way `data/pokemon-data.sqlite3.db` is
  produced. Do not commit the .db file — it is gitignored (Phase 1) and will
  be built in CI before publish.
- `package.json`'s `bin` exposes `johto-card-data-rebuild` pointing at
  `scripts/rebuild.ts`. This is the binary that `johto sync-data --rebuild`
  will exec in Phase 5 (next session); not in scope here.

**Verify:**
```bash
# Build the SQLite from the existing seeds
bun dist-packages/card-data/scripts/rebuild.ts \
  --source database/seeds \
  --out dist-packages/card-data/data/pokemon-data.sqlite3.db

test -f dist-packages/card-data/data/pokemon-data.sqlite3.db && echo "✓ SQLite produced"

# Card count should match the canonical DB (19,818 ± reasonable drift if seeds updated)
EXPECTED=$(sqlite3 database/pokemon-data.sqlite3.db "SELECT COUNT(*) FROM pokemon_cards")
ACTUAL=$(sqlite3 dist-packages/card-data/data/pokemon-data.sqlite3.db "SELECT COUNT(*) FROM pokemon_cards")
echo "canonical: $EXPECTED  rebuilt: $ACTUAL"
test "$EXPECTED" = "$ACTUAL" && echo "✓ Card counts match"

# Set count should also match
EXPECTED=$(sqlite3 database/pokemon-data.sqlite3.db "SELECT COUNT(*) FROM pokemon_card_sets")
ACTUAL=$(sqlite3 dist-packages/card-data/data/pokemon-data.sqlite3.db "SELECT COUNT(*) FROM pokemon_card_sets")
test "$EXPECTED" = "$ACTUAL" && echo "✓ Set counts match"

# A known card should resolve identically
sqlite3 dist-packages/card-data/data/pokemon-data.sqlite3.db \
  "SELECT id, name, supertype, regulation_mark FROM pokemon_cards WHERE id = 'me1-60'" \
  | grep -q "Mega Gardevoir ex" && echo "✓ Sample card resolves"
```

---

### Phase 4 — Runtime Path Resolution Refactor

**Files to modify:**
- `apps/deck-cli/src/args.ts`                    ← rewrite `resolveDefaultMcpPath` per SPEC_09 Phase 4.1
- `apps/deck-cli/src/mcp/client.ts`              ← constructor accepts optional `dbPath`; injects `DATABASE_PATH` to spawn env
- `apps/deck-cli/src/index.ts`                   ← pass `process.env['JOHTO_DB_PATH']` to `new McpClient(...)`
- `apps/mcp-server/src/main.rs`                  ← improve error message on missing DB file (Phase 4.2)

**Implementation notes:**
- The new `resolveDefaultMcpPath` is a three-step chain: `JOHTO_MCP_SERVER_PATH`
  env var → monorepo-relative fallback (only when `import.meta.url` starts with
  `file://`, i.e. we're running from source not a bun-compiled binary) → throw
  with a "run johto doctor" hint.
- Existing in-repo `bun run dev` invocations must continue to find the MCP
  binary at `apps/mcp-server/target/release/pokemon-mcp-server` via the
  fallback branch. Test this explicitly.
- `McpClient` env injection: when `dbPath` is provided, the spawned child gets
  `DATABASE_PATH` set; when undefined, the child inherits the parent's env
  (which may or may not have `DATABASE_PATH`, depending on how the parent was
  invoked). Do not break the existing in-repo behaviour where `DATABASE_PATH`
  is set in the parent shell.
- The Rust-side change in `main.rs` is just an error-message improvement. The
  existing env-var read at line 29–30 is correct. Do not change the lookup logic.

**Verify:**
```bash
# 1. Existing monorepo dev flow must still work
cd apps/deck-cli
bun run dev -- --deck ./decks/example.toml --dry-run 2>&1 | grep -q "SYSTEM PROMPT" && echo "✓ Monorepo dev flow intact"
cd ../..

# 2. The bun-compiled CLI from Phase 2 must accept the env-var override
HOST=$(case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)   echo linux-x64 ;;
  Linux-aarch64)  echo linux-arm64 ;;
  Darwin-x86_64)  echo darwin-x64 ;;
  Darwin-arm64)   echo darwin-arm64 ;;
esac)

# Rebuild CLI now that args.ts is refactored
bun apps/deck-cli/build/compile.ts $HOST

# Run the compiled CLI with env vars set (simulating what the JS shim will do)
JOHTO_MCP_SERVER_PATH="$(pwd)/dist-packages/mcp-server-platforms/$HOST/bin/pokemon-mcp-server" \
JOHTO_DB_PATH="$(pwd)/dist-packages/card-data/data/pokemon-data.sqlite3.db" \
"dist-packages/cli-platforms/$HOST/bin/johto" \
  --deck "$(pwd)/apps/deck-cli/decks/example.toml" \
  --dry-run 2>&1 | grep -q "SYSTEM PROMPT" && echo "✓ Compiled CLI runs end-to-end with env-injected paths"

# 3. Manually assemble a tarball-equivalent and install it
# (simulates what npm install -g @johto/cli will do)
NPM_PREFIX=$(mktemp -d)
cp -r dist-packages/cli              "$NPM_PREFIX/cli"
mkdir -p "$NPM_PREFIX/cli/node_modules/@johto"
cp -r "dist-packages/cli-platforms/$HOST"        "$NPM_PREFIX/cli/node_modules/@johto/cli-$HOST"
cp -r "dist-packages/mcp-server-platforms/$HOST" "$NPM_PREFIX/cli/node_modules/@johto/mcp-server-$HOST"
cp -r dist-packages/card-data                    "$NPM_PREFIX/cli/node_modules/@johto/card-data"

node "$NPM_PREFIX/cli/bin/johto.js" \
  --deck "$(pwd)/apps/deck-cli/decks/example.toml" \
  --dry-run 2>&1 | grep -q "SYSTEM PROMPT" && echo "✓ JS shim resolves binaries and runs end-to-end"

rm -rf "$NPM_PREFIX"

# 4. Missing-binary error path
mv "dist-packages/cli-platforms/$HOST/bin/johto" "dist-packages/cli-platforms/$HOST/bin/johto.bak"
node "dist-packages/cli/bin/johto.js" --help 2>&1 | grep -q "not found at" && echo "✓ Shim produces clear error when binary missing"
mv "dist-packages/cli-platforms/$HOST/bin/johto.bak" "dist-packages/cli-platforms/$HOST/bin/johto"
```

---

## Stop Criteria for This Session

After Phase 4 verification passes:

1. Open `.claude/specs/deck-cli/SPEC_09_PACKAGING_AND_DISTRIBUTION.md` and update
   the **Success Criteria** section — check off the following items in your
   commit message (do not modify the spec):

   - [x] Phase 1: workspace topology scaffolded, change coordinator in place
   - [x] Phase 2: build pipeline produces host-platform CLI + MCP binaries
   - [x] Phase 3: `@johto/card-data` rebuilds a byte-compatible SQLite from JSON sources
   - [x] Phase 4: env-injected paths work end-to-end; monorepo dev flow unchanged

2. Commit with a message in the form:
   ```
   feat(deck-cli): SPEC_09 phases 1-4 — packaging foundation

   - Scaffold dist-packages/ tree for 9 published packages
   - Per-platform bun build --compile driver
   - @johto/card-data with JSON-to-SQLite rebuild pipeline
   - Runtime path resolution: JOHTO_MCP_SERVER_PATH + JOHTO_DB_PATH env vars
   - Monorepo dev flow preserved via import.meta.url fallback
   ```

3. **Do not start Phase 5.** The subcommand restructure (`johto run` / `init` /
   `doctor` / `auth` / `sync-data`) is a separate session and depends on a few
   open questions about config-file UX that should be revisited before
   implementation. A follow-up `IMPL_PROMPT_SPEC_09_PHASES_5_9.md` will be
   generated for the remaining work.

---

## When You Get Stuck

- **`bun build --compile` produces a non-executable file:** check that the
  `--outfile` path doesn't already exist (Bun won't overwrite a directory).
  Verify the host's Bun version is ≥ 1.3.
- **`cross build` fails with permission errors:** ensure Docker is running.
  `cross` uses Docker for Linux cross-compilation. On macOS, you can skip
  `cross` and just `cargo build` for darwin targets.
- **The JS shim throws `Cannot find module '@johto/...'`:** the `require.resolve`
  call is looking in the Node module search path. For local testing, you must
  symlink or copy the platform packages into a `node_modules/` directory that
  the shim can find. See the Phase 4 verify step for the manual assembly recipe.
- **Card counts diverge between rebuilt and canonical SQLite:** check whether
  the seeds tree has been updated since the canonical DB was last rebuilt.
  If yes, the divergence is expected and you should update the verification
  baseline. If no, the rebuild script has a bug.

---

## What This Session Does NOT Cover

| Phase | Why deferred |
|---|---|
| Phase 5: subcommand surface + `johto init` wizard | Adds a large set of new TypeScript files (`commands/*.ts`, `config/loader.ts`); deserves its own session with attention to UX |
| Phase 6: GitHub Actions release workflow | Depends on Phases 1–5 being stable; touches secrets configuration |
| Phase 7: Docker image | Multi-stage build using Phase 2 artifacts; needs separate smoke-testing |
| Phase 8: curl installer | Standalone shell script; can be developed in parallel with Phase 5–7 |
| Phase 9: documentation updates | Should happen after Phases 5–8 land so docs reflect the actual implementation |
