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

// Two bits of route are "the same strip" if they run close together along the
// same line. How close, and how nearly the same line, cannot be settled with one
// pair of numbers — because two shapes that both put route near route are
// completely different walks:
//
//   A fork. The walk leaves the start up one arm and comes back down the other.
//   The arms sit within L metres of each other for L/sin(θ) along each, so a
//   generous L reads an ordinary loop as doubling back. At 8m and 31° a 20°
//   fork scored 50m of retrace, and that rejected essentially every real loop —
//   which is why the app stopped returning anything.
//
//   The same street both ways. Out along one pavement, back along the other,
//   five or six metres apart for hundreds of metres. Tighten the numbers enough
//   to kill the fork and this walks straight through unnoticed, and it is far
//   worse than any spur: it is the whole complaint, twice the length.
//
// What tells them apart is not how close but how long they stay close. A fork
// diverges — it is near itself for tens of metres and then gone. Doubling back
// on a street is near itself for the length of the street. So the route is
// scanned twice, and each pass gets the run length its own tolerance deserves:
// tight and short-fused for an exact retread, loose and long-fused for the
// sustained kind. Measured, a fork tops out at 30m on the loose pass while a
// pavement out-and-back runs to 400m — two clear multiples apart either way.
const PIECE_M = 5;    // resolution the route is chopped to
const APART_M = 10;   // along-route gap before two pieces may be compared

const TIGHT = { strip: 3, aligned: 0.97, runM: 10 };  // same polyline, ~14° — a spur
const WIDE  = { strip: 8, aligned: 0.85, runM: 60 };  // same street, ~31° — a there-and-back

const MIN_STRIP_M = 10;   // shorter than this and there is nothing to route around

// Nearness alone still cannot say whether treading a strip twice was worth it.
// Walking down a street, round a loop at the far end, and back up the street the
// other way doubles back — but it is a walk, not a there-and-back, and the
// difference is what you do in between. So every doubled piece is asked how far
// it is, along the route, to the pass that matches it: that gap is the walking
// done between the two. A turnaround has nothing in it; a stem has the whole
// loop. Measured, stems come out at 1000-2400m and every turnaround at 15m, so
// the line between them is not a fine judgement.
const CIRCUIT_M = 200;    // a loop between the passes at least this long makes it a stem

// A stem is allowed, but it cannot be most of the walk. Past a third repeated,
// it stops being a loop with a way in and becomes an out-and-back with a bulge.
const STEM_MAX_FRAC = 1 / 3;

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

  return { list, proj: { mPerLat, mPerLng }, totalM: along };
}

// One pass at one tolerance: metres of route spent on ground the walk covers
// more than once, and the longest unbroken run of it. Pieces are bucketed into
// a grid one strip-width across, so each one only ever looks at its own cell and
// the eight around it; without that a 10km walk would be four million pair tests
// on a phone.
function scanRetrace(list, tol) {
  const cells = new Map();
  for (let i = 0; i < list.length; i++) {
    const k = Math.floor(list[i].x / tol.strip) + ':' + Math.floor(list[i].y / tol.strip);
    const bucket = cells.get(k);
    if (bucket) bucket.push(i); else cells.set(k, [i]);
  }

  // Not just whether a piece is walked twice, but how much walking happens
  // between the two passes — the shortest way round from one to the other. That
  // is what separates a stem from a turnaround, so the search cannot stop at the
  // first match; it has to find the nearest one in route order. It can stop as
  // soon as it finds a gap under the circuit threshold, since no later match
  // can talk that verdict back.
  function passGap(i) {
    const p = list[i];
    const cx = Math.floor(p.x / tol.strip), cy = Math.floor(p.y / tol.strip);
    let best = Infinity;
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const bucket = cells.get(gx + ':' + gy);
        if (!bucket) continue;
        for (let n = 0; n < bucket.length; n++) {
          const q = list[bucket[n]];
          const gap = Math.abs(q.s - p.s);
          if (gap < APART_M) continue;   // its own neighbours, not a second pass
          if (gap >= best) continue;
          const dx = q.x - p.x, dy = q.y - p.y;
          if (dx * dx + dy * dy > tol.strip * tol.strip) continue;
          if (Math.abs(p.ux * q.ux + p.uy * q.uy) < tol.aligned) continue;  // a crossing, not a retread
          best = gap;
          if (best < CIRCUIT_M) return best;   // already a turnaround
        }
      }
    }
    return best;
  }

  // Doubled route is tallied whole, but the runs are kept apart: a turnaround
  // run is the offence, a stem run is the price of reaching a loop.
  let meters = 0;
  let worst = [], turnWorst = [];
  let run = [], turnRun = [];
  for (let i = 0; i < list.length; i++) {
    const gap = passGap(i);
    if (gap === Infinity) {
      run = [];
      turnRun = [];
      continue;
    }

    meters += PIECE_M;
    run.push(list[i]);
    if (run.length > worst.length) worst = run;

    if (gap < CIRCUIT_M) {
      turnRun.push(list[i]);
      if (turnRun.length > turnWorst.length) turnWorst = turnRun;
    } else {
      turnRun = [];
    }
  }

  return {
    meters,
    worst: turnWorst.length ? turnWorst : worst,   // wall off an offence, never a stem
    run: worst.length * PIECE_M,
    turnRun: turnWorst.length * PIECE_M,
  };
}

