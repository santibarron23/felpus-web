import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PATCH, ownerFilter } from "./route";

const TOKEN = "123e4567-e89b-12d3-a456-426614174000";
const ROW = { foto_url: "a", foto_urls: ["a", "b"], hist: [1], hists: [[1], [2]], embedding: null, embeddings: null };

function request(body, auth = null) {
  return new Request("http://localhost/api/reports/edit", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: JSON.stringify(body),
  });
}

describe("ownerFilter", () => {
  it("por cuenta, por token o cualquiera de los dos", () => {
    expect(ownerFilter("u1", null)).toBe("or=(user_id.eq.u1)");
    expect(ownerFilter(null, TOKEN)).toBe(`or=(push_token.eq.${TOKEN})`);
    expect(ownerFilter("u1", TOKEN)).toBe(`or=(user_id.eq.u1,push_token.eq.${TOKEN})`);
    expect(ownerFilter(null, null)).toBeNull();
  });
});

describe("PATCH /api/reports/edit", () => {
  let calls;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    calls = [];
  });
  afterEach(() => vi.unstubAllGlobals());

  // ownsRow: si la base encuentra la fila con el filtro de dueño.
  function stubFetch({ userId = null, ownsRow = true, row = ROW } = {}) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init = {}) => {
        calls.push({ url: decodeURIComponent(String(url)), method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
        if (String(url).endsWith("/auth/v1/user")) return userId ? Response.json({ id: userId, email: "a@b.c" }) : new Response("", { status: 401 });
        if ((init.method || "GET") === "GET") return Response.json(ownsRow ? [row] : []);
        return Response.json(ownsRow ? [{ id: "r1" }] : []);
      })
    );
  }
  const patchCall = () => calls.find((c) => c.method === "PATCH");

  it("sin sesión ni token, no deja editar", async () => {
    stubFetch();
    const res = await PATCH(request({ reportId: "r1", fields: { nombre: "X" } }));
    expect(res.status).toBe(401);
    expect(patchCall()).toBeUndefined();
  });

  it("el dueño con sesión edita, filtrando por su cuenta en la base", async () => {
    stubFetch({ userId: "u1" });
    const res = await PATCH(request({ reportId: "r1", fields: { nombre: " Morena ", user_id: "hack", contacto_whatsapp: "1" } }, "sesion"));
    expect(res.status).toBe(200);
    expect(patchCall().url).toContain("id=eq.r1&or=(user_id.eq.u1)");
    expect(patchCall().body).toEqual({ nombre: "Morena" });
  });

  it("un invitado edita con el token de su dispositivo", async () => {
    stubFetch();
    const res = await PATCH(request({ reportId: "r1", pushToken: TOKEN, fields: { zona: "Centro" }, fotoOrder: ["b", "a"] }));
    expect(res.status).toBe(200);
    expect(patchCall().url).toContain(`or=(push_token.eq.${TOKEN})`);
    expect(patchCall().body).toMatchObject({ zona: "Centro", foto_urls: ["b", "a"], foto_url: "b" });
  });

  it("si el aviso no es suyo, la base no lo encuentra y responde 403", async () => {
    stubFetch({ userId: "otra", ownsRow: false });
    const res = await PATCH(request({ reportId: "r1", fields: { nombre: "X" } }, "sesion"));
    expect(res.status).toBe(403);
  });

  it("no deja cambiar perdida/encontrada", async () => {
    stubFetch({ userId: "u1" });
    const res = await PATCH(request({ reportId: "r1", fields: { tipo: "encontrada" } }, "sesion"));
    expect(res.status).toBe(400);
    expect(patchCall()).toBeUndefined();
  });

  it("descarta un token con formato inválido (no se inyecta en el filtro)", async () => {
    stubFetch();
    const res = await PATCH(request({ reportId: "r1", pushToken: "x),user_id.not.is.null,(", fields: { nombre: "X" } }));
    expect(res.status).toBe(401);
    expect(patchCall()).toBeUndefined();
  });

  it("guarda la respuesta de los consejos sumándola a detalles", async () => {
    stubFetch({ row: { ...ROW, detalles: { comportamientos: ["se_acerca"] } } });
    const res = await PATCH(request({ reportId: "r1", pushToken: TOKEN, consejo: { clave: "ante_desconocidos", valor: "miedoso" } }));
    expect(res.status).toBe(200);
    expect(patchCall().url).toContain(`or=(push_token.eq.${TOKEN})`);
    expect(patchCall().body).toEqual({ detalles: { comportamientos: ["se_acerca"], ante_desconocidos: "miedoso" } });
  });

  it("rechaza una respuesta de consejos que no está en la lista", async () => {
    stubFetch({ userId: "u1" });
    for (const consejo of [{ clave: "avistamiento", valor: true }, { clave: "sale_de_casa", valor: "x" }, null]) {
      const res = await PATCH(request({ reportId: "r1", consejo }, "sesion"));
      expect(res.status).toBe(400);
    }
    expect(patchCall()).toBeUndefined();
  });

  it("respuesta de consejos en un aviso ajeno: 403", async () => {
    stubFetch({ userId: "otra", ownsRow: false });
    const res = await PATCH(request({ reportId: "r1", consejo: { clave: "sale_de_casa", valor: "interior" } }, "sesion"));
    expect(res.status).toBe(403);
    expect(patchCall()).toBeUndefined();
  });
});
