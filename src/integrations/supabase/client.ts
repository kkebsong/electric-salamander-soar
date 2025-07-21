import { createClient } from '@supabase/supabase-js';

// Замените эти значения на URL и Anon Key вашего НОВОГО проекта Supabase
const supabaseUrl = "https://jitmryvgkeuwmmzjcfwj.supabase.co"; // Вставьте ваш Project URL здесь
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppdG1yeXZna2V1d21tempjZndqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwMjQyMzEsImV4cCI6MjA2ODYwMDIzMX0.a31CrTh-8ymvZpHq-fjjhLHLwj-JfBAx7OPSxUwmZVk"; // Вставьте ваш Anon Public Key здесь

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase URL and Anon Key must be set as environment variables.");
  // In a production app, you might want to throw an error or handle this more gracefully
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);