# Releasing johto

How to cut a release of the `johto` CLI and its supporting packages.

Releases are **triggered by pushing a git tag**. Everything else — building four
platform binary pairs, stamping versions, publishing nine npm packages, pushing a
multi-arch image to GHCR, and creating the GitHub Release — happens in CI. Your
job locally is to produce a correct tag on a correct commit.

`scripts/release.ts` does that, and stops there.

---

## The one rule

**The git tag is the only place a version number lives.**

Every `dist-packages/*/package.json` has `"version": "0.0.0"` in source, and stays
that way forever. `scripts/stamp-release-versions.ts` writes the real version at
CI time from the tag. Do not hand-edit a version field, and do not "fix" a
`0.0.0` you see in source — it is correct.

This is why `release.ts` derives the current version from `git tag`, not from any
file. A second source of truth would silently diverge from the tag.

---

## The two release streams

They are independent. Neither waits on the other.

| Stream | Tag | Publishes | Command |
|---|---|---|---|
| **johto** | `johto/vX.Y.Z` | `@johto-ai/cli`, 4 × `cli-*`, 4 × `mcp-server-*`, GHCR image, GH Release | `bun run release` |
| **card-data** | `johto/card-data-vX.Y.Z` | `@johto-ai/card-data` | `bun run release:card-data` |

A bare `vX.Y.Z` tag triggers **nothing**. The workflows match `johto/v*.*.*` and
`johto/card-data-v*.*.*` only. There are some stale `v0.1.0`-style tags in this
repo from older instructions; ignore them.

---

## Recording changes as you work

Every PR that should appear in the changelog adds an entry:

```bash
bun run changes:add
```

That writes a `.changes/<timestamp>-<slug>.md` file. **Commit it with your
feature branch.** Review what is pending at any time with `bun run changes:list`.

Pick the cohort by what actually ships:

| Cohort | Covers | On release |
|---|---|---|
| `cli` | the CLI and its four platform binaries | drives the `johto` version |
| `mcpServer` | the four MCP server platform packages | drives the `johto` version |
| `cardData` | `@johto-ai/card-data` | drives the `card-data` version |
| `internal` | build scripts, turbo/CI config, docs, tooling | changelog only — publishes and bumps nothing |

Use `internal` for anything that ships in no package. Filing repo-only work under
`cli` bumps five published packages for a change none of them contain.

A release needs at least one entry for its stream. `internal` entries ride along
in the `johto` changelog but never influence the version — a release consisting
only of `internal` entries is refused, because there is nothing to publish.

---

## Cutting a release

### 1. Get onto `main`, clean and current

```bash
git checkout main
git pull mega-blastoise main
git status          # must be clean
```

The publish remote is **`mega-blastoise`**, not `origin`. `origin` in this repo
points at a stale `nicholasgalante1997/Johto` and pushing a tag there does
nothing. Confirm with `git remote -v` if in doubt.

### 2. Dry run

```bash
bun run release
```

This changes nothing. It prints the resolved version, the tag it would create,
every changelog entry it would fold in, and the full preflight result. Read it.

Version resolution: highest existing `johto/v*` tag + the largest bump among the
pending `cli`/`mcpServer` entries. Override with `--version 0.4.0` when you need
an exact number.

### 3. Execute

```bash
bun scripts/release.ts --execute
```

This does three local things and nothing else:

1. Appends the pending entries to `CHANGELOG.md` and deletes them from `.changes/`
2. Commits as `release(johto): vX.Y.Z`
3. Creates an annotated tag `johto/vX.Y.Z`

**Nothing is pushed.** All three steps are reversible:

```bash
git tag -d johto/vX.Y.Z && git reset --hard HEAD~1
```

### 4. Push — the irreversible step

```bash
git push mega-blastoise main
git push mega-blastoise johto/vX.Y.Z
```

Push the branch first, then the tag; a tag pointing at a commit the remote does
not have will fail. The second command starts the publish.

This is the point of no return. npm version numbers are burned permanently —
unpublishing has a 72-hour window, is messy, and the number can never be reused.
That is why the script refuses to do it for you.

### 5. Watch it

```bash
gh run watch --repo mega-blastoise/deckvault
```

The workflow takes roughly 10–15 minutes: four Rust builds (two cross-compiled,
two on macOS runners), four Bun compiles, then a single publish job.

### 6. Verify

```bash
npm view @johto-ai/cli version
npm view @johto-ai/cli-darwin-arm64 version      # platform packages match
docker manifest inspect ghcr.io/mega-blastoise/johto:X.Y.Z
gh release view johto/vX.Y.Z --repo mega-blastoise/deckvault
```

All nine npm packages carry the same version except `@johto-ai/card-data`, which
has its own stream. A quick end-to-end check:

