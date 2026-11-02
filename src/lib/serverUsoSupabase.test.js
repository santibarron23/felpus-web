import { describe, it, expect, vi } from "vitest";
import { revisarUso, projectRef, contarPorFuente, evaluarUso, UMBRAL_EVENTOS_HORA } from "./serverUsoSupabase";

const ENV = { SUPABASE_ACCESS_TOKEN: "sbp_test", NEXT_PUBLIC_SUPABASE_URL: "https://woqckndwnxdqcwbrvluj.supabase.co" };

function api(respuestas) {
  return vi.fn(async (url) => {
    const sql = new URL(url).searchParams.get("sql");
    const r = sql.includes("group by source") ? respuestas.fuentes : respuestas.rutas;
    if (r instanceof Error) return new Response("", { status: 500 });
    return Response.json(r);
  });
}

describe("serverUsoSupabase", () => {
  it("saca el ref del proyecto de la URL", () => {
    expect(projectRef(ENV.NEXT_PUBLIC_SUPABASE_URL)).toBe("woqckndwnxdqcwbrvluj");
    expect(projectRef("no es url")).toBeNull();
  });

  it("cuenta por servicio aunque n venga como texto", () => {
    const f = contarPorFuente({ result: [{ source: "postgres_logs", n: "10" }, { source: "edge_logs", n: 300 }, { source: "auth_logs", n: 0 }] });
    expect(f).toEqual([{ fuente: "edge_logs", n: 300 }, { fuente: "postgres_logs", n: 10 }]);
    expect(evaluarUso(f, 100)).toEqual({ total: 310, alto: true });
  });

  it("sin token no consulta nada", async () => {
    const fetchImpl = vi.fn();
    expect(await revisarUso({ env: { NEXT_PUBLIC_SUPABASE_URL: ENV.NEXT_PUBLIC_SUPABASE_URL }, fetchImpl })).toEqual({ configurado: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uso normal: una sola consulta, sin alerta", async () => {
    const fetchImpl = api({ fuentes: { result: [{ source: "edge_logs", n: 400 }] } });
    const r = await revisarUso({ env: ENV, now: Date.parse("2026-11-02T22:00:00Z"), fetchImpl });
    expect(r).toMatchObject({ configurado: true, total: 400, alto: false });
    expect(r.alerta).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.pathname).toBe("/v1/projects/woqckndwnxdqcwbrvluj/analytics/endpoints/logs");
    expect(url.searchParams.get("iso_timestamp_start")).toBe("2026-11-02T21:00:00.000Z");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer sbp_test");
  });

  it("pico: alerta con servicios y rutas más pedidas", async () => {
    const fetchImpl = api({
      fuentes: { result: [{ source: "edge_logs", n: 250000 }, { source: "postgres_logs", n: 1200 }] },
      rutas: { result: [{ metodo: "GET", ruta: "/rest/v1/reports", estado: "401", n: 240000 }] },
    });
    const r = await revisarUso({ env: ENV, fetchImpl });
    expect(r.alto).toBe(true);
    expect(r.alerta.firma).toBe("uso:logs");
    expect(r.alerta.detalle).toContain("GET /rest/v1/reports (401)");
    expect(r.alerta.detalle).toContain("edge_logs");
  });

  it("si falla la consulta de rutas, la alerta sale igual", async () => {
    const fetchImpl = api({ fuentes: { result: [{ source: "edge_logs", n: UMBRAL_EVENTOS_HORA }] }, rutas: new Error("x") });
    const r = await revisarUso({ env: ENV, fetchImpl });
    expect(r.alto).toBe(true);
    expect(r.rutas).toEqual([]);
  });

  it("umbral configurable y errores de la API con mensaje claro", async () => {
    const fetchImpl = api({ fuentes: { result: [{ source: "edge_logs", n: 600 }] } });
    expect((await revisarUso({ env: { ...ENV, USO_ALERTA_EVENTOS_HORA: "500" }, fetchImpl })).alto).toBe(true);
    const roto = vi.fn(async () => new Response("", { status: 403 }));
    await expect(revisarUso({ env: ENV, fetchImpl: roto })).rejects.toThrow("Management API 403");
    const conError = vi.fn(async () => Response.json({ result: [], error: "sintaxis" }));
    await expect(revisarUso({ env: ENV, fetchImpl: conError })).rejects.toThrow("Management API: sintaxis");
  });
});
