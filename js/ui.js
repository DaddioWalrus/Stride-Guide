// ─── State ────────────────────────────────────────────────────────────────────

let isLoop = true;
let mode = null;
let value = 30;
let destination = null;
let searching = false;
let loading = false;

// ─── Element References ───────────────────────────────────────────────────────

const panel = document.getElementById('route-panel');
const panelFull = document.querySelector('.panel-full');
const panelCollapsed = document.querySelector('.panel-collapsed');

const loopBtn = document.getElementById('loop-btn');
const abBtn = document.getElementById('ab-btn');

const searchRow = document.getElementById('search-row');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const destinationStatus = document.getElementById('destination-status');

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

// ─── Destination Callback (from map.js) ───────────────────────────────────────

window.onDestinationSet = function (lat, lng) {
  destination = { lat, lng };
  updateDestinationStatus();
  updateGenerateButton();
};

// ─── Toggle Loop / A→B ────────────────────────────────────────────────────────

loopBtn.addEventListener('click', function () {
  isLoop = true;
  loopBtn.classList.add('active');
  abBtn.classList.remove('active');
  searchRow.classList.add('hidden');
  destinationStatus.classList.add('hidden');
  modeRow.classList.remove('hidden');
  destination = null;
  clearDestination();
  clearRoute();
  flyToUserLocation();
  updateGenerateButton();
  updateStepRow();
});

abBtn.addEventListener('click', function () {
  isLoop = false;
  abBtn.classList.add('active');
  loopBtn.classList.remove('active');
  searchRow.classList.remove('hidden');
  destinationStatus.classList.remove('hidden');
  modeRow.classList.add('hidden');
  stepRow.classList.add('hidden');
  mode = null;
  updateGenerateButton();
  updateDestinationStatus();
});

// ─── Mode Buttons (Time / Distance) ───────────────────────────────────────────

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

// ─── Step Buttons (+/-) ───────────────────────────────────────────────────────

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

function updateStepRow() {
  if (mode) {
    stepRow.classList.remove('hidden');
  } else {
    stepRow.classList.add('hidden');
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

searchBtn.addEventListener('click', handleSearch);
searchInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') handleSearch();
});

async function handleSearch() {
  const query = searchInput.value.trim();
  if (!query || searching) return;

  searching = true;
  searchBtn.textContent = '...';
  clearError();

  try {
    await searchAddress(query);
  } catch (e) {
    showError(e.message);
  }

  searching = false;
  searchBtn.textContent = 'Go';
}

// ─── Destination Status ───────────────────────────────────────────────────────

function updateDestinationStatus() {
  if (destination) {
    destinationStatus.textContent = '📍 Destination set — or tap the map to move it';
  } else {
    destinationStatus.textContent = '📍 Search above or tap the map to set a destination';
  }
}

// ─── Generate Route ───────────────────────────────────────────────────────────

generateBtn.addEventListener('click', handleGenerateRoute);

async function handleGenerateRoute() {
  if (loading) return;

  if (!userLocation) {
    showError('Waiting for your location...');
    return;
  }

  if (!isLoop && !destination) {
    showError('Please set a destination on the map or search for one');
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
        userLocation.lat,
        userLocation.lng,
        distanceKm
      );
    } else {
      result = await generateABRoute(
        userLocation.lat,
        userLocation.lng,
        destination.lat,
        destination.lng
      );
    }

    drawRoute(result.coords);
    collapsePanel(result.summary);

  } catch (e) {
    showError(e.message);
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
    collapsedSummary.textContent =
      `${(summary.distance / 1000).toFixed(1)}km — ${Math.round(summary.duration / 60)} min`;
  }
}

changeBtn.addEventListener('click', function () {
  panel.classList.remove('collapsed');
  clearError();
});

// ─── Generate Button Visibility ───────────────────────────────────────────────

function updateGenerateButton() {
  if (isLoop && mode) {
    generateBtn.classList.remove('hidden');
  } else if (!isLoop && destination) {
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
