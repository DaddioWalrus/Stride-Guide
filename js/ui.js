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
let navSteps = [];
let navCurrentStep = 0;
let navCurrentSpeedMs = 0;
let useMetric = true;

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
const routeTimeEl = document.getElementById('route-time');
const routeDistEl = document.getElementById('route-dist');
const startBtn = document.getElementById('start-btn');

const navTimeEl = document.getElementById('nav-time');
const navDistEl = document.getElementById('nav-dist');
const navUnitEl = document.getElementById('nav-unit');
const navPaceEl = document.getElementById('nav-pace');
const navCenterEl = document.getElementById('nav-center');
const stopBtn = document.getElementById('stop-btn');

const errorToast = document.getElementById('error-toast');
const arrivalToast = document.getElementById('arrival-toast');
const instructionPill = document.getElementById('instruction-pill');
const instructionArrowEl = document.getElementById('instruction-arrow');
const instructionTextEl = document.getElementById('instruction-text');
const instructionDistEl = document.getElementById('instruction-dist');

const pinCard = document.getElementById('pin-card');
const pinTimeEl = document.getElementById('pin-time');
const pinDistEl = document.getElementById('pin-dist');
const pinNameEl = document.getElementById('pin-name');
const pinCloseBtn = document.getElementById('pin-close-btn');
const pinDirectionsBtn = document.getElementById('pin-directions-btn');

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
}

function hideArrival() {
  arrivalToast.classList.remove('visible');
}

// ─── Turn-by-Turn ─────────────────────────────────────────────────────────────

const STEP_ARROWS = {
  0: '↰', 1: '↱', 2: '↰', 3: '↱',
  4: '↖', 5: '↗', 6: '↑',
  7: '↻', 8: '↱', 9: '↩',
  10: '●', 11: '↑', 12: '↖', 13: '↗',
};

function initSteps(steps) {
  let cumKm = 0;
  navSteps = steps.map(function (s) {
    const step = { instruction: s.instruction, type: s.type, triggerKm: cumKm };
    cumKm += s.distance / 1000;
    return step;
  });
  navCurrentStep = Math.min(1, navSteps.length - 1);
}

const PREP_RE = /\b(onto|on|into|via|along|through|towards?|at|then|and|to|for|from|by|with|the|a|an|of|in|off|over|past|ahead)\b/gi;

function formatInstruction(text) {
  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return safe.replace(PREP_RE, '<span class="instr-prep">$1</span>');
}

function stepDistLabel(distKm) {
  if (useMetric) {
    return distKm < 0.1 ? `${Math.round(distKm * 1000)}m` : `${distKm.toFixed(1)}km`;
  }
  const mi = distKm * 0.621371;
  return mi < 0.1 ? `${Math.round(distKm * 3280.84)}ft` : `${mi.toFixed(1)}mi`;
}

function updateInstruction() {
  if (!navSteps.length || navCurrentStep >= navSteps.length) return;
  const step = navSteps[navCurrentStep];
  const distKm = Math.max(0, step.triggerKm - navTotalDistKm);
  instructionArrowEl.textContent = STEP_ARROWS[step.type] ?? '↑';
  instructionTextEl.innerHTML = formatInstruction(step.instruction);
  instructionDistEl.textContent = stepDistLabel(distKm);
}

function advanceStep() {
  while (
    navCurrentStep < navSteps.length - 1 &&
    navTotalDistKm >= navSteps[navCurrentStep].triggerKm
  ) {
    navCurrentStep++;
  }
}

function updateNavDisplay() {
  if (!navStartTime) return;
  const elapsedHr = (Date.now() - navStartTime) / 3600000;
  const avgKmh = navTotalDistKm > 0.05 && elapsedHr > 0.001
    ? navTotalDistKm / elapsedHr
    : navCurrentSpeedMs * 3.6;
  const remainingKm = Math.max(0, navRouteDistKm - navTotalDistKm);
  if (useMetric) {
    navDistEl.textContent = `${remainingKm.toFixed(2)} km`;
    navPaceEl.textContent = `${avgKmh.toFixed(1)} km/h`;
  } else {
    navDistEl.textContent = `${(remainingKm * 0.621371).toFixed(2)} mi`;
    navPaceEl.textContent = `${(avgKmh * 0.621371).toFixed(1)} mph`;
  }
  navUnitEl.textContent = useMetric ? 'metric' : 'imperial';
}

navCenterEl.addEventListener('click', function () {
  useMetric = !useMetric;
  updateNavDisplay();
  updateInstruction();
});

// ─── Pin Card ────────────────────────────────────────────────────────────────

