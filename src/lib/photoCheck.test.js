import { describe, it, expect } from "vitest";
import { classifyScores, PHOTO_CHECK_THRESHOLD } from "./photoCheck";
import { imageSimilarity, marcarDudosas, matchBreakdown, scoreMatch } from "./matching";

const real = { perro: 0.9, gato: 0.02, mascota: 0.06, cartel: 0.01, captura: 0.005, ilustracion: 0.005 };

describe("classifyScores (umbral calibrado con fotos reales)", () => {
  it("una foto real de mascota no es dudosa", () => {
    expect(classifyScores(real)).toMatchObject({ dudosa: false, tipo: null });
  });
  it("un flyer con texto es dudoso, tipo cartel", () => {
    expect(classifyScores({ perro: 0.1, gato: 0.02, mascota: 0.03, cartel: 0.85, captura: 0.0, ilustracion: 0.0 })).toMatchObject({
      dudosa: true,
      tipo: "cartel",
    });
  });
  it("una captura de redes es dudosa, tipo captura", () => {
    expect(classifyScores({ perro: 0.85, gato: 0, mascota: 0.04, cartel: 0.01, captura: 0.07, ilustracion: 0 })).toMatchObject({
      dudosa: true,
      tipo: "captura",
    });
  });
  it("justo por debajo del umbral no marca", () => {
    expect(classifyScores({ perro: 0.92, cartel: PHOTO_CHECK_THRESHOLD - 0.01 }).dudosa).toBe(false);
  });
});

describe("fotos dudosas en el matching", () => {
  const emb = (x) => [x, 1 - x, 0];
  const a = { especie: "perro", tipo: "perdida", color: "Negro", tamano: "chico", fotos: [{ embedding: emb(0.5), hist: null }] };
  const b = { especie: "perro", tipo: "encontrada", color: "Negro", tamano: "chico", fotos: [{ embedding: emb(0.5), hist: null }] };

  it("marcarDudosas marca por índice sin tocar las demás", () => {
    const fotos = marcarDudosas([{ url: "a" }, { url: "b" }], { fotos_dudosas: [1] });
    expect(fotos[0].dudosa).toBeUndefined();
    expect(fotos[1].dudosa).toBe(true);
  });
  it("si un lado solo tiene fotos dudosas, no hay similitud de imagen (null) ni ítem Foto", () => {
    const flyer = { ...b, fotos: [{ ...b.fotos[0], dudosa: true }] };
    expect(imageSimilarity(a, flyer)).toBeNull();
    expect(matchBreakdown(a, flyer).some((i) => i.key === "imagen")).toBe(false);
    const s = scoreMatch(a, flyer);
    expect(Number.isFinite(s.score)).toBe(true);
    expect(s.imgSim).toBe(0);
  });
  it("con al menos una foto válida de cada lado, compara solo esas", () => {
    const mixto = { ...b, fotos: [{ embedding: emb(0.9), hist: null, dudosa: true }, b.fotos[0]] };
    expect(imageSimilarity(a, mixto)).toBe(imageSimilarity(a, b));
  });
});
