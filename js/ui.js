// ─── State ────────────────────────────────────────────────────────────────────

let destination = null;
let startLocation = null;
let currentMode = 'ab';
let loopMode = null;
let loopValue = 30;
let loopUseMetric = true;
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
let navRouteCoords = null;
let navOffCourseFixes = 0;
let navLastRerouteTime = 0;
let navRerouting = false;
let pinUseMetric = true;
let pinRouteResult = null;
let pinRoutePromise = null;

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
const routeDestLabel = document.getElementById('route-dest-label');
const routeDestName = document.getElementById('route-dest-name');
const startBtn = document.getElementById('start-btn');

const navTimeEl = document.getElementById('nav-time');
const navDistEl = document.getElementById('nav-dist');
const navUnitEl = document.getElementById('nav-unit');
const navCenterEl = document.getElementById('nav-center');
const stopBtn = document.getElementById('stop-btn');

const routeCenterEl = document.getElementById('route-center');
const routeUnitHint = document.getElementById('route-unit-hint');

const errorToast = document.getElementById('error-toast');
const arrivalToast = document.getElementById('arrival-toast');
const instructionPill = document.getElementById('instruction-pill');
const instructionArrowEl = document.getElementById('instruction-arrow');
const instructionTextEl = document.getElementById('instruction-text');
const instructionDistEl = document.getElementById('instruction-dist');

const modeBar = document.getElementById('mode-bar');
const abTab = document.getElementById('ab-tab');
const loopTab = document.getElementById('loop-tab');

const loopPanel = document.getElementById('loop-panel');
const loopStepCenter = document.getElementById('loop-step-center');
const loopUnitHint = document.getElementById('loop-unit-hint');
const loopTimeBtn = document.getElementById('loop-time-btn');
const loopDistBtn = document.getElementById('loop-dist-btn');
const loopStepRow = document.getElementById('loop-step-row');
const loopStepDown = document.getElementById('loop-step-down');
const loopStepUp = document.getElementById('loop-step-up');
const loopStepValue = document.getElementById('loop-step-value');
const loopGenerateBtn = document.getElementById('loop-generate-btn');

const pinCard = document.getElementById('pin-card');
const pinTimeEl = document.getElementById('pin-time');
const pinDistEl = document.getElementById('pin-dist');
const pinCenter = document.getElementById('pin-center');
const pinUnitHint = document.getElementById('pin-unit-hint');
const pinLocationLabel = document.getElementById('pin-location-label');
const pinLocationName = document.getElementById('pin-location-name');
const pinCloseBtn = document.getElementById('pin-close-btn');
const pinDirectionsBtn = document.getElementById('pin-directions-btn');

// ─── Phase Navigation ─────────────────────────────────────────────────────────

const phases = ['search-panel', 'preview-panel', 'loop-panel', 'route-panel', 'nav-panel'];

function showPhase(id) {
  phases.forEach(function (p) {
    document.getElementById(p).classList.add('hidden');
  });
  document.getElementById(id).classList.remove('hidden');
  if (id !== 'route-panel') routeDestLabel.classList.add('hidden');
  const barVisible = id === 'search-panel' || id === 'preview-panel' || id === 'loop-panel';
  modeBar.classList.toggle('hidden', !barVisible);
}

function showRouteDest(name) {
  routeDestName.textContent = name || '';
  routeDestLabel.classList.toggle('hidden', !name);
}

// ─── Mode Selector ───────────────────────────────────────────────────────────

abTab.addEventListener('click', function () {
  if (currentMode === 'ab') return;
  currentMode = 'ab';
  abTab.classList.add('active');
  loopTab.classList.remove('active');
  clearRoute();
  clearDestination();
  destination = null;
  startLocation = null;
  suggestionsList.classList.add('hidden');
  showPhase('search-panel');
});

loopTab.addEventListener('click', function () {
  if (currentMode === 'loop') return;
  currentMode = 'loop';
  loopTab.classList.add('active');
  abTab.classList.remove('active');
  clearRoute();
  clearDestination();
  clearStartMarker();
  clearPinMarker();
  pinCard.classList.add('hidden');
  pinLocationLabel.classList.add('hidden');
  pinLat = null; pinLng = null; pinName = null;
  destination = null;
  startLocation = null;
  suggestionsList.classList.add('hidden');
  showPhase('loop-panel');
});

// ─── Loop Planning ────────────────────────────────────────────────────────────

loopTimeBtn.addEventListener('click', function () {
  if (loopMode === 'time') { collapseLoopStepRow(); return; }
  loopMode = 'time';
  loopValue = 30;
  loopTimeBtn.classList.add('active');
  loopDistBtn.classList.remove('active');
  loopStepRow.classList.remove('hidden');
  updateLoopStepValue();
  updateLoopGenerateBtn();
});

