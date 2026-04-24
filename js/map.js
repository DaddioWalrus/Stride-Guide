// ─── Map Setup ────────────────────────────────────────────────────────────────

const map = L.map('map', {
  zoomControl: true,
});

map.zoomControl.setPosition('topleft');
document.addEventListener('DOMContentLoaded', function () {
  const zoomControl = document.querySelector('.leaflet-control-zoom');
  if (zoomControl) zoomControl.style.marginTop = '70px';
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
}).addTo(map);

const style = document.createElement('style');
style.textContent = '.leaflet-control-attribution { display: none !important; }';
document.head.appendChild(style);

// Start on Witney as fallback
map.setView([51.7851, -1.4842], 15);

// ─── State ────────────────────────────────────────────────────────────────────

let userLocation = null;
let startMarker = null;
let destinationMarker = null;
let currentRoute = null;

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
  html: '<div style="width:14px;height:14px;background:#e74c3c;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
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

// ─── Address Search ───────────────────────────────────────────────────────────

async function searchAddress(query) {
  const encoded = encodeURIComponent(query);
  const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`;

  const response = await fetch(url, {
    headers: {
      'Accept-Language': 'en',
      'User-Agent': 'StrideGuide/1.0',
    },
  });

  const data = await response.json();

  if (data.length === 0) {
    throw new Error('Location not found, try a different search');
  }

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    name: data[0].display_name.split(',').slice(0, 2).join(', '),
  };
}
