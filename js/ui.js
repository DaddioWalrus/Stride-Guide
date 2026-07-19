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
let loopLastDistKm = 0;
let mapDefaultZoom = 15;
let navPaused = false;
let navPausedAt = null;
let navPausedTotal = 0;

// ─── Unit preference (persisted) ──────────────────────────────────────────────

const UNITS_KEY = 'sgUnits';

function unitsMetric() {
  try { return localStorage.getItem(UNITS_KEY) !== 'mi'; } catch (e) { return true; }
}

function saveUnits(metric) {
  try { localStorage.setItem(UNITS_KEY, metric ? 'km' : 'mi'); } catch (e) {}
}

useMetric = unitsMetric();
pinUseMetric = useMetric;
loopUseMetric = useMetric;

// ─── Fieldline icon set (inline SVG, stroke = currentColor) ───────────────────

const ICONS = {
  locate:   '<svg class="fl" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.4"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22"/></svg>',
  place:    '<svg class="fl" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.5s6.5-6.8 6.5-12A6.5 6.5 0 0 0 5.5 9.5c0 5.2 6.5 12 6.5 12z"/><circle cx="12" cy="9.5" r="2.4"/></svg>',
  bookmark: '<svg class="fl" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h11a1 1 0 0 1 1 1V20l-6.5-4.2L5.5 20V5.5a1 1 0 0 1 1-1z"/></svg>',
  check:    '<svg class="fl" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11"/></svg>',
  layers:   '<svg class="fl" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8.5 4.6L12 12 3.5 7.6 12 3z"/><path d="M4 12l8 4.4 8-4.4"/><path d="M4 16.4l8 4.4 8-4.4"/></svg>',
  loop:     '<svg class="fl" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 11a7.5 7.5 0 0 1 12.7-4.6L20 9"/><path d="M20 3.5V9h-5.5"/><path d="M19.5 13a7.5 7.5 0 0 1-12.7 4.6L4 15"/><path d="M4 20.5V15h5.5"/></svg>',
  dest:     '<svg class="fl" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19L19 5"/><path d="M12 5h7v7"/></svg>',
  stats:    '<svg class="fl" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V12M12 20V5M19 20v-6"/></svg>',
  clock:    '<svg class="fl" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/></svg>',
  map:      '<svg class="fl" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4.5L3.5 7v12.5L9 17l6 2.5 5.5-2.5V4.5L15 7 9 4.5z"/><path d="M9 4.5V17M15 7v12.5"/></svg>',
  mail:     '<svg class="fl" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/></svg>',
  timer:    '<svg class="fl" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.5h5M12 2.5v3"/></svg>',
  ruler:    '<svg class="fl" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="8.5" width="19" height="7" rx="1.5"/><path d="M7 8.5v3M11 8.5v4M15 8.5v3M19 8.5v3"/></svg>',
  reverse:  '<svg class="fl" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4 9"/><path d="M4 3.5V9h5.5"/></svg>',
};

// ─── Element References ───────────────────────────────────────────────────────

const dockEl = document.getElementById('dock');
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
const loopRegenBtn = document.getElementById('loop-regen-btn');
const navRecentreBtn = document.getElementById('nav-recentre-btn');

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
  dockEl.classList.toggle('with-bar', barVisible);
}

function showNavPrompt() {
  document.getElementById('nav-eta-wrap').classList.add('hidden');
  navCenterEl.classList.add('hidden');
  document.getElementById('nav-controls-wrap').classList.add('hidden');
  document.getElementById('nav-prompt').classList.remove('hidden');
}

function hideNavPrompt() {
  document.getElementById('nav-prompt').classList.add('hidden');
  document.getElementById('nav-eta-wrap').classList.remove('hidden');
  navCenterEl.classList.remove('hidden');
  document.getElementById('nav-controls-wrap').classList.remove('hidden');
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
  loopRegenBtn.classList.add('hidden');
  clearRoute();
  clearDestination();
  destination = null;
  startLocation = null;
  suggestionsList.classList.add('hidden');
  showPhase('search-panel');
});

loopTab.addEventListener('click', function () {
  if (currentMode === 'loop') { collapseLoopStepRow(); return; }
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
  if (!loopMode) { loopTimeBtn.click(); }
});

// ─── Loop Planning ────────────────────────────────────────────────────────────

loopTimeBtn.addEventListener('click', function () {
  loopMode = 'time';
  loopValue = 30;
  loopTimeBtn.classList.add('active');
  loopDistBtn.classList.remove('active');
  loopStepRow.classList.remove('hidden');
  updateLoopStepValue();
  updateLoopGenerateBtn();
});

loopDistBtn.addEventListener('click', function () {
  loopMode = 'distance';
  loopValue = 2;
  loopUseMetric = unitsMetric();
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
  saveUnits(loopUseMetric);
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
  } else {
    loopStepValue.textContent = loopUseMetric ? `${loopValue} km` : `${loopValue} mi`;
    renderUnitSeg(loopUnitHint, loopUseMetric);
    loopUnitHint.classList.remove('hidden');
  }
}

function updateLoopGenerateBtn() {
  loopGenerateBtn.classList.toggle('hidden', !loopMode);
}

