// ─── State ────────────────────────────────────────────────────────────────────

let isLoop = true;
let mode = null;
let value = 30;
let startLocation = null;
let destination = null;
let loading = false;
let navWatchId = null;
let navStartTime = null;
let navTotalDistKm = 0;
let navRouteDistKm = 0;
let navLastPos = null;
let navTimerInterval = null;

// ─── Element References ───────────────────────────────────────────────────────

const panel = document.getElementById('route-panel');

const loopBtn = document.getElementById('loop-btn');
const abBtn = document.getElementById('ab-btn');

const loopLocationRow = document.getElementById('loop-location-row');
const abLocationRows = document.getElementById('ab-location-rows');

const loopStartInput = document.getElementById('loop-start-input');
const loopGpsBtn = document.getElementById('loop-gps-btn');

const abStartInput = document.getElementById('ab-start-input');
const abStartGpsBtn = document.getElementById('ab-start-gps-btn');
const abDestInput = document.getElementById('ab-dest-input');
const abDestGpsBtn = document.getElementById('ab-dest-gps-btn');

const modeRow = document.getElementById('mode-row');
const timeBtn = document.getElementById('time-btn');
const distanceBtn = document.getElementById('distance-btn');

const stepRow = document.getElementById('step-row');
const stepDown = document.getElementById('step-down');
const stepUp = document.getElementById('step-up');
const stepValueEl = document.getElementById('step-value');

const generateBtn = document.getElementById('generate-btn');
const errorEl = document.getElementById('error-text');

const collapsedTitle = document.getElementById('collapsed-title');
const collapsedSummary = document.getElementById('collapsed-summary');
const changeBtn = document.getElementById('change-btn');
const startNavBtn = document.getElementById('start-nav-btn');

const navPanel = document.getElementById('nav-panel');
const navTimeEl = document.getElementById('nav-time');
const navDistEl = document.getElementById('nav-dist');
const navSpdEl = document.getElementById('nav-spd');
const stopBtn = document.getElementById('stop-btn');

// ─── Destination Callback (from map.js) ───────────────────────────────────────

window.onDestinationSet = async function (lat, lng) {
  destination = { lat, lng };
  if (!isLoop) {
    abDestInput.value = await reverseGeocode(lat, lng);
  }
  updateGenerateButton();
};

// ─── Toggle Loop / A→B ────────────────────────────────────────────────────────

loopBtn.addEventListener('click', function () {
  isLoop = true;
  loopBtn.classList.add('active');
  abBtn.classList.remove('active');
  loopLocationRow.classList.remove('hidden');
  abLocationRows.classList.add('hidden');
  modeRow.classList.remove('hidden');
  destination = null;
  clearDestination();
  clearRoute();
  updateGenerateButton();
});

abBtn.addEventListener('click', function () {
  isLoop = false;
  abBtn.classList.add('active');
  loopBtn.classList.remove('active');
  abLocationRows.classList.remove('hidden');
  loopLocationRow.classList.add('hidden');
  modeRow.classList.add('hidden');
  stepRow.classList.add('hidden');
  mode = null;
  clearRoute();
  updateGenerateButton();
});

// ─── GPS Buttons ──────────────────────────────────────────────────────────────

loopGpsBtn.addEventListener('click', function () {
  handleGPS(loopGpsBtn, function (loc) {
    startLocation = loc;
    loopStartInput.value = 'My Location';
    placeStartMarker(loc.lat, loc.lng);
    modeRow.classList.remove('hidden');
    updateGenerateButton();
  });
});

abStartGpsBtn.addEventListener('click', function () {
  handleGPS(abStartGpsBtn, function (loc) {
    startLocation = loc;
    abStartInput.value = 'My Location';
    placeStartMarker(loc.lat, loc.lng);
    updateGenerateButton();
  });
});

abDestGpsBtn.addEventListener('click', function () {
  handleGPS(abDestGpsBtn, function (loc) {
    destination = loc;
    abDestInput.value = 'My Location';
    placeDestinationPin(loc.lat, loc.lng);
    updateGenerateButton();
  });
});

function handleGPS(btn, onSuccess) {
  btn.classList.add('loading');
  btn.textContent = '⏳';
  clearError();

  requestGPS(
    function (loc) {
      btn.classList.remove('loading');
      btn.textContent = '📍';
      onSuccess(loc);
    },
    function (errMsg) {
      btn.classList.remove('loading');
      btn.textContent = '📍';
      showError(errMsg);
    }
  );
}

// ─── Address Search on Input ──────────────────────────────────────────────────

loopStartInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') handleAddressSearch(loopStartInput, 'start');
});

abStartInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') handleAddressSearch(abStartInput, 'start');
});

abDestInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') handleAddressSearch(abDestInput, 'destination');
});

