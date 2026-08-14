// ─── Route Generation ─────────────────────────────────────────────────────────

// Every route ORS returned for a request. Usually one; more when alternatives
// were asked for, which is what makes "New route" mean something on a walk
// short enough that there is nothing to pad.
async function callORSRoutes(body) {
  const response = await fetch('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error('Could not generate route, please try again');
  }

  const data = await response.json();

  if (!data.features || data.features.length === 0) {
    throw new Error('No route found');
  }

  return data.features.map(function (feature) {
    const coords = feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const summary = feature.properties.summary;
    const steps = (feature.properties.segments || [])
      .flatMap(seg => seg.steps || [])
      .map(s => ({ instruction: s.instruction, type: s.type, distance: s.distance }));
    return { coords, summary, steps };
  });
}

async function callORS(body) {
  const routes = await callORSRoutes(body);
  return routes[0];
}

// ─── Route shape ──────────────────────────────────────────────────────────────
// Both builders can be handed a walk that is really a there-and-back: the
// length is right, but you tread the same pavement twice. Nothing in the ORS
// summary says so, so the geometry itself is measured.
//
// What's being caught is walking the same strip of path twice — not crossing
// your own route at a junction, which is fine and often unavoidable. Nearness
// alone can't tell those apart, so two bits of route count as one strip only
// when they also run along the same line, either way round: a crossroads fails
// that test, a U-turn passes it hard.
//
// The answer is in metres of route rather than a fraction of it, because "how
// far does this walk retread" is the thing being judged, and 60m of doubling
// back looks just as bad on a 10km walk as on a 2km one.

// APART_M is what sets the shortest retread that can be seen at all: an
// out-and-back over a strip is only visible from the point where the two passes
// are that far apart along the walk, so 10m is what makes a 5m spur register.
// It can't go much lower — pieces on one straight road sit 10m apart along the
// route and 10m apart on the ground, and dropping under SAME_STRIP_M would
// start reading an ordinary pavement as a double-back.
const PIECE_M      = 5;    // resolution the route is chopped to
const SAME_STRIP_M = 8;    // lateral gap within which two pieces are one strip
const APART_M      = 10;   // along-route gap before two pieces may be compared
const ALIGNED      = 0.85; // |cos| between headings — within ~30° of one line
const RETRACE_OK_M = 8;    // under one piece each way: junction geometry, not a doubled walk
const MIN_STRIP_M  = 25;   // a doubled run shorter than this isn't worth routing around

// The route chopped into fixed-length pieces on a local metre plane, each
// carrying where it is, which way it points, and how far along the walk it sits.
// Metres beat degrees here: every test below is a distance or an angle, and the
// plane makes both cheap over the couple of kilometres a walk spans.
function routePieces(coords) {
  const lat0 = coords[0][0], lng0 = coords[0][1];
  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos(lat0 * Math.PI / 180);
  const list = [];
  let along = 0;
  let next = PIECE_M / 2;   // along-route distance of the next piece's centre

  for (let i = 1; i < coords.length; i++) {
    const ax = (coords[i - 1][1] - lng0) * mPerLng;
    const ay = (coords[i - 1][0] - lat0) * mPerLat;
    const dx = (coords[i][1] - lng0) * mPerLng - ax;
    const dy = (coords[i][0] - lat0) * mPerLat - ay;
    const segM = Math.sqrt(dx * dx + dy * dy);
    if (segM <= 0) continue;

    const ux = dx / segM, uy = dy / segM;
    while (next <= along + segM) {
      const t = next - along;
      list.push({
        x: ax + ux * t,
        y: ay + uy * t,
        ux, uy,
        s: next,
        lat: coords[i - 1][0] + (uy * t) / mPerLat,
        lng: coords[i - 1][1] + (ux * t) / mPerLng,
      });
      next += PIECE_M;
    }
    along += segM;
  }

  return { list, proj: { mPerLat, mPerLng } };
}

