import { describe, it, expect } from "vitest";
import { computeImpactMetrics } from "./impactMetrics";

const DIA = 86_400_000;
const NOW = new Date(2026, 9, 29, 12).getTime(); // 29 oct 2026
const hace = (d) => NOW - d * DIA;

function r(id, extra) {
  return { id, tipo: "perdida", especie: "perro", resuelto: false, oculto: false, creadoEn: hace(1), detalles: {}, ...extra };
}

// Matcher simulado: solo los pares que se le indican, con su puntaje.
const matcher = (pares) => (report, candidatos) =>
  candidatos.filter((c) => pares[`${report.id}-${c.id}`] || pares[`${c.id}-${report.id}`]).map((c) => ({ report: c, score: pares[`${report.id}-${c.id}`] || pares[`${c.id}-${report.id}`] }));

describe("computeImpactMetrics", () => {
  const reports = [
    r("p1", { creadoEn: hace(60), resuelto: true, resueltoEn: hace(56) }), // volvió en 4 días
    r("p2", { creadoEn: hace(45), resuelto: true, resueltoEn: hace(35) }), // en 10 días (septiembre)
    r("p3", { creadoEn: hace(40) }), // sin novedades
    r("p4", { creadoEn: hace(2) }),
    r("e1", { tipo: "encontrada", creadoEn: hace(3), resuelto: true, resueltoEn: hace(1) }),
    r("e2", { tipo: "encontrada", creadoEn: hace(5) }),
    r("a1", { tipo: "encontrada", creadoEn: hace(1), detalles: { avistamiento: true } }),
    r("oculto", { oculto: true, resuelto: true, resueltoEn: hace(1) }),
  ];
  const m = computeImpactMetrics(reports, { now: NOW, matcher: matcher({ "p4-e2": 0.8, "p3-a1": 0.3 }) });

  it("cuenta avisos por tipo y deja afuera los ocultos", () => {
    expect(m.avisos).toEqual({ total: 7, perdidas: 4, encontradas: 2, avistamientos: 1 });
  });

  it("reencuentros: total, últimos 30 días y por mes", () => {
    expect(m.reencuentros.total).toBe(3);
    expect(m.reencuentros.ultimos30).toBe(1);
    expect(m.reencuentros.perdidasQueVolvieron).toBe(2);
    expect(m.reencuentros.encontradasDevueltas).toBe(1);
    expect(m.reencuentros.porMes.map((x) => x.label)).toEqual(["may", "jun", "jul", "ago", "sep", "oct"]);
    expect(m.reencuentros.porMes.map((x) => x.n)).toEqual([0, 0, 0, 0, 2, 1]);
  });

  it("tasa de perdidas que volvieron, solo entre las de más de 30 días", () => {
    expect(m.tasaPerdidas).toEqual({ base: 3, volvieron: 2, pct: 67 });
  });

  it("días hasta el reencuentro: mediana y p75", () => {
    expect(m.diasHastaReencuentro.n).toBe(3);
    expect(m.diasHastaReencuentro.mediana).toBeCloseTo(4);
    expect(m.diasHastaReencuentro.p75).toBeCloseTo(7);
  });

  it("avisos activos con alguna coincidencia y con coincidencia alta", () => {
    // Activos: p3, p4, e2, a1 → p4/e2 (0.8, alta) y p3/a1 (0.3).
    expect(m.coincidencias).toEqual({ activos: 4, conAlguna: 4, pctAlguna: 100, conAlta: 2, pctAlta: 50 });
  });

  it("sin novedades: activos publicados hace más de 30 días", () => {
    expect(m.sinNovedades).toEqual({ n: 1, pct: 25 });
  });

  it("sin datos no rompe", () => {
    const vacio = computeImpactMetrics([], { now: NOW });
    expect(vacio.avisos.total).toBe(0);
    expect(vacio.tasaPerdidas.pct).toBeNull();
    expect(vacio.diasHastaReencuentro.mediana).toBeNull();
  });
});
