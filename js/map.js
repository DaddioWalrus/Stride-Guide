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

const navPositionHistory = [];
let navLastBearing    = null;
let navSmoothedBearing = null; // EMA-filtered target bearing (updated on GPS fix)
let navDisplayBearing  = null; // animated bearing (updated every RAF frame)
let navTargetLat = null, navTargetLng = null; // latest GPS position
let navDisplayLat = null, navDisplayLng = null; // animated position
let navPrevLat = null, navPrevLng = null; // for trail dots
let navRafId = null, navRafPrevTs = null;
const navTrailMarkers = [];

const NAV_ROT_SPEED = 200; // degrees per second max rotation

let navCompassWatching = false;
let navLastSpeed = 0;

const trailIcon = L.divIcon({
  className: '',
  html: '<div class="trail-dot"></div>',
  iconSize: [8, 8],
  iconAnchor: [4, 4],
});

function computeBearing(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const rlat1 = lat1 * Math.PI / 180;
  const rlat2 = lat2 * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(rlat2);
  const x = Math.cos(rlat1) * Math.sin(rlat2) - Math.sin(rlat1) * Math.cos(rlat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function smoothBearing(current, target, t) {
  const diff = ((target - current + 540) % 360) - 180;
  return (current + diff * t + 360) % 360;
}

function navHandleOrientation(e) {
  let heading = null;
  if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
    heading = e.webkitCompassHeading; // iOS — already clockwise from true north
  } else if (e.absolute && typeof e.alpha === 'number' && !isNaN(e.alpha)) {
    heading = (360 - e.alpha) % 360; // Android absolute — alpha is CCW from north
  }
  if (heading === null) return;
  if (navSmoothedBearing === null || navDisplayBearing === null) {
    navSmoothedBearing = heading;
    navDisplayBearing  = heading;
  } else {
    navSmoothedBearing = smoothBearing(navSmoothedBearing, heading, 0.1);
  }
}

async function startCompass() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      const state = await DeviceOrientationEvent.requestPermission();
      if (state !== 'granted') return;
    }
  } catch { return; }
  window.addEventListener('deviceorientationabsolute', navHandleOrientation, true);
  window.addEventListener('deviceorientation', navHandleOrientation, true);
  navCompassWatching = true;
}

function stopCompass() {
  window.removeEventListener('deviceorientationabsolute', navHandleOrientation, true);
  window.removeEventListener('deviceorientation', navHandleOrientation, true);
  navCompassWatching = false;
}

const userIcon = L.divIcon({
  className: '',
  html: '<div class="user-arrow"></div>',
  iconSize: [20, 26],
  iconAnchor: [10, 13],
});

function navRafTick(ts) {
  navRafId = requestAnimationFrame(navRafTick);
  const dt = navRafPrevTs ? Math.min((ts - navRafPrevTs) / 1000, 0.1) : 0;
  navRafPrevTs = ts;
  if (navDisplayLat === null || dt === 0) return;

  // Animate bearing toward smoothed GPS target at capped angular speed
  if (navSmoothedBearing !== null) {
    const diff = ((navSmoothedBearing - navDisplayBearing + 540) % 360) - 180;
    if (Math.abs(diff) > 0.05) {
      const step = Math.sign(diff) * Math.min(Math.abs(diff), NAV_ROT_SPEED * dt);
      navDisplayBearing = (navDisplayBearing + step + 360) % 360;
    }
  }

  // Animate position toward GPS target (~0.15 s time constant)
  if (navTargetLat !== null) {
    const k = 1 - Math.exp(-dt / 0.15);
    navDisplayLat += (navTargetLat - navDisplayLat) * k;
    navDisplayLng += (navTargetLng - navDisplayLng) * k;
  }

  if (userMarker) userMarker.setLatLng([navDisplayLat, navDisplayLng]);

  // Offset map center forward so user sits in lower third
  const zoom = map.getZoom();
  const bearingRad = (navDisplayBearing ?? 0) * Math.PI / 180;
  const userPx = map.project(L.latLng(navDisplayLat, navDisplayLng), zoom);
  const shift = map.getSize().y * 0.15;
  const centerPx = L.point(
    userPx.x + Math.sin(bearingRad) * shift,
    userPx.y - Math.cos(bearingRad) * shift
  );
  map.setView(map.unproject(centerPx, zoom), zoom, { animate: false });

  if (typeof map.setBearing === 'function') {
    map.setBearing((360 - (navDisplayBearing ?? 0)) % 360);
  }
}

