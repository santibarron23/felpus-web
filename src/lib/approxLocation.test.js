import { describe, it, expect } from "vitest";
import { approxLocation, APPROX_MIN_M, APPROX_MAX_M, APPROX_RADIUS_M } from "./approxLocation";
import { haversineKm } from "./matching";

const base = { lat: -24.7811544, lng: -65.4028022 };

describe("approxLocation", () => {
  it("corre el punto entre el mínimo y el máximo, siempre dentro del círculo", () => {
    for (let i = 0; i < 300; i++) {
      const a = approxLocation({ id: `r-${i}`, ...base });
      const m = haversineKm(base.lat, base.lng, a.lat, a.lng) * 1000;
      expect(m).toBeGreaterThanOrEqual(APPROX_MIN_M - 2);
      expect(m).toBeLessThanOrEqual(APPROX_MAX_M + 2);
      expect(m).toBeLessThan(APPROX_RADIUS_M);
    }
  });

  it("es estable para el mismo reporte (no se puede promediar recargando)", () => {
    const r = { id: "1792685777000-urnffd", ...base };
    expect(approxLocation(r)).toEqual(approxLocation({ ...r }));
  });

  it("reportes distintos en el mismo punto quedan en lugares distintos", () => {
    const a = approxLocation({ id: "a", ...base });
    const b = approxLocation({ id: "b", ...base });
    expect(a).not.toEqual(b);
  });

  it("los corrimientos van para todos lados", () => {
    const cuadrantes = new Set();
    for (let i = 0; i < 100; i++) {
      const a = approxLocation({ id: `x${i}`, ...base });
      cuadrantes.add(`${a.lat > base.lat}${a.lng > base.lng}`);
    }
    expect(cuadrantes.size).toBe(4);
  });

  it("sin punto devuelve null", () => {
    expect(approxLocation({ id: "a", lat: null, lng: null })).toBeNull();
    expect(approxLocation({ id: "a", lat: "x", lng: 1 })).toBeNull();
    expect(approxLocation(null)).toBeNull();
  });
});
