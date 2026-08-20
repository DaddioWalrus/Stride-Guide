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
- A→B length state: `abLenMode`, `abLenValue`, `abLenMetric`, `abVariant` — the
  "Longer walk" stepper, which is the loop stepper's markup and CSS reused
- Nav state: `navTotalDistKm`, `navStartTime`, `navRouteCoords`, `navRouteDistKm`,
  `navAlongM`
- `haversineKm(lat1,lng1,lat2,lng2)` — global utility in ui.js
- `drawRouteArrows(coords)` — available in map.js
- `#loop-regen-btn` serves both modes — "New loop" and "New route" — labelled by
  `showRegenBtn()`. Hide it whenever the route it belonged to goes away.

## Route shape

A walk must not double back on itself pointlessly. That is not the same as
"must never tread a strip twice" — walking down a street, round a loop at the
far end, and back up the street the other way repeats the street, but it is a
walk, not a there-and-back. What makes doubling back bad is having **nothing in
between**.

`measureRetrace(coords)` in route.js is the judge. It scans the route **twice**,
and the two passes are not interchangeable — this is the part to understand
before touching the constants:

| pass | tolerance | rejects at | catches |
|---|---|---|---|
| `TIGHT` | 3m, ~14° | 10m run | a spur, an exact retread |
| `WIDE` | 8m, ~31° | 60m run | out and back on opposite pavements |

One pair of numbers cannot do both jobs. A **fork** — leaving the start up one
arm and returning down the other — puts route within L metres of route for
L/sin(θ) along each arm, so a loose tolerance reads an ordinary loop as doubling
back. At 8m/31° a 20° fork scored 50m and *every real loop was rejected*; the
app returned nothing at all. But tighten enough to kill that and a there-and-back
on opposite pavements slips through unseen, which is far worse than any spur.

What separates them is not how close but **how long they stay close**. A fork
diverges within ~30m; doubling back on a street stays close for its whole
length. Hence a run threshold per pass. If you change these, re-check against
the shape suite — forks, roundabouts, 90° corners and crescents must all be
accepted, and out-and-backs, spurs and hairpins all rejected.

The cost of the tight pass is a floor: doubling back under ~10m no longer
registers. There is no setting that sees a 5m spur and still lets a fork through.

### Turnarounds vs stems

Nearness alone cannot say whether treading a strip twice was worth it, so every
doubled piece is also asked how far it is *along the route* to the pass that
matches it — the walking done between the two:

- gap under `CIRCUIT_M` (200m) → a **turnaround**: a spur, a hairpin, an
  out-and-back. Nothing in between.
- gap at or above it → a **stem**: a real loop sits between the passes.

Measured, stems come out at 1000–2400m and every turnaround at 15m, so the line
is not a fine judgement. Note a 15m spur and a loop sharing a 15m start/end stub
are the *same length* of repeated path and get opposite verdicts — the gap is
the only thing telling them apart, which is the whole point.

`isClean(result, allow)` is the gate, and it is three tests: the longest
**turnaround** run under each pass's limit, and the repeated fraction of the
walk at most `STEM_MAX_FRAC` (a third). A stem is allowed as the way in to
something; it cannot be the walk itself.

### Length is enforced, not preferred

`loopToleranceKm()` is ±5 min (±0.4km). It is a promise, not a hint — a walker
who asks for half an hour and is handed eighteen minutes has been ignored, which
is what an earlier "length is what gives" rule did. `generateLoopRoute` climbs a
ladder: clean inside the tolerance, else clean inside **twice** it, else the
least-doubled walk inside twice it (`retraceWarn`), else whatever is closest.
The window widens *before* the shape gives at all — a loop five minutes long is
still the walk you asked for; one that doubles back is a different thing.

`LOOP_ASKS` varies the requested length across seed rotations, because a place
with no clean loop at 2.5km often has one at 2.3km.

When nothing clean turns up, `clearRetrace` walls off the offending
**turnarounds** with `avoid_polygons` and asks ORS again — never a stem, which
would only cut the loop off from the walker. If that still fails:

- **Loop** — returns the least-doubled walk with `retraceWarn` set; the UI says
  how far it repeats. Never nothing: a walker standing outside wants a walk.
  `NO_CLEAN_ROUTE` now only means no route came back at all.
- **A→B** — falls back to the direct walk and sets `padRefused`, which the UI
  reports as a refusal, not as a length that came up short.

The one retrace that survives is the geography's own: a destination reachable
only by treading one road twice. That is measured on the direct route and
becomes `allowM` for every longer walk to the same place — inherited, never
added to.

Judging a route by proximity alone does not work: parallel pavements read as a
retrace, and junctions read as one too. Direction is what separates them. If you
change the constants, re-check them against known shapes — a square loop and a
self-crossing route must both read 0.

Arrival is not proximity either. A stretched walk can pass its own destination
mid-route, so `navAlongM` tracks progress along the drawn line
(`trackAlongRoute`) and arrival needs the walker at the *end* of it.

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

Every table needs RLS policies for select/insert/delete on `auth.uid() = user_id`,
or the app fails with a permission error. Schema lives in `supabase-*.sql`; keep
those files in step with any table change.

**Delivering SQL to the user:** they run it on a phone and cannot copy from the
repo or from chat. Publish it as an artifact with a one-tap copy button, the
paste-it-here steps, and a fallback that selects the text — see the saved-routes
page for the pattern. Never just paste SQL into the reply.

## Environment

- ORS API key injected by Vercel from `ORS_API_KEY` env var. Never hardcode it.
- Deployment: Vercel auto-deploys from `main` on push.
- Never force-push `main` without explicit user approval.
- The foot of the account panel shows the deployed commit's short hash, from
  `VERCEL_GIT_COMMIT_SHA` via `/api/config`. Nothing to maintain by hand; there
  is deliberately no separate version number.
