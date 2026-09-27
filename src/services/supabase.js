import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, hasSupabaseConfig } from "../config.js";

export const supabase = hasSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export async function signUpWithEmail(email, password) {
  if (!supabase) throw new Error("AUTH_NOT_CONFIGURED");

  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });
}

export async function signInWithEmail(email, password) {
  if (!supabase) throw new Error("AUTH_NOT_CONFIGURED");
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(callback) {
  if (!supabase) return { unsubscribe() {} };
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return data.subscription;
}
