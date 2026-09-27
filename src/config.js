// Public client configuration only.
// Supabase publishable keys are designed to be exposed to browser clients when Row Level Security is configured.
// Do not place service_role keys, database passwords, or any private secret in this repository.
export const SUPABASE_URL = "https://hmblaasagxyntyfrfztg.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_-8JyZ7lwfSmUUpPS4GBUfg_mNG9zT_B";

export const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
