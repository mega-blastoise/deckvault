# SPEC: Admin Dashboard

## Problem

The platform has zero operational tooling. User management, content moderation, platform health monitoring, and growth visibility all require direct database access. As the platform grows from single-operator to multi-user, this blocks every operational workflow:

- **Can't answer "how is the platform doing?"** without running SQL
- **Can't moderate** abusive LGS reports or bad meta deck data without DELETE statements
- **Can't manage users** — no way to see who signed up, promote admins, or remove bad actors
- **Can't diagnose issues** — no visibility into migration state, table health, or API errors
- **Can't see growth** — no signup trends, engagement patterns, or content velocity

## Research: What Makes SaaS Admin Dashboards Successful

Studied patterns from Stripe Dashboard, Vercel Admin, Linear Admin, PostHog, Retool, and Firebase Console. The consistent patterns that separate great admin panels from CRUD tables:

### 1. Glanceable Health (Stripe, PostHog)
The landing view answers "is everything okay?" in under 3 seconds. Key metrics with **trend indicators** (not just absolute numbers) — a count of 500 users means nothing without knowing it was 480 yesterday. Time-series sparklines beat raw numbers.

### 2. Activity Feed / Event Stream (Vercel, Firebase)
A chronological stream of platform events (signups, deck creations, report submissions) gives admins situational awareness without querying each entity type. This is the single most-used panel in production admin tools.

### 3. User Context, Not Just User Rows (Stripe, Intercom)
Clicking a user should show their full journey: when they signed up, what they've built, how active they are. A user detail panel with aggregated activity replaces 5 separate database queries.

### 4. Inline Actions with Confirmation (Linear, Retool)
Destructive actions (delete user, remove content) happen inline with confirmation dialogs — never on a separate page. Reduces context-switching and makes moderation fast.

### 5. Search-First Navigation (Retool, Firebase Console)
A global search at the top that searches across users, decks, and content. Admins rarely browse paginated tables — they search for a specific entity.

### 6. Data Export (PostHog, Stripe)
CSV export on any table view. Essential for offline analysis, reporting to stakeholders, or piping data into spreadsheets.

### 7. Announcements / Platform Communication (Intercom, LaunchDarkly)
Ability to post platform-wide announcements (maintenance windows, new features, competitive season dates) without deploying code.

### 8. Feature Flags (LaunchDarkly, PostHog)
Toggle features on/off for specific users or globally. Critical during active development to decouple deploy from release.

---

## Scope

An admin section at `/admin` with **six panels** — gated by a `role` column on the `users` table:

| Panel | Purpose | Priority |
|-------|---------|----------|
| **Overview** | Glanceable health + activity feed | P0 |
| **Users** | User management with detail drilldown | P0 |
| **Content** | Meta deck + LGS report moderation | P0 |
| **System** | DB health, migrations, uptime | P0 |
| **Announcements** | Platform-wide banner messages | P1 |
| **Feature Flags** | Runtime feature toggles | P1 |

P0 panels ship in this implementation. P1 panels are specced for architecture awareness but implemented in this pass as well since the backend plumbing is already there.

### Out of Scope

- Multi-role RBAC (editor, moderator, etc.) — single `admin` role is sufficient
- Audit logging with immutable trail — future concern
- User impersonation ("view as") — requires session spoofing, deferred
- Real-time websocket push — polling / manual refresh is fine
- Bulk data import/export pipelines — existing scripts handle this

---

## Architecture

### Database

**Migration `016_user_roles.sql`:**

```sql
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
UPDATE users SET role = 'admin' WHERE email = 'rustycloud42@protonmail.com';
```

**Migration `017_announcements.sql`:**

```sql
CREATE TABLE IF NOT EXISTS announcements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'info',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  starts_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at    TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Migration `018_feature_flags.sql`:**

```sql
CREATE TABLE IF NOT EXISTS feature_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  description TEXT,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO feature_flags (key, description, enabled) VALUES
  ('scaffolder', 'Deck scaffolder / AI card suggestions', true),
  ('local_meta', 'Local meta LGS reporting', true),
  ('cp_tracker', 'Championship point tracker', true),
  ('magic_link_auth', 'Magic link email authentication', true),
  ('deck_versions', 'Deck version history and diffing', true)