// Metres of route spent on ground the walk covers more than once, plus the
// longest unbroken run of it — the strip worth routing around when there's
// budget left to try. Pieces are bucketed into a grid one strip-width across,
// so each one only ever looks at its own cell and the eight around it; without
// that a 10km walk would be four million pair tests on a phone.
function measureRetrace(coords) {
  const empty = { meters: 0, worst: [], proj: null };
  if (!coords || coords.length < 2) return empty;

  const pieces = routePieces(coords);
  const list = pieces.list;
  if (list.length < 3) return empty;

  const cells = new Map();
  for (let i = 0; i < list.length; i++) {
    const k = Math.floor(list[i].x / SAME_STRIP_M) + ':' + Math.floor(list[i].y / SAME_STRIP_M);
    const bucket = cells.get(k);
    if (bucket) bucket.push(i); else cells.set(k, [i]);
  }

  function isDoubled(i) {
    const p = list[i];
    const cx = Math.floor(p.x / SAME_STRIP_M), cy = Math.floor(p.y / SAME_STRIP_M);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const bucket = cells.get(gx + ':' + gy);
        if (!bucket) continue;
        for (let n = 0; n < bucket.length; n++) {
          const q = list[bucket[n]];
          if (Math.abs(q.s - p.s) < APART_M) continue;   // its own neighbours, not a second pass
          const dx = q.x - p.x, dy = q.y - p.y;
          if (dx * dx + dy * dy > SAME_STRIP_M * SAME_STRIP_M) continue;
          if (Math.abs(p.ux * q.ux + p.uy * q.uy) < ALIGNED) continue;   // a crossing, not a retread
          return true;
        }
      }
    }
    return false;
  }

  let meters = 0;
  let worst = [], run = [];
  for (let i = 0; i < list.length; i++) {
    if (isDoubled(i)) {
      meters += PIECE_M;
      run.push(list[i]);
      if (run.length > worst.length) worst = run;
    } else if (run.length) {
      run = [];
    }
  }

  return { meters, worst, proj: pieces.proj };
}

// What a candidate walk costs us. Doubling back is the thing being avoided, so
// it's charged metre for metre; missing the requested length is charged at half
// that, which still lets a big shortfall outweigh a small retread — a walk
// nowhere near the length asked for is no use either.
function routeCost(retraceM, errKm) {
  return retraceM + errKm * 500;
}

// A corridor around a doubled strip, as the GeoJSON polygon ORS understands, so
// the next request has to find another way through. Walls run down both sides
// of the strip and the ends are capped, or the router just threads the gap.
function stripCorridor(run, proj, halfWidthM) {
  const head = run[0], tail = run[run.length - 1];
  const path = [
    { x: head.x - head.ux * halfWidthM, y: head.y - head.uy * halfWidthM, ux: head.ux, uy: head.uy },
  ].concat(run, [
    { x: tail.x + tail.ux * halfWidthM, y: tail.y + tail.uy * halfWidthM, ux: tail.ux, uy: tail.uy },
  ]);

  const lat0 = run[0].lat - run[0].y / proj.mPerLat;
  const lng0 = run[0].lng - run[0].x / proj.mPerLng;
  const toLngLat = function (x, y) {
    return [lng0 + x / proj.mPerLng, lat0 + y / proj.mPerLat];
  };

  const left = [], right = [];
  path.forEach(function (p) {
    const nx = -p.uy * halfWidthM, ny = p.ux * halfWidthM;
    left.push(toLngLat(p.x + nx, p.y + ny));
    right.push(toLngLat(p.x - nx, p.y - ny));
  });

  const ring = left.concat(right.reverse());
  ring.push(ring[0]);
  return ring;
}

