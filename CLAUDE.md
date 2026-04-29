# Stride Guide — Claude Instructions

## Branch Rules — READ FIRST

This project has two active branches with **completely different UI architectures**. They must NEVER be blindly synced.

### `main` (Vercel production — live app)
- Uses a **search-panel → preview-panel → route-panel → nav-panel** phase-based flow
- Entry point is a "Where to?" search bar (`#dest-input` / `#search-panel`)
- GPS location is acquired automatically; user never manually sets a start point
- This is what real users see. Breakage here is critical.

### `claude/stride-guide-review-Rug1W` (feature branch)
- Uses a **unified route-panel** with Loop / A→B toggle
- Loop mode: user sets start location + time or distance, generates a circular route
- A→B mode: user sets start + destination
- Avoid-area circles, collapsed panel bar, pin-card for map taps
- This is experimental UI. Not yet deployed.

## Rules

1. **NEVER copy feature-branch files wholesale into main.** The two UIs are incompatible.
2. Changes to `main` must be surgically applied to the existing main UI code — not imported from the feature branch.
3. Every change that makes sense on both branches must be implemented **separately** for each, respecting each branch's own architecture.
4. Before committing anything to `main`, verify the change targets the correct element IDs and flow (e.g. `dest-input`, `search-panel`, `preview-panel` — NOT `loop-start-input`, `route-panel.collapsed`, etc.).
5. **Never force-push main without explicit user approval.** (Exception: reverting a bad commit that the user has approved.)

## File Map

| File | Purpose |
|------|---------|
| `js/map.js` | Leaflet map, GPS, markers, avoid circles, geocoding — shared logic |
| `js/route.js` | ORS API calls (`generateLoopRoute`, `generateABRoute`) — shared logic |
| `js/ui.js` | All UI interaction — **architecture differs between branches** |
| `css/style.css` | Styles — **differs between branches** |
| `index.html` | HTML structure — **differs between branches** |

## Environment

- ORS API key is injected by Vercel from `ORS_API_KEY` env var. Never hardcode it.
- Deployment: Vercel auto-deploys from `main` on push.
