import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/log", () => ({ logError: vi.fn() }));
vi.mock("../../../lib/serverAiRateLimit", () => ({ makeAiRateLimit: () => async () => true }));

const base = { especie: "perro", color: "Negro", tamano: "mediano", zona: "Centro", lat_aprox: -24.78, lng_aprox: -65.41, descripcion: "", embedding: [1, 0, 0] };
const FILAS = [
  { ...base, id: "p1", tipo: "perdida", fecha: "2026-11-01", creado_en: "2026-11-01T10:00:00Z", foto_url: "u1" },
  { ...base, id: "e1", tipo: "encontrada", fecha: "2026-11-02", creado_en: "2026-11-02T10:00:00Z", foto_url: "u2" },
];
const respuesta = (b) => new Response(JSON.stringify(b), { status: 200 });

function req(body, headers = {}) {
  return new Request("https://felpus.com/api/coincidencias", {
    method: "POST",
    headers: { "Content-Type": "application/json", host: "felpus.com", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/coincidencias", () => {
  let POST;
  beforeEach(async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://s.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    vi.stubGlobal("fetch", vi.fn(async (url) => respuesta(String(url).includes("id=eq.") ? [] : FILAS)));
    ({ POST } = await import("./route"));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("devuelve las coincidencias con puntaje y desglose, sin vectores", async () => {
    const res = await POST(req({ reportIds: ["p1"] }));
    expect(res.status).toBe(200);
    const { resultados } = await res.json();
    expect(resultados.p1.hayCandidatos).toBe(true);
    const m = resultados.p1.coincidencias[0];
    expect(m.id).toBe("e1");
    expect(m.score).toBeGreaterThan(0.15);
    expect(Array.isArray(m.breakdown)).toBe(true);
    expect(m.report.embedding).toBeNull();
  });

  it("valida los ids y el tamaño del pedido", async () => {
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req({ reportIds: ["a b"] }))).status).toBe(400);
    expect((await POST(req({ reportIds: Array.from({ length: 11 }, (_, i) => `r${i}`) }))).status).toBe(400);
  });

  it("frena pedidos desde otros sitios", async () => {
    expect((await POST(req({ reportIds: ["p1"] }, { origin: "https://clon.example" }))).status).toBe(403);
  });

  it("un aviso inexistente no aparece en los resultados", async () => {
    const res = await POST(req({ reportIds: ["no-existe"] }));
    expect((await res.json()).resultados).toEqual({});
  });
});
