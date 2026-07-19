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
