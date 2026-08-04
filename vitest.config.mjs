import { defineConfig, loadEnv } from "vite";

// Vitest (a diferencia de "next dev"/"next build") no carga .env.local
// solo — matching.js importa log.js, que ahora importa supabaseClient.js
// (para loguear errores a Supabase), y ese archivo llama a createClient()
// al importarse. Sin las env vars cargadas acá, createClient("", "") tira
// una excepción synchronous ("supabaseUrl is required") apenas se importa
// matching.js en los tests, aunque los tests en sí no usen Supabase para
// nada. Esto reusa el mismo .env.local que ya usa "next dev".
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return { test: { environment: "node" } };
});
