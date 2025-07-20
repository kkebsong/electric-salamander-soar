import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase URL and Anon Key must be set as environment variables.");
  // In a production app, you might want to throw an error or handle this more gracefully
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);