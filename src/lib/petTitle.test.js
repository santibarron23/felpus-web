import { describe, it, expect } from "vitest";
import { petTitle } from "./petTitle";

describe("petTitle", () => {
  it("usa el nombre si lo tiene", () => {
    expect(petTitle({ nombre: " Morena ", especie: "perro", tipo: "perdida" })).toBe("Morena");
  });
  it("una mascota encontrada sin nombre no es 'sin nombre'", () => {
    expect(petTitle({ especie: "perro", tipo: "encontrada" })).toBe("Perro encontrado");
    expect(petTitle({ especie: "otro", tipo: "encontrada" })).toBe("Mascota encontrada");
  });
  it("reencontrada sin nombre", () => {
    expect(petTitle({ especie: "gato", tipo: "perdida", resuelto: true })).toBe("Gato reencontrado");
  });
  it("perdida sin nombre", () => {
    expect(petTitle({ especie: "gato", tipo: "perdida" })).toBe("Gato sin nombre");
  });
});
