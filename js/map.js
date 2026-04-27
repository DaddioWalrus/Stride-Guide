// ─── Map Setup ────────────────────────────────────────────────────────────────

const map = L.map('map', {
  zoomControl: true,
  rotate: true,
  bearing: 0,
  touchRotate: false,
});

map.zoomControl.setPosition('topleft');

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
}).addTo(map);

// Start on Witney as fallback
map.setView([51.7851, -1.4842], 15);

// ─── State ────────────────────────────────────────────────────────────────────

let userLocation = null;
let userLocality = '';
let startMarker = null;
let destinationMarker = null;
let currentRoute = null;

// Silently acquire GPS on load; also reverse geocode to get town name for search hints
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(async function (position) {
    userLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
    map.setView([userLocation.lat, userLocation.lng], 15);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${userLocation.lat}&lon=${userLocation.lng}&format=json&zoom=10`,
        { headers: NOMINATIM_HEADERS }
      );
      const data = await resp.json();
      userLocality = data.address?.town || data.address?.city ||
                     data.address?.village || data.address?.suburb || '';
    } catch {}
  }, function () {});
}
let userMarker = null;

// ─── GPS — on demand only ─────────────────────────────────────────────────────

function requestGPS(onSuccess, onError) {
  if (!navigator.geolocation) {
    onError('GPS not available on this device');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    function (position) {
      onSuccess({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
    },
    function () {
      onError('Could not get your location, please try again');
    },
    { enableHighAccuracy: true }
  );
}

// ─── Markers ──────────────────────────────────────────────────────────────────

function placeStartMarker(lat, lng) {
  if (startMarker) startMarker.remove();
  startMarker = L.marker([lat, lng]).addTo(map).bindPopup('Start').openPopup();
}

function clearStartMarker() {
  if (startMarker) { startMarker.remove(); startMarker = null; }
}

const dotIcon = L.divIcon({
  className: '',
  html: '<div class="destination-dot"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function placeDestinationPin(lat, lng) {
  if (destinationMarker) destinationMarker.remove();
  destinationMarker = L.marker([lat, lng], { icon: dotIcon }).addTo(map);
}

function clearDestination() {
  if (destinationMarker) { destinationMarker.remove(); destinationMarker = null; }
}

// ─── Route ────────────────────────────────────────────────────────────────────

function drawRoute(coords) {
  if (currentRoute) currentRoute.remove();
  currentRoute = L.polyline(coords, {
    color: '#4A90D9',
    weight: 5,
    opacity: 0.8,
  }).addTo(map);
  map.fitBounds(currentRoute.getBounds(), { padding: [40, 40] });
}

function clearRoute() {
  if (currentRoute) { currentRoute.remove(); currentRoute = null; }
}

// ─── Navigation ───────────────────────────────────────────────────────────────

const navHeadingBuffer = [];
let navLastBearing = null;

function computeBearing(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const rlat1 = lat1 * Math.PI / 180;
  const rlat2 = lat2 * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(rlat2);
  const x = Math.cos(rlat1) * Math.sin(rlat2) - Math.sin(rlat1) * Math.cos(rlat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

const userIcon = L.divIcon({
  className: '',
  html: '<div class="user-dot"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function startNavigation(onPosition, onError) {
  if (!navigator.geolocation) {
    onError('GPS not available on this device');
    return null;
  }

  return navigator.geolocation.watchPosition(
    function (position) {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const heading = position.coords.heading;

      if (!userMarker) {
        userMarker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
      } else {
        userMarker.setLatLng([lat, lng]);
      }

      map.setView([lat, lng], map.getZoom(), { animate: true });

      const speed = position.coords.speed;

      navHeadingBuffer.push({ lat, lng });
      if (navHeadingBuffer.length > 5) navHeadingBuffer.shift();

      if (typeof map.setBearing === 'function') {
        if (heading !== null && !isNaN(heading)) {
          // Geolocation API only sets heading when moving, so use it directly
          navLastBearing = heading;
          map.setBearing(heading);
        } else if (navHeadingBuffer.length >= 2) {
          const first = navHeadingBuffer[0];
          const last = navHeadingBuffer[navHeadingBuffer.length - 1];
          if (distKm(first.lat, first.lng, last.lat, last.lng) > 0.005) {
            navLastBearing = computeBearing(first.lat, first.lng, last.lat, last.lng);
            map.setBearing(navLastBearing);
          }
          // else: heading went null (paused at crossing etc.) — keep last bearing
        }
      }

      onPosition({ lat, lng, heading, speed });
    },
    function () { onError('Lost GPS signal'); },
    { enableHighAccuracy: true, maximumAge: 1000 }
  );
}

function stopNavigation(watchId) {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  if (userMarker) { userMarker.remove(); userMarker = null; }
  navHeadingBuffer.length = 0;
  navLastBearing = null;
  if (typeof map.setBearing === 'function') map.setBearing(0);
}

// ─── Geocoding ────────────────────────────────────────────────────────────────

const NOMINATIM_HEADERS = {
  'Accept-Language': 'en',
  'User-Agent': 'StrideGuide/1.0',
};

function looksLikeAddress(query) {
  return /\d/.test(query);
}

const BRAND_ALIASES = {
  'coop': 'co-op',
  'co op': 'co-op',
  'cooperative': 'co-operative',
  'the cooperative': 'co-operative',
  'mcdonalds': "mcdonald's",
  'mc donalds': "mcdonald's",
  'sainsburys': "sainsbury's",
  'sainsbury': "sainsbury's",
  'marks and spencer': 'marks & spencer',
  'm and s': 'marks & spencer',
  'ms': 'marks & spencer',
  'greggs': 'greggs',
  'primark': 'primark',
};

function normaliseQuery(q) {
  return BRAND_ALIASES[q.toLowerCase().trim()] || q;
}

function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

async function photonSearch(query, lat, lng) {
  const encoded = encodeURIComponent(query);
  const bbox = `${lng - 0.47},${lat - 0.29},${lng + 0.47},${lat + 0.29}`;
  const url = `https://photon.komoot.io/api/?q=${encoded}&lat=${lat}&lon=${lng}&limit=5&lang=en&bbox=${bbox}`;

  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 8000);

  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const data = await resp.json();

    return (data.features || [])
      .filter(function (f) { return f.properties.name; })
      .map(function (f) {
        const p = f.properties;
        const detail = [p.street, p.city || p.town || p.village].filter(Boolean).join(', ');
        return {
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          name: p.name,
          detail,
        };
      })
      .sort(function (a, b) {
        return distKm(lat, lng, a.lat, a.lng) - distKm(lat, lng, b.lat, b.lng);
      });
  } catch {
    clearTimeout(timer);
    return [];
  }
}

