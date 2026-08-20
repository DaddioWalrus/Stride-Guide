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
let navAlongM = 0;          // metres along navRouteCoords the walker has reached
let navLeftStart = false; // has the walker moved off the start point yet?
let navSteps = [];
let navCurrentStep = 0;
let navCurrentSpeedMs = 0;
let useMetric = true;
let navRouteCoords = null;
let navPlannedRoute = null; // route as planned at Start — what mid-walk saving files
let navOffCourseFixes = 0;
let navLastRerouteTime = 0;
let navRerouting = false;
let pinUseMetric = true;
let pinRouteResult = null;
let pinRoutePromise = null;
let loopLastDistKm = 0;
let navPaddedTargetKm = 0; // >0 when the walk was stretched past the direct route
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
const navSaveBtn = document.getElementById('nav-save-btn');

const navTimeEl = document.getElementById('nav-time');
const navDistEl = document.getElementById('nav-dist');
const navUnitEl = document.getElementById('nav-unit');
const navCenterEl = document.getElementById('nav-center');
const stopBtn = document.getElementById('stop-btn');

const navPromptValue = document.getElementById('nav-prompt-value');
const navPromptUnit = document.getElementById('nav-prompt-unit');
const navPromptCenter = document.getElementById('nav-prompt-center');
const navPromptDown = document.getElementById('nav-prompt-down');
const navPromptUp = document.getElementById('nav-prompt-up');
const navPromptGo = document.getElementById('nav-prompt-go');

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
  // Opens on what is actually left of the planned walk, floored at the walk home.
  navPromptKm = Math.max(navPromptFloorKm(), loopLastDistKm - navTotalDistKm);
  renderNavPrompt();
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
  loopRegenBtn.classList.add('hidden');  // the A→B route it belonged to is gone
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

// If the streets here genuinely can't produce a route of the requested size,
// say so rather than silently presenting the near-miss as a match.
function notifyLoopVariance(result, targetKm, lead) {
  if (result.padRefused) { notifyPadRefused(); return; }
  if (result.retraceWarn) { notifyBacktrack(result); return; }
  const actualKm = result.summary.distance / 1000;
  if (Math.abs(actualKm - targetKm) > loopToleranceKm() + 0.01) {
    let label;
    if (loopMode === 'time') {
      label = `${Math.round(result.summary.duration / 60)} min`;
    } else {
      label = loopUseMetric
        ? `${actualKm.toFixed(1)} km`
        : `${(actualKm * 0.621371).toFixed(1)} mi`;
    }
    showError(`${lead || 'Closest loop the streets here allow'}: ${label}`);
    return;
  }
  notifyBacktrack(result);
}