loopDistBtn.addEventListener('click', function () {
  if (loopMode === 'distance') { collapseLoopStepRow(); return; }
  loopMode = 'distance';
  loopValue = 2;
  loopUseMetric = true;
  loopDistBtn.classList.add('active');
  loopTimeBtn.classList.remove('active');
  loopStepRow.classList.remove('hidden');
  updateLoopStepValue();
  updateLoopGenerateBtn();
});

function collapseLoopStepRow() {
  loopMode = null;
  loopTimeBtn.classList.remove('active');
  loopDistBtn.classList.remove('active');
  loopStepRow.classList.add('hidden');
  updateLoopGenerateBtn();
}

loopStepCenter.addEventListener('click', function () {
  if (loopMode !== 'distance') return;
  if (loopUseMetric) {
    loopValue = Math.round(loopValue * 0.621371 * 2) / 2;
    loopUseMetric = false;
  } else {
    loopValue = Math.round(loopValue / 0.621371 * 2) / 2;
    loopUseMetric = true;
  }
  updateLoopStepValue();
});

loopStepDown.addEventListener('click', function () {
  if (loopMode === 'time') {
    loopValue = Math.max(5, loopValue - 5);
  } else {
    loopValue = Math.max(0.5, Math.round((loopValue - 0.5) * 10) / 10);
  }
  updateLoopStepValue();
});

loopStepUp.addEventListener('click', function () {
  if (loopMode === 'time') {
    loopValue = loopValue + 5;
  } else {
    loopValue = Math.round((loopValue + 0.5) * 10) / 10;
  }
  updateLoopStepValue();
});

function updateLoopStepValue() {
  if (loopMode === 'time') {
    loopStepValue.textContent = `${loopValue} min`;
    loopUnitHint.classList.add('hidden');
  } else if (loopUseMetric) {
    loopStepValue.textContent = `${loopValue} km`;
    loopUnitHint.textContent = 'Metric';
    loopUnitHint.classList.remove('hidden');
  } else {
    loopStepValue.textContent = `${loopValue} mi`;
    loopUnitHint.textContent = 'Imperial';
    loopUnitHint.classList.remove('hidden');
  }
}

function updateLoopGenerateBtn() {
  loopGenerateBtn.classList.toggle('hidden', !loopMode);
}

loopGenerateBtn.addEventListener('click', async function () {
  if (!loopMode) return;
  const loc = userLocation;
  if (!loc) {
    showError('Waiting for GPS location — please try again in a moment');
    return;
  }

  const distanceKm = loopMode === 'time'
    ? (loopValue / 60) * 5
    : (loopUseMetric ? loopValue : loopValue / 0.621371);

  loopGenerateBtn.disabled = true;

  try {
    startLocation = loc;
    destination = { lat: loc.lat, lng: loc.lng, name: 'Loop start' };
    const result = await generateLoopRoute(loc.lat, loc.lng, distanceKm);
    navRouteDistKm = result.summary.distance / 1000;
    const mins = Math.round(result.summary.duration / 60);
    routeTimeEl.textContent = `${mins} min`;
    updateRouteDist();
    navRouteCoords = result.coords;
    initSteps(result.steps || []);
    drawRoute(result.coords);
    showPhase('route-panel');
  } catch {
    showError('Could not generate route — please try again');
  }

  loopGenerateBtn.disabled = false;
});

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

function initSteps(steps, distOffset) {
  let cumKm = distOffset || 0;
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
  } else {
    navDistEl.textContent = `${(remainingKm * 0.621371).toFixed(2)} mi`;
  }
  navUnitEl.textContent = useMetric ? 'imperial' : 'metric';
}

navCenterEl.addEventListener('click', function () {
  useMetric = !useMetric;
  updateNavDisplay();
  updateInstruction();
});

function updateRouteDist() {
  if (useMetric) {
    routeDistEl.textContent = `${navRouteDistKm.toFixed(1)} km`;
    routeUnitHint.textContent = 'imperial';
  } else {
    routeDistEl.textContent = `${(navRouteDistKm * 0.621371).toFixed(1)} mi`;
    routeUnitHint.textContent = 'metric';
  }
}

routeCenterEl.addEventListener('click', function () {
  useMetric = !useMetric;
  updateRouteDist();
});

// ─── Pin Card ────────────────────────────────────────────────────────────────

let pinLat = null, pinLng = null, pinName = null;

function updatePinDist(d) {
  if (pinUseMetric) {
    pinDistEl.textContent = `${d.toFixed(1)} km`;
    pinUnitHint.textContent = 'imperial';
  } else {
    pinDistEl.textContent = `${(d * 0.621371).toFixed(1)} mi`;
    pinUnitHint.textContent = 'metric';
  }
  pinUnitHint.classList.remove('hidden');
}

