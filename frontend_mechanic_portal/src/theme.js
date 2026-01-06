export const theme = {
  colors: {
    primary: "#2563EB",
    secondary: "#F59E0B",
    success: "#F59E0B",
    error: "#EF4444",
    background: "#f9fafb",
    surface: "#ffffff",
    text: "#111827",
    mutedText: "#6B7280",
    border: "#E5E7EB",
  },
};

// PUBLIC_INTERFACE
export function isSupabaseConfigured() {
  /** Returns true when env vars exist (non-empty). */
  const url = process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.REACT_APP_SUPABASE_KEY;
  return Boolean(url && key);
}
