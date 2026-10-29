// Pruebas de punta a punta de las alertas (PLAN-alertas.md). Levanta
// "next dev" en otro puerto y simula red, sesión y permisos: no toca
// Supabase, Google ni ningún servicio real. Correr con: npm run test:e2e
const { defineConfig, devices } = require("@playwright/test");

const PORT = 3100;

module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  retries: 0,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/terminos`,
    reuseExistingServer: true,
    timeout: 180_000,
    // Clave pública VAPID de prueba (no es secreta y no sirve fuera de
    // estos tests): sin ella, activar las notificaciones falla con "no están
    // configuradas" en cualquier máquina sin la clave real en .env.local.
    // Next no pisa una variable que ya viene del entorno.
    env: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BMib94BBgB9XpJs4o6CE2uHqDGPQICXGbbmAbG9aLJonly_JqYti4dpCyMTMqsHD4w7xEfOtJ1W5nRi_pkQ2-38" },
  },
});
