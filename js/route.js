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
// destination, and the way an in-flight loop change still gets you home. ORS has
// no "route of length L", so we bend the route with one via point: a point on
// the ellipse whose foci are A and B, where every point satisfies
// crow(A,V) + crow(V,B) = L. Roads are longer than crow lines, so the first ask
// overshoots; from there it is the same converge-or-rotate strategy as
// generateLoopRoute — measure, rescale proportionally, and swing the via point
// to the other side when a direction won't converge.

const PAD_ANGLES = [90, -90, 55, -55, 125, -125]; // via-point bearings off the A→B axis

function ellipseVia(aLat, aLng, bLat, bLng, lengthKm, angleDeg) {
  const cosLat = Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
  const KM_PER_DEG = 111.32;

  // Local km-plane centred on the midpoint, x east, y north.
  const axX = 0, axY = 0;
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

  const t = angleDeg * Math.PI / 180;
  const mx = (axX + bxX) / 2, my = (axY + bxY) / 2;
  const px = mx + a * Math.cos(t) * ux + b * Math.sin(t) * vx;
  const py = my + a * Math.cos(t) * uy + b * Math.sin(t) * vy;

  return {
    lat: aLat + py / KM_PER_DEG,
    lng: aLng + px / (cosLat * KM_PER_DEG),
  };
}

async function generatePaddedRoute(fromLat, fromLng, toLat, toLng, distanceKm, toleranceKm) {
  const tolKm = toleranceKm || 0.2;
  const MAX_CALLS = 6;  // via-point attempts, on top of the direct probe
  const PER_SEED = 2;   // correction rounds before swinging to another angle

  // The direct route is the floor: nothing shorter can reach the destination.
  const direct = await generateABRoute(fromLat, fromLng, toLat, toLng);
  const directKm = direct.summary.distance / 1000;
  if (distanceKm <= directKm * 1.1) return direct;

  let best = direct;
  let bestErr = Math.abs(directKm - distanceKm);
  let calls = 0;

  for (let s = 0; s < PAD_ANGLES.length && calls < MAX_CALLS; s++) {
    let requestKm = distanceKm;
    let prevActualKm = null;

    for (let round = 0; round < PER_SEED && calls < MAX_CALLS; round++) {
      const via = ellipseVia(fromLat, fromLng, toLat, toLng, requestKm, PAD_ANGLES[s]);
      if (!via) break;

      calls++;
      let result;
      try {
        result = await callORS({
          coordinates: [
            [fromLng, fromLat],
            [via.lng, via.lat],
            [toLng, toLat],
          ],
        });
      } catch (e) {
        break; // via point landed somewhere unroutable — try another angle
      }

      const actualKm = result.summary.distance / 1000;
      const err = Math.abs(actualKm - distanceKm);

      if (err < bestErr) {
        best = result;
        bestErr = err;
      }
      if (bestErr <= tolKm) return best;
      if (actualKm <= 0) break;

      if (prevActualKm !== null && Math.abs(actualKm - prevActualKm) < 0.05) break;
      prevActualKm = actualKm;

      const ratio = Math.min(2, Math.max(0.5, distanceKm / actualKm));
      requestKm *= ratio;
    }
  }

  return best;
}
