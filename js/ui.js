// ─── State ────────────────────────────────────────────────────────────────────

let destination = null;
let startLocation = null;
let navWatchId = null;

// ─── Element References ───────────────────────────────────────────────────────

const destInput = document.getElementById('dest-input');
const destGpsBtn = document.getElementById('dest-gps-btn');
const searchBtn = document.getElementById('search-btn');
const suggestionsList = document.getElementById('suggestions');

const previewBack = document.getElementById('preview-back');
const previewDest = document.getElementById('preview-dest');
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

destGpsBtn.addEventListener('click', function () {
  destGpsBtn.textContent = '⏳';
  destGpsBtn.classList.add('loading');

  requestGPS(
    async function (loc) {
      destGpsBtn.textContent = '📍';
      destGpsBtn.classList.remove('loading');
      const name = await reverseGeocode(loc.lat, loc.lng);
      selectDestination({ lat: loc.lat, lng: loc.lng, name: name, detail: 'My Location' });
    },
    function (err) {
      destGpsBtn.textContent = '📍';
      destGpsBtn.classList.remove('loading');
      showError(err);
    }
  );
});

function selectDestination(result) {
  destination = { lat: result.lat, lng: result.lng, name: result.name };
  suggestionsList.classList.add('hidden');
  placeDestinationPin(result.lat, result.lng);
  map.flyTo([result.lat, result.lng], 15, { duration: 1.5 });
  previewDest.textContent = result.name;
  showPhase('preview-panel');
}

// ─── Phase 2: Preview ─────────────────────────────────────────────────────────

previewBack.addEventListener('click', function () {
  clearDestination();
  destination = null;
  suggestionsList.classList.add('hidden');
  showPhase('search-panel');
});

directionsBtn.addEventListener('click', function () {
  directionsBtn.disabled = true;
  directionsBtn.textContent = 'Finding you...';

  requestGPS(
    async function (loc) {
      startLocation = loc;
      placeStartMarker(loc.lat, loc.lng);
      directionsBtn.textContent = 'Routing...';

      try {
        const result = await generateABRoute(loc.lat, loc.lng, destination.lat, destination.lng);
        const km = (result.summary.distance / 1000).toFixed(1);
        const mins = Math.round(result.summary.duration / 60);
        routeSummary.innerHTML = `<span class="route-dist">${km} km</span> · ${mins} min`;
        drawRoute(result.coords);
        showPhase('route-panel');
      } catch {
        showError('Could not get route — check your locations and try again');
      } finally {
        directionsBtn.disabled = false;
        directionsBtn.textContent = 'Get Directions';
      }
    },
    function (err) {
      directionsBtn.disabled = false;
      directionsBtn.textContent = 'Get Directions';
      showError(err);
    }
  );
});

// ─── Phase 3: Route Overview ──────────────────────────────────────────────────

routeBack.addEventListener('click', function () {
  clearRoute();
  clearStartMarker();
  startLocation = null;
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
