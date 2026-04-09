---
name: SSR + TanStack Query Pattern (validated)
description: The confirmed, production-validated approach for TanStack Query SSR in the Pokemon web app — per-request QueryClient, HydrationBoundary, dehydrated state via window.__REACT_QUERY_STATE__
type: project
---

The Pokemon web app SSR latency issue was solved in April 2026. The root causes and fixes are locked in.

**Root causes of the original 12s SSR hang:**
- Module-level `QueryClient` singleton in `QueryProvider.tsx` — shared across all requests
- `getBaseAPIURL()` returned relative URL `/api/v1` on server (no `process.env.API_URL`, no `window`)
- `useDecksQuery` fired during `renderToReadableStream`, fetch failed, TanStack Query retried 3× (1s+2s+4s backoff) keeping the stream open
- Cloudflare buffered the entire streaming response before forwarding — converting the stream delay into TTFB

**The implemented solution (Phase 1, fully shipped):**
- New data layer at `apps/web/src/web/layers/data/` mirroring the Arcturus-JR project pattern
- `getJavascriptEnvironment()` in `utils/env.ts` for server/browser branching
- `createQueryClient()` in `utils/browser.ts` — `retry: false` on server, `retry: 3` on client
- `ServerDataLayer` / `BrowserDataLayer` / `DataLayer` isomorphic split
- `render.tsx` creates a fresh `QueryClient` per request, dehydrates it into `window.__REACT_QUERY_STATE__`
- Client `browser.tsx` reads `getDehydratedState()` and passes through `HydrationBoundary`
- `Cache-Control: no-store` + `X-Accel-Buffering: no` headers on SSR response to prevent Cloudflare buffering

**Reference pattern:** `/home/nicks-dgx/dev/.Project-Arcturus/Arcturus-JR/apps/web/` — the user's preferred SSR + TanStack Query architecture. Mirror this project when making future changes to the data layer.

**Phase 2 (not yet implemented):** Route-level query prefetching via a query registry (`apps/web/src/server/lib/query-registry.ts`) and `prefetchForRoute(serverQueryClient, pathname, request)` called before `renderToReadableStream`. This will eliminate loading flashes on high-value pages (meta-decks, browse).

**Why:** Per-request QueryClient is correct for SSR — module singletons leak state between requests and cause cross-user data contamination risk in multi-user contexts.