pinCenter.addEventListener('click', function () {
  if (pinLat === null) return;
  if (!userLocation) return;
  pinUseMetric = !pinUseMetric;
  const d = pinRouteResult
    ? pinRouteResult.summary.distance / 1000
    : haversineKm(userLocation.lat, userLocation.lng, pinLat, pinLng);
  updatePinDist(d);
});

window.onPinDropped = async function (lat, lng) {
  pinLat = lat;
  pinLng = lng;
  pinName = null;
  pinUseMetric = true;
  pinRouteResult = null;
  pinRoutePromise = null;

  pinTimeEl.textContent = '-- min';
  pinLocationName.textContent = 'Locating...';

  if (userLocation) {
    const d = haversineKm(userLocation.lat, userLocation.lng, lat, lng);
    updatePinDist(d);
    pinTimeEl.textContent = `~${Math.round(d / 5 * 60)} min`;
  } else {
    pinDistEl.textContent = '-- km';
    pinUnitHint.classList.add('hidden');
  }

  phases.forEach(function (p) { document.getElementById(p).classList.add('hidden'); });
  pinCard.classList.remove('hidden');
  pinLocationLabel.classList.remove('hidden');

  if (userLocation) {
    const fromLat = userLocation.lat, fromLng = userLocation.lng;
    pinRoutePromise = generateABRoute(fromLat, fromLng, lat, lng)
      .then(function (result) {
        pinRouteResult = result;
        const distKm = result.summary.distance / 1000;
        navRouteDistKm = distKm;
        navRouteCoords = result.coords;
        initSteps(result.steps || []);
        drawRoute(result.coords);
        updatePinDist(distKm);
        pinTimeEl.textContent = `${Math.round(result.summary.duration / 60)} min`;
      })
      .catch(function () { /* silent — will retry on Go */ });
  }

  const name = await reverseGeocode(lat, lng);
  pinName = name;
  pinLocationName.textContent = name;
};

pinCloseBtn.addEventListener('click', function () {
  pinCard.classList.add('hidden');
  pinLocationLabel.classList.add('hidden');
  clearPinMarker();
  pinLat = null; pinLng = null; pinName = null;
  showPhase(currentMode === 'loop' ? 'loop-panel' : 'search-panel');
});

pinDirectionsBtn.addEventListener('click', async function () {
  if (!userLocation) {
    showError('Enable GPS to get directions');
    return;
  }

  const toLat = pinLat;
  const toLng = pinLng;
  const toName = pinName || 'your destination';

  startLocation = userLocation;
  destination = { lat: toLat, lng: toLng, name: toName };

  if (!pinRouteResult) {
    pinDirectionsBtn.disabled = true;
    pinDirectionsBtn.textContent = 'Loading...';
    try {
      if (pinRoutePromise) await pinRoutePromise;
      if (!pinRouteResult) {
        const result = await generateABRoute(userLocation.lat, userLocation.lng, toLat, toLng);
        pinRouteResult = result;
        navRouteDistKm = result.summary.distance / 1000;
        navRouteCoords = result.coords;
        initSteps(result.steps || []);
        drawRoute(result.coords);
      }
    } catch {
      showError('Could not find route — try again');
      pinDirectionsBtn.disabled = false;
      pinDirectionsBtn.textContent = 'Start';
      return;
    }
    pinDirectionsBtn.disabled = false;
    pinDirectionsBtn.textContent = 'Start';
  }

  clearDestination();
  pinCard.classList.add('hidden');
  pinLocationLabel.classList.add('hidden');
  clearPinMarker();
  pinLat = null; pinLng = null;
  beginNavigation();
});

// ─── Phase 1: Search ──────────────────────────────────────────────────────────

searchBtn.addEventListener('click', handleSearch);

destInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') handleSearch();
});

let suppressMapClick = false;
map.getContainer().addEventListener('touchstart', function () {
  if (document.activeElement === destInput) suppressMapClick = true;
}, { passive: true });

map.on('click', function (e) {
  if (!suggestionsList.classList.contains('hidden')) {
    suggestionsList.classList.add('hidden');
    return;
  }
  if (suppressMapClick) {
    suppressMapClick = false;
    return;
  }
  if (navRafId !== null) return;
  if (currentMode === 'loop') return;
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
      startInput.value = 'My Location';
      startInput.disabled = true;
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
  startInput.value = '';
  startInput.disabled = false;
  suggestionsList.classList.add('hidden');
  showPhase('search-panel');
});

