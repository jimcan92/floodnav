export interface SupabaseConfig {
  url: string;
  key: string;
}
const storageKey = "floodnav.supabase.public-config";
export function validateSupabaseConfig(config: SupabaseConfig): SupabaseConfig {
  const key = config.key.trim();
  let url: URL;
  try {
    url = new URL(config.url.trim());
  } catch {
    throw new Error("Enter a valid Supabase project URL.");
  }
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  )
    throw new Error(
      "Use the HTTPS project URL only, without an API path or credentials.",
    );
  if (key.startsWith("sb_secret_"))
    throw new Error(
      "Use a publishable key, never a secret key in the frontend.",
    );
  if (!key.startsWith("sb_publishable_")) {
    try {
      const payload = JSON.parse(
        atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (!key.startsWith("eyJ") || payload.role !== "anon") throw new Error();
    } catch {
      throw new Error(
        "Only a publishable or legacy anon key belongs in the frontend.",
      );
    }
  }
  if (key === "sb_publishable_" || key.includes("REPLACE_ME"))
    throw new Error("Enter your project publishable key.");
  return { url: url.origin, key };
}
export function loadSupabaseConfig(): SupabaseConfig {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) return validateSupabaseConfig(JSON.parse(saved));
  } catch {
    /* Storage may be unavailable; environment defaults still work. */
  }
  return {
    url: import.meta.env.VITE_SUPABASE_URL || "",
    key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
  };
}
export function saveSupabaseConfig(config: SupabaseConfig): void {
  localStorage.setItem(
    storageKey,
    JSON.stringify(validateSupabaseConfig(config)),
  );
}
export function clearSupabaseConfig(): void {
  localStorage.removeItem(storageKey);
}
