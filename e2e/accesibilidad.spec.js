// Accesibilidad (WCAG 2.2 AA, axe) de las pantallas principales, y los
// flujos que una persona sin experiencia tiene que poder completar sola:
// guía de primera vez, publicar y ver la confirmación, y editar su aviso.
// La red está simulada: nada llega a Supabase ni a servicios reales.
// Correr con: npm run test:e2e
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const TOKEN = "123e4567-e89b-12d3-a456-426614174000";

function supabaseUrl() {
  try {
    const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
    return env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim() || "https://placeholder.supabase.co";
  } catch {
    return "https://placeholder.supabase.co";
  }
}

// Una foto JPEG real (1x1) para las fotos simuladas.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64"
);

function fakeRow(i, extra = {}) {
  const foto = `${supabaseUrl()}/storage/v1/object/public/felpus-photos/e2e-${i}.jpg`;
  return {
    id: `e2e-${i}`,
    tipo: i % 2 ? "encontrada" : "perdida",
    especie: "perro",
    nombre: i === 0 ? "Luna" : "",
    color: "Negro",
    color_otro: null,
    tamano: "mediano",
    sexo: "Hembra",
    edad: "",
    peso: "",
    zona: "Tres Cerritos",
    ciudad: "Salta",
    provincia: "Salta",
    lat_aprox: -24.772 - i * 0.004,
    lng_aprox: -65.404,
    fecha: "2026-10-28",
    descripcion: "Perra negra, mediana, con collar rojo.",
    foto_url: foto,
    foto_urls: [foto],
    nickname: "Vecina",
    resuelto: false,
    resuelto_por: null,
    resuelto_por_user_id: null,
    resuelto_en: null,
    creado_en: new Date(Date.now() - i * 3600e3).toISOString(),
    user_id: null,
    raza: "",
    detalles: {},
    oculto: false,
    inactivo: false,
    ...extra,
  };
}

// Sesión simulada (supabase-js la lee de localStorage, clave sb-<ref>-auth-token).
const ADMIN_USER = { id: "00000000-0000-4000-8000-0000000000ad", aud: "authenticated", role: "authenticated", email: "santiagobarronlf@gmail.com", app_metadata: {}, user_metadata: {} };
function sesion(user) {
  return { access_token: "e2e-token", refresh_token: "e2e-refresh", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user };
}

async function setup(page, { rows = [fakeRow(0), fakeRow(1), fakeRow(2)], tokens = {}, user = null } = {}) {
  const calls = { created: [], edits: [], admin: [], uploads: [] };
  await page.addInitScript(
    ({ tokens, key, session }) => {
      try {
        localStorage.setItem("felpus_install_dismissed_until", String(Date.now() + 864e5));
        localStorage.setItem("felpus_report_tokens", JSON.stringify(tokens));
        if (session) localStorage.setItem(key, JSON.stringify(session));
      } catch {
        // sin storage
      }
    },
    { tokens, key: `sb-${new URL(supabaseUrl()).hostname.split(".")[0]}-auth-token`, session: user ? sesion(user) : null }
  );
  await page.route(/supabase\.co|googleapis\.com|gstatic\.com|google-analytics|googletagmanager|accounts\.google\.com|openstreetmap|tile\./, (route) => {
    const url = route.request().url();
    // Con CORS, como el bucket real: el recortador del admin lee la foto en un canvas.
    if (/\/storage\/v1\/object\/public\//.test(url) || /tile|openstreetmap/.test(url))
      return route.fulfill({ contentType: "image/jpeg", body: JPEG, headers: { "Access-Control-Allow-Origin": "*" } });
    if (/\/storage\/v1\/object\//.test(url)) {
      calls.uploads.push(url);
      return route.fulfill({ json: { Key: "felpus-photos/x.jpg", Id: "x" } });
    }
    if (/\/auth\/v1\/user/.test(url)) return user ? route.fulfill({ json: user }) : route.fulfill({ status: 401, json: {} });
    if (/\/rest\/v1\/rpc\/admin_metrics/.test(url)) return route.fulfill({ json: [{ total: rows.length }] });
    if (/\/rest\/v1\/reports\?select=id,hist/.test(url)) return route.fulfill({ json: [] });
    if (/\/rest\/v1\/reports/.test(url)) return route.fulfill({ json: rows });
    return route.fulfill({ status: 200, json: [] });
  });
  // Rutas propias que guardan algo: simuladas.
  await page.route("**/api/create-report", (route) => {
    calls.created.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, pushToken: TOKEN } });
  });
  await page.route("**/api/admin/report", (route) => {
    calls.admin.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, changed: 1 } });
  });
  await page.route("**/api/reports/edit", (route) => {
    calls.edits.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, changed: 1 } });
  });
  await page.route(/\/api\/(embed|photo-check|import-post|log-error|report-contact|chat)/, (route) =>
    route.fulfill({ status: 503, json: { error: "simulado" } })
  );
  return calls;
}

