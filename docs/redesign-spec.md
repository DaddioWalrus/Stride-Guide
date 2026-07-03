# Stride Guide — UI/UX Redesign Specification

**Scope:** `main` branch (the live Vercel production app).
**Deliverable type:** Bold rethink — quick-win polish *and* a bolder structural/visual vision, clearly separated so each item can be adopted independently.
**Companion:** interactive before/after visual artifact (phone-frame mockups + palette directions).

> Constraint honoured throughout: **zero loss of function.** Every recommendation maps onto the existing phase-based flow (`showPhase`) and the real element IDs (`dest-input`, `search-panel`, `preview-panel`, `route-panel`, `nav-panel`, …). Nothing here proposes importing the experimental feature-branch UI.

---

## 1. Executive summary

Stride Guide *works*, and the interaction model (search → preview → route → navigate, plus a Loop planner) is sound. What holds it back is **presentation, not plumbing**. Three themes dominate the audit:

1. **The identity is generic.** A default "bootstrap blue" (`#4A90D9`), the raw system font with no type scale, and emoji standing in for a real icon set. These are the things that make the app read as a prototype rather than a product.
2. **The hierarchy is upside-down where it matters most.** While walking, the *turn instruction* is the single most important element on screen — yet it's rendered as a thin translucent bar in 16px text, sitting **above** a dense three-column stats panel that dominates the layout.
3. **Accessibility and outdoor ergonomics are under-served.** Secondary text fails WCAG contrast, several touch targets are below 44px, and there is **no dark mode** — a serious gap for an app used at night and in bright sun.

None of this requires a rewrite. The roadmap in §7 sequences it from same-day CSS wins to a bolder identity refresh.

---

## 2. Method & product context

The redesign is anchored in *how the app is actually used*, because that is what should drive every trade-off:

- **One-handed, while moving.** Thumb reach and target size matter more than density.
- **Outdoors.** Bright sun (needs high contrast / true-dark option) and night walks (needs dark mode, dim-friendly).
- **Glanceable.** During navigation the user looks up for <1 second. The most important datum must be readable in that glance.
- **GPS-driven, low-friction.** Location is acquired automatically; the user rarely types. Wording should stay plain and reassuring.

Audit dimensions: visual identity, typography, iconography, colour & theming, layout & information hierarchy, microcopy, interaction/motion/ergonomics, and accessibility.

---

## 3. Findings (the "before"), by dimension

Impact key: **H** = high (hurts core task or excludes users) · **M** = medium · **L** = low/polish.

### 3.1 Visual identity & aesthetics
| # | Finding | Evidence | Impact |
|---|---------|----------|--------|
| 3.1a | Primary colour is the generic default blue used by countless template apps; carries no brand meaning for walking/outdoors. | `#4A90D9` throughout `css/style.css` | M |
| 3.1b | Depth language is flat and uniform — one shadow (`0 4px 20px rgba(0,0,0,.15)`) on every surface, so nothing reads as more or less prominent than anything else. | `.panel` | L |
| 3.1c | No motion identity. Panels appear/disappear via `hidden` class toggles — no transitions between phases, so the flow feels abrupt. | `showPhase()` | M |

### 3.2 Typography
| # | Finding | Evidence | Impact |
|---|---------|----------|--------|
| 3.2a | Raw system stack with **no defined type scale** — font sizes sprawl ad hoc across 11 / 12 / 14 / 15 / 16 / 22 / 26px with no rhythm. | `css/style.css` (throughout) | M |
| 3.2b | The hero data (ETA, distance) is only 26px and shares its weight/colour with lesser text, so it doesn't sing. | `#nav-time`, `#nav-dist` | M |
| 3.2c | No numeric personality. `tabular-nums` is applied (good) but the figures are otherwise plain — a missed chance for a distinctive "instrument readout" feel. | `#nav-dist` etc. | L |

### 3.3 Iconography
| # | Finding | Evidence | Impact |
|---|---------|----------|--------|
| 3.3a | **Emoji used as the primary icon set.** 🛰️ 📍 🔖 ↺ 📊 🕐 🗺️ ⏱ 📏 ✉️ ❓ render differently on every OS, can't be recoloured, don't align to a grid, and look inconsistent beside the CSS-drawn shapes. This is the biggest single "cheap" tell. | `index.html` (buttons/labels), `terrain-btn` = 🛰️ | H |
| 3.3b | Mixed metaphors for the same concept — the Loop mode is a text tab ("Loop"), an emoji 🔄 in onboarding, and 🔄 again in Help. | `#loop-tab` vs onboarding/help rows | L |