async function handleAddressSearch(input, type) {
  const query = input.value.trim();
  if (!query) return;
  clearError();

  input.disabled = true;
  input.value = 'Searching...';

  try {
    const result = await searchAddress(query);

    input.disabled = false;
    input.value = result.name;

    if (type === 'start') {
      startLocation = { lat: result.lat, lng: result.lng };
      placeStartMarker(result.lat, result.lng);
      if (isLoop) modeRow.classList.remove('hidden');
    } else {
      destination = { lat: result.lat, lng: result.lng };
      placeDestinationPin(result.lat, result.lng);
    }
    updateGenerateButton();
  } catch (e) {
    input.disabled = false;
    input.value = query;
    showError(e.message);
  }
}

// ─── Mode Buttons ─────────────────────────────────────────────────────────────

timeBtn.addEventListener('click', function () {
  mode = 'time';
  value = 30;
  timeBtn.classList.add('active');
  distanceBtn.classList.remove('active');
  stepRow.classList.remove('hidden');
  updateStepValue();
  updateGenerateButton();
});

distanceBtn.addEventListener('click', function () {
  mode = 'distance';
  value = 0.5;
  distanceBtn.classList.add('active');
  timeBtn.classList.remove('active');
  stepRow.classList.remove('hidden');
  updateStepValue();
  updateGenerateButton();
});

// ─── Step Buttons ─────────────────────────────────────────────────────────────

stepDown.addEventListener('click', function () {
  const min = mode === 'time' ? 5 : 0.5;
  const step = mode === 'time' ? 5 : 0.5;
  value = Math.max(min, value - step);
  updateStepValue();
});

stepUp.addEventListener('click', function () {
  const step = mode === 'time' ? 5 : 0.5;
  value = value + step;
  updateStepValue();
});

function updateStepValue() {
  stepValueEl.textContent = mode === 'time' ? `${value} min` : `${value} km`;
}

// ─── Generate Route ───────────────────────────────────────────────────────────

generateBtn.addEventListener('click', handleGenerateRoute);

async function handleGenerateRoute() {
  if (loading) return;

  if (!startLocation) {
    showError('Please set a start location first');
    return;
  }

  if (!isLoop && !destination) {
    showError('Please set a destination');
    return;
  }

  loading = true;
  generateBtn.disabled = true;
  generateBtn.textContent = 'Generating...';
  clearError();

  try {
    const distanceKm = mode === 'time' ? (value / 60) * 5 : value;
    let result;

    if (isLoop) {
      result = await generateLoopRoute(
        startLocation.lat,
        startLocation.lng,
        distanceKm
      );
    } else {
      result = await generateABRoute(
        startLocation.lat,
        startLocation.lng,
        destination.lat,
        destination.lng
      );
    }

    drawRoute(result.coords);
    collapsePanel(result.summary);

  } catch (e) {
    showError('Could not generate route — please check your locations and try again');
  }

  loading = false;
  generateBtn.disabled = false;
  generateBtn.textContent = 'Generate Route';
}

// ─── Panel Collapse ───────────────────────────────────────────────────────────

function collapsePanel(summary) {
  panel.classList.add('collapsed');
  collapsedTitle.textContent = 'Route Ready 🗺️';
  if (summary) {
    navRouteDistKm = summary.distance / 1000;
    collapsedSummary.textContent =
      `${navRouteDistKm.toFixed(1)}km — ${Math.round(summary.duration / 60)} min`;
  }
}

changeBtn.addEventListener('click', function () {
  panel.classList.remove('collapsed');
  clearError();
});

// ─── Generate Button Visibility ───────────────────────────────────────────────

function updateGenerateButton() {
  if (isLoop && startLocation && mode) {
    generateBtn.classList.remove('hidden');
  } else if (!isLoop && startLocation && destination) {
    generateBtn.classList.remove('hidden');
  } else {
    generateBtn.classList.add('hidden');
  }
}

// ─── Error Handling ───────────────────────────────────────────────────────────

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

function clearError() {
  errorEl.textContent = '';
  errorEl.classList.add('hidden');
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

startNavBtn.addEventListener('click', function () {
  panel.classList.add('hidden');
  navPanel.classList.remove('hidden');
  map.setZoom(18);

  navStartTime = Date.now();
  navTotalDistKm = 0;
  navLastPos = null;
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
    },
    function (err) { showError(err); }
  );
});

stopBtn.addEventListener('click', function () {
  clearInterval(navTimerInterval);
  navTimerInterval = null;
  navStartTime = null;
  navTotalDistKm = 0;
  navRouteDistKm = 0;
  navLastPos = null;
  stopNavigation(navWatchId);
  navWatchId = null;
  navPanel.classList.add('hidden');
  panel.classList.remove('hidden');
  map.setZoom(15);
});
