// ─── Auth State ────────────────────────────────────────────────────────────────

let currentUser = null;
let codeEmail = '';

// ─── Element References ────────────────────────────────────────────────────────

const accountBtn             = document.getElementById('account-btn');
const accountBackdrop        = document.getElementById('account-backdrop');
const accountPanel           = document.getElementById('account-panel');
const authSigninView         = document.getElementById('auth-signin-view');
const authCodeView           = document.getElementById('auth-code-view');
const authProfileView        = document.getElementById('auth-profile-view');
const authEditView           = document.getElementById('auth-edit-view');
const authStatsView          = document.getElementById('auth-stats-view');
const authHistoryView        = document.getElementById('auth-history-view');
const authSavedRoutesView    = document.getElementById('auth-saved-routes-view');
const authSavedLocationsView = document.getElementById('auth-saved-locations-view');
const authHelpView           = document.getElementById('auth-help-view');

// ─── Panel Open / Close ────────────────────────────────────────────────────────

function openAccountPanel() {
  accountBackdrop.classList.add('open');
  accountPanel.classList.add('open');
  showAuthView('profile');
}

function closeAccountPanel() {
  accountBackdrop.classList.remove('open');
  accountPanel.classList.remove('open');
  document.getElementById('auth-delete-confirm').classList.add('hidden');
}

function showAuthView(view) {
  [authSigninView, authCodeView, authProfileView, authEditView,
   authStatsView, authHistoryView, authSavedRoutesView, authSavedLocationsView, authHelpView]
    .forEach(function (v) { v.classList.add('hidden'); });

  if (view === 'signin')             authSigninView.classList.remove('hidden');
  else if (view === 'code')          authCodeView.classList.remove('hidden');
  else if (view === 'profile')       { authProfileView.classList.remove('hidden'); renderProfile(); }
  else if (view === 'edit')          { authEditView.classList.remove('hidden'); renderEditView(); }
  else if (view === 'stats')         { authStatsView.classList.remove('hidden');       loadStrideStats(); }
  else if (view === 'history')       { authHistoryView.classList.remove('hidden');     loadWalkHistory(); }
  else if (view === 'saved-routes')  { authSavedRoutesView.classList.remove('hidden'); loadSavedRoutes(); }
  else if (view === 'saved-locations') { authSavedLocationsView.classList.remove('hidden'); loadSavedLocations(); }
  else if (view === 'help')          authHelpView.classList.remove('hidden');
}

// ─── Button Wiring ─────────────────────────────────────────────────────────────

accountBtn.addEventListener('click', openAccountPanel);
accountBackdrop.addEventListener('click', closeAccountPanel);

document.getElementById('auth-close-btn').addEventListener('click', closeAccountPanel);
document.getElementById('auth-code-close-btn').addEventListener('click', closeAccountPanel);
document.getElementById('auth-profile-close-btn').addEventListener('click', closeAccountPanel);
document.getElementById('auth-edit-close-btn').addEventListener('click', closeAccountPanel);

document.getElementById('auth-signin-back-btn').addEventListener('click', function () {
  showAuthView('profile');
});
document.getElementById('auth-code-back-btn').addEventListener('click', function () {
  showAuthView('signin');
});
document.getElementById('auth-edit-back-btn').addEventListener('click', function () {
  showAuthView('profile');
});
document.getElementById('auth-profile-signin-btn').addEventListener('click', function () {
  showAuthView('signin');
});
document.getElementById('auth-edit-profile-btn').addEventListener('click', function () {
  showAuthView('edit');
});

document.getElementById('auth-stats-btn').addEventListener('click', function () { showAuthView('stats'); });
document.getElementById('auth-history-btn').addEventListener('click', function () { showAuthView('history'); });
document.getElementById('auth-saved-routes-btn').addEventListener('click', function () { showAuthView('saved-routes'); });
document.getElementById('auth-saved-locations-btn').addEventListener('click', function () { showAuthView('saved-locations'); });

