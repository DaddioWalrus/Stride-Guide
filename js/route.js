// ─── Route Generation ─────────────────────────────────────────────────────────

// API key is injected by Vercel from environment variables — never hardcoded here
const ORS_API_KEY = window.ORS_API_KEY;
const ORS_URL = 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson';

async function callORS(body) {
  const response = await fetch(ORS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': ORS_API_KEY,
    },
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

  return { coords, summary };
}

// ─── Loop Route ───────────────────────────────────────────────────────────────

async function generateLoopRoute(lat, lng, distanceKm) {
  return callORS({
    coordinates: [[lng, lat]],
    options: {
      round_trip: {
        length: distanceKm * 1000,
        points: 3,
      },
    },
  });
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