### 3.4 Colour & theming
| # | Finding | Evidence | Impact |
|---|---------|----------|--------|
| 3.4a | **No dark mode at all.** `body { background: white }` is the only ground. Painful for night walking and battery, and glary in some conditions. | `css/style.css` | H |
| 3.4b | Semantic colours are ad hoc, not a system — green means both "primary action" (Start) and "success" (arrival); red means stop *and* destination *and* map pin. | `.green-btn`, `.stop-btn`, `.destination-dot`, `.pin-marker` | M |
| 3.4c | Secondary greys (`#999`, `#aaa`, `#888`) on white fall **below WCAG AA** for small text. | `#nav-unit`, `.field-label`, `.place-detail` | H |

### 3.5 Layout & information hierarchy
| # | Finding | Evidence | Impact |
|---|---------|----------|--------|
| 3.5a | **Navigation hierarchy is inverted.** The turn instruction — the thing you look up to see — is a thin dark translucent pill in 16px, *above* the panel; the persistent panel is dominated by a 3-column ETA/distance/Stop row. The glanceable priority order should be maneuver → distance-to-turn → ETA. | `#instruction-pill` (bottom:150px) vs `#nav-panel` | H |
| 3.5b | Many bespoke floating elements are **manually pixel-positioned in JS** (`positionRecentreBtn` measures rects and sets `.style.bottom`). Fragile, hard to theme, and a re-layout risk on every device size. | `js/ui.js` `positionRecentreBtn()` | M |
| 3.5c | The unit toggle is hidden and **mislabelled**: a tiny lowercase hint shows the *opposite* unit ("imperial" while the number is in km), and the whole `#nav-center` is secretly tappable with no affordance. | `#route-unit-hint`, `#nav-unit`, `updateNavDist` | H |
| 3.5d | Placeholder states look broken — `-- min`, `-- km`, `0.00 km` are visible before data arrives, reading as errors rather than "loading". | `index.html`, `ui.js` | M |

### 3.6 Microcopy & wording
| # | Finding | Evidence | Impact |
|---|---------|----------|--------|
| 3.6a | Jargon in the mode switch: **"A→B"** is engineer-speak. | `#ab-tab` | M |
| 3.6b | Inconsistent titles for parallel flows — "Plan a Route" (search) vs "Plan a Loop" (loop) vs "Directions" (preview). A→B is also a route. | `.preview-title`s | L |
| 3.6c | Overlapping recovery verbs during nav — "New Route", "Reset", "Adjust route" aren't clearly differentiated. | `#loop-regen-btn`, `#nav-prompt-fresh`, `#nav-prompt-adjust` | M |
| 3.6d | Loop arrival reads oddly: *"You've arrived at Loop start"* (the destination name is literally the string "Loop start"). | `ui.js` arrival toast + `name: 'Loop start'` | L |

### 3.7 Interaction, motion & touch ergonomics
| # | Finding | Evidence | Impact |
|---|---------|----------|--------|
| 3.7a | Sub-minimum touch targets: `.small-gps` and the field GPS button are **32px**; `.back-btn` / `.pin-close-btn` are 36px. Apple/Material minimum is 44px — and this app is used while moving. | `.small-gps`, `.back-btn` | H |
| 3.7b | No feedback on long-press-to-drop-pin; the gesture is undiscoverable except via Help. | map handler | M |
| 3.7c | Active states are opacity-only (`:active { opacity:.7 }`) — functional but characterless; no ripple/press physics. | buttons | L |

### 3.8 Accessibility
| # | Finding | Evidence | Impact |
|---|---------|----------|--------|
| 3.8a | Icon-only buttons lack labels in places (emoji buttons like `terrain-btn`, save `🔖`). Screen-reader users hear "satellite emoji". | `index.html` | H |
| 3.8b | No visible keyboard focus styling; `outline:none` on inputs with only a colour change. | `.search-input:focus` | M |
| 3.8c | No `prefers-reduced-motion` handling (currently moot, but required once motion is added). | — | L |
| 3.8d | Contrast failures (see 3.4c) compound outdoors. | — | H |

