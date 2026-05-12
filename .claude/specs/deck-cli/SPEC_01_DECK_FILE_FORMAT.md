# SPEC_01: Deck File Format

## Context

The deck file is the foundational data contract for the entire CLI tool. Every other
component — the MCP tools, the CLI loader, the agent system prompt — consumes this format.
Getting it right here prevents churn downstream.

A deck file must be:
- Human-writable in a text editor with no tooling
- Parseable by both Rust (MCP server) and TypeScript (CLI)
- Portable — no machine-specific paths, no database IDs beyond card IDs
- Stable — the schema version is explicit so future changes are detectable

---

## Prerequisites

None — this is the root spec.

---

## Requirements

### 1. Primary Format: TOML

TOML is the canonical format. All deck files in the project use `.toml` extension.
JSON is supported as an alternative (`.json` extension) for programmatic generation
(e.g., export from the web platform). Both formats must represent the same data model.

### 2. Schema Definition

#### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Human-readable deck name |
| `format` | string | ✅ | Must be `"standard"` (only supported value) |
| `regulation_marks` | string[] | ✅ | Marks present in this deck, e.g. `["H", "I"]` |
| `cards` | array of CardEntry | ✅ | Exactly 60 total quantity |
| `meta` | table | ❌ | Arbitrary string key-value pairs |

#### CardEntry Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Pokemon TCG API card ID, e.g. `"sv3-125"` |
| `quantity` | integer | ✅ | Number of copies (1–60) |

The `id` field uses the same card ID format as the platform's SQLite database and the
Pokemon TCG API — `{set-id}-{collector-number}`, e.g. `sv3-125`, `sv6-198`, `sv7-83`.

#### Meta Table

All values in `[meta]` must be strings. The table is freeform — no required keys.
Suggested conventions (not enforced):

| Key | Example | Meaning |
|-----|---------|---------|
| `archetype` | `"charizard-ex"` | Archetype identifier matching meta deck slugs |
| `version` | `"1.3"` | Deck version label |
| `notes` | `"Testing 2-2 Pidgeot"` | Free-form notes |
| `tournament` | `"locals-2026-04-27"` | Tournament context |
| `author` | `"nick"` | Deck author |

### 3. Canonical TOML Example

```toml
name = "Charizard ex — Pidgeot Control"
format = "standard"
regulation_marks = ["H", "I"]

# Pokemon — 15
[[cards]]
id = "sv3-125"       # Charizard ex OBF
quantity = 3

[[cards]]
id = "sv3-35"        # Charmander OBF
quantity = 3

[[cards]]
id = "sv3-36"        # Charmeleon OBF
quantity = 1

[[cards]]
id = "sv6pt5-20"     # Pidgeot ex MEW
quantity = 2

[[cards]]
id = "sv6pt5-17"     # Pidgey MEW
quantity = 2

[[cards]]
id = "sv6-198"       # Arcanine ex OBF
quantity = 2

[[cards]]
id = "sv7-83"        # Moltres ex PAR
quantity = 2

# Trainers — 33
[[cards]]
id = "sv1-189"       # Professor's Research SVI
quantity = 4

[[cards]]
id = "sv5-172"       # Boss's Orders PAL
quantity = 2

[[cards]]
id = "sv4-185"       # Iono PAR
quantity = 4

[[cards]]
id = "sv6-186"       # Arven OBF
quantity = 3

[[cards]]
id = "sv3-185"       # Ultra Ball OBF
quantity = 4

[[cards]]
id = "sv3-181"       # Nest Ball OBF
quantity = 3

[[cards]]
id = "sv5-160"       # Rare Candy PAL
quantity = 3

[[cards]]
id = "sv5-168"       # Switch PAL
quantity = 2

[[cards]]
id = "sv6-193"       # Super Rod OBF
quantity = 2

[[cards]]
id = "sv4-163"       # Technical Machine: Devolution PAR
quantity = 1

[[cards]]
id = "sv5-161"       # Magma Basin PAL (stadium)
quantity = 3

[[cards]]
id = "sv5-136"       # Collapsed Stadium PAL
quantity = 2

# Energy — 12
[[cards]]
id = "sve-2"         # Basic Fire Energy SVE
quantity = 12

[meta]
archetype = "charizard-ex"
version = "2.1"
notes = "Dropped 1 Arcanine ex for third Iono"
tournament = "locals-2026-04-27"
```

### 4. Equivalent JSON Format

The JSON schema is a direct translation. Used for programmatic export from the web platform.

```json
{
  "name": "Charizard ex — Pidgeot Control",
  "format": "standard",
  "regulation_marks": ["H", "I"],
  "cards": [
    { "id": "sv3-125", "quantity": 3 },
    { "id": "sv3-35",  "quantity": 3 }
  ],
  "meta": {
    "archetype": "charizard-ex",
    "version": "2.1"
  }
}
```

### 5. Validation Rules

A deck file is **valid** if and only if all of the following hold:

| Rule | Check |
|------|-------|
| **R1: Total count** | Sum of all `quantity` values equals exactly 60 |
| **R2: No duplicate IDs** | Each `id` appears at most once in the `cards` array |
| **R3: Quantity bounds** | Every `quantity` is between 1 and 60 inclusive |
| **R4: Four-copy limit** | Non–Basic Energy cards have `quantity ≤ 4` |
| **R5: Format string** | `format` is exactly `"standard"` (case-sensitive) |
| **R6: Regulation marks declared** | `regulation_marks` is a non-empty array of strings from `["G","H","I","J"]` |
| **R7: IDs are non-empty strings** | No blank or whitespace-only `id` values |

Note: Basic Energy detection (for the R4 exemption) is done at enrichment time by
checking `supertype == "Energy" && subtypes contains "Basic"` against the card database.
The file format itself does not encode supertype — that comes from the MCP server.

### 6. File Naming Convention

```
decks/
├── {archetype-slug}.toml          # e.g. charizard-ex.toml
├── {archetype-slug}.v{n}.toml     # versioned snapshots
└── {archetype-slug}.exported.json # programmatic export
```

Versioned files are created by the CLI when a session proposes and saves changes.
The original file is never mutated — versions always create new files.

### 7. Schema Version (Future Compatibility)

The schema currently has no explicit version field. If breaking changes are required
in the future, a `schema_version` top-level field will be added with value `2`. Absence
of `schema_version` means version `1` (this spec).

---

## File Structure

No code changes in this spec — this is a data contract document. The following files
are created as examples and reference material:

```
apps/deck-cli/decks/
└── example.toml    # Minimal valid 60-card deck for testing
```

---

## Acceptance Criteria

- [ ] The example TOML file parses without error using `smol-toml` in TypeScript
- [ ] The example TOML file parses without error using the `toml` crate in Rust
- [ ] A file with 59 total quantity is rejected by R1
- [ ] A file with two entries sharing the same `id` is rejected by R2
- [ ] A non–Basic Energy card with `quantity = 5` is rejected by R4 (after enrichment)
- [ ] `format = "Standard"` (capital S) is rejected by R5
- [ ] Empty `regulation_marks = []` is rejected by R6

---

## Dependencies

None.

---

## Verification

```bash
# Validate the example file parses correctly (once SPEC_02 is implemented)
cargo run --manifest-path apps/mcp-server/Cargo.toml -- validate_deck \
  apps/deck-cli/decks/example.toml

# Validate JSON alternative parses identically (once SPEC_03 is implemented)
bun apps/deck-cli/src/index.ts --deck apps/deck-cli/decks/example.json --dry-run
```
