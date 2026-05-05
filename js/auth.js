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

// ─── Panel Open / Close ────────────────────────────────────────────────────────

function openAccountPanel() {
  accountBackdrop.classList.add('open');
  accountPanel.classList.add('open');
  showAuthView(currentUser ? 'profile' : 'signin');
}

function closeAccountPanel() {
  accountBackdrop.classList.remove('open');
  accountPanel.classList.remove('open');
  document.getElementById('auth-delete-confirm').classList.add('hidden');
}

function showAuthView(view) {
  [authSigninView, authCodeView, authProfileView, authEditView,
   authStatsView, authHistoryView, authSavedRoutesView, authSavedLocationsView]
    .forEach(function (v) { v.classList.add('hidden'); });

  if (view === 'signin')             authSigninView.classList.remove('hidden');
  else if (view === 'code')          authCodeView.classList.remove('hidden');
  else if (view === 'profile')       { authProfileView.classList.remove('hidden'); renderProfile(); }
  else if (view === 'edit')          { authEditView.classList.remove('hidden'); renderEditView(); }
  else if (view === 'stats')         authStatsView.classList.remove('hidden');
  else if (view === 'history')       authHistoryView.classList.remove('hidden');
  else if (view === 'saved-routes')  authSavedRoutesView.classList.remove('hidden');
  else if (view === 'saved-locations') { authSavedLocationsView.classList.remove('hidden'); loadSavedLocations(); }
}

// ─── Button Wiring ─────────────────────────────────────────────────────────────

accountBtn.addEventListener('click', openAccountPanel);
accountBackdrop.addEventListener('click', closeAccountPanel);

document.getElementById('auth-close-btn').addEventListener('click', closeAccountPanel);
document.getElementById('auth-code-close-btn').addEventListener('click', closeAccountPanel);
document.getElementById('auth-profile-close-btn').addEventListener('click', closeAccountPanel);
document.getElementById('auth-edit-close-btn').addEventListener('click', closeAccountPanel);

document.getElementById('auth-code-back-btn').addEventListener('click', function () {
  showAuthView('signin');
});
document.getElementById('auth-edit-back-btn').addEventListener('click', function () {
  showAuthView('profile');
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
    showError(err.message);
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
    showError('Invalid or expired code — try again or request a new one');
    return;
  }

  closeAccountPanel();
}

document.getElementById('auth-verify-btn').addEventListener('click', handleVerifyCode);

document.getElementById('auth-code-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') handleVerifyCode();
});

// ─── Profile View ──────────────────────────────────────────────────────────────

async function renderProfile() {
  if (!currentUser) return;
  const meta = currentUser.user_metadata || {};
  const name = meta.full_name || meta.name || currentUser.email.split('@')[0];
  const avatarUrl = meta.avatar_url || meta.picture;

  const avatarEl = document.getElementById('auth-profile-avatar');
  if (avatarUrl) {
    avatarEl.innerHTML = `<img src="${avatarUrl}" alt="" />`;
  } else {
    avatarEl.textContent = name.charAt(0).toUpperCase();
  }

  document.getElementById('auth-user-name').textContent = name;
  document.getElementById('auth-user-email').textContent = currentUser.email;
  document.getElementById('auth-tier-badge').textContent = 'Free';

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