['auth-stats-back-btn', 'auth-history-back-btn', 'auth-saved-routes-back-btn', 'auth-saved-locations-back-btn']
  .forEach(function (id) {
    document.getElementById(id).addEventListener('click', function () { showAuthView('profile'); });
  });

['auth-stats-close-btn', 'auth-history-close-btn', 'auth-saved-routes-close-btn', 'auth-saved-locations-close-btn']
  .forEach(function (id) {
    document.getElementById(id).addEventListener('click', closeAccountPanel);
  });

document.getElementById('auth-help-btn').addEventListener('click', function () { showAuthView('help'); });
document.getElementById('auth-help-back-btn').addEventListener('click', function () { showAuthView('profile'); });
document.getElementById('auth-help-close-btn').addEventListener('click', closeAccountPanel);

// ─── Account Button Appearance ─────────────────────────────────────────────────

function updateAccountBtn(user) {
  if (user) {
    const meta = user.user_metadata || {};
    const name = meta.full_name || meta.name || user.email || 'U';
    const avatarUrl = meta.avatar_url || meta.picture;
    if (avatarUrl) {
      accountBtn.innerHTML = `<img src="${avatarUrl}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" />`;
    } else {
      accountBtn.innerHTML = `<span class="account-btn-initial">${name.charAt(0).toUpperCase()}</span>`;
    }
    accountBtn.classList.add('signed-in');
  } else {
    accountBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden="true"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>`;
    accountBtn.classList.remove('signed-in');
  }
}

// ─── Send OTP Code ─────────────────────────────────────────────────────────────

async function sendCode(email) {
  const { error } = await sbClient.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

async function handleSendCode() {
  const email = document.getElementById('auth-email-input').value.trim();
  if (!email) return;

  const btn = document.getElementById('auth-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    await sendCode(email);
    codeEmail = email;
    document.getElementById('auth-sent-email').textContent = email;
    document.getElementById('auth-code-input').value = '';
    showAuthView('code');
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('email') || msg.includes('smtp') || msg.includes('sending')) {
      showError('Could not send code — check Supabase SMTP settings');
    } else {
      showError(err.message || 'Could not send code — please try again');
    }
  }

  btn.disabled = false;
  btn.textContent = 'Send code';
}

document.getElementById('auth-submit-btn').addEventListener('click', handleSendCode);
document.getElementById('auth-email-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') handleSendCode();
});

// ─── Resend Code ───────────────────────────────────────────────────────────────

document.getElementById('auth-resend-btn').addEventListener('click', async function () {
  if (!codeEmail) return;
  const btn = this;
  btn.disabled = true;
  btn.textContent = 'Sending...';
  try {
    await sendCode(codeEmail);
    showError('New code sent');
  } catch (err) {
    showError(err.message);
  }
  btn.disabled = false;
  btn.textContent = 'Resend code';
});

// ─── Verify OTP Code ───────────────────────────────────────────────────────────

async function handleVerifyCode() {
  const token = document.getElementById('auth-code-input').value.trim();
  if (token.length < 6) return;

  const btn = document.getElementById('auth-verify-btn');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  const { error } = await sbClient.auth.verifyOtp({
    email: codeEmail,
    token,
    type: 'email',
  });

  btn.disabled = false;
  btn.textContent = 'Sign in';

  if (error) {
    const { data: { session } } = await sbClient.auth.getSession();
    if (session) { showAuthView('profile'); return; }
    showError('Invalid or expired code — try again or request a new one');
    return;
  }

  showAuthView('profile');
}

document.getElementById('auth-verify-btn').addEventListener('click', handleVerifyCode);

document.getElementById('auth-code-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') handleVerifyCode();
});

document.getElementById('auth-code-input').addEventListener('input', function () {
  if (this.value.trim().length === 6) handleVerifyCode();
});

// ─── Profile View ──────────────────────────────────────────────────────────────

async function renderProfile() {
  const avatarEl    = document.getElementById('auth-profile-avatar');
  const signInBtn   = document.getElementById('auth-profile-signin-btn');
  const editBtn     = document.getElementById('auth-edit-profile-btn');
  const signOutBtn  = document.getElementById('auth-signout-btn');
  const helpBtn     = document.getElementById('auth-help-btn');
  const deleteBtn   = document.getElementById('auth-delete-btn');
  const navBtns     = document.querySelectorAll('.auth-nav-btn');

  if (!currentUser) {
    avatarEl.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="#ccc" aria-hidden="true"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>';
    document.getElementById('auth-user-name').textContent = 'Guest';
    document.getElementById('auth-user-email').textContent = '';
    document.getElementById('auth-tier-badge').textContent = '';
    signInBtn.classList.remove('hidden');
    editBtn.classList.add('hidden');
    signOutBtn.classList.add('hidden');
    deleteBtn.classList.add('hidden');
    document.getElementById('auth-delete-confirm').classList.add('hidden');
    navBtns.forEach(function (b) { b.disabled = true; });
    return;
  }

  const meta = currentUser.user_metadata || {};
  const name = meta.full_name || meta.name || currentUser.email.split('@')[0];
  const avatarUrl = meta.avatar_url || meta.picture;

  if (avatarUrl) {
    avatarEl.innerHTML = `<img src="${avatarUrl}" alt="" />`;
  } else {
    avatarEl.textContent = name.charAt(0).toUpperCase();
  }

  document.getElementById('auth-user-name').textContent = name;
  document.getElementById('auth-user-email').textContent = currentUser.email;
  document.getElementById('auth-tier-badge').textContent = 'Free';
  signInBtn.classList.add('hidden');
  editBtn.classList.remove('hidden');
  signOutBtn.classList.remove('hidden');
  deleteBtn.classList.remove('hidden');
  navBtns.forEach(function (b) { b.disabled = false; });

  const { data: profile } = await sbClient
    .from('profiles')
    .select('tier')
    .eq('id', currentUser.id)
    .single();

  if (profile?.tier) {
    const tier = profile.tier;
    document.getElementById('auth-tier-badge').textContent =
      tier.charAt(0).toUpperCase() + tier.slice(1);
  }
}

// ─── Edit Profile View ─────────────────────────────────────────────────────────

function renderEditView() {
  if (!currentUser) return;
  const meta = currentUser.user_metadata || {};
  const name = meta.full_name || meta.name || '';
  const avatarUrl = meta.avatar_url || meta.picture;

  const avatarEl = document.getElementById('auth-edit-avatar');
  if (avatarUrl) {
    avatarEl.innerHTML = `<img src="${avatarUrl}" alt="" />`;
  } else {
    avatarEl.textContent = (name || currentUser.email || 'U').charAt(0).toUpperCase();
  }

  document.getElementById('auth-name-input').value = name;
  document.getElementById('auth-avatar-input').value = '';
}

document.getElementById('auth-avatar-input').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  document.getElementById('auth-edit-avatar').innerHTML =
    `<img src="${URL.createObjectURL(file)}" alt="" />`;
});

document.getElementById('auth-save-btn').addEventListener('click', async function () {
  const name = document.getElementById('auth-name-input').value.trim();
  const file = document.getElementById('auth-avatar-input').files[0];
  if (!name && !file) { showAuthView('profile'); return; }

  const btn = this;
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    let avatarUrl = null;

    if (file) {
      const ext = file.name.split('.').pop();
      const path = `${currentUser.id}/avatar.${ext}`;
      const { error: uploadError } = await sbClient.storage
        .from('avatars')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      avatarUrl = sbClient.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    }

    const updates = {};
    if (name) updates.full_name = name;
    if (avatarUrl) updates.avatar_url = avatarUrl;

    await sbClient.from('profiles').update(updates).eq('id', currentUser.id);
    await sbClient.auth.updateUser({ data: updates });

    showAuthView('profile');
  } catch (err) {
    showError(err.message || 'Could not save — please try again');
  }

  btn.disabled = false;
  btn.textContent = 'Save changes';
});

// ─── Sign Out ──────────────────────────────────────────────────────────────────

document.getElementById('auth-signout-btn').addEventListener('click', async function () {
  await sbClient.auth.signOut();
  closeAccountPanel();
});

// ─── Delete Account ────────────────────────────────────────────────────────────

document.getElementById('auth-delete-btn').addEventListener('click', function () {
  document.getElementById('auth-delete-confirm').classList.remove('hidden');
});

document.getElementById('auth-delete-no-btn').addEventListener('click', function () {
  document.getElementById('auth-delete-confirm').classList.add('hidden');
});

document.getElementById('auth-delete-yes-btn').addEventListener('click', async function () {
  const btn = this;
  btn.disabled = true;
  btn.textContent = '...';
  try { await sbClient.rpc('delete_user'); } catch { /* fall through */ }
  await sbClient.auth.signOut();
  closeAccountPanel();
});

// ─── Saved Locations ───────────────────────────────────────────────────────────

window.onSaveLocationRequest = async function (lat, lng, name) {
  if (!currentUser) { showError('Sign in to save places'); return; }
  const btn = document.getElementById('pin-save-btn');
  btn.disabled = true;
  const { error } = await sbClient.from('saved_locations')
    .insert({ user_id: currentUser.id, name: name || 'Saved place', lat, lng });
  if (error) {
    showError('Could not save place');
    btn.disabled = false;
  } else {
    btn.textContent = '✓';
    setTimeout(function () { btn.textContent = '🔖'; btn.disabled = false; }, 2000);
  }
};

async function loadSavedLocations() {
  const listEl  = document.getElementById('saved-locations-list');
  const emptyEl = document.getElementById('saved-locations-empty');
  listEl.innerHTML = '<p class="auth-loading">Loading...</p>';

  const { data, error } = await sbClient.from('saved_locations')
    .select('*').eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  listEl.innerHTML = '';
  if (error) { showError('Could not load saved places'); return; }

  if (!data || data.length === 0) { emptyEl.classList.remove('hidden'); return; }
  emptyEl.classList.add('hidden');

  data.forEach(function (loc) {
    const item = document.createElement('div');
    item.className = 'saved-location-item';
    item.innerHTML = `
      <button class="saved-location-go" data-lat="${loc.lat}" data-lng="${loc.lng}" data-name="${escapeHtml(loc.name)}">
        <span class="saved-location-icon">📍</span>
        <span class="saved-location-name">${escapeHtml(loc.name)}</span>
      </button>
      <button class="saved-location-delete" data-id="${loc.id}">✕</button>`;
    listEl.appendChild(item);
  });

  listEl.querySelectorAll('.saved-location-go').forEach(function (btn) {
    btn.addEventListener('click', function () {
      closeAccountPanel();
      const lat = parseFloat(this.dataset.lat);
      const lng = parseFloat(this.dataset.lng);
      placePinMarker(lat, lng);
      map.flyTo([lat, lng], 16, { duration: 1 });
      if (typeof window.onPinDropped === 'function') window.onPinDropped(lat, lng);
    });
  });

  listEl.querySelectorAll('.saved-location-delete').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      await sbClient.from('saved_locations').delete()
        .eq('id', this.dataset.id).eq('user_id', currentUser.id);
      const item = this.closest('.saved-location-item');
      item.remove();
      if (listEl.children.length === 0) emptyEl.classList.remove('hidden');
    });
  });
}

// ─── Walk Logging ──────────────────────────────────────────────────────────────

window.onWalkCompleted = async function (walk) {
  if (!currentUser) return;
  await sbClient.from('walk_history').insert({
    user_id:      currentUser.id,
    dist_km:      Math.round(walk.distKm * 100) / 100,
    duration_sec: Math.round(walk.durationSec),
    mode:         walk.mode,
    walked_at:    new Date().toISOString(),
  });
};

// ─── Walk History ──────────────────────────────────────────────────────────────

async function loadWalkHistory() {
  const listEl  = document.getElementById('history-list');
  const emptyEl = document.getElementById('history-empty');
  const loadEl  = document.getElementById('history-loading');
  listEl.innerHTML = '';
  emptyEl.classList.add('hidden');
  loadEl.classList.remove('hidden');

  const { data, error } = await sbClient.from('walk_history')
    .select('*').eq('user_id', currentUser.id)
    .order('walked_at', { ascending: false })
    .limit(50);

  loadEl.classList.add('hidden');
  if (error) { showError('Could not load walk history'); return; }
  if (!data || data.length === 0) { emptyEl.classList.remove('hidden'); return; }

  data.forEach(function (w) {
    const date  = new Date(w.walked_at);
    const label = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const km    = w.dist_km.toFixed(2);
    const mins  = Math.round(w.duration_sec / 60);
    const item  = document.createElement('div');
    item.className = 'walk-item';
    item.innerHTML = `
      <div class="walk-date">${label}</div>
      <div class="walk-stats">
        <span class="walk-stat">${km} km</span>
        <span class="walk-stat">${mins} min</span>
        <span class="walk-mode">${w.mode === 'loop' ? '🔄' : '↗️'}</span>
      </div>`;
    listEl.appendChild(item);
  });
}

// ─── Stride Stats ──────────────────────────────────────────────────────────────

async function loadStrideStats() {
  const gridEl  = document.getElementById('stats-grid');
  const emptyEl = document.getElementById('stats-empty');
  const loadEl  = document.getElementById('stats-loading');
  gridEl.classList.add('hidden');
  emptyEl.classList.add('hidden');
  loadEl.classList.remove('hidden');

  const { data, error } = await sbClient.from('walk_history')
    .select('dist_km, duration_sec, walked_at')
    .eq('user_id', currentUser.id);

  loadEl.classList.add('hidden');
  if (error) { showError('Could not load stats'); return; }
  if (!data || data.length === 0) { emptyEl.classList.remove('hidden'); return; }

  const totalKm   = data.reduce(function (s, w) { return s + w.dist_km; }, 0);
  const totalMins = Math.round(data.reduce(function (s, w) { return s + w.duration_sec; }, 0) / 60);
  const longestKm = Math.max.apply(null, data.map(function (w) { return w.dist_km; }));
  const weekAgo   = Date.now() - 7 * 24 * 3600 * 1000;
  const weekKm    = data
    .filter(function (w) { return new Date(w.walked_at).getTime() >= weekAgo; })
    .reduce(function (s, w) { return s + w.dist_km; }, 0);

  const stats = [
    { label: 'Total distance', value: totalKm.toFixed(1) + ' km' },
    { label: 'Total walks',    value: String(data.length) },
    { label: 'Longest walk',   value: longestKm.toFixed(2) + ' km' },
    { label: 'This week',      value: weekKm.toFixed(1) + ' km' },
    { label: 'Time on feet',   value: totalMins + ' min' },
  ];

  gridEl.innerHTML = '';
  stats.forEach(function (s) {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `<div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div>`;
    gridEl.appendChild(card);
  });
  gridEl.classList.remove('hidden');
}

// ─── Saved Routes ──────────────────────────────────────────────────────────────

window.onSaveRouteRequest = async function (route) {
  if (!currentUser) { showError('Sign in to save routes'); return; }
  const btn = document.getElementById('route-save-btn');
  btn.disabled = true;
  const { error } = await sbClient.from('saved_routes').insert({
    user_id:         currentUser.id,
    name:            route.name,
    mode:            route.mode,
    coords:          route.coords,
    dist_km:         Math.round(route.distKm * 100) / 100,
    loop_mode:       route.loopMode || null,
    loop_value:      route.loopValue || null,
    loop_use_metric: route.loopUseMetric !== false,
    dest_lat:        route.destLat || null,
    dest_lng:        route.destLng || null,
    start_lat:       route.startLat || null,
    start_lng:       route.startLng || null,
  });
  if (error) {
    showError('Could not save route');
    btn.disabled = false;
  } else {
    btn.textContent = '✓';
    setTimeout(function () { btn.textContent = '🔖'; btn.disabled = false; }, 2000);
  }
};

function isRouteNearby(route, userLoc) {
  if (!userLoc) return false;
  if (route.mode === 'ab' && route.start_lat) {
    return haversineKm(userLoc.lat, userLoc.lng, route.start_lat, route.start_lng) <= 0.5;
  }
  if (route.mode === 'loop' && route.coords && route.coords.length) {
    return route.coords.some(function (c) {
      return haversineKm(userLoc.lat, userLoc.lng, c[0], c[1]) <= 0.5;
    });
  }
  return false;
}

async function loadSavedRoutes() {
  const listEl  = document.getElementById('saved-routes-list');
  const emptyEl = document.getElementById('saved-routes-empty');
  const loadEl  = document.getElementById('saved-routes-loading');
  const noteEl  = document.getElementById('saved-routes-note');
  listEl.innerHTML = '';
  emptyEl.classList.add('hidden');
  noteEl.classList.add('hidden');
  loadEl.classList.remove('hidden');

  const { data, error } = await sbClient.from('saved_routes')
    .select('*').eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  loadEl.classList.add('hidden');
  if (error) { showError('Could not load saved routes'); return; }
  if (!data || data.length === 0) { emptyEl.classList.remove('hidden'); return; }

  const userLoc = (typeof userLocation !== 'undefined') ? userLocation : null;
  let anyNearby = false;

  data.forEach(function (route) {
    const nearby = isRouteNearby(route, userLoc);
    if (nearby) anyNearby = true;
    const km   = route.dist_km ? route.dist_km.toFixed(1) + ' km' : '';
    const icon = route.mode === 'loop' ? '🔄' : '↗️';
    const item = document.createElement('div');
    item.className = 'saved-route-item';
    item.innerHTML = `
      <button class="saved-route-go${nearby ? '' : ' saved-route-far'}" data-id="${route.id}">
        <span class="saved-route-icon">${icon}</span>
        <div class="saved-route-info">
          <span class="saved-route-name">${escapeHtml(route.name)}</span>
          ${km ? `<span class="saved-route-dist">${km}</span>` : ''}
        </div>
      </button>
      <button class="saved-location-delete" data-id="${route.id}">✕</button>`;
    listEl.appendChild(item);
  });

  if (!anyNearby && userLoc) noteEl.classList.remove('hidden');

  listEl.querySelectorAll('.saved-route-go').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const routeId = this.dataset.id;
      const route   = data.find(function (r) { return r.id === routeId; });
      if (!route) return;
      closeAccountPanel();
      if (route.mode === 'ab') {
        if (typeof window.onLoadSavedABRoute === 'function') window.onLoadSavedABRoute(route);
      } else {
        if (typeof window.onLoadSavedLoopRoute === 'function') window.onLoadSavedLoopRoute(route);
      }
    });
  });

  listEl.querySelectorAll('.saved-location-delete').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      await sbClient.from('saved_routes').delete()
        .eq('id', this.dataset.id).eq('user_id', currentUser.id);
      const item = this.closest('.saved-route-item');
      item.remove();
      if (listEl.children.length === 0) emptyEl.classList.remove('hidden');
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Session ───────────────────────────────────────────────────────────────────

sbReady.then(function () {
  sbClient.auth.onAuthStateChange(function (event, session) {
    currentUser = session?.user || null;
    updateAccountBtn(currentUser);
  });

  sbClient.auth.getSession().then(function ({ data: { session } }) {
    currentUser = session?.user || null;
    updateAccountBtn(currentUser);
  });
});