```bash
npm i -g @johto-ai/cli@X.Y.Z && johto doctor
```

---

## Preflight checks, and what to do when one fails

`release.ts` blocks on all of these. They exist because each one has cost a real
release at some point.

| Check | Meaning | Fix |
|---|---|---|
| `working tree clean` | Uncommitted changes would not be in the tagged commit | Commit or stash |
| `on release branch (main)` | Releases are cut from `main` | `git checkout main`, or `--branch <name>` if you genuinely mean otherwise |
| `publish remote exists` | Never assumes `origin` | `git remote -v`; pass `--remote <name>` |
| `pending changes present` | A release with an empty changelog is a mistake | `bun run changes:add` |
| `version resolvable` | No version-driving entries and no `--version` | Add a `cli`/`mcpServer` entry, or pass `--version` |
| `version increases` | Guards against re-releasing or going backwards | Pass a higher `--version` |
| `tag does not exist locally` | The tag is already cut | `git tag -d` it if it was a mistake |
| `source versions pinned to 0.0.0` | Something wrote a real version into source | Reset those files to `0.0.0` — see "The one rule" |
| `repository fields match publish remote` | npm `--provenance` requires an exact repo match, or the publish fails *after* the tag is pushed | Fix `repository` in the offending `package.json` / `.tmpl` |
| `workflows use safe npm publish` | Regression guard: `npm publish dist-packages/card-data` is parsed by npm as a GitHub shortcut, not a folder | Publish from inside the directory (`working-directory:` or `cd … && npm publish`) |
| `tag absent on remote` | The tag already exists upstream | Choose a new version, or delete the remote tag deliberately |

`--offline` skips the remote check. `--branch` and `--remote` override the
branch and remote guards. There is no flag to skip the rest, by design.

---

## Recovery

### CI failed before anything published

Nothing is on npm. Fix the problem, then move the tag forward:

```bash
git tag -d johto/vX.Y.Z
git push mega-blastoise :refs/tags/johto/vX.Y.Z   # delete remote tag
# ... commit the fix ...
git tag -a johto/vX.Y.Z -m "johto vX.Y.Z"
git push mega-blastoise johto/vX.Y.Z
```

Deleting and re-pushing a tag is safe **only** while nothing has published under
that version. Check first:

```bash
npm view @johto-ai/cli@X.Y.Z version    # 404 means the slot is free
```

### CI failed partway through publishing

Some packages are on npm, some are not. **Do not reuse the version.** Cut the
next patch version instead and let the partial release be a gap. A partially
published version is worse than a skipped number: `@johto-ai/cli` declares the
platform packages as `optionalDependencies`, so a missing one installs cleanly
and then fails at runtime when the shim cannot find its binary.

### The tag is on the wrong commit

If it has not been pushed, `git tag -d` and re-tag. If it has been pushed and
nothing published, delete the remote tag as above. If something published, do not
rewrite anything — cut a new version forward.

### You need to rewrite the release commit

Check whether it is already on the remote before proposing any history rewrite:

```bash
git branch -r --contains <sha>
```

If it is on `mega-blastoise/main`, do not reset or amend. Fix forward with a new
commit.

---

## What CI actually does

`.github/workflows/release.yml`, on `johto/v*.*.*`:

1. **build-rust** (4 jobs) — `pack-platform.sh` per target. linux via `cross`,
   darwin on `macos-14`. Produces the binary *and* generates that platform's
   `package.json` from `_template/package.json.tmpl`. Those manifests are not in
   source and must not be committed.
2. **build-bun** (4 jobs) — `bun apps/deck-cli/build/compile.ts <suffix>`.
3. **publish** — downloads all artifacts, assembles `dist-packages/`, runs
   `stamp-release-versions.ts <tag>` (which also rewrites `workspace:*` deps to
   the concrete version), publishes each package from inside its own directory,
   builds and pushes the multi-arch image, and creates the GitHub Release with
   four per-platform tarballs.

`.github/workflows/release-card-data.yml`, on `johto/card-data-v*.*.*`, publishes
the single data package.

Note the asymmetry: `johto/vX.Y.Z` is what CI keys on, and the version it stamps
is that tag minus the prefix. Nothing reads a version from source.

---

## Quick reference

```bash
bun run changes:add                       # record a change
bun run changes:list                      # what is pending
bun run release                           # dry run (johto stream)
bun scripts/release.ts --execute          # commit + tag, no push
bun run release:card-data                 # dry run (card-data stream)

git push mega-blastoise main
git push mega-blastoise johto/vX.Y.Z      # starts the publish

git tag -d johto/vX.Y.Z && git reset --hard HEAD~1   # undo, pre-push
```

Flags: `--execute`, `--version X.Y.Z`, `--stream card-data`, `--branch <name>`,
`--remote <name>`, `--offline`.
