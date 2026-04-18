import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://vifwjwsndchnrpvfgrmg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpZndqd3NuZGNobnJwdmZncm1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NzE2MDcsImV4cCI6MjA5MjA0NzYwN30.1cQbPUNgAfsOHdSikc1i6fhCgo1QYxO7XmBi1zoDAxs";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