directionsBtn.addEventListener('click', function () {
  if (!startLocation) {
    showError('Please set a start location');
    return;
  }

  directionsBtn.disabled = true;
  placeStartMarker(startLocation.lat, startLocation.lng);

  generateABRoute(startLocation.lat, startLocation.lng, destination.lat, destination.lng)
    .then(function (result) {
      navRouteDistKm = result.summary.distance / 1000;
      const mins = Math.round(result.summary.duration / 60);
      routeTimeEl.textContent = `${mins} min`;
      routeDistEl.textContent = useMetric
        ? `${navRouteDistKm.toFixed(1)} km`
        : `${(navRouteDistKm * 0.621371).toFixed(1)} mi`;
      navRouteCoords = result.coords;
      initSteps(result.steps || []);
      drawRoute(result.coords);
      showPhase('route-panel');
      showRouteDest(destination.name);
    })
    .catch(function () {
      showError('Could not get route — check your locations and try again');
    })
    .finally(function () {
      directionsBtn.disabled = false;
    });
});

// ─── Phase 3: Route Overview ──────────────────────────────────────────────────

routeBack.addEventListener('click', function () {
  clearRoute();
  clearStartMarker();
  showPhase(currentMode === 'loop' ? 'loop-panel' : 'preview-panel');
});

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function distToSegmentM(plat, plng, alat, alng, blat, blng) {
  const R = 6371000;
  const cosLat = Math.cos(((plat + alat + blat) / 3) * Math.PI / 180);
  const px = (plng - alng) * cosLat * R * Math.PI / 180;
  const py = (plat - alat) * R * Math.PI / 180;
  const bx = (blng - alng) * cosLat * R * Math.PI / 180;
  const by = (blat - alat) * R * Math.PI / 180;
  const len2 = bx * bx + by * by;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
  return Math.sqrt((px - t * bx) ** 2 + (py - t * by) ** 2);
}

function distToRouteM(lat, lng, coords) {
  let min = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = distToSegmentM(lat, lng, coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
    if (d < min) min = d;
  }
  return min;
}

async function triggerReroute() {
  navRerouting = true;
  navLastRerouteTime = Date.now();
  navOffCourseFixes = 0;

  instructionArrowEl.textContent = '↻';
  instructionTextEl.innerHTML = 'Rerouting...';
  instructionDistEl.textContent = '';
  instructionPill.classList.remove('hidden');

  try {
    const result = await generateABRoute(navLastPos.lat, navLastPos.lng, destination.lat, destination.lng);
    navRouteCoords = result.coords;
    navRouteDistKm = navTotalDistKm + result.summary.distance / 1000;
    drawRoute(result.coords);
    initSteps(result.steps || [], navTotalDistKm);
    updateInstruction();
  } catch (e) {
    updateInstruction();
  }

  navRerouting = false;
}

function beginNavigation() {
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

      if (!navArrived && !navRerouting && destination && navRouteCoords && navRouteCoords.length > 1) {
        if (distToRouteM(pos.lat, pos.lng, navRouteCoords) > 15) {
          navOffCourseFixes++;
          if (navOffCourseFixes >= 2 && Date.now() - navLastRerouteTime > 20000) {
            triggerReroute();
          }
        } else {
          navOffCourseFixes = 0;
        }
      }
    },
    function (err) { showError(err); }
  );
}

startBtn.addEventListener('click', beginNavigation);

// ─── Phase 4: Navigation ──────────────────────────────────────────────────────

stopBtn.addEventListener('click', function () {
  clearInterval(navTimerInterval);
  navTimerInterval = null;
  navStartTime = null;
  navTotalDistKm = 0;
  navRouteDistKm = 0;
  navLastPos = null;
  navArrived = false;
  navRouteCoords = null;
  navOffCourseFixes = 0;
  navRerouting = false;
  navSteps = [];
  navCurrentStep = 0;
  navCurrentSpeedMs = 0;
  hideArrival();
  instructionPill.classList.add('hidden');
  stopNavigation(navWatchId);
  navWatchId = null;
  pinCard.classList.add('hidden');
  pinLocationLabel.classList.add('hidden');
  pinLat = null; pinLng = null; pinName = null;
  clearRoute();
  clearDestination();
  clearStartMarker();
  destination = null;
  startLocation = null;
  destInput.value = '';
  map.setZoom(15);
  showPhase(currentMode === 'loop' ? 'loop-panel' : 'search-panel');
});

// ─── Keyboard tracking — keeps search panel above the keyboard ────────────────

const searchPanel = document.getElementById('search-panel');

function adjustSearchPanel() {
  const vv = window.visualViewport;
  const offsetFromBottom = window.innerHeight - (vv.offsetTop + vv.height);
  const bottomPad = document.activeElement === destInput ? 10 : 64;
  searchPanel.style.bottom = (Math.max(offsetFromBottom, 0) + bottomPad) + 'px';
}

destInput.addEventListener('focus', function () {
  modeBar.classList.add('hidden');
  searchPanel.style.bottom = '10px';
});

destInput.addEventListener('blur', function () {
  modeBar.classList.remove('hidden');
  searchPanel.style.bottom = '64px';
});

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', adjustSearchPanel);
  window.visualViewport.addEventListener('scroll', adjustSearchPanel);
}