async function axe(page, include) {
  let b = new AxeBuilder({ page }).withTags(WCAG);
  if (include) b = b.include(include);
  const r = await b.analyze();
  return r.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} — ${n.any[0]?.message || v.help}`));
}

test.describe("accesibilidad (axe, WCAG 2.2 AA)", () => {
  test("inicio con la tarjeta de primera vez", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "¿Es tu primera vez en Felpus?" })).toBeVisible();
    expect(await axe(page)).toEqual([]);
  });

  test("guía de 3 pasos", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Conocer cómo funciona" }).click();
    const dialog = page.getByRole("dialog", { name: "Buscá mascotas" });
    await expect(dialog).toBeVisible();
    expect(await axe(page, '[role="dialog"]')).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("formulario de reporte", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Perdí a mi mascota/ }).click();
    await expect(page.getByRole("button", { name: "¿Necesitás ayuda?" })).toBeVisible();
    expect(await axe(page, "main")).toEqual([]);
  });

  test("explorar y ficha de una mascota", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Ver mascotas reportadas" }).click();
    await expect(page.getByText("Luna").first()).toBeVisible();
    expect(await axe(page, "main")).toEqual([]);
    await page.getByText("Luna").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await axe(page, '[role="dialog"]')).toEqual([]);
  });

  for (const ruta of ["/sobre", "/privacidad", "/terminos"]) {
    test(`página ${ruta}`, async ({ page }) => {
      await setup(page);
      await page.goto(ruta);
      expect(await axe(page)).toEqual([]);
    });
  }
});

// Flujos completos, como los haría alguien por primera vez.
test.describe("flujos", () => {
  test("publicar: confirmación clara con ver, compartir y volver", async ({ page }) => {
    const calls = await setup(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Perdí a mi mascota/ }).click();
    await page.locator("#foto-input").setInputFiles({ name: "luna.jpg", mimeType: "image/jpeg", buffer: JPEG });
    await expect(page.getByText("Principal").or(page.getByRole("button", { name: "Quitar la foto 1" })).first()).toBeVisible();
    await page.locator("#form-zona").fill("Tres Cerritos");
    await page.locator("#form-color").selectOption("Negro");
    await page.locator("#apodo-input").fill("Vecina");
    await page.locator("#form-contacto-email").fill("vecina@example.com");
    await page.getByRole("button", { name: "Publicar y buscar coincidencias" }).click();

    const listo = page.getByRole("heading", { name: "¡Listo! Tu aviso ya está publicado." });
    await expect(listo).toBeVisible({ timeout: 20_000 });
    expect(calls.created).toHaveLength(1);
    // El aviso de alertas (si el navegador soporta push) se cierra primero.
    const optIn = page.getByRole("dialog");
    if (await optIn.isVisible().catch(() => false)) await page.keyboard.press("Escape");
    await expect(listo).toBeFocused();
    await expect(page.getByRole("link", { name: "Compartir por WhatsApp" })).toHaveAttribute("href", /api\.whatsapp\.com\/send/);
    await expect(page.getByRole("button", { name: "Ver mi aviso" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Volver al inicio" })).toBeVisible();
    await expect(page.getByText("Te escribimos por email solo si aparece una coincidencia muy probable.")).toBeVisible();
    expect(await axe(page, "main")).toEqual([]);
  });

  test("foto movida: avisa sin frenar; una nítida no", async ({ page }) => {
    const sharp = require("sharp");
    const W = 600;
    const H = 450;
    // Degradé suave (como una foto movida) y un damero de bordes nítidos.
    const raw = (f) => {
      const b = Buffer.alloc(W * H * 3);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b.fill(f(x, y), (y * W + x) * 3, (y * W + x) * 3 + 3);
      return sharp(b, { raw: { width: W, height: H, channels: 3 } }).jpeg().toBuffer();
    };
    const movida = await raw((x, y) => 90 + Math.round((x + y) / 12));
    const nitida = await raw((x, y) => (((x >> 3) + (y >> 3)) % 2 ? 220 : 40));
    await setup(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Perdí a mi mascota/ }).click();
    const aviso = page.getByText(/parece movida o fuera de foco/);

    await page.locator("#foto-input").setInputFiles({ name: "nitida.jpg", mimeType: "image/jpeg", buffer: nitida });
    await expect(page.getByRole("button", { name: "Quitar la foto 1" })).toBeVisible();
    await expect(aviso).toHaveCount(0);

    await page.locator("#foto-input").setInputFiles({ name: "movida.jpg", mimeType: "image/jpeg", buffer: movida });
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText("podés publicar igual");
  });

  test("un invitado edita su aviso desde el mismo dispositivo", async ({ page }) => {
    const calls = await setup(page, { tokens: { "e2e-0": TOKEN } });
    await page.goto("/");
    await page.getByRole("button", { name: "Ver mascotas reportadas" }).click();
    await page.getByText("Luna").first().click();
    await page.getByRole("button", { name: "Editar mi aviso" }).click();
    const dialog = page.getByRole("dialog", { name: "Editar mi aviso" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Tipo")).toHaveCount(0);
    expect(await axe(page, '[aria-labelledby="admin-edit-title"]')).toEqual([]);
    await dialog.getByLabel("Nombre").fill("Luna Negra");
    await dialog.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Listo, tu aviso quedó actualizado.")).toBeVisible();
    expect(calls.edits).toHaveLength(1);
    expect(calls.edits[0]).toMatchObject({ reportId: "e2e-0", pushToken: TOKEN, fields: { nombre: "Luna Negra" } });
    expect(calls.edits[0].fields.tipo).toBeUndefined();
  });

  test("en un aviso ajeno no aparece Editar", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Ver mascotas reportadas" }).click();
    await page.getByText("Luna").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar mi aviso" })).toHaveCount(0);
  });

  test("recortar una foto al cargarla (mouse y teclado)", async ({ page }) => {
    const sharp = require("sharp");
    // Foto de 800x600 para que el recorte cambie las medidas.
    const foto = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 120, g: 90, b: 60 } } }).jpeg().toBuffer();
    await setup(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Perdí a mi mascota/ }).click();
    await page.locator("#foto-input").setInputFiles({ name: "luna.jpg", mimeType: "image/jpeg", buffer: foto });
    const miniatura = page.getByRole("img", { name: /Foto 1 de la mascota/ });
    await expect(miniatura).toBeVisible();
    const antes = await miniatura.getAttribute("src");

    await page.getByRole("button", { name: "Recortar la foto 1" }).click();
    const dialog = page.getByRole("dialog", { name: "Recortar la foto" });
    await expect(dialog).toBeVisible();
    expect(await axe(page, '[aria-labelledby="cropper-title"]')).toEqual([]);
    // Teclado: el recuadro arranca con el foco; Shift+flechas lo achican.
    const marco = dialog.getByRole("group", { name: /Recuadro de recorte/ });
    await expect(marco).toBeFocused();
    for (let i = 0; i < 10; i++) await page.keyboard.press("Shift+ArrowLeft");
    await expect(marco).toHaveAttribute("aria-label", /70 % de ancho/);
    await dialog.getByRole("button", { name: "Recortar", exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(miniatura).not.toHaveAttribute("src", antes);
    const ancho = await miniatura.evaluate((img) => new Promise((r) => (img.complete ? r(img.naturalWidth) : (img.onload = () => r(img.naturalWidth)))));
    expect(ancho).toBeLessThan(800);
  });

  test("el admin recorta y saca fotos de una publicación", async ({ page }) => {
    const B = `${supabaseUrl()}/storage/v1/object/public/felpus-photos/`;
    const conDosFotos = fakeRow(0, { foto_urls: [`${B}e2e-0-a.jpg`, `${B}e2e-0-b.jpg`], foto_url: `${B}e2e-0-a.jpg` });
    const calls = await setup(page, { rows: [conDosFotos, fakeRow(1)], user: ADMIN_USER });
    await page.goto("/");
    await page.getByRole("button", { name: "Panel de administrador" }).click();
    await page.getByRole("button", { name: "Reportes", exact: true }).click();
    await page.getByRole("button", { name: "Editar publicación", exact: true }).first().click();
    const editor = page.getByRole("dialog", { name: "Editar publicación" });
    await expect(editor).toBeVisible();

    await editor.getByRole("button", { name: "Quitar la foto 2" }).click();
    await expect(editor.getByRole("button", { name: "Quitar la foto 1" })).toBeDisabled();
    await editor.getByRole("button", { name: "Recortar la foto 1" }).click();
    const cropper = page.getByRole("dialog", { name: "Recortar la foto" });
    await expect(cropper.getByRole("button", { name: "Recortar", exact: true })).toBeEnabled();
    await page.keyboard.press("Shift+ArrowUp");
    await cropper.getByRole("button", { name: "Recortar", exact: true }).click();
    await expect(editor.getByText("Recortada")).toBeVisible();
    await editor.getByRole("button", { name: "Guardar cambios" }).click();

    await expect.poll(() => calls.admin.length).toBe(1);
    const fotos = calls.admin[0].fotos;
    expect(fotos).toHaveLength(1);
    expect(fotos[0].url).toMatch(/felpus-photos\/e2e-0-r-[0-9a-f-]{36}\.jpg$/);
    expect(Array.isArray(fotos[0].hist)).toBe(true);
    expect(calls.uploads.some((u) => /felpus-photos\/e2e-0-r-/.test(u))).toBe(true);
  });
});