// Corridors accumulate. Clearing one spur routinely uncovers the next, and a
// second request that quietly unblocks the first strip would just walk back
// into it — so every corridor blocked so far is carried forward.
function addAvoidPolygon(existing, ring) {
  const rings = existing && existing.type === 'MultiPolygon'
    ? existing.coordinates.slice()
    : [];
  rings.push([ring]);
  return { type: 'MultiPolygon', coordinates: rings };
}

// One more go at a walk that still doubles back: block the worst doubled strip
// and ask again. The strip may be the only way through, so an unroutable retry
// or a worse answer leaves the original standing.
async function retryWithoutWorstStrip(best, targetKm) {
  const shape = best.shape;
  if (!shape || shape.meters <= RETRACE_OK_M) return best;
  if (shape.worst.length * PIECE_M < MIN_STRIP_M) return best;
  if (!best.body) return best;

  const body = Object.assign({}, best.body);
  body.options = Object.assign({}, body.options, {
    avoid_polygons: addAvoidPolygon(
      body.options && body.options.avoid_polygons,
      stripCorridor(shape.worst, shape.proj, 10)
    ),
  });

  let result;
  try {
    result = await callORS(body);
  } catch (e) {
    return best;
  }

  result.shape = measureRetrace(result.coords);
  result.body = body;

  const wasCost = routeCost(shape.meters, Math.abs(best.summary.distance / 1000 - targetKm));
  const nowCost = routeCost(result.shape.meters, Math.abs(result.summary.distance / 1000 - targetKm));
  return nowCost < wasCost ? result : best;
}

// ─── Loop Route ───────────────────────────────────────────────────────────────
// ORS treats round_trip.length as a suggestion — actual loops routinely land
// 10–20% off. Strategy: measure what comes back, correct the ask, and keep the
// correction for the rest of the generation — how far ORS lands from the ask is
// a property of the streets here, not of the seed we happened to use.
//
// Three ways a seed can fail: a plateau (waypoints snap to the same streets no
// matter what length we ask for, so retries return the identical loop), a dead
// direction (no loop of this size exists that way — rivers, dead ends, which
// ORS answers with an error, not a route), and a there-and-back dressed up as a
// loop. All three are answered by rotating to a fresh seed, which is cheap
// because the length correction survives the rotation. The rotation also varies
// how many points the round trip is hung on, since that changes a loop's shape
// far more than its length does.
//
// Returns the best attempt overall if nothing lands clean inside the call
// budget, judged by routeCost — so a walk that doubles back only wins when
// nothing else came close to the length asked for.

async function generateLoopRoute(lat, lng, distanceKm, toleranceKm) {
  const tolKm = toleranceKm || 0.2;
  const MAX_CALLS = 9;       // total API budget per generation
  const PER_SEED = 3;        // correction rounds before giving up on a seed

  let best = null, bestCost = Infinity;
  let calls = 0;
  let spin = 0;
  let seed = Math.floor(Math.random() * 90);
  let lengthFactor = 1;      // what ORS delivers per km asked for, learned as we go

  while (calls < MAX_CALLS) {
    let prevActualKm = null;

    for (let round = 0; round < PER_SEED && calls < MAX_CALLS; round++) {
      const requestKm = distanceKm / lengthFactor;
      const body = {
        coordinates: [[lng, lat]],
        options: {
          round_trip: {
            length: Math.max(300, Math.round(requestKm * 1000)),
            points: 4 + (spin % 4),
            seed,
          },
        },
      };

      calls++;
      let result;
      try {
        result = await callORS(body);
      } catch (e) {
        break; // no loop this way — rotate rather than fail the whole generation
      }

      const actualKm = result.summary.distance / 1000;
      const err = Math.abs(actualKm - distanceKm);
      result.shape = measureRetrace(result.coords);
      result.body = body;

      const cost = routeCost(result.shape.meters, err);
      if (cost < bestCost) { best = result; bestCost = cost; }
      if (result.shape.meters <= RETRACE_OK_M && err <= tolKm) return result;
      if (actualKm <= 0) break;

      // Plateau: the network returned (near-)identical length despite an
      // adjusted request. Further correction on this seed is pointless, and the
      // measurement teaches nothing about the area either — it says only that
      // this seed has saturated — so leave the correction untouched.
      if (prevActualKm !== null && Math.abs(actualKm - prevActualKm) < 0.05) break;
      prevActualKm = actualKm;

      // Correction, clamped so one weird result can't fling the next request to
      // a wild size. Held across seeds: what this attempt learned about the
      // area's bias saves the next seed from learning it again.
      lengthFactor = Math.min(2, Math.max(0.5, actualKm / requestKm));

      // The seed is what decides a round trip's shape, so a walk that doubles
      // back won't be rescaled into one that doesn't — swing to a different
      // seed instead. The length lesson above is kept, which makes that cheap.
      if (result.shape.meters > RETRACE_OK_M) break;
    }

    // This direction won't converge — rotate to a meaningfully different one.
    seed = (seed + 29 + Math.floor(Math.random() * 30)) % 90;
    spin++;
  }

  // Every direction failed outright. Swallowing that would hand the caller a
  // route-shaped nothing, so fail the way a single bad call used to.
  if (!best) throw new Error('Could not generate route, please try again');

  // Nothing clean turned up. Before settling, block the worst doubled strip and
  // let ORS find its way round.
  return retryWithoutWorstStrip(best, distanceKm);
}