// Both passes over one walk. `worst` is the strip worth walling off — taken
// from whichever pass is actually in breach, so the repair always aims at a
// real offender rather than at whichever tolerance happened to notice something.
function measureRetrace(coords) {
  const empty = {
    meters: 0, worst: [], proj: null,
    run: 0, wideRun: 0, turnRun: 0, wideTurnRun: 0, totalM: 0, frac: 0,
  };
  if (!coords || coords.length < 2) return empty;

  const pieces = routePieces(coords);
  const list = pieces.list;
  if (list.length < 3) return empty;

  const tight = scanRetrace(list, TIGHT);
  const wide = scanRetrace(list, WIDE);
  const breach = tight.turnRun >= TIGHT.runM ? tight
               : (wide.turnRun >= WIDE.runM ? wide : tight);
  const meters = Math.max(tight.meters, wide.meters);

  return {
    meters,
    worst: breach.worst,
    proj: pieces.proj,
    run: tight.run,
    wideRun: wide.run,
    turnRun: tight.turnRun,
    wideTurnRun: wide.turnRun,
    totalM: pieces.totalM,
    frac: pieces.totalM > 0 ? meters / pieces.totalM : 0,
  };
}

// Doubling back is not a cost to be weighed against length — it is a rule.
// Length is the thing that gives: a clean walk of the wrong size is an honest
// answer the walker can see and accept, a doubled one of the right size is not.
// Only where a place has no clean walk at all does a doubled one come back, and
// then it is flagged so the caller can say so — refusing outright leaves a
// walker standing outside with nothing, which serves them worse.
//
// The only doubling back that ever survives is the sort the geography imposes —
// a destination up a road with one way in and out. That is measured on the
// direct route and becomes the allowance for every longer walk to the same
// place, so we never add a retread of our own on top of it.
const NO_CLEAN_ROUTE = 'no-clean-route';

// Three tests, and a walk has to pass all of them.
//
// The first two ask whether it turns around: the longest unbroken *turnaround*
// run, on each pass, under that pass's limit. The run is what counts, not the
// total — a total sums fragments from every junction on the walk, which is not
// what treading the same strip twice means and not what anyone walks. And it is
// turnarounds only, because a stem out to a loop is a walk, not an offence.
//
// The third stops the stem from eating the walk. Doubling back is allowed as
// the way in to something; it cannot be the thing itself.
//
// `allow` raises the bar for a destination whose own geography forces a
// retread; left out, the limits stand. A limit is the point at which a walk
// becomes a doubled walk, so reaching it is already too far — under, not up to.
function isClean(result, allow) {
  const s = result.shape;
  const a = allow || {};
  return s.turnRun < (a.turnRun == null ? TIGHT.runM : a.turnRun)
      && s.wideTurnRun < (a.wideTurnRun == null ? WIDE.runM : a.wideTurnRun)
      && s.frac <= (a.frac == null ? STEM_MAX_FRAC : a.frac);
}

// How badly a rejected walk doubles back, for picking which near miss is worth
// spending a repair call on. Turnarounds are what a repair can actually shift,
// so they lead; the repeated fraction only breaks ties.
function retraceBadness(result) {
  const s = result.shape;
  return s.turnRun + s.wideTurnRun + s.frac * 100;
}