loopGenerateBtn.addEventListener('click', async function () {
  if (!loopMode) return;

  const distanceKm = loopMode === 'time'
    ? (loopValue / 60) * 5
    : (loopUseMetric ? loopValue : loopValue / 0.621371);

  loopLastDistKm = distanceKm;
  navPaddedTargetKm = 0;
  loopGenerateBtn.disabled = true;
  loadingBox.classList.add('visible');

  // A loop starts where the walker is standing now, not where they opened the app.
  const loc = await getFreshLocation();
  if (!loc) {
    loadingBox.classList.remove('visible');
    loopGenerateBtn.disabled = false;
    showError('Waiting for GPS location — please try again in a moment');
    return;
  }

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
    showRegenBtn();
    loopReverseBtn.classList.remove('hidden');
    showPhase('route-panel');
  } catch (e) {
    showError(routeFailure(e, 'Could not generate route — please try again'));
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

// ─── Walk length on A→B routes ────────────────────────────────────────────────
// The loop panel's Time/Distance stepper, applied to a destination walk: leave
// it alone for the shortest way there, or ask for a longer walk and the route
// takes the scenic way round. Both destination flows — map pin and search —
// drive one shared setting through two identical controls.

let abLenOpen = false;
let abLenMode = null;    // null → plain shortest route
let abLenValue = 0;      // minutes, or km/mi per abLenMetric
let abLenMetric = true;
let abLenDirectKm = 0;   // shortest route there — the floor the stepper can't go under
let abVariant = 0;       // bumped by "New route" to send the builders down a different line
const abLenControls = [];

function abLenTargetKm() {
  if (!abLenMode) return 0;
  if (abLenMode === 'time') return (abLenValue / 60) * 5;
  return abLenMetric ? abLenValue : abLenValue / 0.621371;
}

// You can't ask for a shorter walk than the destination actually is.
function abLenFloorValue() {
  if (abLenMode === 'time') return Math.max(5, Math.ceil(abLenDirectKm / 5 * 60 / 5) * 5);
  const km = Math.max(0.5, Math.ceil(abLenDirectKm * 2) / 2);
  return abLenMetric ? km : Math.max(0.5, Math.ceil(km * 0.621371 * 2) / 2);
}

function abLenLabel() {
  if (!abLenMode) return 'Direct route';
  if (abLenMode === 'time') return `${abLenValue} min`;
  return abLenMetric ? `${abLenValue} km` : `${abLenValue} mi`;
}

function renderAbLen() {
  abLenControls.forEach(function (c) {
    c.block.classList.toggle('hidden', !abLenOpen);
    c.timeBtn.classList.toggle('active', abLenMode === 'time');
    c.distBtn.classList.toggle('active', abLenMode === 'distance');
    c.step.classList.toggle('hidden', !abLenMode);
    c.hint.textContent = abLenLabel();
    if (abLenMode === 'time') {
      c.value.textContent = `${abLenValue} min`;
      c.unit.classList.add('hidden');
    } else if (abLenMode === 'distance') {
      c.value.textContent = abLenMetric ? `${abLenValue} km` : `${abLenValue} mi`;
      renderUnitSeg(c.unit, abLenMetric);
      c.unit.classList.remove('hidden');
    }
  });
}

function setAbLenMode(mode) {
  abLenMode = abLenMode === mode ? null : mode;
  if (abLenMode) {
    // Open one step past the direct route — picking a mode means "make it longer".
    abLenValue = abLenMode === 'time' ? abLenFloorValue() + 5 : abLenFloorValue() + 0.5;
  }
  renderAbLen();
}

function setAbLenMetric(metric) {
  if (abLenMetric === metric || abLenMode !== 'distance') return;
  abLenValue = metric
    ? Math.round(abLenValue / 0.621371 * 2) / 2
    : Math.round(abLenValue * 0.621371 * 2) / 2;
  abLenMetric = metric;
  saveUnits(metric);
  abLenValue = Math.max(abLenValue, abLenFloorValue());
  renderAbLen();
}

function stepAbLen(dir) {
  const floor = abLenFloorValue();
  if (abLenMode === 'time') {
    abLenValue = Math.max(floor, abLenValue + dir * 5);
  } else {
    abLenValue = Math.max(floor, Math.round((abLenValue + dir * 0.5) * 10) / 10);
  }
  renderAbLen();
}

// A new destination starts from scratch: shortest route, control collapsed.
function resetAbLen(directKm) {
  abLenOpen = false;
  abLenMode = null;
  abLenMetric = unitsMetric();
  abLenDirectKm = directKm || 0;
  abVariant = 0;   // a new destination gets the best route, not the next one along
  renderAbLen();
}

// The measured direct route replaces the estimate the floor was seeded from.
function setAbLenDirect(km) {
  abLenDirectKm = km;
  if (abLenMode) abLenValue = Math.max(abLenValue, abLenFloorValue());
  renderAbLen();
}

function bindAbLenControl(prefix, onChange) {
  const c = {
    block:   document.getElementById(prefix + '-len-block'),
    hint:    document.getElementById(prefix + '-len-hint'),
    timeBtn: document.getElementById(prefix + '-len-time'),
    distBtn: document.getElementById(prefix + '-len-dist'),
    step:    document.getElementById(prefix + '-len-step'),
    value:   document.getElementById(prefix + '-len-value'),
    unit:    document.getElementById(prefix + '-len-unit'),
  };

  document.getElementById(prefix + '-len-toggle').addEventListener('click', function () {
    abLenOpen = !abLenOpen;
    renderAbLen();
  });
  c.timeBtn.addEventListener('click', function () { setAbLenMode('time'); onChange(); });
  c.distBtn.addEventListener('click', function () { setAbLenMode('distance'); onChange(); });
  document.getElementById(prefix + '-len-down').addEventListener('click', function () {
    stepAbLen(-1); onChange();
  });
  document.getElementById(prefix + '-len-up').addEventListener('click', function () {
    stepAbLen(1); onChange();
  });
  document.getElementById(prefix + '-len-center').addEventListener('click', function () {
    setAbLenMetric(!abLenMetric); onChange();
  });
  bindUnitSeg(c.unit, function (metric) { setAbLenMetric(metric); onChange(); });

  abLenControls.push(c);
}

// Two ways a walk can come back treading itself, and they read differently.
//
// `retraceWarn` means nowhere here has a clean loop of that size and this is the
// least-doubled one going — worth saying, because regenerating or changing the
// length is what fixes it. Otherwise it is the geography's own: a destination up
// a road with one way in and out, which no route can dodge.
//
// The figure quoted is the longest unbroken stretch, since that is the bit a
// walker actually walks twice, not a total swept up from every junction.
function notifyBacktrack(result) {
  const s = result.shape;
  if (!s) return;
  // Whichever pass is in breach owns the figure: the exact-retread stretch, or
  // the longer run of walking alongside itself the loose pass picks up.
  const run = Math.max(s.run || 0, s.wideRun >= 60 ? s.wideRun : 0);
  if (run < 10) return;
  const m = Math.round(run / 5) * 5;
  showError(result.retraceWarn
    ? `Best loop here repeats about ${m} m — try New loop or another length`
    : `There's only one way in and out here — about ${m} m is walked twice`);
}

// A stretched walk is refused outright when every long way round would double
// the walker back. That is not a length that came up short, so it doesn't get
// reported as one.
function notifyPadRefused() {
  showError('No longer way round here without doubling back — showing the direct walk');
}

// A place with no clean loop now gets the least-doubled one and a warning, so
// this only fires when no route came back at all. Kept as a safety net, and
// worded for the one thing left that a walker can act on.
function routeFailure(e, fallback) {
  return e && e.message === 'no-clean-route'
    ? 'No loop found here at that length — try a different time or distance'
    : fallback;
}

// Deviation from a requested walk length, in the units the stepper is showing.
function notifyLengthVariance(result, targetKm, lead) {
  if (result.padRefused) { notifyPadRefused(); return; }
  if (result.retraceWarn) { notifyBacktrack(result); return; }
  const actualKm = result.summary.distance / 1000;
  if (Math.abs(actualKm - targetKm) > 0.25) {
    let label;
    if (abLenMode === 'time') {
      label = `${Math.round(result.summary.duration / 60)} min`;
    } else {
      label = abLenMetric
        ? `${actualKm.toFixed(1)} km`
        : `${(actualKm * 0.621371).toFixed(1)} mi`;
    }
    showError(`${lead}: ${label}`);
    return;
  }
  notifyBacktrack(result);
}

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

let pinRouteFrom = null;  // the fix the drawn pin route was built from
let pinRouteSeq = 0;      // guards against a slow request painting over a newer one
let pinLenTimer = null;

// Draws the walk to the pin from `loc` — the direct route, or a longer one when
// the walk-length stepper asks for it.
function buildPinRoute(loc) {
  if (pinLat === null || !loc) return Promise.resolve();

  const seq = ++pinRouteSeq;
  const toLat = pinLat, toLng = pinLng;
  const targetKm = abLenTargetKm();

  pinRoutePromise = (targetKm > 0
    ? generatePaddedRoute(loc.lat, loc.lng, toLat, toLng, targetKm, 0.2)
    : generateABRoute(loc.lat, loc.lng, toLat, toLng))
    .then(function (result) {
      if (seq !== pinRouteSeq) return;                    // superseded
      if (pinCard.classList.contains('hidden')) return;   // card closed meanwhile
      pinRouteResult = result;
      pinRouteFrom = { lat: loc.lat, lng: loc.lng };
      const distKm = result.summary.distance / 1000;
      navRouteDistKm = distKm;
      navRouteCoords = result.coords;
      navPaddedTargetKm = targetKm;
      initSteps(result.steps || []);
      drawRoute(result.coords);
      updatePinDist(distKm);
      pinTimeEl.textContent = `${Math.round(result.summary.duration / 60)} min`;
      if (targetKm > 0) {
        notifyLengthVariance(result, targetKm, 'Longest walk the streets here allow');
      } else {
        setAbLenDirect(distKm);
      }
    })
    .catch(function () { /* silent — will retry on Start walk */ });

  return pinRoutePromise;
}

function pinLenChanged() {
  if (pinLat === null) return;
  clearTimeout(pinLenTimer);
  pinTimeEl.textContent = '…';
  pinLenTimer = setTimeout(function () { buildPinRoute(userLocation); }, 800);
}

bindAbLenControl('pin', pinLenChanged);

window.onPinDropped = async function (lat, lng) {
  pinLat = lat;
  pinLng = lng;
  pinName = null;
  pinUseMetric = unitsMetric();
  pinRouteResult = null;
  pinRoutePromise = null;
  pinRouteFrom = null;
  clearTimeout(pinLenTimer);
  resetAbLen(userLocation ? haversineKm(userLocation.lat, userLocation.lng, lat, lng) * 1.25 : 0);

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

  // Draw from the last known fix straight away, then take a current one — if the
  // walker has moved since the app opened, redraw from where they actually are.
  const cached = userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null;
  if (cached) buildPinRoute(cached);
  getFreshLocation().then(function (loc) {
    if (!loc || pinLat !== lat || pinLng !== lng) return;
    if (cached && haversineKm(cached.lat, cached.lng, loc.lat, loc.lng) <= 0.03) return;
    buildPinRoute(loc);
  });

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
  if (pinLat === null) return;

  const toLat = pinLat;
  const toLng = pinLng;
  const toName = pinName || 'your destination';

  pinDirectionsBtn.disabled = true;
  pinDirectionsBtn.textContent = 'Loading…';
  clearTimeout(pinLenTimer);

  // The walk starts from where the walker is standing now.
  const loc = await getFreshLocation();
  if (!loc) {
    showError('Enable GPS to get directions');
    pinDirectionsBtn.disabled = false;
    pinDirectionsBtn.textContent = 'Start walk';
    return;
  }

  startLocation = loc;
  destination = { lat: toLat, lng: toLng, name: toName };

  // Only ever set off on a route built from the fix we are standing on.
  const routeIsCurrent = function () {
    return !!pinRouteResult && !!pinRouteFrom &&
      haversineKm(pinRouteFrom.lat, pinRouteFrom.lng, loc.lat, loc.lng) <= 0.03;
  };

  if (!routeIsCurrent()) {
    await buildPinRoute(loc);
  } else if (pinRoutePromise) {
    await pinRoutePromise;
  }

  if (!routeIsCurrent()) {
    showError('Could not find route — try again');
    pinDirectionsBtn.disabled = false;
    pinDirectionsBtn.textContent = 'Start walk';
    return;
  }

  pinDirectionsBtn.disabled = false;
  pinDirectionsBtn.textContent = 'Start walk';

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
    if (typeof sizeSearchList === 'function') sizeSearchList();
  } catch {
    showError('Search failed — please try again');
  } finally {
    searchBtn.disabled = false;
    searchBtn.classList.remove('loading');
  }
}

bindAbLenControl('preview', function () { /* route is built on Get directions */ });

function selectDestination(result) {
  destination = { lat: result.lat, lng: result.lng, name: result.name };
  suggestionsList.classList.add('hidden');
  placeDestinationPin(result.lat, result.lng);
  previewDest.textContent = result.name;
  showPhase('preview-panel');
  // Deferred a frame so the pin is framed against the preview panel that just
  // went up, not against the panel it replaced.
  requestAnimationFrame(function () {
    centreInView(result.lat, result.lng, 15, { duration: 1.5 });
  });
  acquireStartLocation();
  // Nothing is routed yet, so seed the stepper's floor from the crow-flight
  // distance with a typical street-network allowance; the real route corrects it.
  resetAbLen(userLocation
    ? haversineKm(userLocation.lat, userLocation.lng, result.lat, result.lng) * 1.25
    : 0);
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

  const targetKm = abLenTargetKm();
  const routing = targetKm > 0
    ? generatePaddedRoute(startLocation.lat, startLocation.lng, destination.lat, destination.lng, targetKm, 0.2)
    : generateABRoute(startLocation.lat, startLocation.lng, destination.lat, destination.lng);

  routing
    .then(function (result) {
      navRouteDistKm = result.summary.distance / 1000;
      navPaddedTargetKm = targetKm;
      const mins = Math.round(result.summary.duration / 60);
      routeTimeEl.textContent = `${mins} min`;
      updateRouteDist();
      navRouteCoords = result.coords;
      initSteps(result.steps || []);
      drawRoute(result.coords);
      showRegenBtn();
      showPhase('route-panel');
      showRouteDest(destination.name);
      if (targetKm > 0) {
        notifyLengthVariance(result, targetKm, 'Longest walk the streets here allow');
      } else {
        setAbLenDirect(navRouteDistKm);
      }
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

  // Planning with a route on screen: re-frame the route, not the walker
  if (navRafId === null && typeof currentRoute !== 'undefined' && currentRoute) {
    fitRouteToView();
    return;
  }

  if (userLocation) {
    centreInView(userLocation.lat, userLocation.lng, mapDefaultZoom);
  } else {
    requestGPS(
      function (loc) {
        userLocation = loc;
        centreInView(loc.lat, loc.lng, mapDefaultZoom);
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

// The regenerate button serves both modes from one place in the dock: a fresh
// loop, or a different way to the same destination. Only the wording changes.
function showRegenBtn() {
  loopRegenBtn.textContent = currentMode === 'loop' ? 'New loop' : 'New route';
  loopRegenBtn.classList.remove('hidden');
}

// Another way to the same destination, at the same length. The start stands —
// it may be a searched address rather than where the walker is — and only the
// line between the two changes.
async function regenerateAbRoute() {
  if (!destination || !startLocation) {
    showError('Pick a destination first');
    return;
  }

  loopRegenBtn.disabled = true;
  loadingBox.classList.add('visible');
  abVariant++;

  const targetKm = abLenTargetKm();
  try {
    const result = targetKm > 0
      ? await generatePaddedRoute(
          startLocation.lat, startLocation.lng,
          destination.lat, destination.lng, targetKm, 0.2, abVariant)
      : await generateABRoute(
          startLocation.lat, startLocation.lng,
          destination.lat, destination.lng, abVariant);

    navRouteDistKm = result.summary.distance / 1000;
    navPaddedTargetKm = targetKm;
    routeTimeEl.textContent = `${Math.round(result.summary.duration / 60)} min`;
    updateRouteDist();
    navRouteCoords = result.coords;
    initSteps(result.steps || []);
    drawRoute(result.coords);
    navRecentreBtn.classList.add('hidden');
    navFreeCamera = false;
    showPhase('route-panel');
    showRouteDest(destination.name);
    if (targetKm > 0) {
      notifyLengthVariance(result, targetKm, 'Longest walk the streets here allow');
    } else {
      setAbLenDirect(navRouteDistKm);
    }
  } catch (e) {
    showError(routeFailure(e, 'Could not generate route — please try again'));
  }

  loadingBox.classList.remove('visible');
  loopRegenBtn.disabled = false;
}

loopRegenBtn.addEventListener('click', async function () {
  if (currentMode === 'ab') {
    await regenerateAbRoute();
    return;
  }
  if (navRafId !== null) {
    showNavPrompt();
    return;
  }
  loopRegenBtn.disabled = true;
  loadingBox.classList.add('visible');
  const loc = await getFreshLocation();
  if (!loc) {
    loadingBox.classList.remove('visible');
    loopRegenBtn.disabled = false;
    showError('Waiting for GPS location — please try again in a moment');
    return;
  }
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
    showRegenBtn();
    loopReverseBtn.classList.remove('hidden');
    navRecentreBtn.classList.add('hidden');
    navFreeCamera = false;
    showPhase('route-panel');
  } catch (e) {
    showError(routeFailure(e, 'Could not generate route — please try again'));
  }
  loadingBox.classList.remove('visible');
  loopRegenBtn.disabled = false;
});

document.getElementById('nav-prompt-cancel').addEventListener('click', hideNavPrompt);

// ─── In-flight loop change ────────────────────────────────────────────────────
// Mid-walk, a new loop is not a new walk: the timer, the distance already
// covered and the original start point all stand. Only what is left of the
// route changes — and it still ends where the walk began.

let navPromptKm = 0;  // the distance-left the stepper is showing, in km

// Shortest way home is the floor: you can't ask to walk less than it takes to
// get back. Crow-flight, rounded up — generatePaddedRoute holds the real line.
function navPromptFloorKm() {
  const pos = navLastPos || userLocation;
  if (!pos || !destination) return 0.5;
  const crow = haversineKm(pos.lat, pos.lng, destination.lat, destination.lng);
  return Math.max(0.5, Math.ceil(crow * 2) / 2);
}

function renderNavPrompt() {
  if (useMetric) {
    navPromptValue.textContent = `${navPromptKm.toFixed(1)} km`;
  } else {
    navPromptValue.textContent = `${(navPromptKm * 0.621371).toFixed(1)} mi`;
  }
  renderUnitSeg(navPromptUnit, useMetric);
}

function stepNavPrompt(dir) {
  const stepKm = useMetric ? 0.5 : 0.5 / 0.621371;
  navPromptKm = Math.max(navPromptFloorKm(), navPromptKm + dir * stepKm);
  renderNavPrompt();
}

navPromptDown.addEventListener('click', function () { stepNavPrompt(-1); });
navPromptUp.addEventListener('click', function () { stepNavPrompt(1); });

navPromptCenter.addEventListener('click', function () {
  useMetric = !useMetric;
  saveUnits(useMetric);
  renderNavPrompt();
  updateNavDisplay();
});

bindUnitSeg(navPromptUnit, function (metric) {
  if (useMetric === metric) return;
  useMetric = metric;
  saveUnits(metric);
  renderNavPrompt();
  updateNavDisplay();
});

// Reshapes the rest of the walk to `targetKm` and brings it home to the loop's
// original start — no haltNavigation, no phase change, the walk carries on.
async function reshapeRemainingLoop(targetKm) {
  const pos = navLastPos || userLocation;
  if (!navStartTime || !pos || !destination) {
    showError('Waiting for GPS location');
    return;
  }

  navRerouting = true;
  navLastRerouteTime = Date.now();
  navOffCourseFixes = 0;

  instructionArrowEl.textContent = '↻';
  instructionTextEl.innerHTML = 'Reshaping loop...';
  instructionDistEl.textContent = '';
  instructionPill.classList.remove('hidden');
  speak('New route');

  try {
    const result = await generatePaddedRoute(
      pos.lat, pos.lng,
      destination.lat, destination.lng,
      targetKm, loopToleranceKm()
    );
    if (navStartTime) {
      notifyLoopVariance(result, targetKm, result.summary.distance / 1000 < targetKm
        ? 'Shortest way back from here'
        : 'Closest route back the streets allow');
      navRouteCoords = result.coords;
      navAlongM = 0;   // the reshaped route starts at the walker's feet
      navRouteDistKm = navTotalDistKm + result.summary.distance / 1000;
      loopLastDistKm = navRouteDistKm; // keeps "distance left" honest on a second change
      navArrived = false;
      drawRoute(result.coords);
      drawRouteArrows(result.coords);
      initSteps(result.steps || [], navTotalDistKm);
      updateNavDisplay();
      updateInstruction();
    }
  } catch (e) {
    showError(e && e.message === 'no-clean-route'
      ? 'No way back that length without doubling back — carrying on as you were'
      : 'Could not reshape your loop — carrying on with your current route');
    if (navStartTime) updateInstruction();
  }

  navRerouting = false;
}

navPromptGo.addEventListener('click', function () {
  const targetKm = navPromptKm;
  hideNavPrompt();
  reshapeRemainingLoop(targetKm);
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

// Where the walker sits against the drawn line: how far off it they are, how
// far along it they have got, and how much is still in front of them. Both
// answers fall out of the same projection, and the plane is centred on the
// walker so their position is the origin — which is the whole of the distance
// arithmetic below. The search can be confined to a stretch of the line, which
// is what trackAlongRoute uses it for.
// A metre of walking backwards along the route is worth this much extra
// distance off it when the two readings are being compared. Where a route lies
// on its own path, standing on it is exactly as near the outbound pass as the
// return one, and an unbiased nearest-point search settles those ties by
// polyline order — which walks the tracked position backwards down the leg the
// walker already finished. The penalty is small enough that a walker who really
// has doubled back is still found there.
const BACKWARD_PENALTY = 0.1;

function nearestOnRoute(lat, lng, coords, fromM, toM, biasM) {
  const R = 6371000, D = Math.PI / 180;
  const cosLat = Math.cos(lat * D);
  const lo = fromM === undefined ? -Infinity : fromM;
  const hi = toM === undefined ? Infinity : toM;
  let bestScore = Infinity, bestDist = Infinity, bestAlong = 0, total = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const ax = (coords[i][1] - lng) * cosLat * R * D;
    const ay = (coords[i][0] - lat) * R * D;
    const dx = (coords[i + 1][1] - lng) * cosLat * R * D - ax;
    const dy = (coords[i + 1][0] - lat) * R * D - ay;
    const len2 = dx * dx + dy * dy;
    const len = Math.sqrt(len2);

    if (total + len >= lo && total <= hi) {
      const t = len2 > 0 ? Math.max(0, Math.min(1, (-ax * dx - ay * dy) / len2)) : 0;
      const px = ax + t * dx, py = ay + t * dy;
      const d = Math.sqrt(px * px + py * py);
      const at = total + t * len;
      const score = biasM !== undefined && at < biasM
        ? d + (biasM - at) * BACKWARD_PENALTY
        : d;
      if (score < bestScore) { bestScore = score; bestDist = d; bestAlong = at; }
    }
    total += len;
  }

  return { distM: bestDist, alongM: bestAlong, totalM: total, remainingM: total - bestAlong };
}

// How far along the route the walker has got. The nearest point on the line
// can't answer that on its own: a walk that comes back near itself puts two
// answers the same distance away, and standing on the destination is equally
// "on" the leg that passed it half an hour earlier. So the search is windowed
// around where the walker was last seen — they arrive on foot, they don't jump
// — and leans forwards within that window. It only widens when they have
// genuinely left the line, which is the case the off-course reroute is about to
// pick up anyway.
function trackAlongRoute(lat, lng, coords, fromM) {
  const near = nearestOnRoute(lat, lng, coords, fromM - 60, fromM + 200, fromM);
  if (near.distM <= 40) return near;
  return nearestOnRoute(lat, lng, coords);
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
    // A loop is rejoined, never re-aimed: its destination is the walk's own
    // start, so routing there would beeline the walker home and swallow
    // whatever is left of the loop.
    if (currentMode === 'loop' && navRouteCoords && navRouteCoords.length > 1) {
      await rejoinLoopRoute(navLastPos);
      navRerouting = false;
      return;
    }

    // A walk deliberately stretched past the direct route keeps its length
    // through a reroute — otherwise one wrong turn quietly shortens it.
    const remainingKm = navPaddedTargetKm > 0
      ? Math.max(0, navRouteDistKm - navTotalDistKm)
      : 0;
    const result = remainingKm > 0
      ? await generatePaddedRoute(navLastPos.lat, navLastPos.lng, destination.lat, destination.lng, remainingKm, 0.2)
      : await generateABRoute(navLastPos.lat, navLastPos.lng, destination.lat, destination.lng);
    if (navStartTime) {
      navRouteCoords = result.coords;
      navAlongM = 0;   // the new route starts at the walker's feet
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
  if (currentMode !== 'loop') loopRegenBtn.classList.add('hidden');

  // Snapshot the route now so it can still be saved from the nav panel by
  // someone who forgot to before setting off.
  navPlannedRoute = routeSavePayload();
  navSaveBtn.innerHTML = ICONS.bookmark;
  navSaveBtn.classList.remove('saved', 'hidden');
  navSaveBtn.disabled = false;

  showPhase('nav-panel');
  if (typeof map.setBearing === 'function') map.setBearing(0);
  if (userLocation) {
    centreInView(userLocation.lat, userLocation.lng, 18, { animate: false });
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
  navAlongM = 0;
  navLeftStart = false;
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

      // A loop finishes where it starts, so the walker is standing on the
      // destination at the off. Arrival only counts once they have left it —
      // otherwise the first fix ends the walk on the spot, taking the turn
      // instructions and off-course rerouting down with it.
      if (!navLeftStart && destination &&
          haversineKm(pos.lat, pos.lng, destination.lat, destination.lng) > 0.05) {
        navLeftStart = true;
      }

      const onRoute = navRouteCoords && navRouteCoords.length > 1
        ? trackAlongRoute(pos.lat, pos.lng, navRouteCoords, navAlongM)
        : null;
      if (onRoute) navAlongM = onRoute.alongM;

      // Being near the destination is not the same as arriving at it. A walk
      // deliberately stretched past the direct route swings out and comes back,
      // and can pass within a few metres of where it ends long before it ends
      // there — which is what was firing the arrival toast mid-walk. Arriving
      // means standing on the destination at the end of the drawn line.
      if (!navArrived && navLeftStart && destination) {
        const distToDest = haversineKm(pos.lat, pos.lng, destination.lat, destination.lng);
        if (distToDest < 0.01 && (!onRoute || onRoute.remainingM < 30)) {
          navArrived = true;
          instructionPill.classList.add('hidden');
          if (currentMode !== 'loop') showArrival(destination.name);
        }
      }

      if (!navArrived && !navRerouting && destination && onRoute) {
        if (onRoute.distM > 15) {
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
  navLeftStart = false;
  navOffCourseFixes = 0;
  navRerouting = false;
  navSteps = [];
  navCurrentStep = 0;
  navCurrentSpeedMs = 0;
  hideArrival();
  instructionPill.classList.add('hidden');
  navSaveBtn.classList.add('hidden');
  navPlannedRoute = null;
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
  navPaddedTargetKm = 0;
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
// Where to rejoin a loop from off the route. Nearest node alone won't do: a
// loop begins and ends at the same place, so early in the walk the walker
// stands metres from its *final* node, and picking purely by distance would
// hand back a route with the loop already finished. Among the nodes that are
// effectively as close, take the one leaving roughly the planned distance
// still ahead of it.
function bestRejoinIndex(pos, coords) {
  let nearest = Infinity;
  const dists = coords.map(function (c) {
    const d = haversineKm(pos.lat, pos.lng, c[0], c[1]);
    if (d < nearest) nearest = d;
    return d;
  });

  const ahead = new Array(coords.length).fill(0);
  for (let i = coords.length - 2; i >= 0; i--) {
    ahead[i] = ahead[i + 1] +
      haversineKm(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
  }

  const plannedLeftKm = Math.max(0, navRouteDistKm - navTotalDistKm);
  let bestI = 0;
  let bestScore = Infinity;
  for (let i = 0; i < coords.length; i++) {
    if (dists[i] > nearest + 0.3) continue;
    const score = Math.abs(ahead[i] - plannedLeftKm);
    if (score < bestScore) { bestScore = score; bestI = i; }
  }
  return bestI;
}

// Routes the walker back onto the loop they strayed from and keeps the rest of
// it ahead of them. Throws are the caller's to handle.
async function rejoinLoopRoute(pos) {
  if (!pos || !navRouteCoords || navRouteCoords.length < 2) return false;

  const bestI = bestRejoinIndex(pos, navRouteCoords);
  const result = await generateABRoute(
    pos.lat, pos.lng,
    navRouteCoords[bestI][0], navRouteCoords[bestI][1]
  );
  if (!navStartTime) return false; // walk was stopped while we were routing

  const remaining = navRouteCoords.slice(bestI);
  const remainingKm = polylineKm(remaining);
  navRouteCoords = result.coords.concat(remaining);
  navAlongM = 0;   // the leg back onto the loop starts at the walker's feet
  navRouteDistKm = navTotalDistKm + result.summary.distance / 1000 + remainingKm;
  drawRoute(navRouteCoords);
  drawRouteArrows(navRouteCoords);
  initSteps((result.steps || []).concat([
    { instruction: 'Continue along your loop', type: 11, distance: remainingKm * 1000 },
  ]), navTotalDistKm);
  updateNavDisplay();
  updateInstruction();
  return true;
}

async function rejoinRouteAfterPause() {
  const pos = navLastPos || userLocation;
  if (!pos || !navRouteCoords || navRouteCoords.length < 2) return;
  if (distToRouteM(pos.lat, pos.lng, navRouteCoords) <= 30) return;

  if (currentMode !== 'loop') {
    triggerReroute();
    return;
  }

  try {
    await rejoinLoopRoute(pos);
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

const searchPanelEl = document.getElementById('search-panel');
const voiceBtnEl = document.getElementById('voice-btn');

// Grow the suggestions list to fill the space between the search bar and the
// keyboard, leaving only the panel's own bottom padding as the gap — the same
// spacing the list has from the panel edge when the keyboard is absent.
function sizeSearchList() {
  const vv = window.visualViewport;
  if (!vv || suggestionsList.classList.contains('hidden')) {
    suggestionsList.style.maxHeight = '';
    return;
  }
  const keyboardTopY = vv.offsetTop + vv.height;
  const keyboardUp = (window.innerHeight - keyboardTopY) > 60;
  if (!keyboardUp) {
    suggestionsList.style.maxHeight = '';
    return;
  }
  const header = searchPanelEl.querySelector('.preview-header');
  const bar = searchPanelEl.querySelector('.search-bar');
  // Keep the panel top clear of the floating map buttons (account/terrain/voice)
  const topClear = voiceBtnEl.getBoundingClientRect().bottom + 10;
  // panel padding (18 top + 18 bottom) + header margin (14) + list margin-top (12)
  const chrome = 62 + header.offsetHeight + bar.offsetHeight;
  const maxH = keyboardTopY - topClear - chrome;
  suggestionsList.style.maxHeight = Math.max(120, Math.floor(maxH)) + 'px';
}

// Clearance above the keyboard. iOS's QuickType/autofill bar (~48px) isn't
// reflected in visualViewport.height, so clear it and then leave the same
// ~12px breathing gap the panel has above the mode bar normally.
const KB_GAP = 60;

function resetDockKeyboard() {
  const wasLifted = dockEl.style.bottom !== '';
  dockEl.style.top = '';
  dockEl.style.bottom = '';
  dockEl.style.transform = '';
  suggestionsList.style.maxHeight = '';
  // The dock drops back over the map without changing height, so the resize
  // observer never sees it. Re-frame once the drop has landed.
  if (wasLifted) requestAnimationFrame(syncMapToDock);
}

// Pin the dock's bottom edge directly to the top of the keyboard using the
// visual viewport, via top + translateY(-100%). This positions the panel
// absolutely (no bottom-offset arithmetic that can double up on browsers that
// already lift fixed elements), so the gap is exactly KB_GAP everywhere.
function keyboardTargetFocused() {
  const a = document.activeElement;
  return a === destInput || a === startInput;
}

// Once positioned for an open keyboard, latch it: ignore further viewport
// wiggle (e.g. Safari's URL bar collapsing as you drag the map) so the panel
// stays put. Only a full close+reopen re-positions.
let kbLatched = false;

// While the dock is lifted clear of the keyboard it sits near the top of the
// screen, so anything that frames the map against it would swing wildly.
function keyboardIsUp() {
  return kbLatched || keyboardTargetFocused();
}

// Keyboard height = the part of the layout viewport the visual viewport no
// longer covers. Using heights only (not offsetTop) makes it immune to iOS's
// forced page-scroll when an input is focused.
function keyboardInset() {
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, document.documentElement.clientHeight - vv.height);
}

// iOS standalone scrolls the whole document up to reveal a focused input,
// which drags fixed elements. Pin it back to the top.
function lockScrollTop() {
  if (window.scrollY !== 0 || window.pageYOffset !== 0) window.scrollTo(0, 0);
}

function adjustSearchPanel(force) {
  const vv = window.visualViewport;
  if (!vv) return;
  const inset = keyboardInset();
  if (inset <= 120 || !keyboardTargetFocused()) {
    kbLatched = false;
    resetDockKeyboard();
    return;
  }
  lockScrollTop();
  if (kbLatched && force !== true) return;
  kbLatched = true;
  dockEl.style.top = 'auto';
  dockEl.style.transform = '';
  dockEl.style.bottom = (inset + KB_GAP) + 'px';
  sizeSearchList();
}

// Counteract the iOS forced-scroll continuously while a field is focused.
window.addEventListener('scroll', function () {
  if (keyboardTargetFocused()) lockScrollTop();
}, { passive: true });

// Force re-settle across the keyboard's open animation, then let the latch hold.
function settleDock() {
  lockScrollTop();
  requestAnimationFrame(function () { lockScrollTop(); adjustSearchPanel(true); });
  setTimeout(function () { lockScrollTop(); adjustSearchPanel(true); }, 300);
  setTimeout(function () { lockScrollTop(); adjustSearchPanel(true); }, 600);
}

function onSearchFocus() {
  modeBar.classList.add('hidden');
  settleDock();
}

function onSearchBlur() {
  modeBar.classList.remove('hidden');
  kbLatched = false;
  resetDockKeyboard();
}

destInput.addEventListener('focus', onSearchFocus);
destInput.addEventListener('blur', onSearchBlur);
startInput.addEventListener('focus', settleDock);
startInput.addEventListener('blur', function () { kbLatched = false; resetDockKeyboard(); });

if (window.visualViewport) {
  // Only on resize — the keyboard opening/closing. NOT on scroll, so panning
  // the map (which fires visualViewport scroll) can't drag the panel around.
  window.visualViewport.addEventListener('resize', adjustSearchPanel);
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

function routeSavePayload() {
  return {
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
  };
}

document.getElementById('route-save-btn').addEventListener('click', function () {
  if (typeof window.onSaveRouteRequest === 'function') {
    window.onSaveRouteRequest(routeSavePayload());
  }
});

// Saving mid-walk files the route as it was planned, not what is left of it —
// a reroute replaces navRouteCoords with the remainder, and half a route is no
// use to walk again later.
navSaveBtn.addEventListener('click', async function () {
  if (!navPlannedRoute || typeof window.onSaveRouteRequest !== 'function') return;
  await window.onSaveRouteRequest(navPlannedRoute, { btnId: 'nav-save-btn', sticky: true });
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
  previewDest.textContent = route.name;
  showPhase('preview-panel');
  requestAnimationFrame(function () {
    centreInView(route.dest_lat, route.dest_lng, 15, { duration: 1.5 });
  });
  acquireStartLocation();
  resetAbLen(userLocation
    ? haversineKm(userLocation.lat, userLocation.lng, route.dest_lat, route.dest_lng) * 1.25
    : 0);
};

// Loads the loop that was actually saved, rather than generating a new one of
// the same size. The walker is rarely standing on the loop, so the saved shape
// is rotated to begin at the node nearest them and a walk-in leg is routed to
// it — the distance and time shown cover that leg plus the loop itself.
window.onLoadSavedLoopRoute = async function (route) {
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

  const saved = Array.isArray(route.coords) && route.coords.length > 1 ? route.coords : null;
  if (!saved) {
    // Nothing walkable stored — fall back to planning a fresh loop of that size.
    showPhase('loop-panel');
    loopGenerateBtn.click();
    return;
  }

  showPhase('loop-panel');
  loadingBox.classList.add('visible');

  const loc = await getFreshLocation();

  let bestI = 0;
  let bestD = Infinity;
  if (loc) {
    for (let i = 0; i < saved.length; i++) {
      const d = haversineKm(loc.lat, loc.lng, saved[i][0], saved[i][1]);
      if (d < bestD) { bestD = d; bestI = i; }
    }
  }

  // Rotating only makes sense on a closed ring; anything else is walked as saved.
  const closed = haversineKm(
    saved[0][0], saved[0][1],
    saved[saved.length - 1][0], saved[saved.length - 1][1]
  ) < 0.05;

  // Start the loop at the node nearest the walker, and close it there.
  const loop = closed && bestI > 0
    ? saved.slice(bestI).concat(saved.slice(1, bestI + 1))
    : saved.slice();
  const loopKm = polylineKm(loop);

  // Walk-in leg from where the walker stands to that node.
  let approach = null;
  const walkInKm = loc ? haversineKm(loc.lat, loc.lng, loop[0][0], loop[0][1]) : 0;
  if (loc && walkInKm > 0.03 && walkInKm <= 5) {
    try {
      approach = await generateABRoute(loc.lat, loc.lng, loop[0][0], loop[0][1]);
    } catch (e) { /* walk the loop as saved — the leg is a nicety */ }
  } else if (loc && walkInKm > 5) {
    showError(`This loop starts ${walkInKm.toFixed(1)} km away — travel there first`);
  }

  const approachKm = approach ? approach.summary.distance / 1000 : 0;
  const coords = approach ? approach.coords.concat(loop) : loop;

  navRouteCoords = coords;
  navRouteDistKm = approachKm + loopKm;
  loopLastDistKm = navRouteDistKm;
  navPaddedTargetKm = 0;
  destination = { lat: loop[0][0], lng: loop[0][1], name: 'Loop start' };
  startLocation = loc || { lat: loop[0][0], lng: loop[0][1] };

  // The saved loop carries no ORS steps, so it walks as one instruction after
  // the leg's turns — the same shape rejoinRouteAfterPause uses.
  const rawSteps = (approach ? (approach.steps || []) : []).concat([
    { instruction: 'Continue along your loop', type: 11, distance: loopKm * 1000 },
  ]);
  initSteps(rawSteps);

  routeTimeEl.textContent = `${Math.round(navRouteDistKm / 5 * 60)} min`;
  updateRouteDist();
  drawRoute(coords);
  drawRouteArrows(coords);
  showRegenBtn();
  loopReverseBtn.classList.remove('hidden');
  navRecentreBtn.classList.add('hidden');
  navFreeCamera = false;
  showPhase('route-panel');
  loadingBox.classList.remove('visible');
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
      padKm: navPaddedTargetKm,
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
    navPaddedTargetKm = s.padKm || 0;
    drawRoute(navRouteCoords);
    if (currentMode === 'loop') {
      drawRouteArrows(navRouteCoords);
      showRegenBtn();
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

  // Whenever the app runs in a browser rather than installed, keep nudging
  // to install. Dismissal only snoozes for a day — a new day (and thus any
  // fresh session after it) brings the prompt back.
  if (isStandalone()) return;
  if (dismissedAt && Date.now() - dismissedAt < 24 * 3600 * 1000) return;

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
      text.textContent = 'Open in Safari, then Share ▸ Add to Home Screen';
      btn.classList.add('hidden');
    } else if (isIOS) {
      text.textContent = 'Tap Share ▸ Add to Home Screen';
      btn.classList.add('hidden');
    } else if (deferredPrompt) {
      text.textContent = 'Install the app';
      btn.classList.remove('hidden');
    } else {
      text.textContent = 'Add to your Home Screen from the browser menu';
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

(function () {
  var banner = document.getElementById('offline-banner');
  function syncOffline() {
    banner.classList.toggle('hidden', navigator.onLine);
  }
  window.addEventListener('offline', syncOffline);
  window.addEventListener('online', function () {
    syncOffline();
    showError('Back online');
  });
  syncOffline(); // reflect state on load — covers opening already in airplane mode
}());

if ('serviceWorker' in navigator) {
  // Auto-update: when a new service worker takes control, reload once so the
  // page always runs the freshest code instead of a stale cached build.
  let reloadedForSW = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (reloadedForSW || !navigator.serviceWorker.controller) return;
    reloadedForSW = true;
    window.location.reload();
  });
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').then(function (reg) {
      reg.update();
      setInterval(function () { reg.update(); }, 60000);
    }).catch(function () {});
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
