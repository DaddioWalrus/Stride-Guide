let sbClient = null;

const sbReady = fetch('/api/config')
  .then(function (res) { return res.json(); })
  .then(function (cfg) {
    const { createClient } = window.supabase;
    sbClient = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  });
