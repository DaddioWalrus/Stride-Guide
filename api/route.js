module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.ORS_API_KEY) {
    return res.status(500).json({ error: 'Routing service not configured' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || !Array.isArray(body.coordinates) || body.coordinates.length === 0) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  let response;
  try {
    response = await fetch(
      'https://api.openrouteservice.org/v2/directions/foot-walking/geojson',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': process.env.ORS_API_KEY,
        },
        body: JSON.stringify(body),
      }
    );
  } catch {
    return res.status(502).json({ error: 'Routing service unavailable' });
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return res.status(502).json({ error: 'Routing service unavailable' });
  }

  res.status(response.status).json(data);
};