// The allowance a walk to this destination inherits from the streets themselves.
// The limits above say "this much is already too far", so they are compared
// exclusively; an inherited retrace is the opposite — the walk is allowed
// exactly what the direct route could not avoid. One piece of slack converts
// the one into the other, so a long way round carrying precisely the forced
// retrace passes while one that adds a single piece of its own does not.
function forcedAllowance(direct) {
  return {
    turnRun: Math.max(TIGHT.runM, direct.shape.turnRun + PIECE_M),
    wideTurnRun: Math.max(WIDE.runM, direct.shape.wideTurnRun + PIECE_M),
    // A longer walk covers more ground, so the forced retrace is a smaller
    // slice of it — the fraction only ever needs to be as generous as the
    // direct walk's own, never more.
    frac: Math.max(STEM_MAX_FRAC, direct.shape.frac),
  };
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

// Wall off the doubled strips one at a time and ask again, until the walk comes
// back clean or the tries run out. Corridors accumulate, so clearing one spur
// can't quietly reopen the last, and each round attacks whatever is now the
// worst — which is how a route with two spurs gets rid of both.
//
// Returns the last route it got, clean or not; the caller applies the rule.
// Where the strip is the only way through, ORS says so by failing, and the
// route we already had stands.
async function clearRetrace(candidate, allow, rounds) {
  let best = candidate;

  for (let i = 0; i < rounds; i++) {
    const shape = best.shape;
    if (!shape || isClean(best, allow)) return best;
    if (shape.worst.length * PIECE_M < MIN_STRIP_M) return best;   // junction noise
    if (!best.body) return best;
    // Nothing to wall off: the walk turns nowhere, its stem is simply too much
    // of it. Blocking the stem would only cut the loop off from the walker.
    if (!shape.turnRun && !shape.wideTurnRun) return best;

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
      return best;   // nothing routes with that strip blocked
    }

    result.shape = measureRetrace(result.coords);
    result.body = body;
    if (retraceBadness(result) >= retraceBadness(best)) return best;   // no ground gained
    best = result;
  }

  return best;
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
// The length asked for is a promise, not a preference: a walker who asks for
// half an hour and is handed eighteen minutes has been ignored. So the
// tolerance is enforced, and when the streets cannot satisfy both the length
// and the shape, the length window widens before the shape gives at all:
//
//   1. clean, inside the tolerance                     — what we came for
//   2. clean, inside twice the tolerance               — caller reports the time
//   3. inside twice the tolerance, least doubled       — caller warns on shape
//   4. whatever is closest                             — caller warns on both
//
// Widening first is the right order because a loop five minutes long is still
// the walk you asked for; a loop that doubles back is a different thing.

// How far off the requested length each rotation is willing to ask. A round
// trip's shape depends far more on the length asked for than on the seed, so a
// place that has no clean loop at exactly 2.5km very often has one at 2.3 or
// 2.7 — and since a clean loop of the wrong length beats a doubled one of the
// right length, it is worth asking. Candidates are still ranked against the
// original target, so the closest one to what was wanted still wins.
const LOOP_ASKS = [1, 0.92, 1.08, 0.85, 1.15];

async function generateLoopRoute(lat, lng, distanceKm, toleranceKm) {
  const tolKm = toleranceKm || 0.2;
  const MAX_CALLS = 12;      // total API budget per generation
  const PER_SEED = 3;        // correction rounds before giving up on a seed
  const REPAIR_ROUNDS = 3;   // strips walled off before giving up on a near miss

  const wideKm = tolKm * 2;                // the widened window, before shape gives
  let clean = null, cleanErr = Infinity;   // best loop that never doubles back
  let nearIn = null, nearInM = Infinity;   // least doubled of the rejects inside the window
  let near = null, nearM = Infinity;       // least doubled anywhere, for the repair pass
  let calls = 0;
  let spin = 0;
  let seed = Math.floor(Math.random() * 90);
  let lengthFactor = 1;      // what ORS delivers per km asked for, learned as we go

  while (calls < MAX_CALLS) {
    let prevActualKm = null;
    const askKm = distanceKm * LOOP_ASKS[spin % LOOP_ASKS.length];

    for (let round = 0; round < PER_SEED && calls < MAX_CALLS; round++) {
      const requestKm = askKm / lengthFactor;
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

      if (isClean(result)) {
        if (err < cleanErr) { clean = result; cleanErr = err; }
        if (cleanErr <= tolKm) return clean;
      } else {
        const bad = retraceBadness(result);
        if (bad < nearM) { near = result; nearM = bad; }
        if (err <= wideKm && bad < nearInM) { nearIn = result; nearInM = bad; }
      }
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
      if (!isClean(result)) break;
    }

    // This direction won't converge — rotate to a meaningfully different one.
    seed = (seed + 29 + Math.floor(Math.random() * 30)) % 90;
    spin++;
  }

  // Nothing clean inside the widened window yet. The least-doubled near miss
  // gets its turnarounds walled off one at a time — a spur blocked is often a
  // circuit found. Only worth the calls when the answer would otherwise be a
  // doubled walk or a badly-sized one.
  if ((!clean || cleanErr > wideKm) && near) {
    const fixed = await clearRetrace(near, undefined, REPAIR_ROUNDS);
    const err = Math.abs(fixed.summary.distance / 1000 - distanceKm);
    if (isClean(fixed)) {
      if (err < cleanErr) { clean = fixed; cleanErr = err; }
    } else {
      const bad = retraceBadness(fixed);
      if (bad < nearM) { near = fixed; nearM = bad; }
      if (err <= wideKm && bad < nearInM) { nearIn = fixed; nearInM = bad; }
    }
  }

  // Steps 1 and 3: a clean loop, at the length asked for or within the widened
  // window. The caller reports the time if it drifted.
  if (clean && cleanErr <= wideKm) return clean;

  // Step 4: nothing clean fits the window, so the shape gives — but only inside
  // it. The walker asked for a length and gets one; the caller says what it cost.
  if (nearIn) {
    nearIn.retraceWarn = true;
    return nearIn;
  }

  // Step 5: the streets here offer nothing near the right size either way.
  // Whatever came closest still beats an empty map — a walker standing outside
  // wants a walk — and the caller warns on whichever count it falls short.
  if (clean) return clean;
  if (near) {
    near.retraceWarn = true;
    return near;
  }

  // Every direction failed outright — no route came back at all. That is the
  // network or the streets, not the shape, and it is the one case that fails.
  throw new Error(NO_CLEAN_ROUTE);
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
  const MAX_CALLS = 12; // via-point attempts, on top of the direct probe
  const PER_SEED = 2;   // correction rounds before swinging to another sweep
  const REPAIR_ROUNDS = 3;

  // The direct route is the floor: nothing shorter can reach the destination.
  const direct = await generateABRoute(fromLat, fromLng, toLat, toLng);
  const directKm = direct.summary.distance / 1000;
  direct.shape = measureRetrace(direct.coords);
  if (distanceKm <= directKm * 1.1) return direct;

  // Some destinations sit up a road with one way in and one way out, and the
  // shortest walk there already treads it twice. That much is the geography's
  // doing and no route can dodge it, so it becomes the allowance — a longer
  // walk may inherit it, but it may not add a single metre of its own.
  const allow = forcedAllowance(direct);

  const viaCount = padViaCount(distanceKm / directKm);

  // The sweep order rotates with the variant, so asking for a new route
  // explores a different side of the A→B axis first instead of re-deriving the
  // walk that was just rejected.
  const spin = PAD_SWEEPS.length + ((variant || 0) % PAD_SWEEPS.length);
  const sweeps = PAD_SWEEPS.slice(spin % PAD_SWEEPS.length)
    .concat(PAD_SWEEPS.slice(0, spin % PAD_SWEEPS.length));

  // The direct walk is the standing candidate. It is short of what was asked
  // for, but it adds nothing to the geography's own doubling back — so where no
  // long way round can say the same, it wins by default and the caller tells
  // the walker why. A stretched walk that treads itself is never the answer.
  let clean = direct, cleanErr = Math.abs(directKm - distanceKm);
  let near = null, nearM = Infinity;
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

      if (isClean(result, allow)) {
        if (err < cleanErr) { clean = result; cleanErr = err; }
        if (cleanErr <= tolKm) return clean;
      } else if (retraceBadness(result) < nearM) {
        near = result; nearM = retraceBadness(result);
      }
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
  // whose only way in is its only way out. Wall off the offending strips and
  // let ORS find its way round. Only worth the calls while the direct walk is
  // still the best we have; once a clean long way round is in hand, it is.
  if (near && clean === direct) {
    const fixed = await clearRetrace(near, allow, REPAIR_ROUNDS);
    if (isClean(fixed, allow) &&
        Math.abs(fixed.summary.distance / 1000 - distanceKm) < cleanErr) {
      clean = fixed;
    }
  }

  // Falling back to the direct walk is not a near miss to be reported as a
  // length — it is a refusal to double the walker back, and it reads as one.
  if (clean === direct) direct.padRefused = true;

  return clean;
}
