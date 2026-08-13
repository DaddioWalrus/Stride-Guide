module.exports = function handler(req, res) {
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
  });
};
