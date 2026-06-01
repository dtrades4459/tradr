import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Log clearly but don't crash — the app will render and show a login screen.
  // All Supabase calls will fail with auth errors until the vars are set.
  console.error(
    "[KODA] Missing Supabase env vars. Copy .env.example → .env and fill in your project values.\n" +
    "  VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set before the app will work."
  );
}

export const supabase = createClient(
  SUPABASE_URL  || "http://localhost:54321",
  SUPABASE_ANON_KEY || "placeholder-anon-key",
);