// ─── A→B Route ────────────────────────────────────────────────────────────────
// The shortest way there, and — when `variant` asks for a different one — the
// next of the alternatives ORS offers. A shortest path never treads its own
// ground, so there is nothing to measure here; the alternatives are the whole
// point of "New route" on a walk with no padding to reshape.

async function generateABRoute(startLat, startLng, endLat, endLng, variant) {
  const body = {
    coordinates: [
      [startLng, startLat],
      [endLng, endLat],
    ],
  };

  if (!variant) return callORS(body);

  try {
    const routes = await callORSRoutes(Object.assign({}, body, {
      alternative_routes: { target_count: 3, share_factor: 0.6, weight_factor: 1.6 },
    }));
    return routes[variant % routes.length];
  } catch (e) {
    return callORS(body);   // no alternatives here — the direct walk still stands
  }
}

// ─── Padded A→B Route ─────────────────────────────────────────────────────────
// A walk from A to B of roughly a requested length — the long way round to a
// destination, and the way an in-flight loop change still gets you home.
//
// ORS has no "route of length L", so the walk is bent through via points placed
// on the ellipse whose foci are A and B, where every point satisfies
// crow(A,V) + crow(V,B) = L. One via point is not enough: ORS solves A→V and
// V→B as separate shortest paths, so when the point sits off to one side the
// only road out to it is also the only road back and the walk becomes a spur —
// out, turn round, home. So the route is swept through several points along the
// ellipse arc, and U-turns at those points are forbidden outright.
//
// Everything else follows generateLoopRoute: measure, correct, rotate away from
// a direction that won't converge, and return the closest attempt if nothing
// lands inside the tolerance — the caller reports the miss. The correction is
// the one thing that differs: the arc is solved to a target length before each
// call, so what gets learned is how much longer the streets run than the line —
// which holds across directions, and carries into the next sweep.

const PAD_SWEEPS = [90, -90, 65, -65, 115, -115, 45, -45]; // sweep centres, sign = side of the A→B axis
const PAD_SPREAD = 60;      // degrees either side of the sweep centre

// How many via points a given amount of padding wants. A gentle stretch stays a
// gentle bend; a long walk needs a wide arc to keep off its own toes.
function padViaCount(ratio) {
  if (ratio < 1.6) return 1;
  if (ratio < 3) return 2;
  return 3;
}

