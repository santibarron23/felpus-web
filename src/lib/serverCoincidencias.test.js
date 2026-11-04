import { describe, expect, it, vi } from "vitest";
import { makeReportesFuente, coincidenciasDe, reporteLiviano, CACHE_MS } from "./serverCoincidencias";
import { findMatches, matchBreakdown } from "./matchingScore";
import { candidatosParaComparar } from "./matching";
import { rowToReport } from "./reportFromRow";
import { pedirCoincidencias } from "./coincidenciasClient";

const emb = (x) => Array.from({ length: 8 }, (_, i) => (i === x ? 1 : 0.1));
function fila(over = {}) {
  return {
    id: "p1", tipo: "perdida", especie: "perro", nombre: "Rocky", color: "Negro", color_otro: null, tamano: "mediano",
    sexo: "Macho", edad: "Adulto", peso: "", zona: "Centro", lat_aprox: -24.78, lng_aprox: -65.41, fecha: "2026-11-01",
    descripcion: "Perro negro con collar rojo", foto_url: "https://x/p1.jpg", hist: null, embedding: emb(1),
    foto_urls: null, hists: null, embeddings: null, nickname: "Ana", resuelto: false, resuelto_por: null,
    resuelto_por_user_id: null, resuelto_en: null, creado_en: "2026-11-01T10:00:00Z", user_id: null,
    raza: "", detalles: {}, oculto: false, ciudad: "Salta", provincia: "Salta", inactivo: false, ...over,
  };
}
const FILAS = [
  fila(),
  fila({ id: "e1", tipo: "encontrada", embedding: emb(1), creado_en: "2026-11-02T10:00:00Z" }),
  fila({ id: "e2", tipo: "encontrada", color: "Blanco", embedding: emb(5), zona: "Norte", lat_aprox: -24.7, creado_en: "2026-11-03T10:00:00Z" }),
  fila({ id: "e3", tipo: "encontrada", especie: "gato" }),
  fila({ id: "oculto", tipo: "encontrada", oculto: true }),
];
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

describe("coincidenciasDe", () => {
  const lista = FILAS.filter((f) => !f.oculto).map(rowToReport);

  it("da el mismo resultado que el cálculo que hacía el navegador", () => {
    // El puntaje depende de la hora actual (días desde la pérdida): reloj fijo.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
    const p1 = lista[0];
    const antes = findMatches(p1, candidatosParaComparar(p1, lista), { limit: 6 });
    const ahora = coincidenciasDe(p1, lista, { limit: 6 });
    expect(antes.length).toBeGreaterThan(0);
    expect(ahora.coincidencias.map((m) => [m.id, m.score])).toEqual(antes.map((m) => [m.report.id, m.score]));
    expect(ahora.coincidencias[0].breakdown).toEqual(matchBreakdown(p1, antes[0].report));
    expect(ahora.coincidencias[0].distanceLabel).toBe(antes[0].distanceLabel);
    expect(ahora.hayCandidatos).toBe(true);
    vi.useRealTimers();
  });

  it("no manda los vectores de las fotos", () => {
    const { coincidencias } = coincidenciasDe(lista[0], lista);
    for (const m of coincidencias) {
      expect(m.report.embedding).toBeNull();
      expect(m.report.fotos.every((f) => f.embedding === null && f.hist === null)).toBe(true);
    }
    expect(reporteLiviano({ fotos: [{ url: "u", embedding: [1], hist: [1], dudosa: true }] }).fotos).toEqual([
      { url: "u", hist: null, embedding: null, dudosa: true },
    ]);
  });
});

describe("makeReportesFuente", () => {
  it("usa coordenadas aproximadas, saca ocultos y guarda en caché", async () => {
    let t = 0;
    const fetchImpl = vi.fn(async () => json(FILAS));
    const f = makeReportesFuente({ supabaseUrl: "https://s", anonKey: "anon", fetchImpl, now: () => t });
    const lista = await f.todos();
    expect(lista.map((r) => r.id)).not.toContain("oculto");
    expect(lista[0].lat).toBe(-24.78);
    expect(fetchImpl.mock.calls[0][0]).toContain("lat_aprox");
    expect(fetchImpl.mock.calls[0][0]).not.toMatch(/[,=]lat,/);
    await f.todos();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t = CACHE_MS + 1;
    await f.todos();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("un aviso recién publicado que no está en la caché se pide aparte", async () => {
    const fetchImpl = vi.fn(async (url) => (url.includes("id=eq.nuevo") ? json([fila({ id: "nuevo" })]) : json(url.includes("id=eq.") ? [] : FILAS)));
    const f = makeReportesFuente({ supabaseUrl: "https://s", anonKey: "anon", fetchImpl });
    expect((await f.uno("nuevo")).reporte.id).toBe("nuevo");
    expect((await f.uno("no-existe")).reporte).toBeNull();
  });

  it("si faltan columnas opcionales, reintenta con las básicas", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({}, 400)).mockResolvedValueOnce(json(FILAS));
    const f = makeReportesFuente({ supabaseUrl: "https://s", anonKey: "anon", fetchImpl });
    expect((await f.todos()).length).toBe(4);
    expect(fetchImpl.mock.calls[1][0]).not.toContain("detalles");
  });

  it("si Supabase falla, no deja la falla guardada en la caché", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({}, 500)).mockResolvedValueOnce(json(FILAS));
    const f = makeReportesFuente({ supabaseUrl: "https://s", anonKey: "anon", fetchImpl });
    await expect(f.todos()).rejects.toThrow();
    expect((await f.todos()).length).toBe(4);
  });
});

describe("pedirCoincidencias (navegador)", () => {
  it("usa el aviso que ya tiene cargado el navegador si existe", async () => {
    const local = { id: "e1", nombre: "local" };
    const fetchImpl = vi.fn(async () =>
      json({
        resultados: {
          p1: { hayCandidatos: true, coincidencias: [{ id: "e1", score: 0.9, report: { id: "e1", nombre: "server" } }, { id: "e9", score: 0.5, report: { id: "e9" } }] },
        },
      })
    );
    const out = await pedirCoincidencias(["p1", "p1", null], { reports: [local], fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ reportIds: ["p1"], limit: 6 });
    expect(out.p1.coincidencias[0].report).toBe(local);
    expect(out.p1.coincidencias[1].report).toEqual({ id: "e9" });
  });

  it("sin ids no llama al servidor; con error tira", async () => {
    const fetchImpl = vi.fn(async () => json({}, 503));
    expect(await pedirCoincidencias([], { fetchImpl })).toEqual({});
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(pedirCoincidencias(["p1"], { fetchImpl })).rejects.toThrow();
  });
});
