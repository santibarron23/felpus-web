import { describe, it, expect } from "vitest";
import { zonaConCiudad } from "./zona";

describe("zonaConCiudad", () => {
  it("agrega la ciudad entre paréntesis", () => {
    expect(zonaConCiudad({ zona: "Tres Cerritos", ciudad: "Salta" })).toBe("Tres Cerritos (Salta)");
  });
  it("no repite la ciudad si ya está en la zona (sin importar tildes ni mayúsculas)", () => {
    expect(zonaConCiudad({ zona: "Salta", ciudad: "Salta" })).toBe("Salta");
    expect(zonaConCiudad({ zona: "Centro de Santa Maria", ciudad: "Santa María" })).toBe("Centro de Santa Maria");
  });
  it("sin ciudad (reportes viejos) queda la zona sola", () => {
    expect(zonaConCiudad({ zona: "Norte Grande", ciudad: "" })).toBe("Norte Grande");
    expect(zonaConCiudad({ zona: "Norte Grande" })).toBe("Norte Grande");
  });
  it("sin zona muestra la ciudad", () => {
    expect(zonaConCiudad({ zona: "", ciudad: "Salta" })).toBe("Salta");
  });
});