// Points along the ellipse arc, ordered in the direction of travel. Past about
// 1.4x padding the outer points sit beyond the ends of the A→B axis — that is
// what turns the shape from a spike into a teardrop, so the sweep is wide by
// design.
function ellipseArcVias(aLat, aLng, bLat, bLng, lengthKm, sweepDeg, count) {
  const cosLat = Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
  const KM_PER_DEG = 111.32;

  // Local km-plane centred on A, x east, y north.
  const bxX = (bLng - aLng) * cosLat * KM_PER_DEG;
  const bxY = (bLat - aLat) * KM_PER_DEG;
  const span = Math.sqrt(bxX * bxX + bxY * bxY);
  if (span <= 0) return null;

  const ux = bxX / span, uy = bxY / span;   // along A→B
  const vx = -uy, vy = ux;                  // perpendicular

  const a = lengthKm / 2;
  const c = span / 2;
  const b = Math.sqrt(Math.max(a * a - c * c, 0));
  if (b <= 0) return null;

  const mx = bxX / 2, my = bxY / 2;
  const side = sweepDeg < 0 ? -1 : 1;
  const centre = Math.abs(sweepDeg);
  const vias = [];

  for (let i = 0; i < count; i++) {
    // Angles run high→low so the points come out ordered from A's end to B's.
    const offset = count === 1
      ? 0
      : PAD_SPREAD - (2 * PAD_SPREAD * i) / (count - 1);
    const t = (centre + offset) * Math.PI / 180;
    const px = mx + a * Math.cos(t) * ux + b * Math.sin(t) * side * vx;
    const py = my + a * Math.cos(t) * uy + b * Math.sin(t) * side * vy;
    vias.push({
      lat: aLat + py / KM_PER_DEG,
      lng: aLng + px / (cosLat * KM_PER_DEG),
    });
  }

  return vias;
}