ON CONFLICT (key) DO NOTHING;
```

### Backend — REST API

**New file: `apps/rest-api/src/handlers/admin.ts`**

All endpoints require `authRequired` + `adminRequired` middleware chain.

#### Core Admin Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/admin/stats` | Platform aggregate stats with trends |
| `GET` | `/api/v1/admin/activity` | Recent platform activity feed |
| `GET` | `/api/v1/admin/users` | Paginated user list with activity counts |
| `GET` | `/api/v1/admin/users/:id` | User detail with full activity summary |
| `PUT` | `/api/v1/admin/users/:id/role` | Set user role |
| `DELETE` | `/api/v1/admin/users/:id` | Delete user + cascade |
| `GET` | `/api/v1/admin/content/meta-decks` | Meta deck list for moderation |
| `DELETE` | `/api/v1/admin/content/meta-decks/:id` | Remove a meta deck |
| `GET` | `/api/v1/admin/content/reports` | LGS reports for moderation |
| `DELETE` | `/api/v1/admin/content/reports/:id` | Remove abusive report |
| `GET` | `/api/v1/admin/system` | DB health, migrations, uptime |

#### Announcements Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/admin/announcements` | List all announcements |
| `POST` | `/api/v1/admin/announcements` | Create announcement |
| `PUT` | `/api/v1/admin/announcements/:id` | Update announcement |
| `DELETE` | `/api/v1/admin/announcements/:id` | Delete announcement |
| `GET` | `/api/v1/announcements/active` | **Public** — active announcements for banner display |

#### Feature Flags Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/admin/flags` | List all feature flags |
| `PUT` | `/api/v1/admin/flags/:id` | Toggle flag enabled/disabled |
| `POST` | `/api/v1/admin/flags` | Create new flag |
| `DELETE` | `/api/v1/admin/flags/:id` | Remove flag |

**New middleware: `adminRequired`** in `middleware/auth.ts` — after `authRequired` extracts the user, queries `users.role` and returns 403 if not `'admin'`.

**New Postgres methods:**

```
// Overview
getAdminStats()           → { users, decks, collections, metaDecks, reports, signupsToday, signupsWeek }
getSignupTrend(days)      → { date: string, count: number }[]
getRecentActivity(limit)  → ActivityEvent[]  (union of recent signups, deck creates, reports)
getTopUsers(limit)        → { id, name, email, deckCount, collectionSize, lastActive }[]

// Users
listUsersAdmin(opts)      → { data: AdminUserRow[], total }
getUserAdmin(id)          → AdminUserRow | null  (with decks[], collection size, report count)
setUserRole(id, role)     → UserRow | null
deleteUser(id)            → boolean  (cascades all user data in a transaction)

// Content
listMetaDecksAdmin(opts)  → { data: MetaDeckRow[], total }  (reuses existing but admin-scoped)
deleteMetaDeckAdmin(id)   → boolean  (cascades meta_deck_cards)
listReportsAdmin(opts)    → { data: LgsReportRow[], total }
deleteReport(id)          → boolean

// System
getSystemHealth()         → { tables: { name, rowCount }[], migrations: string[], uptime: number }

// Announcements
listAnnouncements()       → AnnouncementRow[]
createAnnouncement(input) → AnnouncementRow
updateAnnouncement(id, i) → AnnouncementRow | null
deleteAnnouncement(id)    → boolean
getActiveAnnouncements()  → AnnouncementRow[]  (where is_active AND within date range)

// Feature Flags
listFeatureFlags()        → FeatureFlagRow[]
toggleFeatureFlag(id, v)  → FeatureFlagRow | null
createFeatureFlag(input)  → FeatureFlagRow
deleteFeatureFlag(id)     → boolean
```

