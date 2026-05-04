// ─── Auth State ────────────────────────────────────────────────────────────────

let currentUser = null;

// ─── Element References ────────────────────────────────────────────────────────

const accountBtn      = document.getElementById('account-btn');
const accountBackdrop = document.getElementById('account-backdrop');
const accountPanel    = document.getElementById('account-panel');
const authSigninView  = document.getElementById('auth-signin-view');
const authSentView    = document.getElementById('auth-sent-view');
const authProfileView = document.getElementById('auth-profile-view');

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
  authSigninView.classList.add('hidden');
  authSentView.classList.add('hidden');
  authProfileView.classList.add('hidden');
  if (view === 'signin')       authSigninView.classList.remove('hidden');
  else if (view === 'sent')    authSentView.classList.remove('hidden');
  else if (view === 'profile') { authProfileView.classList.remove('hidden'); renderProfile(); }
}

// ─── Button Wiring ─────────────────────────────────────────────────────────────

accountBtn.addEventListener('click', openAccountPanel);
accountBackdrop.addEventListener('click', closeAccountPanel);

document.getElementById('auth-close-btn').addEventListener('click', closeAccountPanel);
document.getElementById('auth-sent-close-btn').addEventListener('click', closeAccountPanel);
document.getElementById('auth-profile-close-btn').addEventListener('click', closeAccountPanel);
document.getElementById('auth-sent-back-btn').addEventListener('click', function () {
  showAuthView('signin');
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

// ─── Magic Link Sign-In ────────────────────────────────────────────────────────

async function sendMagicLink() {
  const email = document.getElementById('auth-email-input').value.trim();
  if (!email) return;

  const btn = document.getElementById('auth-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  const { error } = await sbClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });

  btn.disabled = false;
  btn.textContent = 'Send magic link';

  if (error) {
    showError(error.message);
    return;
  }

  document.getElementById('auth-sent-email').textContent = email;
  showAuthView('sent');
}

document.getElementById('auth-submit-btn').addEventListener('click', sendMagicLink);

document.getElementById('auth-email-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') sendMagicLink();
});

// ─── Profile ───────────────────────────────────────────────────────────────────

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
