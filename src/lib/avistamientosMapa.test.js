import { describe, it, expect } from "vitest";
import { recorridoAvistamientos, escapeHtml } from "./avistamientosMapa";
import { approxLocation } from "./approxLocation";

const perdida = { id: "p1", tipo: "perdida", lat: -24.78, lng: -65.41, coordAprox: true };
const av = (id, fecha, hora, extra = {}) => ({
  id,
  tipo: "encontrada",
  fecha,
  lat: -24.77,
  lng: -65.4,
  coordAprox: true,
  detalles: { avistamiento: true, avistamiento_de: "p1", hora },
  ...extra,
});

describe("recorridoAvistamientos", () => {
  it("numera del más viejo al más nuevo, con ubicación aproximada", () => {
    const nuevo = av("s2", "2026-10-29", "18:30", { detalles: { avistamiento: true, hora: "18:30", direccion: "norte" } });
    const viejo = av("s1", "2026-10-28", "09:10");
    const { origen, puntos } = recorridoAvistamientos(perdida, [nuevo, viejo]);
    expect(origen).toEqual(approxLocation(perdida));
    expect(puntos.map((p) => [p.id, p.n])).toEqual([["s1", 1], ["s2", 2]]);
    expect(puntos[0]).toMatchObject(approxLocation(viejo));
    expect(puntos[0].etiqueta).toBe("1. Vista el 28/10 a las 09:10");
    expect(puntos[1].etiqueta).toBe("2. Vista el 29/10 a las 18:30 · iba hacia el norte");
  });

  it("deja afuera los que no tienen punto, sin saltear números", () => {
    const { puntos } = recorridoAvistamientos(perdida, [av("s1", "2026-10-28", "09:00", { lat: null, lng: null }), av("s2", "2026-10-29", "10:00")]);
    expect(puntos.map((p) => [p.id, p.n])).toEqual([["s2", 1]]);
  });

  it("perdida sin punto: sin origen, pero con los avistamientos", () => {
    const r = recorridoAvistamientos({ id: "p1", tipo: "perdida" }, [av("s1", "2026-10-28", "09:00")]);
    expect(r.origen).toBeNull();
    expect(r.puntos).toHaveLength(1);
  });

  it("sin avistamientos, lista vacía", () => {
    expect(recorridoAvistamientos(perdida, undefined).puntos).toEqual([]);
  });
});

describe("escapeHtml", () => {
  it("escapa lo que Leaflet interpretaría como HTML", () => {
    expect(escapeHtml(`<img src=x onerror="a">&'`)).toBe("&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;");
  });
});