// Max acceptable deviation from the requested loop size:
// time mode → 2 min at ORS walking pace (5 km/h); distance mode → 0.2 km.
function loopToleranceKm() {
  return loopMode === 'time' ? (2 / 60) * 5 : 0.2;
}

// If the streets here genuinely can't produce a loop of the requested size,
// say so rather than silently presenting the near-miss as a match.
function notifyLoopVariance(result, targetKm) {
  const actualKm = result.summary.distance / 1000;
  if (Math.abs(actualKm - targetKm) <= loopToleranceKm() + 0.01) return;
  let label;
  if (loopMode === 'time') {
    label = `${Math.round(result.summary.duration / 60)} min`;
  } else {
    label = loopUseMetric
      ? `${actualKm.toFixed(1)} km`
      : `${(actualKm * 0.621371).toFixed(1)} mi`;
  }
  showError(`Closest loop the streets here allow: ${label}`);
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

  loopLastDistKm = distanceKm;
  loopGenerateBtn.disabled = true;
  loadingBox.classList.add('visible');

  try {
    startLocation = loc;
    destination = { lat: loc.lat, lng: loc.lng, name: 'Loop start' };
    const result = await generateLoopRoute(loc.lat, loc.lng, distanceKm, loopToleranceKm());
    notifyLoopVariance(result, distanceKm);
    navRouteDistKm = result.summary.distance / 1000;
    const mins = Math.round(result.summary.duration / 60);
    routeTimeEl.textContent = `${mins} min`;
    updateRouteDist();
    navRouteCoords = result.coords;
    initSteps(result.steps || []);
    drawRoute(result.coords);
    drawRouteArrows(result.coords);
    loopRegenBtn.classList.remove('hidden');
    loopReverseBtn.classList.remove('hidden');
    showPhase('route-panel');
  } catch {
    showError('Could not generate route — please try again');
  }

  loadingBox.classList.remove('visible');
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
  speak(`You've arrived at ${name}`);
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
  if (navStartTime) maybeSpeakStep(navCurrentStep, step, distKm);
}

function advanceStep() {
  while (
    navCurrentStep < navSteps.length - 1 &&
    navTotalDistKm >= navSteps[navCurrentStep].triggerKm
  ) {
    navCurrentStep++;
  }
}

function renderUnitSeg(el, metric) {
  el.children[0].classList.toggle('on', metric);
  el.children[1].classList.toggle('on', !metric);
}

// Elapsed walking time, excluding paused intervals
function navElapsedMs() {
  const pausing = navPaused && navPausedAt ? (Date.now() - navPausedAt) : 0;
  return Date.now() - navStartTime - navPausedTotal - pausing;
}

function updateNavDisplay() {
  if (!navStartTime) return;
  const elapsedHr = navElapsedMs() / 3600000;
  const avgKmh = navTotalDistKm > 0.05 && elapsedHr > 0.001
    ? navTotalDistKm / elapsedHr
    : navCurrentSpeedMs * 3.6;
  const remainingKm = Math.max(0, navRouteDistKm - navTotalDistKm);
  if (useMetric) {
    navDistEl.textContent = `${remainingKm.toFixed(2)} km`;
  } else {
    navDistEl.textContent = `${(remainingKm * 0.621371).toFixed(2)} mi`;
  }
  renderUnitSeg(navUnitEl, useMetric);
}

navCenterEl.addEventListener('click', function () {
  useMetric = !useMetric;
  saveUnits(useMetric);
  updateNavDisplay();
  updateInstruction();
});

function updateRouteDist() {
  if (useMetric) {
    routeDistEl.textContent = `${navRouteDistKm.toFixed(1)} km`;
  } else {
    routeDistEl.textContent = `${(navRouteDistKm * 0.621371).toFixed(1)} mi`;
  }
  renderUnitSeg(routeUnitHint, useMetric);
}

routeCenterEl.addEventListener('click', function () {
  useMetric = !useMetric;
  saveUnits(useMetric);
  updateRouteDist();
});

// Direct taps on a km/mi segment set that unit explicitly
function bindUnitSeg(el, setMetric) {
  Array.prototype.forEach.call(el.children, function (span, i) {
    span.addEventListener('click', function (e) {
      e.stopPropagation();
      setMetric(i === 0);
    });
  });
}

bindUnitSeg(navUnitEl, function (metric) {
  if (useMetric === metric) return;
  useMetric = metric;
  saveUnits(metric);
  updateNavDisplay();
  updateInstruction();
});

bindUnitSeg(routeUnitHint, function (metric) {
  if (useMetric === metric) return;
  useMetric = metric;
  saveUnits(metric);
  updateRouteDist();
});

bindUnitSeg(loopUnitHint, function (metric) {
  if (loopMode !== 'distance' || loopUseMetric === metric) return;
  if (metric) {
    loopValue = Math.round(loopValue / 0.621371 * 2) / 2;
  } else {
    loopValue = Math.round(loopValue * 0.621371 * 2) / 2;
  }
  loopUseMetric = metric;
  saveUnits(metric);
  updateLoopStepValue();
});

bindUnitSeg(pinUnitHint, function (metric) {
  if (pinLat === null || !userLocation) return;
  if (pinUseMetric === metric) return;
  pinUseMetric = metric;
  saveUnits(metric);
  const d = pinRouteResult
    ? pinRouteResult.summary.distance / 1000
    : haversineKm(userLocation.lat, userLocation.lng, pinLat, pinLng);
  updatePinDist(d);
});

