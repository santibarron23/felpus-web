import { describe, it, expect } from "vitest";
import { petTitle, petDescriptor, nombreReal } from "./petTitle";

describe("petTitle", () => {
  it("usa el nombre si lo tiene", () => {
    expect(petTitle({ nombre: " Morena ", especie: "perro", tipo: "perdida", color: "Negro" })).toBe("Morena");
  });

  it("sin nombre: especie + color + tamaño, concordando con el sexo", () => {
    expect(petTitle({ especie: "perro", sexo: "Hembra", color: "Blanco", tamano: "chico", tipo: "encontrada" })).toBe(
      "Perra blanca, tamaño chico"
    );
    expect(petTitle({ especie: "gato", sexo: "Macho", color: "Negro", tipo: "perdida" })).toBe("Gato negro");
    expect(petTitle({ especie: "perro", color: "Marrón", tamano: "grande", tipo: "perdida" })).toBe("Perro marrón, tamaño grande");
    expect(petTitle({ especie: "gato", sexo: "Hembra", color: "Atigrado", tipo: "perdida" })).toBe("Gata atigrada");
  });

  it("sin sexo (o 'No sé') usa la forma general, no inventa", () => {
    expect(petTitle({ especie: "perro", sexo: "No sé", color: "Blanco", tipo: "perdida" })).toBe("Perro blanco");
  });

  it("'Otro color' usa lo que escribió la persona", () => {
    expect(petTitle({ especie: "perro", color: "Otro color", colorOtro: "Colorado", tipo: "perdida" })).toBe("Perro color colorado");
    expect(petTitle({ especie: "perro", color: "Otro color", color_otro: "Canela", tipo: "perdida" })).toBe("Perro color canela");
  });

  it("sin color: 'Perro encontrado', 'Gata perdida', con tamaño si se sabe", () => {
    expect(petTitle({ especie: "perro", tipo: "encontrada" })).toBe("Perro encontrado");
    expect(petTitle({ especie: "gato", sexo: "Hembra", tipo: "perdida" })).toBe("Gata perdida");
    expect(petTitle({ especie: "otro", tipo: "encontrada" })).toBe("Mascota encontrada");
    expect(petTitle({ especie: "gato", tipo: "perdida", resuelto: true })).toBe("Gato reencontrado");
    expect(petTitle({ especie: "perro", tipo: "perdida", tamano: "mediano" })).toBe("Perro perdido, tamaño mediano");
  });

  it("nunca muestra solo el color, aunque esté guardado como nombre", () => {
    const r = { nombre: "Blanco", especie: "perro", color: "Blanco", tamano: "chico", tipo: "encontrada" };
    expect(petTitle(r)).toBe("Perro blanco, tamaño chico");
    expect(r.nombre).toBe("Blanco"); // el dato original no se toca
    expect(nombreReal({ nombre: "negra", especie: "gato" })).toBe("");
    expect(nombreReal({ nombre: "Colorado", color: "Otro color", colorOtro: "colorado" })).toBe("");
    expect(nombreReal({ nombre: "Blanquita" })).toBe("Blanquita");
  });
});

describe("petDescriptor", () => {
  it("describe sin nombre, o null si no hay color ni tamaño", () => {
    expect(petDescriptor({ nombre: "Toby", especie: "perro", color: "Negro", tamano: "grande" })).toBe("Perro negro, tamaño grande");
    expect(petDescriptor({ especie: "perro" })).toBeNull();
  });
});
