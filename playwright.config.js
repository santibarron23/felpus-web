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
  },
});
