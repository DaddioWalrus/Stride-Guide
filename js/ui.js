// ─── State ────────────────────────────────────────────────────────────────────

let destination = null;
let startLocation = null;
let navWatchId = null;
let navRouteDistKm = 0;
let navTotalDistKm = 0;
let navStartTime = null;
let navLastPos = null;
let navTimerInterval = null;
let navArrived = false;

// ─── Element References ───────────────────────────────────────────────────────

const destInput = document.getElementById('dest-input');
const searchBtn = document.getElementById('search-btn');
const suggestionsList = document.getElementById('suggestions');

const loadingBox = document.getElementById('loading-box');

const previewBack = document.getElementById('preview-back');
const previewDest = document.getElementById('preview-dest');
const startInput = document.getElementById('start-input');
const startGpsBtn = document.getElementById('start-gps-btn');
const directionsBtn = document.getElementById('directions-btn');

const routeBack = document.getElementById('route-back');
const routeSummary = document.getElementById('route-summary');
const startBtn = document.getElementById('start-btn');

const navTimeEl = document.getElementById('nav-time');
const navDistEl = document.getElementById('nav-dist');
const navSpdEl = document.getElementById('nav-spd');
const stopBtn = document.getElementById('stop-btn');

const errorToast = document.getElementById('error-toast');
const arrivalToast = document.getElementById('arrival-toast');

// ─── Phase Navigation ─────────────────────────────────────────────────────────

const phases = ['search-panel', 'preview-panel', 'route-panel', 'nav-panel'];

function showPhase(id) {
  phases.forEach(function (p) {
    document.getElementById(p).classList.add('hidden');
  });
  document.getElementById(id).classList.remove('hidden');
}

// ─── Error Toast ──────────────────────────────────────────────────────────────

let errorTimer = null;

function showError(msg) {
  errorToast.textContent = msg;
  errorToast.classList.add('visible');
  clearTimeout(errorTimer);
  errorTimer = setTimeout(function () {
    errorToast.classList.remove('visible');
  }, 3000);
}

// ─── Arrival Toast ────────────────────────────────────────────────────────────

function showArrival(name) {
  arrivalToast.textContent = `You've arrived at ${name}`;
  arrivalToast.classList.add('visible');
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

function hideArrival() {
  arrivalToast.classList.remove('visible');
}

// ─── Phase 1: Search ──────────────────────────────────────────────────────────

searchBtn.addEventListener('click', handleSearch);

destInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') handleSearch();
});

map.on('click', function () {
  suggestionsList.classList.add('hidden');
});

async function handleSearch() {
  const query = destInput.value.trim();
  if (!query) return;

  searchBtn.disabled = true;
  searchBtn.textContent = '...';

  try {
    const results = await searchAddressSuggestions(query);

    if (results.length === 0) {
      showError('No places found — try a different search');
      return;
    }

    suggestionsList.innerHTML = '';
    results.forEach(function (result) {
      const li = document.createElement('li');
      li.innerHTML = `<div class="place-name">${result.name}</div><div class="place-detail">${result.detail}</div>`;
      li.addEventListener('click', function () { selectDestination(result); });
      suggestionsList.appendChild(li);
    });
    suggestionsList.classList.remove('hidden');
  } catch {
    showError('Search failed — please try again');
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = 'Search';
  }
}

function selectDestination(result) {
  destination = { lat: result.lat, lng: result.lng, name: result.name };
  suggestionsList.classList.add('hidden');
  placeDestinationPin(result.lat, result.lng);
  map.flyTo([result.lat, result.lng], 15, { duration: 1.5 });
  previewDest.textContent = result.name;
  showPhase('preview-panel');
  acquireStartLocation();
}

// ─── Phase 2: Start Location ──────────────────────────────────────────────────

function acquireStartLocation() {
  startLocation = null;
  startInput.value = '';
  startInput.placeholder = 'Getting your location...';
  startInput.disabled = true;
  startGpsBtn.textContent = '⏳';
  directionsBtn.disabled = true;

  requestGPS(
    function (loc) {
      startLocation = loc;
      startInput.placeholder = 'My Location';
      startInput.disabled = false;
      startGpsBtn.textContent = '📍';
      directionsBtn.disabled = false;
    },
    function () {
      startInput.placeholder = 'Enter a start address...';
      startInput.disabled = false;
      startGpsBtn.textContent = '📍';
    }
  );
}

startGpsBtn.addEventListener('click', acquireStartLocation);

startInput.addEventListener('keydown', async function (e) {
  if (e.key !== 'Enter') return;
  const query = startInput.value.trim();
  if (!query) return;

  startInput.disabled = true;
  startInput.value = 'Searching...';

  try {
    const results = await searchAddressSuggestions(query);
    if (results.length > 0) {
      startLocation = { lat: results[0].lat, lng: results[0].lng };
      startInput.value = results[0].name;
      startInput.disabled = false;
      directionsBtn.disabled = false;
    } else {
      showError('Start location not found — try again');
      startInput.value = query;
      startInput.disabled = false;
    }
  } catch {
    showError('Search failed — please try again');
    startInput.value = query;
    startInput.disabled = false;
  }
});

