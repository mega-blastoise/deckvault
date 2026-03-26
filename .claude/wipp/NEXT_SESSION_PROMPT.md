# Next Session Prompt

Copy-paste this as your opening message in the new session.

---

We're continuing development on **Project Johto (DeckVault — Pokemon TCG platform)**. Read the following context files before doing anything else:

- `.claude/wipp/TIER_PARITY_CONTEXT.md` — full history, current app surface, key technical facts
- `.claude/guides/LOCAL_DEV_SETUP.md` — local dev workflow (`bun run db:dev` + `bun run dev`)

**Where we are:**

Tiers 1–3 of the competitive parity workstream are fully shipped. A UI polish + magic email link auth session has also shipped and been deployed to prod. The app is in a beta-ready state.

**What shipped in the UI polish session (2026-03-26):**

1. **Favicon** — pokéball SVG
2. **Navbar logo icon** — pokéball left of "DeckVault"
3. **Navbar cleanup** — "Collection" and "Dashboard" gated links removed
4. **Glassmorphism** — deeper glass on Navbar, Cards, MetaDeckCard, sign-in card (Nebula theme)
5. **Card height standardization** — equal height cards in grid rows
6. **Magic email link auth** — full stack (migrations 013+014, Resend via fetch, secure token flow)
   - Domain `deckvault.gg` verified in Resend
   - Prod env vars needed: `RESEND_API_KEY`, `RESEND_FROM_EMAIL=DeckVault <noreply@deckvault.gg>`, `APP_URL=https://deckvault.gg`

**Migrations pending prod (applied in dev):**
- 013 `magic_link_tokens` — makes `users.google_id` nullable, adds tokens table
- 014 `magic_link_nullable_user_id` — drops NOT NULL on `magic_link_tokens.user_id`

**Suggested next work:**

- Visual audit / beta polish pass (see suggestions at end of last session)
- TCGPlayer mass entry UX polish on DeckDetailPage
- Dashboard page (currently a gated route with no content)
- Collection page (same)