---

## 4. Before → After, by dimension

Each row: the change, its upside, its cost/risk.

### 4.1 Visual identity
| Aspect | Before | After | Pros | Cons |
|--------|--------|-------|------|------|
| Primary hue | Generic `#4A90D9` | A chosen, subject-grounded palette (see §5) | Distinctive, memorable, on-theme | Requires a token pass across CSS |
| Depth | One flat shadow everywhere | 2–3 elevation tiers (resting sheet, floating control, overlay) | Guides the eye; feels intentional | Minor CSS work |
| Motion | Instant show/hide | Sheet slide + cross-fade between phases (respecting reduced-motion) | Flow feels continuous & premium | Must guard performance on low-end phones |

### 4.2 Typography
| Aspect | Before | After | Pros | Cons |
|--------|--------|-------|------|------|
| Scale | Ad hoc 11–26px | A 6-step modular scale (e.g. 12 / 14 / 16 / 20 / 28 / 40) applied via tokens | Rhythm & hierarchy; easier to maintain | One-time refactor |
| Hero data | 26px, same weight as labels | 40px, heavy, tabular, given its own token | ETA/distance readable in a glance | None material |
| Numerals | Plain | "Instrument" treatment — tabular, tightened, optional condensed weight | Distinctive, map-device feel | Font choice constrained by no-webfont rule → lean on system + weight/spacing |

### 4.3 Iconography
| Aspect | Before | After | Pros | Cons |
|--------|--------|-------|------|------|
| Icon set | Emoji | A single-weight inline-SVG line-icon set (location, bookmark, reverse, satellite, stats, clock, map, timer, ruler) | Consistent, recolourable, grid-aligned, theme-able, accessible | Must author/curate ~14 icons; small size increase |
| Labelling | Emoji only | Icon + `aria-label` on every icon-only control | Screen-reader correct | Trivial |

### 4.4 Colour & theming
| Aspect | Before | After | Pros | Cons |
|--------|--------|-------|------|------|
| Themes | Light only | Token-based light **and** dark, following OS + manual toggle | Night walking, sun glare, battery, modern feel | Doubles the palette QA surface |
| Semantics | Overloaded green/red | Dedicated tokens: `--accent` (brand), `--go` (start/success), `--stop` (halt), `--pin` (place) — separated from brand hue | Unambiguous meaning; colour-blind-safer with icon backup | Slight palette expansion |
| Contrast | `#999`/`#aaa` fail AA | All text ≥ 4.5:1 (or ≥3:1 for ≥24px) | Legible outdoors; compliant | Secondary text gets slightly darker |

### 4.5 Layout & hierarchy
| Aspect | Before | After | Pros | Cons |
|--------|--------|-------|------|------|
| Nav screen | Instruction pill demoted above dense stats | **Maneuver card is the hero**: big directional glyph + next-street name + distance-to-turn; a slim secondary bar carries ETA / remaining / Stop | Matches glance priority; safer while walking | Restructures `nav-panel` markup (functions preserved) |
| Floating controls | JS pixel-positioning (`positionRecentreBtn`) | A single bottom-sheet stack with consistent `gap`; controls dock into it | Removes fragile JS math; robust across sizes | Refactor of positioning logic |
| Unit toggle | Hidden, mislabelled, opposite unit | Explicit `km · mi` segmented control with the active unit highlighted | Discoverable, unambiguous | Tiny space cost |
| Empty/placeholder | Visible `-- km` / `0.00` | Skeleton shimmer or "…" until first fix | Reads as loading, not broken | Minor JS/CSS |

### 4.6 Microcopy
| Before | After | Pros | Cons |
|--------|-------|------|------|
| "A→B" | "Destination" (or "Get there") | Human, self-explanatory | None |
| "Plan a Route" / "Plan a Loop" / "Directions" | Consistent frame: "Where to?" (destination) / "Loop walk" | Parallel, predictable | None |
| "New Route" / "Reset" / "Adjust route" | "New loop" / "Restart" / "Re-route" — each verb distinct | Removes ambiguity | None |
| "You've arrived at Loop start" | "Loop complete — nice walk!" | Correct & warm | Tiny branch in arrival copy |
| "-- min", "-- km" | "…" or hidden until data | Not alarming | None |

