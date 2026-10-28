import { describe, it, expect, vi } from "vitest";
import { computeHomeStats, fetchHomeStats } from "./homeStats";

const NOW = Date.UTC(2026, 9, 28, 12);
const hace = (dias) => new Date(NOW - dias * 864e5).toISOString();

describe("computeHomeStats", () => {
  it("cuenta activas, últimos 7 días y reencuentros, sin los ocultos", () => {
    const rows = [
      { resuelto: false, creado_en: hace(1) },
      { resuelto: false, creado_en: hace(10) },
      { resuelto: true, creado_en: hace(2) },
      { resuelto: false, creado_en: hace(0), oculto: true },
      { resuelto: false, creado_en: hace(6.9), oculto: false },
    ];
    expect(computeHomeStats(rows, NOW)).toEqual({ activas: 3, ultimos7: 3, reencuentros: 1 });
  });

  it("tolera vacío o basura", () => {
    expect(computeHomeStats(null, NOW)).toEqual({ activas: 0, ultimos7: 0, reencuentros: 0 });
    expect(computeHomeStats([null], NOW)).toEqual({ activas: 0, ultimos7: 0, reencuentros: 0 });
  });
});

describe("fetchHomeStats", () => {
  const env = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };
  const withEnv = async (fn) => {
    const prev = { ...process.env };
    Object.assign(process.env, env);
    try {
      return await fn();
    } finally {
      process.env = prev;
    }
  };

  it("pide solo 3 columnas y calcula", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ resuelto: false, creado_en: new Date().toISOString() }] }));
    const stats = await withEnv(() => fetchHomeStats({ fetchImpl }));
    expect(stats).toEqual({ activas: 1, ultimos7: 1, reencuentros: 0 });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://x.supabase.co/rest/v1/reports?select=resuelto,creado_en,oculto");
  });

  it("sin la columna oculto, reintenta sin ella", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 400 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
    expect(await withEnv(() => fetchHomeStats({ fetchImpl }))).toEqual({ activas: 0, ultimos7: 0, reencuentros: 0 });
    expect(fetchImpl.mock.calls[1][0]).toMatch(/select=resuelto,creado_en$/);
  });

  it("si falla la red o el servidor, null (la página carga igual)", async () => {
    expect(await withEnv(() => fetchHomeStats({ fetchImpl: async () => { throw new Error("red"); } }))).toBeNull();
    expect(await withEnv(() => fetchHomeStats({ fetchImpl: async () => ({ ok: false, status: 500 }) }))).toBeNull();
  });
});