### Frontend

**New files:**

```
apps/web/src/web/pages/AdminPage/
  index.ts
  AdminPage.tsx
  AdminPage.css
  panels/
    OverviewPanel.tsx
    UsersPanel.tsx
    ContentPanel.tsx
    SystemPanel.tsx
    AnnouncementsPanel.tsx
    FlagsPanel.tsx

apps/web/src/web/components/AdminRoute/
  index.ts
  AdminRoute.tsx

apps/web/src/web/components/AnnouncementBanner/
  index.ts
  AnnouncementBanner.tsx
  AnnouncementBanner.css

apps/web/src/web/services/AdminService.ts
```

**AdminRoute** — extends `ProtectedRoute`. After auth resolves, checks `user.role === 'admin'`. Non-admins see a styled 403 page ("You don't have permission to access this page"), not a redirect.

**AdminPage** — sidebar tab navigation (not top tabs — admin panels have enough density to warrant a sidebar). Each panel is a separate component to keep file sizes manageable and enable lazy loading.

---

### Panel 1: Overview (default)

**Goal:** Answer "how is the platform doing?" in 3 seconds.

**Stat Cards Row (top):**
- Total Users (with +N today badge)
- Total Decks
- Total Collection Entries
- Total Meta Decks
- Total LGS Reports

Each stat card shows the absolute number + a small trend indicator (sparkline or delta from 7 days ago). Uses the existing `Stats` component.

**Signup Trend Chart:**
- Bar chart showing signups per day for the last 30 days
- Pure CSS bars (no charting library) — each bar is a `div` with `height` set as percentage of max
- X-axis labels: every 7th day
- Hover tooltip showing exact count + date

**Activity Feed:**
- Chronological list of the last 50 platform events
- Event types: `user_signup`, `deck_created`, `deck_deleted`, `report_submitted`, `meta_deck_added`
- Each event: icon + description + relative timestamp ("2 hours ago")
- Pulled from a single query that UNIONs across tables ordered by timestamp
- Auto-refreshes every 60 seconds via `refetchInterval` on the TanStack Query

**Top Users Table:**
- Top 5 users by engagement (deck count + collection size)
- Columns: avatar, name, email, decks, collection cards, joined date
- Click to navigate to user detail in Users panel

### Panel 2: Users

**Global Search Bar:**
- Searches by name or email (ILIKE)
- Debounced 300ms input
- Results update the table below

**User Table:**
- Columns: avatar, name, email, role (badge), decks, collection size, joined, last active
- Sortable by: name, joined, decks, collection size
- Paginated: 20 per page
- Row click expands inline detail (or could navigate to detail view)

**User Detail (expanded row or drilldown):**
- Full user profile: name, email, avatar, role, created_at
- Activity summary: deck count, collection size, CP entries, LGS reports
- List of user's decks (name, format, card count, last updated)
- **Actions:**
  - Toggle role (user <-> admin) with confirmation dialog
  - Delete user with confirmation dialog (warns about cascade)

**Inline Actions:**
- Role toggle: click the role badge → confirmation modal → PUT
- Delete: red button → confirmation modal with user's name typed to confirm → DELETE

### Panel 3: Content

**Sub-tabs: Meta Decks | LGS Reports**

**Meta Decks Tab:**
- Table: name, archetype, format, tier, event_name, event_date, card_count
- Search by name/archetype
- Paginated: 20 per page
- Delete action with confirmation
- CSV export button (client-side — serialize table data to CSV blob)

**LGS Reports Tab:**
- Table: reporter (name), archetype, format, lgs_name, region, result, reported_at
- Filter by format
- Paginated: 20 per page
- Delete action for moderation (removes abusive/spam reports)

### Panel 4: System

**Database Health Table:**
- Row for each platform table: name, row count, estimated size
- Visual bar showing relative size
- Data from `pg_stat_user_tables`

**Migration Status:**
- List of applied migrations with applied_at timestamp
- Visual checkmark for each
- Shows if any pending (files on disk not in `_migrations` table)

