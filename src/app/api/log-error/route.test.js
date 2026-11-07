import { beforeEach, describe, expect, it, vi } from "vitest";

// Supabase falso: registra cada operación (tabla + método) para contar
// cuántos pedidos hace la ruta por cada error.
const ops = [];
function query(table) {
  const q = {
    delete: () => (ops.push(`${table}.delete`), q),
    select: () => (ops.push(`${table}.select`), q),
    insert: () => (ops.push(`${table}.insert`), Promise.resolve({ error: null })),
    lt: () => Promise.resolve({ error: null }),
    eq: () => q,
    gt: () => Promise.resolve({ count: 0, error: null }),
    gte: () => q,
    limit: () => Promise.resolve({ data: [], error: null }),
  };
  return q;
}
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: query }) }));
vi.mock("../../../lib/serverAdminAlerts", () => ({
  alertarAdmin: vi.fn(),
  esRuido: () => true,
  evaluarError: () => null,
  PICO_VENTANA_MIN: 10,
}));

function req(headers = {}) {
  return new Request("https://felpus.com/api/log-error", {
    method: "POST",
    headers: { "Content-Type": "application/json", host: "felpus.com", "x-forwarded-for": "200.1.2.3", ...headers },
    body: JSON.stringify({ message: "Error de prueba" }),
  });
}

describe("POST /api/log-error", () => {
  let POST;
  beforeEach(async () => {
    ops.length = 0;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://s.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    ({ POST } = await import("./route"));
  });

  it("la mayoría de las veces no poda: 3 pedidos a la base por error", async () => {
    const res = await POST(req(), { random: () => 0.9 });
    expect(res.status).toBe(200);
    expect(ops).toEqual(["error_log_submissions.select", "error_log_submissions.insert", "error_logs.insert"]);
  });

  it("de vez en cuando poda las dos tablas", async () => {
    await POST(req(), { random: () => 0.01 });
    expect(ops).toContain("error_log_submissions.delete");
    expect(ops).toContain("error_logs.delete");
  });

  it("frena pedidos que vienen de otro sitio", async () => {
    const res = await POST(req({ origin: "https://otro.example" }), { random: () => 0.9 });
    expect(res.status).toBe(403);
    expect(ops).toEqual([]);
  });

  it("sigue exigiendo JSON", async () => {
    const res = await POST(req({ "Content-Type": "text/plain" }), { random: () => 0.9 });
    expect(res.status).toBe(415);
  });
});