### 4.7 Ergonomics & a11y
| Before | After | Pros | Cons |
|--------|-------|------|------|
| 32–36px targets | ≥44px hit areas (visual can stay compact via padding) | Reliable one-handed taps while moving | Slightly larger controls |
| Opacity-only press | Press physics + optional haptic (`navigator.vibrate`) on key actions | Tactile confidence | Guard unsupported devices |
| No focus ring | Visible focus token on all interactive elements | Keyboard/AT usable | None |

---

## 5. Three visual-identity directions

All three are delivered as **the same token set** (`--accent`, `--go`, `--stop`, `--surface`, `--ink`, …) so switching direction is a variable swap, not a rebuild. Each ships light + dark. The interactive artifact shows swatches for all three.

### Direction A — "Trailhead" (nature-forward)
Deep forest/spruce primary, warm limestone neutrals, a bright waymark-orange CTA.
- **Palette (light):** ink `#1B2A24` · surface `#F3F1EA` · accent spruce `#1F6F5C` · CTA waymark `#E4712B` · go `#2E9E6B` · stop `#C6412B`.
- **Pros:** most distinctive and on-theme; calm, premium, "OS-map / hiking" feeling; differentiates hard from the current blue.
- **Cons:** a green primary can visually compete with the green of parks/countryside on the map tiles; the biggest departure from today's brand.

### Direction B — "Horizon" (evolved, energetic) — **recommended**
Keeps a blue lineage but richer and more confident, with a warm coral/amber accent for go-moments.
- **Palette (light):** ink `#111826` · surface `#FFFFFF`/`#F4F7FB` · accent indigo `#2F5FE0` · go coral `#FF6B4A` · stop `#E23D3D`.
- **Pros:** an *evolution* users won't find jarring; energetic and sporty (Strava-adjacent); the blue stays clearly distinct from map greens/greys; dark mode is excellent (indigo glows on near-black).
- **Cons:** closest to the status quo, so less of a "wow" reveal on its own — the wins come from typography + hierarchy carrying it.

### Direction C — "Nocturne" (dark-first, high-contrast)
Designed dark-first: near-black canvas, a luminous lime/cyan primary that pops on both the dark UI and the map.
- **Palette (dark ground):** canvas `#0C0F0E` · surface `#161A19` · ink `#EAF0EC` · accent lime `#B8F24A` (or cyan `#38E1D0`) · stop `#FF5A4D`.
- **Pros:** superb for night walking and sun-glare (true dark cuts brightness); best battery; most premium/modern; a real point of view.
- **Cons:** the light variant needs careful tuning so the luminous accent doesn't vibrate on white; boldest risk.

**Recommendation:** **Direction B (Horizon)** as the shipping identity — it delivers a confident, distinctive result while keeping the migration low-risk, and its dark mode is strong. Pull Direction C's dark palette in as the app's *dark theme* (best of both). Keep Trailhead as the fallback if the team wants a sharper break from "blue app".

---

## 6. Screen-by-screen redesign notes

Each references the real elements so implementation stays surgical.

- **Home / search (`#search-panel`).** Rename card to "Where to?"; make the search field taller (48px) with a leading location line-icon; suggestions get more padding, a place line-icon, and a stronger name/detail contrast. Mode bar (`#mode-bar`) relabelled **Destination / Loop** with line-icons.
- **Loop planner (`#loop-panel`).** The stepper (`#loop-step-*`) becomes a large, legible dial; Time/Distance (`.mode-btn`) become a clean segmented control; unit shown explicitly. Big primary "Generate loop".
- **Preview (`#preview-panel`).** Keep From/To rows; upgrade the field GPS button to 44px; "Get Directions" → "Start directions" primary. From-row shows a live "Using your location" chip when GPS is the source.
- **Route overview (`#route-panel`).** Elevate to a proper summary card: hero ETA + distance (big, tabular), an explicit `km · mi` toggle, and the action cluster (back / 🔖→bookmark icon / **Start**) with ≥44px targets.
- **Navigation (`#nav-panel` + `#instruction-pill`).** *The headline change.* Promote the maneuver to a hero card: large turn glyph (from the line-icon set, driven by `STEP_ARROWS`), next-street text at 20px, distance-to-turn prominent. Demote ETA/remaining/Stop to a slim bar beneath. Re-centre and loop controls dock into the same stack instead of floating via JS math.
- **Pin card (`#pin-card`).** Same summary-card language as route overview; clarify the location label; bookmark + Start with proper targets.
- **Account panel (`#account-panel`).** Already the most polished area. Swap nav-row emoji (📊🕐🗺️📍) for the line-icon set; tighten the type scale; give avatar/name a cleaner header. Keep all nine views and their wiring intact.
- **Onboarding / Help.** Unify the icon language with the rest of the app; keep copy but align Loop/Destination naming.

