import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Esto se ve en la consola del navegador / terminal si faltan las env vars.
  console.warn(
    "Felpus: faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copiá .env.local.example a .env.local y completá tus credenciales de Supabase."
  );
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "", {
  auth: {
    flowType: "implicit",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
