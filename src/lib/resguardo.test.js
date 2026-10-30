import { describe, it, expect } from "vitest";
import { detallesResguardo, esTerceros, lugarResguardo, LUGAR_MAX } from "./resguardo";
import { validarResguardo } from "./reportValidation";

const encontrada = (detalles) => ({ tipo: "encontrada", especie: "perro", detalles });

describe("detallesResguardo", () => {
  it("solo guarda lo que corresponde", () => {
    expect(detallesResguardo(null, "x")).toEqual({});
    expect(detallesResguardo("solo_la_vi", "x")).toEqual({});
    expect(detallesResguardo("conmigo", "Vete")).toEqual({ resguardo: "conmigo" });
    expect(detallesResguardo("terceros", "  Vete San Roque ")).toEqual({ resguardo: "terceros", lugar: "Vete San Roque" });
    expect(detallesResguardo("terceros", "  ")).toEqual({ resguardo: "terceros" });
    expect(detallesResguardo("terceros", "a".repeat(200)).lugar).toHaveLength(LUGAR_MAX);
  });
});

describe("lugarResguardo / esTerceros", () => {
  it("texto para la ficha", () => {
    expect(lugarResguardo(encontrada({ resguardo: "terceros", lugar: "Refugio Patitas" }))).toBe("Está en: Refugio Patitas");
    expect(lugarResguardo(encontrada({ resguardo: "terceros" }))).toBe("Está en una veterinaria o refugio");
    expect(lugarResguardo(encontrada({ resguardo: "conmigo" }))).toBe("");
    expect(lugarResguardo(encontrada({}))).toBe("");
  });

  it("una perdida nunca es 'terceros'", () => {
    expect(esTerceros({ tipo: "perdida", detalles: { resguardo: "terceros" } })).toBe(false);
  });
});

describe("validarResguardo (servidor)", () => {
  it("sin resguardo, no toca nada (reportes de siempre)", () => {
    expect(validarResguardo({ tipo: "perdida", detalles: { comportamientos: ["miedoso"] } })).toEqual({ detalles: { comportamientos: ["miedoso"] } });
    expect(validarResguardo({ tipo: "encontrada", detalles: null })).toEqual({ detalles: null });
  });

  it("acepta y normaliza", () => {
    expect(validarResguardo(encontrada({ resguardo: "terceros", lugar: "  Vete  " }))).toEqual({ detalles: { resguardo: "terceros", lugar: "Vete" } });
    expect(validarResguardo(encontrada({ resguardo: "terceros", lugar: " " }))).toEqual({ detalles: { resguardo: "terceros" } });
    expect(validarResguardo(encontrada({ resguardo: "conmigo" }))).toEqual({ detalles: { resguardo: "conmigo" } });
  });

  it("rechaza lo que no corresponde", () => {
    for (const row of [
      { tipo: "perdida", detalles: { resguardo: "terceros" } },
      { tipo: "encontrada", detalles: { avistamiento: true, resguardo: "conmigo" } },
      encontrada({ resguardo: "solo_la_vi" }),
      encontrada({ resguardo: "conmigo", lugar: "Vete" }),
      encontrada({ lugar: "Vete" }),
      encontrada({ resguardo: "terceros", lugar: 5 }),
      encontrada({ resguardo: "terceros", lugar: "a".repeat(LUGAR_MAX + 1) }),
    ]) {
      expect(validarResguardo(row).error, JSON.stringify(row)).toBeTruthy();
    }
  });
});
