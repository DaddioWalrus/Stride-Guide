// ─── Map Setup ────────────────────────────────────────────────────────────────

const map = L.map('map', { zoomControl: true });

map.zoomControl.setPosition('topleft');

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
}).addTo(map);

// Start on Witney as fallback
map.setView([51.7851, -1.4842], 15);

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

// ─── State ────────────────────────────────────────────────────────────────────

let userLocation = null;
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
      userLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      onSuccess(userLocation);
    },
    function (error) {
      onError('Could not get your location, please try again');
    }
  );
}

// ─── Start Marker ─────────────────────────────────────────────────────────────

function placeStartMarker(lat, lng) {
  if (startMarker) {
    startMarker.remove();
  }
  startMarker = L.marker([lat, lng])
    .addTo(map)
    .bindPopup('Start Here')
    .openPopup();

  map.flyTo([lat, lng], 15, { duration: 2 });
}

// ─── Destination Pin ──────────────────────────────────────────────────────────

const dotIcon = L.divIcon({
  className: '',
  html: '<div class="destination-dot"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const dragIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 120],
});

map.on('click', function (e) {
  placeDestinationPin(e.latlng.lat, e.latlng.lng);
});

function placeDestinationPin(lat, lng) {
  if (destinationMarker) {
    destinationMarker.remove();
  }

  destinationMarker = L.marker([lat, lng], {
    draggable: true,
    icon: dotIcon,
  }).addTo(map);

  destinationMarker.on('dragstart', function () {
    destinationMarker.setIcon(dragIcon);
  });

  destinationMarker.on('dragend', function () {
    destinationMarker.setIcon(dotIcon);
    const pos = destinationMarker.getLatLng();
    window.onDestinationSet(pos.lat, pos.lng);
  });

  window.onDestinationSet(lat, lng);
}

// ─── Route Drawing ────────────────────────────────────────────────────────────

function drawRoute(coords) {
  if (currentRoute) {
    currentRoute.remove();
  }
  currentRoute = L.polyline(coords, {
    color: '#4A90D9',
    weight: 5,
    opacity: 0.8,
  }).addTo(map);
  map.fitBounds(currentRoute.getBounds(), { padding: [40, 40] });
}

function clearRoute() {
  if (currentRoute) {
    currentRoute.remove();
    currentRoute = null;
  }
}

function clearDestination() {
  if (destinationMarker) {
    destinationMarker.remove();
    destinationMarker = null;
  }
}

function clearStartMarker() {
  if (startMarker) {
    startMarker.remove();
    startMarker = null;
  }
}

function flyToUserLocation() {
  if (userLocation) {
    map.flyTo([userLocation.lat, userLocation.lng], 15, { duration: 1.5 });
  }
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

      if (!userMarker) {
        userMarker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
      } else {
        userMarker.setLatLng([lat, lng]);
      }

      map.setView([lat, lng], map.getZoom(), { animate: true });
      onPosition({ lat, lng, speed: position.coords.speed });
    },
    function () { onError('Lost GPS signal'); },
    { enableHighAccuracy: true, maximumAge: 1000 }
  );
}

function stopNavigation(watchId) {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  if (userMarker) { userMarker.remove(); userMarker = null; }
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
