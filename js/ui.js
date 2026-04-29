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
let navArrived = false;
let navSteps = [];
let navCurrentStep = 0;
let navCurrentSpeedMs = 0;
let useMetric = true;
let navRouteCoords = null;
let navOffCourseFixes = 0;
let navLastRerouteTime = 0;
let navRerouting = false;

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

const changeBtn = document.getElementById('change-btn');
const startNavBtn = document.getElementById('start-nav-btn');

const routeTimeEl = document.getElementById('route-time');
const routeDistEl = document.getElementById('route-dist');

const navPanel = document.getElementById('nav-panel');
const navTimeEl = document.getElementById('nav-time');
const navDistEl = document.getElementById('nav-dist');
const navUnitEl = document.getElementById('nav-unit');
const navPaceEl = document.getElementById('nav-pace');
const navCenterEl = document.getElementById('nav-center');
const stopBtn = document.getElementById('stop-btn');

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

  panel.classList.add('hidden');
  pinCard.classList.remove('hidden');

  const name = await reverseGeocode(lat, lng);
  pinName = name;
  pinNameEl.textContent = name;
};

pinCloseBtn.addEventListener('click', function () {
  pinCard.classList.add('hidden');
  panel.classList.remove('hidden');
  clearPinMarker();
  pinLat = null;
  pinLng = null;
  pinName = null;
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

  try {
    startLocation = userLocation;
    destination = { lat: toLat, lng: toLng, name: toName };
    clearDestination();
    const result = await generateABRoute(userLocation.lat, userLocation.lng, toLat, toLng);
    navRouteCoords = result.coords;
    drawRoute(result.coords);
    pinCard.classList.add('hidden');
    panel.classList.remove('hidden');
    collapsePanel(result.summary, result.steps);
    clearPinMarker();
    pinLat = null;
    pinLng = null;
  } catch (e) {
    pinNameEl.textContent = 'Could not find route — try again';
  }

  pinDirectionsBtn.disabled = false;
  pinDirectionsBtn.textContent = 'Go';
});

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

    navRouteCoords = result.coords;
    drawRoute(result.coords);
    collapsePanel(result.summary, result.steps);

  } catch (e) {
    showError('Could not generate route — please check your locations and try again');
  }

  loading = false;
  generateBtn.disabled = false;
  generateBtn.textContent = 'Generate Route';
}

// ─── Panel Collapse ───────────────────────────────────────────────────────────

function collapsePanel(summary, steps) {
  panel.classList.add('collapsed');
  if (summary) {
    navRouteDistKm = summary.distance / 1000;
    const mins = Math.round(summary.duration / 60);
    routeTimeEl.textContent = `${mins} min`;
    routeDistEl.textContent = useMetric
      ? `${navRouteDistKm.toFixed(1)} km`
      : `${(navRouteDistKm * 0.621371).toFixed(1)} mi`;
  }
  initSteps(steps || []);
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

// ─── Arrival Toast ────────────────────────────────────────────────────────────

const arrivalToast = document.getElementById('arrival-toast');

function showArrival(name) {
  arrivalToast.textContent = `You've arrived at ${name}`;
  arrivalToast.classList.add('visible');
}

function hideArrival() {
  arrivalToast.classList.remove('visible');
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

// ─── Off-Course Rerouting ─────────────────────────────────────────────────────

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

// ─── Navigation ───────────────────────────────────────────────────────────────

startNavBtn.addEventListener('click', function () {
  panel.classList.add('hidden');
  navPanel.classList.remove('hidden');
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
          showArrival(destination.name || 'your destination');
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
});

stopBtn.addEventListener('click', function () {
  clearInterval(navTimerInterval);
  navTimerInterval = null;
  navStartTime = null;
  navTotalDistKm = 0;
  navRouteDistKm = 0;
  navLastPos = null;
  navCurrentSpeedMs = 0;
  navArrived = false;
  navSteps = [];
  navCurrentStep = 0;
  navRouteCoords = null;
  navOffCourseFixes = 0;
  navRerouting = false;
  hideArrival();
  instructionPill.classList.add('hidden');
  stopNavigation(navWatchId);
  navWatchId = null;
  navPanel.classList.add('hidden');
  pinCard.classList.add('hidden');
  pinLat = null; pinLng = null; pinName = null;
  panel.classList.remove('collapsed');
  panel.classList.remove('hidden');
  clearRoute();
  map.setZoom(15);
});