function startNavigation(onPosition, onError) {
  if (!navigator.geolocation) {
    onError('GPS not available on this device');
    return null;
  }

  navRafPrevTs = null;
  navRafId = requestAnimationFrame(navRafTick);
  startCompass(); // fires async; may prompt on iOS — GPS heading covers the gap

  return navigator.geolocation.watchPosition(
    function (position) {
      const lat   = position.coords.latitude;
      const lng   = position.coords.longitude;
      const speed = position.coords.speed ?? 0;
      navLastSpeed = speed;

      // Trail dot at previous GPS position
      if (navPrevLat !== null) {
        const dot = L.marker([navPrevLat, navPrevLng], { icon: trailIcon, interactive: false }).addTo(map);
        navTrailMarkers.push(dot);
        if (navTrailMarkers.length > 5) navTrailMarkers.shift().remove();
      }
      navPrevLat = lat;
      navPrevLng = lng;

      if (!userMarker) {
        userMarker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
      }

      if (navDisplayLat === null) { navDisplayLat = lat; navDisplayLng = lng; }
      navTargetLat = lat;
      navTargetLng = lng;

      navPositionHistory.push({ lat, lng });
      if (navPositionHistory.length > 50) navPositionHistory.shift();

      // Compass handles bearing when active; fall back to GPS heading, then computed
      if (!navCompassWatching) {
        const gpsHdg = position.coords.heading;
        if (gpsHdg != null && !isNaN(gpsHdg) && speed > 0.3) {
          // GPS chipset heading — no lookback needed, updates every fix
          if (navSmoothedBearing === null) { navSmoothedBearing = gpsHdg; navDisplayBearing = gpsHdg; }
          else { navSmoothedBearing = smoothBearing(navSmoothedBearing, gpsHdg, 0.5); }
        } else {
          // Computed from position history (last resort)
          for (let i = navPositionHistory.length - 2; i >= 0; i--) {
            if (distKm(navPositionHistory[i].lat, navPositionHistory[i].lng, lat, lng) >= 0.008) {
              navLastBearing = computeBearing(navPositionHistory[i].lat, navPositionHistory[i].lng, lat, lng);
              if (navSmoothedBearing === null) { navSmoothedBearing = navLastBearing; navDisplayBearing = navLastBearing; }
              else { navSmoothedBearing = smoothBearing(navSmoothedBearing, navLastBearing, 0.4); }
              break;
            }
          }
        }
      }

      onPosition({ lat, lng, speed });
    },
    function () { onError('Lost GPS signal'); },
    { enableHighAccuracy: true, maximumAge: 0 }
  );
}

function stopNavigation(watchId) {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  if (navRafId !== null) { cancelAnimationFrame(navRafId); navRafId = null; }
  stopCompass();
  if (userMarker) { userMarker.remove(); userMarker = null; }
  navPositionHistory.length = 0;
  navLastBearing = null; navSmoothedBearing = null;
  navDisplayBearing = null;
  navTargetLat = null; navTargetLng = null;
  navDisplayLat = null; navDisplayLng = null;
  navPrevLat = null; navPrevLng = null;
  navRafPrevTs = null; navLastSpeed = 0;
  navTrailMarkers.forEach(function (m) { m.remove(); });
  navTrailMarkers.length = 0;
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
