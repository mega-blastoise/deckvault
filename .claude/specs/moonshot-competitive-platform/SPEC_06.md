# SPEC_06: Local Meta Intelligence

## Context

All existing meta data is global and post-hoc (tournament results after the fact). No tool tracks
what people are actually playing at your local game store this week. This spec builds a crowd-sourced
local meta reporting layer — users submit what they faced, and the platform surfaces frequency data
by archetype and region. This is the long-term community moat.

---

## Prerequisites

- SPEC_01 complete (routing)
- SPEC_02 complete (archetype vocabulary from meta decks — we reuse archetype slugs)
- Authentication required for reporting

---

## Requirements

### 1. Database: LGS Reports

New migration: `database/migrations/006_local_meta.sql`

```sql
-- User-reported "I faced this archetype at an event"
CREATE TABLE lgs_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archetype    VARCHAR(80) NOT NULL,    -- slug e.g. "charizard-pidgeot"
  archetype_name VARCHAR(120) NOT NULL, -- display name e.g. "Charizard ex / Pidgeot ex"
  format       VARCHAR(20) NOT NULL,
  lgs_name     VARCHAR(200),           -- optional, user-provided
  region       VARCHAR(100),           -- optional, e.g. "Seattle, WA"
  result       VARCHAR(10),            -- optional: 'win' | 'loss' | 'tie'
  reported_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lgs_reports_archetype ON lgs_reports(archetype);
CREATE INDEX idx_lgs_reports_format ON lgs_reports(format);
CREATE INDEX idx_lgs_reports_reported_at ON lgs_reports(reported_at);
CREATE INDEX idx_lgs_reports_user_id ON lgs_reports(user_id);
```

Rate limit: max 10 reports per user per calendar day. Enforce at the API layer.

### 2. Archetype Aggregation View

```sql
-- Read-optimized view for meta frequency
CREATE VIEW local_meta_frequency AS
SELECT
  archetype,
  archetype_name,
  format,
  COUNT(*)                                    AS report_count,
  COUNT(*) FILTER (WHERE result = 'win')      AS win_count,
  COUNT(*) FILTER (WHERE result = 'loss')     AS loss_count,
  COUNT(*) FILTER (WHERE result = 'tie')      AS tie_count,
  MAX(reported_at)                            AS last_seen
FROM lgs_reports
WHERE reported_at >= NOW() - INTERVAL '30 days'
GROUP BY archetype, archetype_name, format
ORDER BY report_count DESC;
```

### 3. REST API: Local Meta Endpoints

New handler: `apps/rest-api/src/handlers/local-meta.ts`

```typescript
// POST /api/v1/local-meta/reports
// Body: { archetype, archetypeName, format, lgsName?, region?, result? }
// Requires: authentication
// Rate limit: 10/user/day — check count before insert
// Returns: { id, archetype, reportedAt }

// GET /api/v1/local-meta/frequency
// Query params: format?, days? (default 30), limit? (default 20)
// Returns: { archetypes: ArchetypeFrequency[], generatedAt, dayRange }
// Public endpoint — no auth required

interface ArchetypeFrequency {
  archetype: string;
  archetypeName: string;
  format: string;
  reportCount: number;
  winCount: number;
  lossCount: number;
  tieCount: number;
  winRate: number | null;    // null if result not provided for most reports
  lastSeen: string;
}

// Rate limit check:
async function checkRateLimit(db: DatabaseService, userId: string): Promise<boolean> {
  const { rows } = await db.pg.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM lgs_reports
     WHERE user_id = $1
       AND reported_at >= DATE_TRUNC('day', NOW())`,
    [userId]
  );
  return parseInt(rows[0]?.count ?? '0', 10) < 10;
}
```

### 4. Report Submission UI

A modal dialog, accessible from two surfaces:
1. A "Report a Match" button in the main navbar (authenticated users only)
2. A "Report" FAB on `LocalMetaPage`

```typescript
// apps/web/src/web/components/ReportMatchModal/ReportMatchModal.tsx

interface ReportMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ReportMatchModal({ isOpen, onClose }: ReportMatchModalProps) {
  const [archetype, setArchetype] = useState('');
  const [archetypeName, setArchetypeName] = useState('');
  const [format, setFormat] = useState<DeckFormat>('standard');
  const [result, setResult] = useState<'win' | 'loss' | 'tie' | ''>('');
  const [lgsName, setLgsName] = useState('');

