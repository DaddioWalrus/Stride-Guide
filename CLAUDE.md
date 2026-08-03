# Stride Guide — Claude Instructions

## Status
- **Repo:** Stride-Guide
- **What it is:** A walking-route PWA — generate loop or A→B routes by time or distance, with turn-by-turn GPS navigation, saved routes/places, and walk history.
- **Phase:** Pre-beta polish. Feature-complete; working through the launch checklist in `docs/beta-checklist.html` before inviting testers.
- **State:** working
- **Runs on:** Vercel (static hosting + two serverless functions), auto-deploys from `main` on push. Not self-hosted, no server or device to administer.
- **Depends on:** Supabase (auth, Postgres, storage), OpenRouteService directions API (proxied through `/api/route`), Nominatim + Photon (geocoding, called client-side), Leaflet + leaflet-rotate + OSM/CARTO/Esri map tiles (all loaded from CDN).
- **Next action:** Wire custom SMTP into Supabase Auth (Dashboard → Settings → Auth → SMTP). Flagged as the top blocker in `docs/beta-checklist.html` — Supabase's built-in mailer is capped at a handful of emails/hour and will silently stop delivering OTP sign-in codes once testers are on it.
- **Last reviewed:** 2026-08-03

## Branch

All development happens on `main` — the live Vercel app. There is no other active branch.

**Never push to any branch other than `main` without explicit user instruction.**

## Commands

No build, lint, or test tooling — this is plain static HTML/CSS/JS (no `package.json`) plus two tiny Vercel functions in `api/`.

Run it locally, functions included, matching production:
```
npx vercel dev
```
First run needs `vercel login` and either a linked project or a local `.env` (gitignored) with `ORS_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` — see `.env.example`.

There's no automated test suite. Verify changes by clicking through the flow, or against `docs/beta-checklist.html` (open it directly in a browser — it's a standalone checklist page).

## Architecture

UI is phase-based: `showPhase(id)` hides all panels and shows the specified one.

| Phase | Panel ID | Trigger |
|---|---|---|
| 1 | `search-panel` | Default / A→B mode |
| 1 | `loop-panel` | Loop mode |
| 2 | `preview-panel` | Destination selected (A→B) |
| 3 | `route-panel` | Route generated |
| 4 | `nav-panel` | Navigation started |

- GPS acquired automatically via `requestGPS()` / `startNavigation()` in `map.js`
- User never manually sets a start point on A→B; `acquireStartLocation()` does it
- Errors shown via `showError(msg)` — toast from `#error-toast` (defined in `ui.js`, global)
- Loop state: `currentMode`, `loopMode`, `loopValue`, `loopUseMetric`, `loopLastDistKm`
- Nav state: `navTotalDistKm`, `navStartTime`, `navRouteCoords`, `navRouteDistKm`
- `haversineKm(lat1,lng1,lat2,lng2)` — global utility in `ui.js`
- `drawRouteArrows(coords)` — available in `map.js`
- `js/theme-init.js` runs synchronously in `<head>` (before `ui.js` loads) to apply a saved light/dark override pre-paint and avoid a flash
- `sw.js` is an app-shell service worker: caches static assets for offline load, but explicitly bypasses `/api/*`, Supabase, tile servers, and geocoders — those stay network-only

## File Map

| File | Purpose |
|---|---|
| `js/map.js` | Leaflet map, GPS, markers, geocoding, `drawRouteArrows` |
| `js/route.js` | ORS API calls (`generateLoopRoute`, `generateABRoute`) |
| `js/ui.js` | All UI interaction, phase navigation, walk logging hooks |
| `js/auth.js` | Auth (OTP), account panel, Supabase data (history, stats, routes, places) |
| `js/supabase.js` | Supabase client init, exports `sbClient` and `sbReady` |
| `js/theme-init.js` | Pre-paint dark/light theme apply (see above) |
| `css/style.css` | All styles |
| `index.html` | HTML structure |
| `api/config.js` | Serverless: hands the Supabase URL/anon key to the client |
| `api/route.js` | Serverless: proxies ORS directions requests (keeps `ORS_API_KEY` server-side) |
| `sw.js` | Service worker — offline app shell |

## Supabase Tables

- `walk_history`: `id, user_id, dist_km, duration_sec, mode, walked_at`
- `saved_routes`: `id, user_id, name, mode, coords(jsonb), dist_km, loop_mode, loop_value, loop_use_metric, dest_lat, dest_lng, start_lat, start_lng, created_at`
- `saved_locations`: `id, user_id, name, lat, lng, created_at`
- `profiles`: `id, email, tier, full_name, avatar_url`

Setup SQL exists in the repo for `profiles` (`supabase-setup.sql`), `saved_locations` (`supabase-saved-locations.sql`), and the avatars storage bucket (`supabase-storage.sql`) — each idempotent, run in the Supabase SQL Editor. **`walk_history` and `saved_routes` have no SQL file in the repo.** Their schema above is reverse-engineered from the `.from(...)` calls in `js/auth.js`; if you ever need to recreate the DB from scratch, you'd have to write that migration yourself or pull the schema from the live Supabase project.

## Environment

- ORS API key injected by Vercel from `ORS_API_KEY` env var. Never hardcode it.
- Deployment: Vercel auto-deploys from `main` on push. No staging environment.
- Never force-push `main` without explicit user approval.
- Secrets: `.env` and `.env.*` are gitignored (`.env.example` is the only tracked exception) — confirmed clean, keep it that way.

## Known gaps (pre-beta, be aware)

- `vercel.json`'s Content-Security-Policy is `Report-Only`, not enforcing. Checklist item is to promote it to enforcing after a clean soak — check browser console for violations first.
- SMTP and the `delete_user` RPC are both unverified blockers per `docs/beta-checklist.html` §5 — don't assume email delivery or account deletion works end-to-end until those are ticked.
- ORS free tier is ≈2,000 directions/day; loop generation can burn up to 7 calls per button press (see the retry/rescale logic in `generateLoopRoute`, `js/route.js`).
