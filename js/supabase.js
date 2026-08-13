let sbClient = null;

// Split from sbReady so consumers that only want the config — the version
// stamp — still get it when the Supabase script itself failed to load.
const sbConfig = fetch('/api/config').then(function (res) { return res.json(); });

const sbReady = sbConfig
  .then(function (cfg) {
    const { createClient } = window.supabase;
    sbClient = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  });