let pinLat = null, pinLng = null, pinName = null;

window.onPinDropped = async function (lat, lng) {
  pinLat = lat;
  pinLng = lng;
  pinName = null;

  pinTimeEl.textContent = '-- min';
  pinNameEl.textContent = 'Locating...';

  if (userLocation) {
    const d = haversineKm(userLocation.lat, userLocation.lng, lat, lng);
    const mins = Math.round(d / 5 * 60);
    pinDistEl.textContent = useMetric ? `${d.toFixed(1)} km` : `${(d * 0.621371).toFixed(1)} mi`;
    pinTimeEl.textContent = `~${mins} min`;
  } else {
    pinDistEl.textContent = '-- km';
  }

  phases.forEach(function (p) { document.getElementById(p).classList.add('hidden'); });
  pinCard.classList.remove('hidden');

  const name = await reverseGeocode(lat, lng);
  pinName = name;
  pinNameEl.textContent = name;
};

pinCloseBtn.addEventListener('click', function () {
  pinCard.classList.add('hidden');
  clearPinMarker();
  pinLat = null; pinLng = null; pinName = null;
  showPhase('search-panel');
});

pinDirectionsBtn.addEventListener('click', async function () {
  if (!userLocation) {
    pinNameEl.textContent = 'Enable GPS to get directions';
    return;
  }

  const toLat = pinLat;
  const toLng = pinLng;
  const toName = pinName || 'your destination';

  pinDirectionsBtn.disabled = true;
  pinDirectionsBtn.textContent = 'Loading...';
  loadingBox.classList.add('visible');

  try {
    startLocation = userLocation;
    destination = { lat: toLat, lng: toLng, name: toName };
    clearDestination();
    const result = await generateABRoute(userLocation.lat, userLocation.lng, toLat, toLng);
    navRouteDistKm = result.summary.distance / 1000;
    const mins = Math.round(result.summary.duration / 60);
    routeTimeEl.textContent = `${mins} min`;
    routeDistEl.textContent = useMetric
      ? `${navRouteDistKm.toFixed(1)} km`
      : `${(navRouteDistKm * 0.621371).toFixed(1)} mi`;
    initSteps(result.steps || []);
    drawRoute(result.coords);
    pinCard.classList.add('hidden');
    clearPinMarker();
    pinLat = null; pinLng = null;
    showPhase('route-panel');
  } catch (e) {
    pinNameEl.textContent = 'Could not find route — try again';
  }

  loadingBox.classList.remove('visible');
  pinDirectionsBtn.disabled = false;
  pinDirectionsBtn.textContent = 'Go';
});

// ─── Phase 1: Search ──────────────────────────────────────────────────────────

searchBtn.addEventListener('click', handleSearch);

destInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') handleSearch();
});

map.on('click', function (e) {
  if (!suggestionsList.classList.contains('hidden')) {
    suggestionsList.classList.add('hidden');
    return;
  }
  if (navRafId !== null) return;
  placePinMarker(e.latlng.lat, e.latlng.lng);
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
      const mins = Math.round(result.summary.duration / 60);
      routeTimeEl.textContent = `${mins} min`;
      routeDistEl.textContent = useMetric
        ? `${navRouteDistKm.toFixed(1)} km`
        : `${(navRouteDistKm * 0.621371).toFixed(1)} mi`;
      initSteps(result.steps || []);
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
  navCurrentSpeedMs = 0;
  navArrived = false;
  hideArrival();
  updateNavDisplay();

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

  if (navSteps.length) {
    updateInstruction();
    instructionPill.classList.remove('hidden');
  }

  updateEta();
  navTimerInterval = setInterval(updateEta, 10000);

  navWatchId = startNavigation(
    function (pos) {
      if (navLastPos) {
        navTotalDistKm += haversineKm(navLastPos.lat, navLastPos.lng, pos.lat, pos.lng);
      }
      navLastPos = pos;

      if (pos.speed !== null && pos.speed >= 0) navCurrentSpeedMs = pos.speed;
      updateNavDisplay();

      advanceStep();
      updateInstruction();

      if (!navArrived && destination) {
        const distToDest = haversineKm(pos.lat, pos.lng, destination.lat, destination.lng);
        if (distToDest < 0.01) {
          navArrived = true;
          instructionPill.classList.add('hidden');
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
  navSteps = [];
  navCurrentStep = 0;
  navCurrentSpeedMs = 0;
  hideArrival();
  instructionPill.classList.add('hidden');
  stopNavigation(navWatchId);
  navWatchId = null;
  pinCard.classList.add('hidden');
  pinLat = null; pinLng = null; pinName = null;
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