---

## 7. Prioritized roadmap

Grouped by effort tier. Impact from §3. Everything is additive/surgical to the existing flow.

### Tier 1 — Quick wins (same-day, pure CSS/markup, low risk)
1. **Contrast fix** (3.4c/3.8d): darken secondary greys to pass AA. *High impact, minutes.*
2. **Touch targets** (3.7a): bump `.small-gps`, `.back-btn`, `.pin-close-btn` hit areas to ≥44px. *High, low.*
3. **`aria-label`s** on all icon-only buttons (3.8a). *High, low.*
4. **Microcopy pass** (3.6): "A→B"→"Destination", fix loop-arrival string, distinguish recovery verbs, hide `-- km` placeholders. *Medium, low.*
5. **Type scale tokens** (3.2a): introduce CSS custom properties and map existing sizes onto them. *Medium, low — sets up everything else.*
6. **Focus-visible ring** (3.8b). *Medium, low.*

### Tier 2 — Structural (a few days, moderate risk, big payoff)
7. **Colour tokenisation + dark mode** (3.4a/b): lift all colours to tokens; add `@media (prefers-color-scheme)` + a manual toggle. *High.*
8. **Line-icon set** replacing emoji (3.3a). *High.*
9. **Navigation hierarchy flip** (3.5a): maneuver-hero card + slim stats bar. *High — this is the safety-relevant one.*
10. **Explicit unit toggle** (3.5c). *High.*
11. **Retire `positionRecentreBtn` pixel math** in favour of a docked bottom-sheet stack (3.5b). *Medium, but removes fragility.*

### Tier 3 — Bold identity (the reveal)
12. **Adopt the chosen palette (Horizon)** + Nocturne dark theme (§5). *High.*
13. **Motion system**: phase transitions, press physics, reduced-motion guard (3.1c/3.7c). *Medium.*
14. **Elevation tiers + depth language** (3.1b). *Low/Medium polish.*

Suggested sequence: ship **Tier 1** immediately (it's safe and visibly improves the app), land **Tier 2 #7–#10** next (dark mode + icons + nav flip are the headline upgrades), then commit to **Tier 3** once the palette is signed off.

---

## 8. Functionality-preservation & compliance notes

- **No feature-branch imports.** Every recommendation targets the existing `main` architecture and its documented element IDs — consistent with the branch rules in `CLAUDE.md`.
- **Phase flow untouched.** `showPhase()` and the `phases` array stay authoritative; redesign changes styling and markup *within* panels, not the state machine.
- **Behaviour preserved.** Unit tapping, GPS acquisition, rerouting, save flows, and the account panel's nine views keep their handlers; only their presentation changes.
- **Deploy safety.** `main` auto-deploys to Vercel with no staging, so land changes in the Tier order above (each tier independently revertable), and verify on-device after each — especially the nav-screen restructure (#9) and dark mode (#7).
- **Risk watch:** the nav hierarchy flip and the removal of `positionRecentreBtn` touch layout logic that currently has device-specific pixel tuning; treat those as their own commits with real-device checks.

---

## 9. Open questions for you

1. **Identity direction** — go with the recommended **Horizon**, or do you want to see **Trailhead** / **Nocturne** fully rendered before deciding?
2. **Dark mode default** — follow the OS setting, or ship a manual toggle in the account panel too?
3. **Icon set** — hand-author a small bespoke SVG set (most control, on-brand) or adapt an open-licensed line set (faster)?
4. **Scope of first PR** — want me to implement **Tier 1** now (it's low-risk and improves the live app immediately), and spec Tier 2/3 as follow-ups?