**Server Info:**
- Server uptime (process start time → now)
- Node/Bun version
- PostgreSQL version
- Active database connections

### Panel 5: Announcements

**Announcement List:**
- Table: title, type (info/warning/maintenance), status (active/scheduled/expired), starts_at, ends_at
- Active announcements highlighted

**Create/Edit Form:**
- Title (text input)
- Body (textarea, supports markdown-ish plain text)
- Type: dropdown (info, warning, maintenance, celebration)
- Active: toggle
- Start date: datetime picker
- End date: datetime picker (optional — null means indefinite)

**Preview:**
- Shows how the announcement banner will look to users

**Public-facing: `AnnouncementBanner` component:**
- Sits above the Navbar in AppLayout
- Fetches `GET /api/v1/announcements/active`
- Displays active announcements as dismissible banners
- Color-coded by type: blue (info), yellow (warning), red (maintenance), green (celebration)
- Dismissal stored in `sessionStorage` so it doesn't reappear during the session

### Panel 6: Feature Flags

**Flag List Table:**
- Columns: key, description, status (enabled/disabled toggle), updated_at
- Inline toggle switch to enable/disable
- No confirmation needed for toggles (they're designed to be fast)

**Create Flag Form:**
- Key (slug format: `snake_case`)
- Description (what the flag controls)
- Default state: enabled/disabled

**Integration pattern for consuming flags:**
- Public endpoint `GET /api/v1/flags` returns `{ [key]: boolean }` map
- Frontend can fetch on app init and store in context/query cache
- Individual features check the flag before rendering

---

### Auth Enhancement

The `/auth/me` endpoint currently returns `{ id, email, name, avatarUrl }`. Changes:

1. **Backend:** Add `role` field to the `getMe` response
2. **Frontend `AuthUser` type:** Add `role: 'user' | 'admin'`
3. **`useAuth()` hook:** Expose `isAdmin` computed boolean
4. **Navbar:** Show "Admin" link only when `isAdmin` is true

---

## Data Flow

```
Browser → /admin → AdminRoute (auth check → role check)
  │
  ├── Overview Panel
  │   ├── AdminService.getStats()     → GET /api/v1/admin/stats
  │   ├── AdminService.getActivity()  → GET /api/v1/admin/activity?limit=50
  │   └── AdminService.getTopUsers()  → (included in stats response)
  │
  ├── Users Panel
  │   ├── AdminService.getUsers(opts) → GET /api/v1/admin/users?page=&limit=&q=&sort=
  │   ├── AdminService.getUser(id)    → GET /api/v1/admin/users/:id
  │   ├── AdminService.setRole(id,r)  → PUT /api/v1/admin/users/:id/role
  │   └── AdminService.deleteUser(id) → DELETE /api/v1/admin/users/:id
  │
  ├── Content Panel
  │   ├── AdminService.getMetaDecks() → GET /api/v1/admin/content/meta-decks
  │   ├── AdminService.deleteMetaDeck()→ DELETE /api/v1/admin/content/meta-decks/:id
  │   ├── AdminService.getReports()   → GET /api/v1/admin/content/reports
  │   └── AdminService.deleteReport() → DELETE /api/v1/admin/content/reports/:id
  │
  ├── System Panel
  │   └── AdminService.getSystem()    → GET /api/v1/admin/system
  │
  ├── Announcements Panel
  │   ├── AdminService.getAnnouncements()     → GET /api/v1/admin/announcements
  │   ├── AdminService.createAnnouncement()   → POST /api/v1/admin/announcements
  │   ├── AdminService.updateAnnouncement()   → PUT /api/v1/admin/announcements/:id
  │   └── AdminService.deleteAnnouncement()   → DELETE /api/v1/admin/announcements/:id
  │
  └── Flags Panel
      ├── AdminService.getFlags()      → GET /api/v1/admin/flags
      ├── AdminService.toggleFlag()    → PUT /api/v1/admin/flags/:id
      ├── AdminService.createFlag()    → POST /api/v1/admin/flags
      └── AdminService.deleteFlag()    → DELETE /api/v1/admin/flags/:id

Public (non-admin):
  AnnouncementBanner → GET /api/v1/announcements/active
```

---

## CSS Design

Follows existing BEM conventions with `.admin-page` block prefix. Nebula theme compatibility via semantic CSS variables.

**Layout:** Two-column — 220px sidebar + fluid content area. Sidebar collapses to top tabs on `< 768px`.

**Color Coding:**
- Role badges: admin = `var(--badge-admin)`, user = `var(--badge-user)`
- Announcement types: info = blue, warning = amber, maintenance = red, celebration = green
- Feature flag toggles: enabled = green, disabled = `var(--text-tertiary)`
- Activity feed icons: signup = blue, deck = purple, report = amber, delete = red

**Tables:** Reusable `.admin-table` class — sticky header, alternating row backgrounds, hover highlight.

---

## Implementation Order

1. **Migrations** — `016_user_roles.sql`, `017_announcements.sql`, `018_feature_flags.sql`
2. **Admin middleware** — `adminRequired` in `middleware/auth.ts`
3. **Postgres methods** — all admin queries in `postgres.ts`
4. **API handlers** — `handlers/admin.ts` + wire routers into `index.ts`
5. **Auth enhancement** — `role` in `/auth/me` response + frontend `AuthUser` type + `isAdmin`
6. **AdminRoute** — role-gated route guard component
7. **AdminService** — frontend API client
8. **AdminPage shell** — sidebar + tab routing + CSS layout
9. **Overview panel** — stats + trend chart + activity feed
10. **Users panel** — table + search + detail + actions
11. **Content panel** — meta decks + reports tables with moderation
12. **System panel** — DB health + migrations + server info
13. **Announcements panel** — CRUD + preview
14. **AnnouncementBanner** — public-facing banner in AppLayout
15. **Feature flags panel** — flag list + toggle + create
16. **Route + navbar registration** — `/admin` route, navbar link for admins

---

## Acceptance Criteria

### Access Control
- [ ] Non-authenticated users hitting `/admin` are redirected to sign-in
- [ ] Authenticated non-admin users hitting `/admin` see a 403 message
- [ ] All `/api/v1/admin/*` endpoints return 401 for unauthenticated requests
- [ ] All `/api/v1/admin/*` endpoints return 403 for non-admin authenticated users
- [ ] Admin navbar link only visible to admin users

### Overview Panel
- [ ] Stat cards show accurate platform totals
- [ ] Signup trend chart renders last 30 days of signup data
- [ ] Activity feed shows recent events across all entity types
- [ ] Activity feed auto-refreshes every 60 seconds

### Users Panel
- [ ] Paginated user table with deck count and collection size
- [ ] Search filters users by name or email
- [ ] User detail shows full activity summary
- [ ] Role toggle works with confirmation dialog
- [ ] User delete works with confirmation dialog and cascades all data

### Content Panel
- [ ] Meta decks table with search and pagination
- [ ] LGS reports table with format filter and pagination
- [ ] Delete actions work with confirmation dialogs

### System Panel
- [ ] Accurate row counts for all platform tables
- [ ] Migration list shows all applied migrations with timestamps
- [ ] Server info displays uptime and version information

### Announcements
- [ ] Admin can create, edit, and delete announcements
- [ ] Active announcements display as banners for all users
- [ ] Banner is dismissible (persists in sessionStorage)
- [ ] Type-based color coding works correctly

### Feature Flags
- [ ] Flag list displays all flags with current state
- [ ] Inline toggle enables/disables flags
- [ ] Admin can create and delete flags

### Code Quality
- [ ] No `any` types in new code
- [ ] All new files pass `bun run check-types`
- [ ] All new CSS follows BEM with `.admin-page` / `.admin-table` / `.announcement-banner` blocks
- [ ] Services use existing `APIModel` pattern with credentials