async function nominatimSearch(query, lat, lng, globalFallback = true) {
  const encoded = encodeURIComponent(query);
  // ~20-mile bounding box
  const dlat = 0.29;
  const dlng = 0.47;
  const viewbox = `${lng - dlng},${lat + dlat},${lng + dlng},${lat - dlat}`;

  const localResp = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=10&viewbox=${viewbox}&bounded=1`,
    { headers: NOMINATIM_HEADERS }
  );
  const localData = await localResp.json();

  const data = localData.length > 0 || !globalFallback ? localData : await (async () => {
    const globalResp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=10`,
      { headers: NOMINATIM_HEADERS }
    );
    return globalResp.json();
  })();

  return data.map(function (item) {
    const parts = item.display_name.split(',');
    return {
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      name: parts[0].trim(),
      detail: parts.slice(1, 3).join(',').trim(),
    };
  }).sort(function (a, b) {
    return distKm(lat, lng, a.lat, a.lng) - distKm(lat, lng, b.lat, b.lng);
  }).slice(0, 5);
}

async function searchAddressSuggestions(query) {
  const centre = startLocation || userLocation || map.getCenter();
  const lat = centre.lat;
  const lng = centre.lng;
  const normalised = normaliseQuery(query);

  if (looksLikeAddress(normalised)) {
    return nominatimSearch(normalised, lat, lng);
  }

  const results = await photonSearch(normalised, lat, lng);
  if (results.length > 0) return results;
  return nominatimSearch(normalised, lat, lng, false);
}

async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
  try {
    const response = await fetch(url, { headers: NOMINATIM_HEADERS });
    const data = await response.json();
    return data.display_name
      ? data.display_name.split(',').slice(0, 2).join(', ')
      : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}
