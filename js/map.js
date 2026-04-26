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
let startMarker = null;
let destinationMarker = null;
let currentRoute = null;

// Silently acquire GPS on load so searches have location context
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(function (position) {
    userLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
    map.setView([userLocation.lat, userLocation.lng], 15);
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

      if (heading !== null && typeof map.setBearing === 'function') {
        map.setBearing(heading);
      }

      onPosition({ lat, lng, heading, speed: position.coords.speed });
    },
    function () { onError('Lost GPS signal'); },
    { enableHighAccuracy: true, maximumAge: 1000 }
  );
}

function stopNavigation(watchId) {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  if (userMarker) { userMarker.remove(); userMarker = null; }
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

function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

async function overpassSearch(query, lat, lng) {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Search name and brand, no limit — sort by distance in JS so nearest appear first
  // out bb instead of out center: bounding box always has coords even for complex relations
  const overpassQuery = `[out:json][timeout:6];(nwr["name"~"${escaped}",i](around:32187,${lat},${lng});nwr["brand"~"${escaped}",i](around:32187,${lat},${lng}););out bb;`;

  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 7000);

  try {
    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(overpassQuery);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const data = await resp.json();

    return (data.elements || [])
      .map(function (el) {
        let elLat, elLng;
        if (el.lat !== undefined) {
          elLat = el.lat; elLng = el.lon;                          // node
        } else if (el.bounds) {
          elLat = (el.bounds.minlat + el.bounds.maxlat) / 2;      // way / relation
          elLng = (el.bounds.minlon + el.bounds.maxlon) / 2;
        }
        const name = el.tags?.name || el.tags?.brand || query;
        const street = el.tags?.['addr:street'] || '';
        const city = el.tags?.['addr:city'] || el.tags?.['addr:town'] || '';
        const detail = [street, city].filter(Boolean).join(', ');
        return { lat: elLat, lng: elLng, name, detail };
      })
      .filter(function (el) { return el.lat && el.lng; })
      .sort(function (a, b) {
        return distKm(lat, lng, a.lat, a.lng) - distKm(lat, lng, b.lat, b.lng);
      })
      .slice(0, 5);
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
    `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=5&viewbox=${viewbox}&bounded=1`,
    { headers: NOMINATIM_HEADERS }
  );
  const localData = await localResp.json();

  const data = localData.length > 0 || !globalFallback ? localData : await (async () => {
    const globalResp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=5`,
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
  });
}

async function searchAddressSuggestions(query) {
  const centre = startLocation || userLocation || map.getCenter();
  const lat = centre.lat;
  const lng = centre.lng;

  if (looksLikeAddress(query)) {
    return nominatimSearch(query, lat, lng);
  }

  const results = await overpassSearch(query, lat, lng);
  if (results.length > 0) return results;
  return nominatimSearch(query, lat, lng, false);
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
