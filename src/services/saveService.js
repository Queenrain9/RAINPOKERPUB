import { supabase } from "./supabase.js";

const NEW_ACCOUNT_STATE = Object.freeze({
  version: 1,
  phase: "needs_pub_name",
  createdAt: null,
});

export async function ensureGameSave(userId) {
  if (!supabase) throw new Error("SAVE_SERVER_NOT_CONFIGURED");

  const { data: existing, error: readError } = await supabase
    .from("game_saves")
    .select("user_id, save_version, state, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) throw readError;
  if (existing) return existing;

  const initialState = {
    ...NEW_ACCOUNT_STATE,
    createdAt: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("game_saves")
    .insert({
      user_id: userId,
      save_version: 1,
      state: initialState,
    })
    .select("user_id, save_version, state, updated_at")
    .single();

  if (error) throw error;
  return data;
}

export async function loadGameSave(userId) {
  if (!supabase) throw new Error("SAVE_SERVER_NOT_CONFIGURED");

  const { data, error } = await supabase
    .from("game_saves")
    .select("user_id, save_version, state, updated_at")
    .eq("user_id", userId)
    .single();

  if (error) throw error;
  return data;
}

export async function saveGameState(userId, state, saveVersion = 1) {
  if (!supabase) throw new Error("SAVE_SERVER_NOT_CONFIGURED");

  const { data, error } = await supabase
    .from("game_saves")
    .update({
      save_version: saveVersion,
      state,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select("user_id, save_version, state, updated_at")
    .single();

  if (error) throw error;
  return data;
}