// ─── Pin Card ────────────────────────────────────────────────────────────────

let pinLat = null, pinLng = null, pinName = null;

function updatePinDist(d) {
  if (pinUseMetric) {
    pinDistEl.textContent = `${d.toFixed(1)} km`;
  } else {
    pinDistEl.textContent = `${(d * 0.621371).toFixed(1)} mi`;
  }
  renderUnitSeg(pinUnitHint, pinUseMetric);
  pinUnitHint.classList.remove('hidden');
}

pinCenter.addEventListener('click', function () {
  if (pinLat === null) return;
  if (!userLocation) return;
  pinUseMetric = !pinUseMetric;
  saveUnits(pinUseMetric);
  const d = pinRouteResult
    ? pinRouteResult.summary.distance / 1000
    : haversineKm(userLocation.lat, userLocation.lng, pinLat, pinLng);
  updatePinDist(d);
});

window.onPinDropped = async function (lat, lng) {
  pinLat = lat;
  pinLng = lng;
  pinName = null;
  pinUseMetric = unitsMetric();
  pinRouteResult = null;
  pinRoutePromise = null;

  const saveBtn = document.getElementById('pin-save-btn');
  saveBtn.innerHTML = ICONS.bookmark;
  saveBtn.disabled = false;

  pinTimeEl.textContent = '…';
  pinLocationName.textContent = 'Locating...';

  if (userLocation) {
    const d = haversineKm(userLocation.lat, userLocation.lng, lat, lng);
    updatePinDist(d);
    pinTimeEl.textContent = `~${Math.round(d / 5 * 60)} min`;
  } else {
    pinDistEl.textContent = '…';
    pinUnitHint.classList.add('hidden');
  }

  phases.forEach(function (p) { document.getElementById(p).classList.add('hidden'); });
  pinCard.classList.remove('hidden');
  pinLocationLabel.classList.remove('hidden');

  if (userLocation) {
    const fromLat = userLocation.lat, fromLng = userLocation.lng;
    pinRoutePromise = generateABRoute(fromLat, fromLng, lat, lng)
      .then(function (result) {
        if (pinCard.classList.contains('hidden')) return;
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
  clearRoute();
  pinLat = null; pinLng = null; pinName = null;
  showPhase(currentMode === 'loop' ? 'loop-panel' : 'search-panel');
});

document.getElementById('pin-save-btn').addEventListener('click', function () {
  if (typeof window.onSaveLocationRequest === 'function') {
    window.onSaveLocationRequest(pinLat, pinLng, pinName);
  }
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
    pinDirectionsBtn.textContent = 'Loading…';
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
      pinDirectionsBtn.textContent = 'Start walk';
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
  navFreeCamera = true;
  navRecentreBtn.classList.remove('hidden');
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
  searchBtn.classList.add('loading');

  try {
    const results = await searchAddressSuggestions(query);

    if (results.length === 0) {
      showError('No places found — try a different search');
      return;
    }

    suggestionsList.innerHTML = '';
    results.forEach(function (result) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="place-icon">${ICONS.place}</span><div class="place-text"><div class="place-name">${escapeHtml(result.name)}</div><div class="place-detail">${escapeHtml(result.detail)}</div></div>`;
      li.addEventListener('click', function () { selectDestination(result); });
      suggestionsList.appendChild(li);
    });
    suggestionsList.classList.remove('hidden');
  } catch {
    showError('Search failed — please try again');
  } finally {
    searchBtn.disabled = false;
    searchBtn.classList.remove('loading');
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
  startGpsBtn.classList.add('loading');
  directionsBtn.disabled = true;

  requestGPS(
    function (loc) {
      startLocation = loc;
      startInput.value = 'My Location';
      startInput.disabled = true;
      startGpsBtn.classList.remove('loading');
      directionsBtn.disabled = false;
    },
    function () {
      startInput.placeholder = 'Enter a start address...';
      startInput.disabled = false;
      startGpsBtn.classList.remove('loading');
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
      updateRouteDist();
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

navRecentreBtn.addEventListener('click', function () {
  navFreeCamera = false;
  navRecentreBtn.classList.add('hidden');
  if (typeof map.setBearing === 'function') map.setBearing(0);
  if (userLocation) {
    map.flyTo([userLocation.lat, userLocation.lng], mapDefaultZoom, { duration: 0.4 });
  } else {
    requestGPS(
      function (loc) {
        userLocation = loc;
        map.flyTo([loc.lat, loc.lng], mapDefaultZoom, { duration: 0.4 });
      },
      function () {
        showError('Location access is blocked — enable it in your browser or device settings');
      }
    );
  }
});

routeBack.addEventListener('click', function () {
  loopRegenBtn.classList.add('hidden');
  loopReverseBtn.classList.add('hidden');
  navRecentreBtn.classList.add('hidden');
  clearRoute();
  clearStartMarker();
  showPhase(currentMode === 'loop' ? 'loop-panel' : 'preview-panel');
});

loopRegenBtn.addEventListener('click', async function () {
  if (navRafId !== null) {
    showNavPrompt();
    return;
  }
  const loc = userLocation;
  if (!loc) {
    showError('Waiting for GPS location — please try again in a moment');
    return;
  }
  loopRegenBtn.disabled = true;
  loadingBox.classList.add('visible');
  try {
    startLocation = loc;
    destination = { lat: loc.lat, lng: loc.lng, name: 'Loop start' };
    const result = await generateLoopRoute(loc.lat, loc.lng, loopLastDistKm, loopToleranceKm());
    notifyLoopVariance(result, loopLastDistKm);
    navRouteDistKm = result.summary.distance / 1000;
    routeTimeEl.textContent = `${Math.round(result.summary.duration / 60)} min`;
    updateRouteDist();
    navRouteCoords = result.coords;
    initSteps(result.steps || []);
    drawRoute(result.coords);
    drawRouteArrows(result.coords);
    loopReverseBtn.classList.remove('hidden');
    navRecentreBtn.classList.add('hidden');
    navFreeCamera = false;
    showPhase('route-panel');
  } catch {
    showError('Could not generate route — please try again');
  }
  loadingBox.classList.remove('visible');
  loopRegenBtn.disabled = false;
});

document.getElementById('nav-prompt-cancel').addEventListener('click', hideNavPrompt);

async function runLoopRegen(distKm) {
  const loc = navLastPos || userLocation;
  if (!loc) { showError('Waiting for GPS location'); return; }
  haltNavigation();
  loopRegenBtn.disabled = true;
  loadingBox.classList.add('visible');
  try {
    startLocation = loc;
    destination = { lat: loc.lat, lng: loc.lng, name: 'Loop start' };
    const result = await generateLoopRoute(loc.lat, loc.lng, distKm, loopToleranceKm());
    notifyLoopVariance(result, distKm);
    navRouteDistKm = result.summary.distance / 1000;
    routeTimeEl.textContent = `${Math.round(result.summary.duration / 60)} min`;
    updateRouteDist();
    navRouteCoords = result.coords;
    initSteps(result.steps || []);
    drawRoute(result.coords);
    drawRouteArrows(result.coords);
    loopReverseBtn.classList.remove('hidden');
    navFreeCamera = false;
    navRecentreBtn.classList.add('hidden');
    showPhase('route-panel');
  } catch {
    showError('Could not generate route — please try again');
    showPhase('loop-panel');
  }
  loadingBox.classList.remove('visible');
  loopRegenBtn.disabled = false;
}

document.getElementById('nav-prompt-adjust').addEventListener('click', function () {
  const remainingKm = Math.max(0.5, loopLastDistKm - navTotalDistKm);
  loopLastDistKm = remainingKm;
  hideNavPrompt();
  runLoopRegen(remainingKm);
});

document.getElementById('nav-prompt-fresh').addEventListener('click', function () {
  hideNavPrompt();
  runLoopRegen(loopLastDistKm);
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  speak('Rerouting');

  try {
    const result = await generateABRoute(navLastPos.lat, navLastPos.lng, destination.lat, destination.lng);
    if (navStartTime) {
      navRouteCoords = result.coords;
      navRouteDistKm = navTotalDistKm + result.summary.distance / 1000;
      drawRoute(result.coords);
      initSteps(result.steps || [], navTotalDistKm);
      updateInstruction();
    }
  } catch (e) {
    if (navStartTime) updateInstruction();
  }

  navRerouting = false;
}

function beginNavigation(opts) {
  const resume = !!(opts && opts.resume);
  document.getElementById('resume-card').classList.add('hidden');
  mapDefaultZoom = 18;
  navFreeCamera = false; // touches before Start must not leave the follow-camera off
  navRecentreBtn.classList.add('hidden');
  showPhase('nav-panel');
  if (typeof map.setBearing === 'function') map.setBearing(0);
  if (userLocation) {
    map.setView([userLocation.lat, userLocation.lng], 18);
  } else {
    map.setZoom(18);
  }

  resetVoice();
  acquireWake();
  if (resume) {
    navStartTime = Date.now() - (opts.elapsedMs || 0);
    navTotalDistKm = opts.totalKm || 0;
  } else {
    navStartTime = Date.now();
    navTotalDistKm = 0;
  }
  navPaused = false;
  navPausedAt = null;
  navPausedTotal = 0;
  navLastPos = null;
  navCurrentSpeedMs = 0;
  navArrived = false;
  hideArrival();
  updateNavDisplay();

  const DEFAULT_WALK_KMH = 5;

  function updateEta() {
    const elapsedSec = navElapsedMs() / 1000;
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
      if (navPaused) {
        // Track position (camera + resume baseline) but freeze the walk
        navLastPos = pos;
        saveWalkState();
        return;
      }
      if (navLastPos) {
        navTotalDistKm += haversineKm(navLastPos.lat, navLastPos.lng, pos.lat, pos.lng);
      }
      navLastPos = pos;
      saveWalkState();

      if (pos.speed !== null && pos.speed >= 0) navCurrentSpeedMs = pos.speed;
      updateNavDisplay();

      advanceStep();
      updateInstruction();

      if (!navArrived && destination) {
        const distToDest = haversineKm(pos.lat, pos.lng, destination.lat, destination.lng);
        if (distToDest < 0.01) {
          navArrived = true;
          instructionPill.classList.add('hidden');
          if (currentMode !== 'loop') showArrival(destination.name);
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

startBtn.addEventListener('click', function () { beginNavigation(); });

// ─── Phase 4: Navigation ──────────────────────────────────────────────────────

function haltNavigation() {
  releaseWake();
  resetVoice();
  clearWalkState();
  setPausedUI(false);
  navPaused = false;
  navPausedAt = null;
  navPausedTotal = 0;
  clearInterval(navTimerInterval);
  navTimerInterval = null;
  navStartTime = null;
  navTotalDistKm = 0;
  navLastPos = null;
  navArrived = false;
  navOffCourseFixes = 0;
  navRerouting = false;
  navSteps = [];
  navCurrentStep = 0;
  navCurrentSpeedMs = 0;
  hideArrival();
  instructionPill.classList.add('hidden');
  stopNavigation(navWatchId);
  navWatchId = null;
}

function doStopNavigation() {
  var walkedKm   = navTotalDistKm;
  var walkedSec  = navStartTime ? navElapsedMs() / 1000 : 0;
  var walkedMode = currentMode;
  haltNavigation();
  if (walkedKm >= 0.05 && typeof window.onWalkCompleted === 'function') {
    window.onWalkCompleted({ distKm: walkedKm, durationSec: walkedSec, mode: walkedMode });
    if (typeof currentUser === 'undefined' || !currentUser) showGuestNudge();
  }
  pinCard.classList.add('hidden');
  pinLocationLabel.classList.add('hidden');
  pinLat = null; pinLng = null; pinName = null;
  navRouteDistKm = 0;
  navRouteCoords = null;
  clearRoute();
  clearDestination();
  clearStartMarker();
  destination = null;
  startLocation = null;
  destInput.value = '';
  hideNavPrompt();
  loopRegenBtn.classList.add('hidden');
  loopReverseBtn.classList.add('hidden');
  navRecentreBtn.classList.add('hidden');
  mapDefaultZoom = 15;
  map.setZoom(15);
  showPhase(currentMode === 'loop' ? 'loop-panel' : 'search-panel');
}

stopBtn.addEventListener('click', doStopNavigation);

// ─── Pause / Resume ───────────────────────────────────────────────────────────

const pauseBtn = document.getElementById('pause-btn');

function setPausedUI(paused) {
  pauseBtn.classList.toggle('paused', paused);
  pauseBtn.setAttribute('aria-label', paused ? 'Resume walk' : 'Pause walk');
  pauseBtn.title = paused ? 'Resume' : 'Pause';
  pauseBtn.querySelector('.pause-icon').classList.toggle('hidden', paused);
  pauseBtn.querySelector('.play-icon').classList.toggle('hidden', !paused);
  if (paused) {
    instructionArrowEl.textContent = '⏸';
    instructionTextEl.innerHTML = 'Paused';
    instructionDistEl.textContent = '';
    instructionPill.classList.remove('hidden');
  }
}

function polylineKm(coords) {
  let km = 0;
  for (let i = 1; i < coords.length; i++) {
    km += haversineKm(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  }
  return km;
}

// After a paused wander, route the walker from where they now stand back
// onto the remaining loop; A→B walks simply re-route to the destination.
async function rejoinRouteAfterPause() {
  const pos = navLastPos || userLocation;
  if (!pos || !navRouteCoords || navRouteCoords.length < 2) return;
  if (distToRouteM(pos.lat, pos.lng, navRouteCoords) <= 30) return;

  if (currentMode !== 'loop') {
    triggerReroute();
    return;
  }

  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < navRouteCoords.length; i++) {
    const d = haversineKm(pos.lat, pos.lng, navRouteCoords[i][0], navRouteCoords[i][1]);
    if (d < bestD) { bestD = d; bestI = i; }
  }

  try {
    const result = await generateABRoute(
      pos.lat, pos.lng,
      navRouteCoords[bestI][0], navRouteCoords[bestI][1]
    );
    if (!navStartTime) return; // walk was stopped while we were routing
    const remaining = navRouteCoords.slice(bestI);
    const remainingKm = polylineKm(remaining);
    navRouteCoords = result.coords.concat(remaining);
    navRouteDistKm = navTotalDistKm + result.summary.distance / 1000 + remainingKm;
    drawRoute(navRouteCoords);
    drawRouteArrows(navRouteCoords);
    const rawSteps = (result.steps || []).concat([
      { instruction: 'Continue along your loop', type: 11, distance: remainingKm * 1000 },
    ]);
    initSteps(rawSteps, navTotalDistKm);
    updateNavDisplay();
    updateInstruction();
  } catch (e) {
    /* keep the old route — off-course rerouting picks it up from here */
  }
}

pauseBtn.addEventListener('click', function () {
  if (!navStartTime) return;
  navPaused = !navPaused;
  if (navPaused) {
    navPausedAt = Date.now();
    releaseWake();
    setPausedUI(true);
    speak('Walk paused');
  } else {
    navPausedTotal += Date.now() - navPausedAt;
    navPausedAt = null;
    acquireWake();
    setPausedUI(false);
    updateNavDisplay();
    if (navSteps.length) {
      updateInstruction();
    } else {
      instructionPill.classList.add('hidden');
    }
    speak('Resuming');
    rejoinRouteAfterPause();
  }
});

// ─── Keyboard tracking — keeps the dock above the keyboard ───────────────────

function adjustSearchPanel() {
  const vv = window.visualViewport;
  const offsetFromBottom = window.innerHeight - (vv.offsetTop + vv.height);
  if (offsetFromBottom <= 0) {
    dockEl.style.bottom = '';
    return;
  }
  const bottomPad = document.activeElement === destInput ? 10 : 64;
  dockEl.style.bottom = (offsetFromBottom + bottomPad) + 'px';
}

destInput.addEventListener('focus', function () {
  modeBar.classList.add('hidden');
  dockEl.style.bottom = '10px';
});

destInput.addEventListener('blur', function () {
  modeBar.classList.remove('hidden');
  dockEl.style.bottom = '';
});

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', adjustSearchPanel);
  window.visualViewport.addEventListener('scroll', adjustSearchPanel);
}

// ─── Loop Reverse ─────────────────────────────────────────────────────────────

var loopReverseBtn = document.getElementById('loop-reverse-btn');

loopReverseBtn.addEventListener('click', function () {
  if (!navRouteCoords || navRouteCoords.length < 2) return;
  navRouteCoords = navRouteCoords.slice().reverse();
  drawRoute(navRouteCoords);
  drawRouteArrows(navRouteCoords);
});

// ─── Route Save ───────────────────────────────────────────────────────────────

document.getElementById('route-save-btn').addEventListener('click', function () {
  if (typeof window.onSaveRouteRequest === 'function') {
    window.onSaveRouteRequest({
      mode:          currentMode,
      coords:        navRouteCoords,
      distKm:        navRouteDistKm,
      name:          currentMode === 'loop' ? 'Loop route' : (destination && destination.name || 'Route'),
      loopMode:      loopMode,
      loopValue:     loopValue,
      loopUseMetric: loopUseMetric,
      destLat:       destination && destination.lat,
      destLng:       destination && destination.lng,
      startLat:      startLocation && startLocation.lat,
      startLng:      startLocation && startLocation.lng,
    });
  }
});

// ─── Load Saved Routes ────────────────────────────────────────────────────────

window.onLoadSavedABRoute = function (route) {
  currentMode = 'ab';
  abTab.classList.add('active');
  loopTab.classList.remove('active');
  loopRegenBtn.classList.add('hidden');
  loopReverseBtn.classList.add('hidden');
  clearRoute();
  clearDestination();
  clearStartMarker();
  destination = { lat: route.dest_lat, lng: route.dest_lng, name: route.name };
  placeDestinationPin(route.dest_lat, route.dest_lng);
  map.flyTo([route.dest_lat, route.dest_lng], 15, { duration: 1.5 });
  previewDest.textContent = route.name;
  showPhase('preview-panel');
  acquireStartLocation();
};

window.onLoadSavedLoopRoute = function (route) {
  currentMode = 'loop';
  loopTab.classList.add('active');
  abTab.classList.remove('active');
  loopMode = route.loop_mode || 'time';
  loopValue = route.loop_value || 30;
  loopUseMetric = route.loop_use_metric !== false;
  clearRoute();
  clearDestination();
  clearStartMarker();
  clearPinMarker();
  pinCard.classList.add('hidden');
  pinLocationLabel.classList.add('hidden');
  pinLat = null; pinLng = null; pinName = null;
  destination = null;
  startLocation = null;
  loopTimeBtn.classList.toggle('active', loopMode === 'time');
  loopDistBtn.classList.toggle('active', loopMode === 'distance');
  loopStepRow.classList.remove('hidden');
  updateLoopStepValue();
  updateLoopGenerateBtn();
  showPhase('loop-panel');
  loopGenerateBtn.click();
};

// ─── Onboarding ───────────────────────────────────────────────────────────────

(function () {
  var backdrop = document.getElementById('onboarding-backdrop');
  var card     = document.getElementById('onboarding-card');

  if (!localStorage.getItem('strideGuideSeen')) {
    backdrop.classList.add('visible');
    card.classList.add('visible');
  }

  document.getElementById('onboarding-close').addEventListener('click', function () {
    backdrop.classList.remove('visible');
    card.classList.remove('visible');
  });

  document.getElementById('onboarding-got-it').addEventListener('click', function () {
    localStorage.setItem('strideGuideSeen', '1');
    backdrop.classList.remove('visible');
    card.classList.remove('visible');
  });
}());

// ─── Interrupted-walk persistence ─────────────────────────────────────────────
// Walk state is snapshotted while navigating so a killed app can offer
// "Resume your walk?" on reopen (within 6 hours).

const WALK_KEY = 'sgActiveWalk';
let walkSaveLast = 0;

function saveWalkState() {
  if (!navStartTime) return;
  const now = Date.now();
  if (now - walkSaveLast < 5000) return;
  walkSaveLast = now;
  try {
    localStorage.setItem(WALK_KEY, JSON.stringify({
      savedAt: now,
      elapsedMs: navElapsedMs(),
      totalKm: navTotalDistKm,
      routeKm: navRouteDistKm,
      coords: navRouteCoords,
      steps: navSteps,
      step: navCurrentStep,
      mode: currentMode,
      dest: destination,
      loopLastKm: loopLastDistKm,
    }));
  } catch (e) {}
}

function clearWalkState() {
  walkSaveLast = 0;
  try { localStorage.removeItem(WALK_KEY); } catch (e) {}
}

(function () {
  let raw = null;
  try { raw = localStorage.getItem(WALK_KEY); } catch (e) {}
  if (!raw) return;

  let s = null;
  try { s = JSON.parse(raw); } catch (e) {}
  if (!s || !s.coords || s.coords.length < 2 ||
      Date.now() - s.savedAt > 6 * 3600 * 1000) {
    clearWalkState();
    return;
  }

  const card = document.getElementById('resume-card');
  const label = s.totalKm >= 0.01 ? `${s.totalKm.toFixed(2)} km walked` : 'just started';
  document.getElementById('resume-card-text').textContent = `Resume your walk? (${label})`;
  card.classList.remove('hidden');

  document.getElementById('resume-no').addEventListener('click', function () {
    card.classList.add('hidden');
    clearWalkState();
  });

  document.getElementById('resume-yes').addEventListener('click', function () {
    card.classList.add('hidden');
    if (navStartTime) return; // a new walk already started — don't clobber it
    currentMode = s.mode === 'loop' ? 'loop' : 'ab';
    loopTab.classList.toggle('active', currentMode === 'loop');
    abTab.classList.toggle('active', currentMode === 'ab');
    destination = s.dest || null;
    navRouteCoords = s.coords;
    navRouteDistKm = s.routeKm || polylineKm(s.coords);
    navSteps = s.steps || [];
    navCurrentStep = Math.min(s.step || 0, Math.max(0, navSteps.length - 1));
    if (s.loopLastKm) loopLastDistKm = s.loopLastKm;
    drawRoute(navRouteCoords);
    if (currentMode === 'loop') {
      drawRouteArrows(navRouteCoords);
      loopRegenBtn.classList.remove('hidden');
      loopReverseBtn.classList.remove('hidden');
    }
    beginNavigation({ resume: true, elapsedMs: s.elapsedMs || 0, totalKm: s.totalKm || 0 });
  });
}());

// ─── Screen wake lock (during navigation) ─────────────────────────────────────
// Preference: how long the screen stays awake once a walk starts.

const WAKE_KEY = 'sgWake';
let wakeLock = null;
let wakeTimer = null;

function wakePref() {
  try { return localStorage.getItem(WAKE_KEY) || 'always'; } catch (e) { return 'always'; }
}

async function acquireWake() {
  const pref = wakePref();
  if (pref === 'off' || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) {
    wakeLock = null;
    return;
  }
  clearTimeout(wakeTimer);
  wakeTimer = null;
  if (pref !== 'always') {
    wakeTimer = setTimeout(releaseWake, parseInt(pref, 10) * 60000);
  }
}

function releaseWake() {
  clearTimeout(wakeTimer);
  wakeTimer = null;
  if (wakeLock) {
    try { wakeLock.release(); } catch (e) {}
    wakeLock = null;
  }
}

// Wake locks auto-release when the tab is backgrounded; re-acquire on return.
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible' && navStartTime) acquireWake();
});

(function () {
  var seg = document.getElementById('wake-seg');
  if (!seg) return;

  function render(pref) {
    Array.prototype.forEach.call(seg.children, function (b) {
      b.classList.toggle('on', b.dataset.wake === pref);
    });
  }

  seg.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-wake]');
    if (!btn) return;
    try { localStorage.setItem(WAKE_KEY, btn.dataset.wake); } catch (err) {}
    render(btn.dataset.wake);
    if (navStartTime) {
      releaseWake();
      acquireWake();
    }
  });

  render(wakePref());
}());

// ─── Voice guidance ───────────────────────────────────────────────────────────

const VOICE_KEY = 'sgVoice';
let voiceLastStep = -1;
let voiceNearStep = -1;

function voiceOn() {
  try { return localStorage.getItem(VOICE_KEY) !== 'off'; } catch (e) { return true; }
}

function speak(text) {
  if (!voiceOn() || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

function spokenDist(distKm) {
  if (useMetric) {
    return distKm < 0.95
      ? `${Math.round(distKm * 1000 / 10) * 10} metres`
      : `${distKm.toFixed(1)} kilometres`;
  }
  const mi = distKm * 0.621371;
  return mi < 0.19
    ? `${Math.round(distKm * 3280.84 / 50) * 50} feet`
    : `${mi.toFixed(1)} miles`;
}

function maybeSpeakStep(stepIdx, step, distKm) {
  if (stepIdx !== voiceLastStep) {
    voiceLastStep = stepIdx;
    voiceNearStep = -1;
    speak(distKm > 0.09 ? `In ${spokenDist(distKm)}, ${step.instruction}` : step.instruction);
  } else if (distKm < 0.08 && voiceNearStep !== stepIdx) {
    voiceNearStep = stepIdx;
    speak(step.instruction);
  }
}

function resetVoice() {
  voiceLastStep = -1;
  voiceNearStep = -1;
  if ('speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }
}

(function () {
  var btn = document.getElementById('voice-btn');
  if (!btn) return;

  function render(on) {
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.querySelector('.voice-waves').classList.toggle('hidden', !on);
    btn.querySelector('.voice-slash').classList.toggle('hidden', on);
  }

  btn.addEventListener('click', function () {
    var on = !voiceOn();
    try { localStorage.setItem(VOICE_KEY, on ? 'on' : 'off'); } catch (err) {}
    render(on);
    if (!on) resetVoice();
  });

  render(voiceOn());
}());

// ─── Guest walk-complete nudge ────────────────────────────────────────────────

let guestNudgeTimer = null;

function hideGuestNudge() {
  document.getElementById('guest-nudge').classList.add('hidden');
  clearTimeout(guestNudgeTimer);
  guestNudgeTimer = null;
}

function showGuestNudge() {
  document.getElementById('guest-nudge').classList.remove('hidden');
  clearTimeout(guestNudgeTimer);
  guestNudgeTimer = setTimeout(hideGuestNudge, 10000);
}

document.getElementById('guest-nudge-close').addEventListener('click', hideGuestNudge);

document.getElementById('guest-nudge-btn').addEventListener('click', function () {
  hideGuestNudge();
  if (typeof openAccountPanel === 'function') {
    openAccountPanel();
    showAuthView('signin');
  }
});

// ─── Add-to-Home-Screen suggestion ────────────────────────────────────────────
// Shown on startup when the app is running in a browser tab rather than
// installed. Chrome/Android exposes a real install prompt; iOS only allows
// instructions. Dismissal snoozes the card for 14 days; never shown on the
// first run (the onboarding card owns that moment).

(function () {
  var KEY = 'sgA2hsDismissed';
  var card = document.getElementById('a2hs-card');
  if (!card) return;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  var dismissedAt = 0;
  try { dismissedAt = parseInt(localStorage.getItem(KEY) || '0', 10) || 0; } catch (e) {}

  if (isStandalone()) return;
  if (dismissedAt && Date.now() - dismissedAt < 14 * 24 * 3600 * 1000) return;

  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
  });

  function dismiss() {
    card.classList.add('hidden');
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
  }

  document.getElementById('a2hs-close').addEventListener('click', dismiss);

  document.getElementById('a2hs-btn').addEventListener('click', function () {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt = null;
    }
    dismiss();
  });

  function showCard() {
    var text = document.getElementById('a2hs-text');
    var btn = document.getElementById('a2hs-btn');
    var ua = navigator.userAgent;
    var isIOS = /iphone|ipad|ipod/i.test(ua);
    var iosOtherBrowser = isIOS && /crios|fxios|edgios/i.test(ua);

    if (iosOtherBrowser) {
      text.textContent = 'For the full app: open Stride Guide in Safari, tap Share, then "Add to Home Screen".';
      btn.classList.add('hidden');
    } else if (isIOS) {
      text.textContent = 'Add Stride Guide to your Home Screen: tap Share, then "Add to Home Screen".';
      btn.classList.add('hidden');
    } else if (deferredPrompt) {
      text.textContent = 'Install Stride Guide for the full app experience.';
      btn.classList.remove('hidden');
    } else {
      text.textContent = 'Add Stride Guide to your Home Screen from your browser menu for the full app experience.';
      btn.classList.add('hidden');
    }
    card.classList.remove('hidden');
  }

  // Other cards (onboarding, resume) get the moment first; this card
  // appears 1s after they close. Mid-walk it waits for the walk to end.
  function blockingUiVisible() {
    var onboarding = document.getElementById('onboarding-card');
    var resume = document.getElementById('resume-card');
    return (onboarding && onboarding.classList.contains('visible')) ||
           (resume && !resume.classList.contains('hidden')) ||
           !!navStartTime;
  }

  var everBlocked = false;
  var clearSince = null;
  var poll = setInterval(function () {
    if (isStandalone()) { clearInterval(poll); return; }
    if (blockingUiVisible()) {
      everBlocked = true;
      clearSince = null;
      return;
    }
    if (clearSince === null) clearSince = Date.now();
    var delay = everBlocked ? 1000 : 2000;
    if (Date.now() - clearSince >= delay) {
      clearInterval(poll);
      showCard();
    }
  }, 300);
}());

// ─── Offline awareness + app-shell service worker ─────────────────────────────

window.addEventListener('offline', function () {
  showError("You're offline — search and routing won't work until you reconnect");
});

window.addEventListener('online', function () {
  showError('Back online');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}

// ─── Appearance (theme) ───────────────────────────────────────────────────────
// Defaults to the system setting; Light/Dark override it and persist.

(function () {
  var seg = document.getElementById('theme-seg');
  if (!seg) return;
  var KEY = 'sgTheme';

  function apply(pref) {
    if (pref === 'light' || pref === 'dark') {
      document.documentElement.setAttribute('data-theme', pref);
    } else {
      pref = 'system';
      document.documentElement.removeAttribute('data-theme');
    }
    Array.prototype.forEach.call(seg.children, function (b) {
      b.classList.toggle('on', b.dataset.themeOpt === pref);
    });
    if (typeof updateStreetLayer === 'function') updateStreetLayer();
  }

  seg.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-theme-opt]');
    if (!btn) return;
    var pref = btn.dataset.themeOpt;
    try {
      if (pref === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, pref);
    } catch (err) {}
    apply(pref);
  });

  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (err) {}
  apply(stored);
}());
