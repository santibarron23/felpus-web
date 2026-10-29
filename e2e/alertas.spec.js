// Alertas automáticas: permiso, zona y modales, con la red simulada.
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

// supabase-js guarda la sesión en localStorage con la clave
// sb-<ref>-auth-token (ref = subdominio del proyecto).
function storageKey() {
  let url = "https://placeholder.supabase.co";
  try {
    const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
    url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim() || url;
  } catch {
    // sin .env.local: cliente placeholder
  }
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

const FAKE_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "e2e@felpus.test",
  app_metadata: {},
  user_metadata: {},
};
const FAKE_SESSION = {
  access_token: "e2e-token",
  refresh_token: "e2e-refresh",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 4102444800, // año 2100
  user: FAKE_USER,
};

// Permisos y push simulados: el navegador de prueba no habla con ningún
// servicio de push real.
async function setup(page, { loggedIn = true, permission = "default", zone = null } = {}) {
  const calls = { zonePut: [], subscribe: [] };
  await page.addInitScript(
    ({ key, session, loggedIn, permission }) => {
      try {
        if (loggedIn) localStorage.setItem(key, JSON.stringify(session));
        localStorage.setItem("felpus_install_dismissed_until", String(Date.now() + 864e5));
      } catch {
        // sin storage
      }
      let perm = permission;
      const FakeNotification = function () {};
      Object.defineProperty(FakeNotification, "permission", { get: () => perm });
      FakeNotification.requestPermission = async () => {
        if (perm === "default") perm = "granted";
        return perm;
      };
      window.Notification = FakeNotification;
      if (!("PushManager" in window)) window.PushManager = function () {};
      let sub = null;
      const pushManager = {
        getSubscription: async () => sub,
        subscribe: async () => {
          sub = {
            endpoint: "https://push.example.test/e2e",
            toJSON: () => ({ endpoint: "https://push.example.test/e2e", keys: { p256dh: "BPe2e", auth: "e2eauth" } }),
            unsubscribe: async () => {
              sub = null;
              return true;
            },
          };
          return sub;
        },
      };
      const registration = { pushManager, showNotification: async () => {} };
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
          ready: Promise.resolve(registration),
          getRegistration: async () => registration,
          register: async () => registration,
          addEventListener: () => {},
          removeEventListener: () => {},
          controller: null,
        },
      });
    },
    { key: storageKey(), session: FAKE_SESSION, loggedIn, permission }
  );

  // Nada sale a servicios reales.
  await page.route(/supabase\.co|googleapis\.com|gstatic\.com|google-analytics|googletagmanager|accounts\.google\.com/, (route) => {
    if (/\/auth\/v1\/user/.test(route.request().url())) return route.fulfill({ json: FAKE_USER });
    return route.fulfill({ status: 200, json: [] });
  });
  await page.route("**/api/alerts/zone", async (route) => {
    if (route.request().method() === "PUT") {
      calls.zonePut.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { zone } });
  });
  await page.route("**/api/push/subscribe", (route) => {
    calls.subscribe.push({ method: route.request().method(), body: route.request().postDataJSON() });
    return route.fulfill({ json: { ok: true } });
  });
  return calls;
}

test.describe("Configuración de alertas", () => {
  test("sin sesión pide iniciar sesión", async ({ page }) => {
    await setup(page, { loggedIn: false });
    await page.goto("/configuracion/alertas");
    await expect(page.getByRole("button", { name: "Iniciar sesión con Google" })).toBeVisible();
  });

  test("guarda la zona con radio, especies y tipos", async ({ page }) => {
    const calls = await setup(page);
    await page.goto("/configuracion/alertas?lat=-24.78&lng=-65.41");
    await expect(page.getByRole("heading", { name: "Tu zona", exact: true })).toBeVisible();
    await page.getByText("5 km", { exact: true }).click();
    await page.getByLabel("Gatos").uncheck();
    await page.getByLabel("Encontradas").uncheck();
    await page.getByRole("button", { name: "Guardar mi zona" }).click();
    // Hay dos zonas de estado (la de la zona y la del dispositivo).
    await expect(page.getByRole("status").filter({ hasText: "Guardado" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Zona guardada" })).toBeVisible();
    expect(calls.zonePut).toHaveLength(1);
    expect(calls.zonePut[0]).toMatchObject({
      lat: -24.78,
      lng: -65.41,
      radius_m: 5000,
      species: ["perro"],
      report_types: ["perdida"],
      active: true,
    });
  });

  test("pausar todas las alertas guarda active=false", async ({ page }) => {
    const calls = await setup(page, {
      zone: { lat: -24.78, lng: -65.41, radius_m: 3000, species: ["perro"], report_types: ["perdida"], active: true },
    });
    await page.goto("/configuracion/alertas");
    await page.getByRole("switch", { name: "Pausar todas las alertas" }).check();
    // Con una zona ya guardada el botón dice "Guardar cambios" (42fb87f).
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("status").filter({ hasText: "pausa" })).toBeVisible();
    expect(calls.zonePut[0]).toMatchObject({ active: false, radius_m: 3000 });
  });

  test("acepta el permiso y guarda el dispositivo; después se puede desactivar", async ({ page }) => {
    const calls = await setup(page);
    await page.goto("/configuracion/alertas");
    await page.getByRole("button", { name: "Activar notificaciones en este dispositivo" }).click();
    await expect(page.getByRole("status").filter({ hasText: "este dispositivo va a recibir" })).toBeVisible();
    expect(calls.subscribe[0]).toMatchObject({ method: "POST", body: { subscription: { endpoint: "https://push.example.test/e2e" } } });
    await page.getByRole("button", { name: "Desactivar notificaciones en este dispositivo" }).click();
    await expect(page.getByRole("status").filter({ hasText: "ya no va a recibir" })).toBeVisible();
    expect(calls.subscribe[1]).toMatchObject({ method: "DELETE", body: { endpoint: "https://push.example.test/e2e" } });
  });

  test("si el permiso está bloqueado no insiste", async ({ page }) => {
    await setup(page, { permission: "denied" });
    await page.goto("/configuracion/alertas");
    await expect(page.getByText("Bloqueaste las notificaciones")).toBeVisible();
    await expect(page.getByRole("button", { name: /Activar notificaciones/ })).toHaveCount(0);
  });

  test("accesibilidad (axe)", async ({ page }) => {
    await setup(page);
    await page.goto("/configuracion/alertas?lat=-24.78&lng=-65.41");
    await expect(page.getByRole("heading", { name: "Tu zona", exact: true })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} — ${n.any[0]?.message || v.help}`))).toEqual([]);
  });
});

test.describe("Aviso después de publicar", () => {
  for (const [tipo, texto] of [
    ["perdida", "¿Querés que te avisemos al instante si alguien reporta un animal parecido?"],
    ["encontrada", "Te avisamos si aparece el dueño."],
  ]) {
    test(`modal de ${tipo}: texto, foco, Escape y axe`, async ({ page }) => {
      await setup(page);
      await page.goto("/dev/test-push");
      await page.getByRole("button", { name: `Ver aviso (${tipo})` }).click();
      const dialog = page.getByRole("dialog", { name: texto });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Sí, avisame" })).toBeFocused();
      const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
      expect(results.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} — ${n.any[0]?.message || v.help}`))).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    });
  }
});