  // Archetype field: free text with autocomplete from known meta_decks archetypes
  // Uses datalist (HTML5 native) — no external autocomplete library

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Report a Match">
      <form onSubmit={handleSubmit} className="report-match-form">
        <label>
          Opponent's Archetype
          <input
            list="archetypes-list"
            value={archetypeName}
            onChange={(e) => setArchetypeName(e.target.value)}
            placeholder="e.g. Charizard ex / Pidgeot ex"
            required
          />
          <datalist id="archetypes-list">
            {/* Populated from GET /api/v1/meta-decks distinct archetypes */}
          </datalist>
        </label>
        <label>
          Format
          <select value={format} onChange={(e) => setFormat(e.target.value as DeckFormat)}>
            <option value="standard">Standard</option>
            <option value="expanded">Expanded</option>
          </select>
        </label>
        <label>
          Result (optional)
          {(['win', 'loss', 'tie'] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={`report-match-form__result-btn${result === r ? ' --active' : ''}`}
              onClick={() => setResult((prev) => (prev === r ? '' : r))}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </label>
        <label>
          LGS Name (optional)
          <input value={lgsName} onChange={(e) => setLgsName(e.target.value)} placeholder="Your local game store" />
        </label>
        <button type="submit" className="button button--primary">Submit Report</button>
      </form>
    </Modal>
  );
}
```

### 5. LocalMetaPage

New page at `/local-meta`:

```
┌──────────────────────────────────────────────────────────────┐
│  Local Meta Intelligence                                      │
│  "What people are playing near you — last 30 days"           │
│                                                              │
│  [Standard ▾]  [All Regions ▾]        [Report a Match ➕]   │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  #1  Charizard ex / Pidgeot ex          ████████ 84   │  │
│  │  #2  Snorlax Stall                      █████    52   │  │
│  │  #3  Regidrago VSTAR                    ████     41   │  │
│  │  #4  Iron Thorns ex                     ███      28   │  │
│  │  #5  Gardevoir ex                       ██       19   │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  Based on 324 reports from the community (last 30 days)      │
└──────────────────────────────────────────────────────────────┘
```

The frequency bar is a CSS-only bar chart:
```css
.local-meta-row__bar {
  width: calc(var(--count) / var(--max-count) * 100%);
  background: var(--focus-ring);
  height: 8px;
  border-radius: 4px;
}
```
Set `--count` and `--max-count` as inline CSS custom properties.

### 6. Navbar Integration

Add "Meta" nav link (pointing to `/local-meta`) to the Navbar for all users. This is the primary
discovery surface.

Authenticated users see a small "Report +" icon button in the navbar toolbar area.

---

## File Structure

```
database/migrations/
└── 006_local_meta.sql

apps/rest-api/src/handlers/
└── local-meta.ts                  # POST /api/v1/local-meta/reports, GET /api/v1/local-meta/frequency

apps/web/src/web/pages/LocalMetaPage/
├── index.ts
├── LocalMetaPage.tsx
└── LocalMetaPage.css

apps/web/src/web/components/ReportMatchModal/
├── index.ts
├── ReportMatchModal.tsx
└── ReportMatchModal.css

apps/web/src/web/routes/
└── routes.tsx                     # MODIFIED — add /local-meta route

apps/web/src/web/components/Navbar/
└── Navbar.tsx                     # MODIFIED — add Meta nav link + Report button
```

---

## Acceptance Criteria

- [ ] `POST /api/v1/local-meta/reports` creates a report for authenticated users
- [ ] Posting 11 reports in one day returns `429 Too Many Requests` on the 11th
- [ ] `GET /api/v1/local-meta/frequency` returns aggregated frequency for last 30 days
- [ ] `LocalMetaPage` renders at `/local-meta` with frequency bar chart
- [ ] Frequency bars are proportionally sized to the highest count value
- [ ] Format filter updates the list without page reload
- [ ] "Report a Match" button is visible in navbar for authenticated users only
- [ ] `ReportMatchModal` submits a report and shows a success toast
- [ ] Archetype input has datalist autocomplete from known archetypes
- [ ] Report count in page footer reflects actual total from API
- [ ] No TypeScript errors introduced

---

## Dependencies

- SPEC_01 (routing)
- SPEC_02 (archetype vocabulary for autocomplete)

---

## Verification

```bash
# Apply migration
psql $DATABASE_URL -f database/migrations/006_local_meta.sql

# Submit a report (requires auth)
curl -b cookies.txt -X POST http://localhost:3001/api/v1/local-meta/reports \
  -H "Content-Type: application/json" \
  -d '{"archetype":"charizard-pidgeot","archetypeName":"Charizard ex / Pidgeot ex","format":"standard"}'

# Get frequency
curl http://localhost:3001/api/v1/local-meta/frequency | jq '.archetypes[0]'

# Rate limit test (submit 11 times)
for i in {1..11}; do
  curl -s -o /dev/null -w "%{http_code}\n" -b cookies.txt \
    -X POST http://localhost:3001/api/v1/local-meta/reports \
    -H "Content-Type: application/json" \
    -d '{"archetype":"test","archetypeName":"Test","format":"standard"}'
done
# Expected: 10x 200, 1x 429

# Type check
cd apps/web && bun run check-types
cd apps/rest-api && bun run check-types
```
