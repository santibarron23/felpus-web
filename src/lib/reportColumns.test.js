import { describe, it, expect } from "vitest";
import { missingCoordAprox, withLegacyCoords, REPORT_LIST_ALL_COLUMNS } from "./reportColumns";

describe("coordenadas del listado público", () => {
  it("el listado no pide lat/lng exactos", () => {
    expect(REPORT_LIST_ALL_COLUMNS).toContain("lat_aprox");
    expect(REPORT_LIST_ALL_COLUMNS).not.toContain("lat");
    expect(REPORT_LIST_ALL_COLUMNS).not.toContain("lng");
  });

  it("detecta que falta la migración (columna inexistente)", () => {
    expect(missingCoordAprox({ code: "42703", message: "column reports.lat_aprox does not exist" })).toBe(true);
    expect(missingCoordAprox({ code: "42703", message: "column reports.raza does not exist" })).toBe(false);
    expect(missingCoordAprox({ code: "42501", message: "permission denied for table reports" })).toBe(false);
    expect(missingCoordAprox(null)).toBe(false);
  });

  it("withLegacyCoords cambia solo las columnas de coordenadas", () => {
    expect(withLegacyCoords(["id", "lat_aprox", "lng_aprox", "zona"])).toEqual(["id", "lat", "lng", "zona"]);
  });
});
