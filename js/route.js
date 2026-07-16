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
// 10–20% off. Generate, measure, rescale the request proportionally (same seed,
// so the shape stays comparable and the length responds predictably), and retry
// until within tolerance. Returns the closest attempt if none converges.

async function generateLoopRoute(lat, lng, distanceKm, toleranceKm) {
  const tolKm = toleranceKm || 0.2;
  const seed = Math.floor(Math.random() * 90);
  const MAX_ATTEMPTS = 4;

  let requestKm = distanceKm;
  let best = null;
  let bestErr = Infinity;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
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
    if (err <= tolKm || actualKm <= 0) break;

    requestKm *= distanceKm / actualKm;
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