// ─── Phase 2: Get Directions ──────────────────────────────────────────────────

previewBack.addEventListener('click', function () {
  clearDestination();
  destination = null;
  startLocation = null;
  suggestionsList.classList.add('hidden');
  showPhase('search-panel');
});

directionsBtn.addEventListener('click', function () {
  if (!startLocation) {
    showError('Please set a start location');
    return;
  }

  directionsBtn.disabled = true;
  map.flyTo([startLocation.lat, startLocation.lng], 15, { duration: 1 });
  placeStartMarker(startLocation.lat, startLocation.lng);
  loadingBox.classList.add('visible');

  generateABRoute(startLocation.lat, startLocation.lng, destination.lat, destination.lng)
    .then(function (result) {
      navRouteDistKm = result.summary.distance / 1000;
      const km = navRouteDistKm.toFixed(1);
      const mins = Math.round(result.summary.duration / 60);
      routeSummary.innerHTML = `<span class="route-dist">${km} km</span> · ${mins} min`;
      drawRoute(result.coords);
      showPhase('route-panel');
    })
    .catch(function () {
      showError('Could not get route — check your locations and try again');
    })
    .finally(function () {
      loadingBox.classList.remove('visible');
      directionsBtn.disabled = false;
    });
});

// ─── Phase 3: Route Overview ──────────────────────────────────────────────────

routeBack.addEventListener('click', function () {
  clearRoute();
  clearStartMarker();
  showPhase('preview-panel');
});

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

startBtn.addEventListener('click', function () {
  showPhase('nav-panel');
  map.setZoom(18);

  navStartTime = Date.now();
  navTotalDistKm = 0;
  navLastPos = null;
  navArrived = false;
  hideArrival();
  navDistEl.textContent = '0.0 km · 0.0 mi';
  navSpdEl.textContent = '0.0 km/h · 0.0 mph';

  const DEFAULT_WALK_KMH = 5;

  function updateEta() {
    const elapsedSec = (Date.now() - navStartTime) / 1000;
    const actualAvg = elapsedSec > 10 && navTotalDistKm > 0.01
      ? navTotalDistKm / (elapsedSec / 3600)
      : 0;
    const speedKmh = actualAvg > 0.5 ? actualAvg : DEFAULT_WALK_KMH;
    const remainingKm = Math.max(0, navRouteDistKm - navTotalDistKm);
    navTimeEl.textContent = `${Math.round(remainingKm / speedKmh * 60)} min`;
  }

  updateEta();
  navTimerInterval = setInterval(updateEta, 10000);

  navWatchId = startNavigation(
    function (pos) {
      if (navLastPos) {
        navTotalDistKm += haversineKm(navLastPos.lat, navLastPos.lng, pos.lat, pos.lng);
      }
      navLastPos = pos;

      const mi = navTotalDistKm * 0.621371;
      navDistEl.textContent = `${navTotalDistKm.toFixed(2)} km · ${mi.toFixed(2)} mi`;

      if (pos.speed !== null && pos.speed >= 0) {
        const kmh = pos.speed * 3.6;
        const mph = pos.speed * 2.23694;
        navSpdEl.textContent = `${kmh.toFixed(1)} km/h · ${mph.toFixed(1)} mph`;
      }

      if (!navArrived && destination) {
        const distToDest = haversineKm(pos.lat, pos.lng, destination.lat, destination.lng);
        if (distToDest < 0.05) {
          navArrived = true;
          showArrival(destination.name);
        }
      }
    },
    function (err) { showError(err); }
  );
});

// ─── Phase 4: Navigation ──────────────────────────────────────────────────────

stopBtn.addEventListener('click', function () {
  clearInterval(navTimerInterval);
  navTimerInterval = null;
  navStartTime = null;
  navTotalDistKm = 0;
  navRouteDistKm = 0;
  navLastPos = null;
  navArrived = false;
  hideArrival();
  stopNavigation(navWatchId);
  navWatchId = null;
  clearRoute();
  clearDestination();
  clearStartMarker();
  destination = null;
  startLocation = null;
  destInput.value = '';
  map.setZoom(15);
  showPhase('search-panel');
});

// ─── Keyboard tracking — keeps search panel above the keyboard ────────────────

const searchPanel = document.getElementById('search-panel');

function adjustSearchPanel() {
  const vv = window.visualViewport;
  const offsetFromBottom = window.innerHeight - (vv.offsetTop + vv.height);
  searchPanel.style.bottom = (Math.max(offsetFromBottom, 0) + 30) + 'px';
}

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', adjustSearchPanel);
  window.visualViewport.addEventListener('scroll', adjustSearchPanel);
}
