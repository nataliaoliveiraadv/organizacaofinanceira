import { supabase } from "./supabaseClient";

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

export const storage = {
  async get(key) {
    const userId = await getUserId();
    if (!userId) return null;
    const { data, error } = await supabase
      .from("app_data")
      .select("value")
      .eq("user_id", userId)
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return { key, value: JSON.stringify(data.value) };
  },

  async set(key, value) {
    const userId = await getUserId();
    if (!userId) return null;
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    const { error } = await supabase
      .from("app_data")
      .upsert({ user_id: userId, key, value: parsed, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
    if (error) {
      console.error("Erro ao salvar no Supabase:", error);
      return null;
    }
    return { key, value };
  },

  async delete(key) {
    const userId = await getUserId();
    if (!userId) return null;
    const { error } = await supabase.from("app_data").delete().eq("user_id", userId).eq("key", key);
    if (error) return null;
    return { key, deleted: true };
  },

  async list(prefix) {
    const userId = await getUserId();
    if (!userId) return null;
    let query = supabase.from("app_data").select("key").eq("user_id", userId);
    if (prefix) query = query.like("key", `${prefix}%`);
    const { data, error } = await query;
    if (error) return null;
    return { keys: (data || []).map((r) => r.key) };
  },
};
