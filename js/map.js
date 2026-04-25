// ─── Map Setup ────────────────────────────────────────────────────────────────

const map = L.map('map', { zoomControl: true });

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

async function searchAddress(query) {
  const encoded = encodeURIComponent(query);
  const centre = startLocation || userLocation || map.getCenter();
  const lat = centre.lat;
  const lng = centre.lng;

  // 50-mile (~80 km) bounding box: ~0.72° lat, ~1.17° lng at UK latitudes
  const dlat = 0.72;
  const dlng = 1.17;
  const viewbox = `${lng - dlng},${lat + dlat},${lng + dlng},${lat - dlat}`;

  const localUrl = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&viewbox=${viewbox}&bounded=1`;
  const localResp = await fetch(localUrl, { headers: NOMINATIM_HEADERS });
  const localData = await localResp.json();

  if (localData.length > 0) {
    return parseNominatimResult(localData[0]);
  }

  // Nothing nearby — fall back to global search
  const globalUrl = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`;
  const globalResp = await fetch(globalUrl, { headers: NOMINATIM_HEADERS });
  const globalData = await globalResp.json();

  if (globalData.length === 0) {
    throw new Error('Location not found, try a different search');
  }

  return parseNominatimResult(globalData[0]);
}

function parseNominatimResult(item) {
  return {
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    name: item.display_name.split(',').slice(0, 2).join(', '),
  };
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
