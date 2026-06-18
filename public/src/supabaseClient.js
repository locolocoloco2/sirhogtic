const { createClient } = window.supabase;

if (!window.OGTIC_CONFIG?.SUPABASE_URL || !window.OGTIC_CONFIG?.SUPABASE_ANON_KEY) {
  console.warn("Falta configurar src/config.js");
}

const sb = createClient(
  window.OGTIC_CONFIG.SUPABASE_URL,
  window.OGTIC_CONFIG.SUPABASE_ANON_KEY
);
