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

// createClient() exige un supabaseUrl no vacío — con "" tira una excepción
// en el momento de crear el cliente, no solo al usarlo. Eso significa que
// sin .env.local (clon nuevo del repo, o CI sin las env vars) hasta
// "npm run build" fallaba duro, a diferencia del resto de la app, que
// degrada con gracia sin Supabase configurado. El placeholder es sintácticamente
// válido pero no apunta a ningún proyecto real — cualquier pedido real
// fallaría igual (y quedaría logueado), pero el build/arranque ya no explota.
export const supabase = createClient(supabaseUrl || "https://placeholder.supabase.co", supabaseAnonKey || "placeholder-anon-key", {
  auth: {
    flowType: "implicit",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
