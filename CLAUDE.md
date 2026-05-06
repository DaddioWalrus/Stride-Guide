# Stride Guide — Claude Instructions

## Branch

All development happens on `main` — the live Vercel app. There is no other active branch.

**Never push to any branch other than `main` without explicit user instruction.**

## Architecture

UI is phase-based: `showPhase(id)` hides all panels and shows the specified one.

| Phase | Panel ID | Trigger |
|---|---|---|
| 1 | `search-panel` | Default / A→B mode |
| 1 | `loop-panel` | Loop mode |
| 2 | `preview-panel` | Destination selected (A→B) |
| 3 | `route-panel` | Route generated |
| 4 | `nav-panel` | Navigation started |

- GPS acquired automatically via `requestGPS()` / `startNavigation()` in map.js
- User never manually sets a start point on A→B; `acquireStartLocation()` does it
- Errors shown via `showError(msg)` — toast from `#error-toast` (defined in ui.js, global)
- Loop state: `currentMode`, `loopMode`, `loopValue`, `loopUseMetric`, `loopLastDistKm`
- Nav state: `navTotalDistKm`, `navStartTime`, `navRouteCoords`, `navRouteDistKm`
- `haversineKm(lat1,lng1,lat2,lng2)` — global utility in ui.js
- `drawRouteArrows(coords)` — available in map.js

## File Map

| File | Purpose |
|---|---|
| `js/map.js` | Leaflet map, GPS, markers, geocoding, `drawRouteArrows` |
| `js/route.js` | ORS API calls (`generateLoopRoute`, `generateABRoute`) |
| `js/ui.js` | All UI interaction, phase navigation, walk logging hooks |
| `js/auth.js` | Auth (OTP), account panel, Supabase data (history, stats, routes, places) |
| `js/supabase.js` | Supabase client init, exports `sbClient` and `sbReady` |
| `css/style.css` | All styles |
| `index.html` | HTML structure |

## Supabase Tables

- `walk_history`: `id, user_id, dist_km, duration_sec, mode, walked_at`
- `saved_routes`: `id, user_id, name, mode, coords(jsonb), dist_km, loop_mode, loop_value, loop_use_metric, dest_lat, dest_lng, start_lat, start_lng, created_at`
- `saved_locations`: `id, user_id, name, lat, lng, created_at`
- `profiles`: `id, tier, full_name, avatar_url`

## Environment

- ORS API key injected by Vercel from `ORS_API_KEY` env var. Never hardcode it.
- Deployment: Vercel auto-deploys from `main` on push.
- Never force-push `main` without explicit user approval.
