// Public client configuration only.
// Supabase anon key is designed to be exposed to browser clients when Row Level Security is configured.
// Do not place service_role keys or any private secret in this repository.
export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";

export const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
