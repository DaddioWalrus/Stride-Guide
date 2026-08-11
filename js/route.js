// ─── Route Generation ─────────────────────────────────────────────────────────

async function callORS(body) {
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

  const coords = data.features[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  const summary = data.features[0].properties.summary;
  const steps = (data.features[0].properties.segments || [])
    .flatMap(seg => seg.steps || [])
    .map(s => ({ instruction: s.instruction, type: s.type, distance: s.distance }));

  return { coords, summary, steps };
}

// ─── Loop Route ───────────────────────────────────────────────────────────────
// ORS treats round_trip.length as a suggestion — actual loops routinely land
// 10–20% off. Strategy: within one seed (one loop direction), measure the
// actual length and rescale the request proportionally until it converges.
// Two ways a seed can fail: a plateau (waypoints snap to the same streets no
// matter what length we ask for, so retries return the identical loop) and a
// dead direction (no loop of this size exists that way — rivers, dead ends).
// Both are detected and answered by rotating to a fresh seed. Returns the
// closest attempt overall if nothing converges within the call budget.

async function generateLoopRoute(lat, lng, distanceKm, toleranceKm) {
  const tolKm = toleranceKm || 0.2;
  const MAX_CALLS = 7;       // total API budget per generation
  const PER_SEED = 3;        // correction rounds before giving up on a seed

  let best = null;
  let bestErr = Infinity;
  let calls = 0;
  let seed = Math.floor(Math.random() * 90);

  while (calls < MAX_CALLS) {
    let requestKm = distanceKm;
    let prevActualKm = null;

    for (let round = 0; round < PER_SEED && calls < MAX_CALLS; round++) {
      calls++;
      const result = await callORS({
        coordinates: [[lng, lat]],
        options: {
          round_trip: {
            length: Math.max(300, Math.round(requestKm * 1000)),
            points: 5,
            seed,
          },
        },
      });

      const actualKm = result.summary.distance / 1000;
      const err = Math.abs(actualKm - distanceKm);

      if (err < bestErr) {
        best = result;
        bestErr = err;
      }
      if (bestErr <= tolKm) return best;
      if (actualKm <= 0) break;

      // Plateau: the network returned (near-)identical length despite an
      // adjusted request — further correction on this seed is pointless.
      if (prevActualKm !== null && Math.abs(actualKm - prevActualKm) < 0.05) break;
      prevActualKm = actualKm;

      // Proportional correction, clamped so one weird result can't fling
      // the next request to a wild size.
      const ratio = Math.min(2, Math.max(0.5, distanceKm / actualKm));
      requestKm *= ratio;
    }

    // This direction won't converge — rotate to a meaningfully different one.
    seed = (seed + 29 + Math.floor(Math.random() * 30)) % 90;
  }

  return best;
}

// ─── A→B Route ────────────────────────────────────────────────────────────────

async function generateABRoute(startLat, startLng, endLat, endLng) {
  return callORS({
    coordinates: [
      [startLng, startLat],
      [endLng, endLat],
    ],
  });
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

const PAD_SWEEPS = [90, -90, 65, -65, 115, -115]; // sweep centres, sign = side of the A→B axis
const PAD_SPREAD = 60;      // degrees either side of the sweep centre
const RETRACE_MAX = 0.35;   // above this a route is doubling back, not touring

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

// How much of a route gets walked twice. Samples the line every 40m and counts
// a sample as retraced when another sample sits within 25m of it but more than
// 200m away along the route. An out-and-back scores near 1; a circuit that
// crosses itself once, or takes one short dead-end detour, scores a few percent.
function retraceFraction(coords) {
  if (!coords || coords.length < 2) return 0;

  const SAMPLE_M = 40, NEAR_M = 25, APART_M = 200;
  const samples = [];
  let along = 0;
  let carried = 0;

  for (let i = 1; i < coords.length; i++) {
    const segKm = haversineKm(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
    const segM = segKm * 1000;
    if (segM <= 0) continue;
    let t = SAMPLE_M - carried;
    while (t <= segM) {
      const f = t / segM;
      samples.push({
        lat: coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f,
        lng: coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f,
        s: along + t,
      });
      t += SAMPLE_M;
    }
    carried = (carried + segM) % SAMPLE_M;
    along += segM;
  }

  if (samples.length < 3) return 0;

  const hit = new Array(samples.length).fill(false);
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      if (samples[j].s - samples[i].s <= APART_M) continue;
      const d = haversineKm(samples[i].lat, samples[i].lng, samples[j].lat, samples[j].lng) * 1000;
      if (d <= NEAR_M) { hit[i] = true; hit[j] = true; }
    }
  }

  return hit.filter(Boolean).length / samples.length;
}

async function generatePaddedRoute(fromLat, fromLng, toLat, toLng, distanceKm, toleranceKm) {
  const tolKm = toleranceKm || 0.2;
  const MAX_CALLS = 8;  // via-point attempts, on top of the direct probe
  const PER_SEED = 2;   // correction rounds before swinging to another sweep

  // The direct route is the floor: nothing shorter can reach the destination.
  const direct = await generateABRoute(fromLat, fromLng, toLat, toLng);
  const directKm = direct.summary.distance / 1000;
  if (distanceKm <= directKm * 1.1) return direct;

  const viaCount = padViaCount(distanceKm / directKm);

  // Two bests: the closest route that tours, and the closest by length whatever
  // its shape. A touring route wins when there is one; failing that, the walk
  // still comes back at the length asked for — loop mode's contract, and the
  // caller's variance toast owns the explaining.
  let tourBest = null;
  let tourErr = Infinity;
  let anyBest = direct;
  let anyErr = Math.abs(directKm - distanceKm);
  let calls = 0;

  // How much longer the streets run than the crow-flight chain. It is a
  // property of the area, not of one direction, so what a failed sweep teaches
  // is carried into the next one instead of being learned again from scratch.
  let roadFactor = directKm / Math.max(0.001, haversineKm(fromLat, fromLng, toLat, toLng));
  roadFactor = Math.min(2, Math.max(1, roadFactor));

  for (let s = 0; s < PAD_SWEEPS.length && calls < MAX_CALLS; s++) {
    let prevActualKm = null;

    for (let round = 0; round < PER_SEED && calls < MAX_CALLS; round++) {
      const arcKm = solveArcLength(
        fromLat, fromLng, toLat, toLng,
        distanceKm / roadFactor, PAD_SWEEPS[s], viaCount
      );
      if (!arcKm) break;
      const vias = ellipseArcVias(fromLat, fromLng, toLat, toLng, arcKm, PAD_SWEEPS[s], viaCount);
      if (!vias) break;

      const coordinates = [[fromLng, fromLat]]
        .concat(vias.map(function (v) { return [v.lng, v.lat]; }))
        .concat([[toLng, toLat]]);

      calls++;
      let result;
      try {
        // continue_straight bans U-turns at the via points — the very move that
        // turns a tour into a spur.
        result = await callORS({ coordinates, continue_straight: true });
      } catch (e) {
        // Strict routing can fail outright on a via snapped into a dead end.
        // Give the direction one loose try before abandoning it.
        if (calls >= MAX_CALLS) break;
        calls++;
        try {
          result = await callORS({ coordinates });
        } catch (e2) {
          break; // unroutable this way — swing elsewhere
        }
      }

      const actualKm = result.summary.distance / 1000;
      const err = Math.abs(actualKm - distanceKm);
      const tours = retraceFraction(result.coords) <= RETRACE_MAX;

      if (err < anyErr) { anyBest = result; anyErr = err; }
      if (tours && err < tourErr) { tourBest = result; tourErr = err; }
      if (tourBest && tourErr <= tolKm) return tourBest;
      if (actualKm <= 0) break;

      // A there-and-back never ends the search early, but the correction still
      // runs: where no circuit exists at all, that convergence is what lets the
      // fallback come back at the length asked for instead of any old figure.
      if (prevActualKm !== null && Math.abs(actualKm - prevActualKm) < 0.05) break;
      prevActualKm = actualKm;

      const chainKm = arcChainKm(fromLat, fromLng, toLat, toLng, arcKm, PAD_SWEEPS[s], viaCount);
      if (chainKm > 0) {
        roadFactor = Math.min(3, Math.max(1, actualKm / chainKm));
      }
    }
  }

  return tourBest || anyBest;
}
