import { describe, expect, it } from "vitest";
import { displayColor } from "./theme";

// Auditoría integral (2026-08-09): función pura de una línea, pero con
// lógica condicional real (y usada en varios lugares: tarjetas, flyer,
// mapa) — sin ningún test hasta ahora.
describe("displayColor", () => {
  it("con color 'Otro color' y colorOtro cargado, muestra el detalle escrito a mano", () => {
    expect(displayColor({ color: "Otro color", colorOtro: "Tricolor" })).toBe("Tricolor");
  });

  it("con color 'Otro color' pero SIN colorOtro, cae al color genérico (no deja vacío)", () => {
    expect(displayColor({ color: "Otro color", colorOtro: "" })).toBe("Otro color");
    expect(displayColor({ color: "Otro color", colorOtro: null })).toBe("Otro color");
  });

  it("con cualquier otro color, lo devuelve tal cual (colorOtro se ignora)", () => {
    expect(displayColor({ color: "Negro", colorOtro: "Tricolor" })).toBe("Negro");
  });
});
