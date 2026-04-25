// ─── State ────────────────────────────────────────────────────────────────────

let destination = null;
let startLocation = null;
let navWatchId = null;

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

const navStatus = document.getElementById('nav-status');
const stopBtn = document.getElementById('stop-btn');

const errorToast = document.getElementById('error-toast');

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

// ─── Phase 1: Search ──────────────────────────────────────────────────────────

searchBtn.addEventListener('click', handleSearch);

destInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') handleSearch();
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
      const km = (result.summary.distance / 1000).toFixed(1);
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

startBtn.addEventListener('click', function () {
  showPhase('nav-panel');
  map.setZoom(18);

  navWatchId = startNavigation(
    function () {},
    function (err) { showError(err); }
  );
});

// ─── Phase 4: Navigation ──────────────────────────────────────────────────────

stopBtn.addEventListener('click', function () {
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
