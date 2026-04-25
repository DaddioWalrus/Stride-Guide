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

let startMarker = null;
let destinationMarker = null;
let currentRoute = null;
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

      onPosition({ lat, lng, heading });
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

async function searchAddressSuggestions(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`;
  const response = await fetch(url, { headers: NOMINATIM_HEADERS });
  const data = await response.json();
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
