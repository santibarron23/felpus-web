import { describe, expect, it } from "vitest";
import { cleanUbicacion, formatUbicacion } from "./profile";

describe("formatUbicacion", () => {
  it("ciudad y provincia; el país solo si no es Argentina", () => {
    expect(formatUbicacion({ ciudad: "Cafayate", provincia: "Salta", pais: "Argentina" })).toBe("Cafayate, Salta");
    expect(formatUbicacion({ ciudad: "Santiago", provincia: "RM", pais: "Chile" })).toBe("Santiago, RM, Chile");
  });
  it("no repite cuando ciudad y provincia son iguales", () => {
    expect(formatUbicacion({ ciudad: "Salta", provincia: "Salta" })).toBe("Salta");
  });
  it("con conPais muestra también Argentina; vacío si no hay datos", () => {
    expect(formatUbicacion({ ciudad: "Salta", provincia: "Salta", pais: "Argentina" }, { conPais: true })).toBe("Salta, Argentina");
    expect(formatUbicacion(null)).toBe("");
    expect(formatUbicacion({})).toBe("");
  });
});

describe("cleanUbicacion", () => {
  it("recorta espacios y convierte vacío en null", () => {
    expect(cleanUbicacion({ pais: " Chile ", provincia: "", ciudad: "  " })).toEqual({ pais: "Chile", provincia: null, ciudad: null });
  });
  it("Argentina sola (el valor por defecto del selector) no se guarda", () => {
    expect(cleanUbicacion({ pais: "Argentina", provincia: "", ciudad: "" }).pais).toBeNull();
    expect(cleanUbicacion({ pais: "Argentina", provincia: "Salta", ciudad: "" }).pais).toBe("Argentina");
  });
  it("respeta los largos máximos de la base", () => {
    expect(cleanUbicacion({ ciudad: "x".repeat(200) }).ciudad).toHaveLength(80);
  });
});