// Crow-flight length of the whole waypoint chain for a given ellipse parameter.
// With one via that is the parameter itself; with several the chain runs well
// past it, which is why the parameter can't be used as the request directly.
function arcChainKm(aLat, aLng, bLat, bLng, lengthKm, sweepDeg, count) {
  const vias = ellipseArcVias(aLat, aLng, bLat, bLng, lengthKm, sweepDeg, count);
  if (!vias) return null;
  const pts = [[aLat, aLng]].concat(vias.map(function (v) { return [v.lat, v.lng]; }));
  pts.push([bLat, bLng]);
  let km = 0;
  for (let i = 1; i < pts.length; i++) {
    km += haversineKm(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  }
  return km;
}

// The ellipse parameter whose waypoint chain measures about targetKm. Chain
// length climbs monotonically with the parameter, so a short bisection pins it
// down without spending an API call on the guess.
function solveArcLength(aLat, aLng, bLat, bLng, targetKm, sweepDeg, count) {
  const span = haversineKm(aLat, aLng, bLat, bLng);
  if (targetKm <= span) return null;

  let lo = span * 1.0001;
  let hi = Math.max(targetKm * 4, span * 4);
  if ((arcChainKm(aLat, aLng, bLat, bLng, hi, sweepDeg, count) || 0) < targetKm) return hi;

  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const chain = arcChainKm(aLat, aLng, bLat, bLng, mid, sweepDeg, count);
    if (chain === null || chain < targetKm) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

async function generatePaddedRoute(fromLat, fromLng, toLat, toLng, distanceKm, toleranceKm, variant) {
  const tolKm = toleranceKm || 0.2;
  const MAX_CALLS = 10; // via-point attempts, on top of the direct probe
  const PER_SEED = 2;   // correction rounds before swinging to another sweep

  // The direct route is the floor: nothing shorter can reach the destination.
  const direct = await generateABRoute(fromLat, fromLng, toLat, toLng);
  const directKm = direct.summary.distance / 1000;
  if (distanceKm <= directKm * 1.1) return direct;

  const viaCount = padViaCount(distanceKm / directKm);

  // The sweep order rotates with the variant, so asking for a new route
  // explores a different side of the A→B axis first instead of re-deriving the
  // walk that was just rejected.
  const spin = PAD_SWEEPS.length + ((variant || 0) % PAD_SWEEPS.length);
  const sweeps = PAD_SWEEPS.slice(spin % PAD_SWEEPS.length)
    .concat(PAD_SWEEPS.slice(0, spin % PAD_SWEEPS.length));

  // The direct walk is the standing candidate: shorter than asked for, but it
  // never doubles back, so a padded route has to beat it on routeCost to win.
  // Where no long way round exists, that is the honest answer and the caller's
  // variance toast owns the explaining.
  direct.shape = measureRetrace(direct.coords);
  let best = direct;
  let bestCost = routeCost(direct.shape.meters, Math.abs(directKm - distanceKm));
  let calls = 0;

  // How much longer the streets run than the crow-flight chain. It is a
  // property of the area, not of one direction, so what a failed sweep teaches
  // is carried into the next one instead of being learned again from scratch.
  let roadFactor = directKm / Math.max(0.001, haversineKm(fromLat, fromLng, toLat, toLng));
  roadFactor = Math.min(2, Math.max(1, roadFactor));

  for (let s = 0; s < sweeps.length && calls < MAX_CALLS; s++) {
    let prevActualKm = null;

    for (let round = 0; round < PER_SEED && calls < MAX_CALLS; round++) {
      const arcKm = solveArcLength(
        fromLat, fromLng, toLat, toLng,
        distanceKm / roadFactor, sweeps[s], viaCount
      );
      if (!arcKm) break;
      const vias = ellipseArcVias(fromLat, fromLng, toLat, toLng, arcKm, sweeps[s], viaCount);
      if (!vias) break;

      const coordinates = [[fromLng, fromLat]]
        .concat(vias.map(function (v) { return [v.lng, v.lat]; }))
        .concat([[toLng, toLat]]);

      // continue_straight bans U-turns at the via points — the very move that
      // turns a tour into a spur.
      let body = { coordinates, continue_straight: true };

      calls++;
      let result;
      try {
        result = await callORS(body);
      } catch (e) {
        // Strict routing can fail outright on a via snapped into a dead end.
        // Give the direction one loose try before abandoning it.
        if (calls >= MAX_CALLS) break;
        calls++;
        body = { coordinates };
        try {
          result = await callORS(body);
        } catch (e2) {
          break; // unroutable this way — swing elsewhere
        }
      }

      const actualKm = result.summary.distance / 1000;
      const err = Math.abs(actualKm - distanceKm);
      result.shape = measureRetrace(result.coords);
      result.body = body;

      const cost = routeCost(result.shape.meters, err);
      if (cost < bestCost) { best = result; bestCost = cost; }
      if (result.shape.meters <= RETRACE_OK_M && err <= tolKm) return result;
      if (actualKm <= 0) break;

      // A walk that doubles back never ends the search early, but the length
      // correction still runs: where no long way round exists at all, that
      // convergence is what lets the fallback come back near the length asked
      // for instead of any old figure.
      if (prevActualKm !== null && Math.abs(actualKm - prevActualKm) < 0.05) break;
      prevActualKm = actualKm;

      const chainKm = arcChainKm(fromLat, fromLng, toLat, toLng, arcKm, sweeps[s], viaCount);
      if (chainKm > 0) {
        roadFactor = Math.min(3, Math.max(1, actualKm / chainKm));
      }
    }
  }

  // This is where the doubling back actually bites — a via snapped onto a road
  // whose only way in is its only way out. Block the worst offending strip and
  // let ORS find its way round; twice, because clearing one spur often just
  // uncovers the next. A round that changes nothing means the strip is the only
  // way through, and asking again would only spend the same call twice.
  for (let i = 0; i < 2; i++) {
    const better = await retryWithoutWorstStrip(best, distanceKm);
    if (better === best) break;
    best = better;
  }
  return best;
}
