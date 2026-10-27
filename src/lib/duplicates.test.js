import { describe, it, expect } from "vitest";
import { findDuplicates, duplicateMessage } from "./duplicates";

const EMB = [0.9, 0.1, 0.3, 0.2, 0.5, 0.1, 0.4, 0.7];
const OTRO_EMB = [0.1, 0.9, -0.3, 0.6, -0.5, 0.8, -0.4, 0.1];

function rep(overrides = {}) {
  return {
    id: "r1",
    tipo: "perdida",
    especie: "perro",
    color: "Negro",
    colorOtro: "",
    tamano: "mediano",
    sexo: "Macho",
    raza: "",
    edad: "",
    zona: "Tres Cerritos",
    provincia: "Salta",
    lat: -24.77,
    lng: -65.41,
    fecha: new Date().toISOString().slice(0, 10),
    descripcion: "",
    fotos: [{ hist: [0.5, 0.5], embedding: EMB }],
    creadoEn: Date.now(),
    userId: null,
    nickname: "",
    resuelto: false,
    ...overrides,
  };
}

const draft = rep({ id: "nuevo" });

describe("findDuplicates", () => {
  it("la misma persona con la misma foto: idéntico", () => {
    const [d] = findDuplicates(draft, [rep({ id: "a", userId: "u1" })], { userId: "u1" });
    expect(d.kind).toBe("identico");
    expect(d.report.id).toBe("a");
  });

  it("sin sesión, el mismo apodo cuenta como la misma persona", () => {
    const [d] = findDuplicates(draft, [rep({ id: "a", nickname: "Santi " })], { nickname: "santi" });
    expect(d.kind).toBe("identico");
  });

  it("la misma persona, parecido pero otra foto: propio", () => {
    const parecido = rep({ id: "a", userId: "u1", fotos: [{ hist: [0.5, 0.5], embedding: [0, 1, 0.3, 0.2, 0.5, 0.1, 0.4, 0.7] }] });
    const [d] = findDuplicates(draft, [parecido], { userId: "u1" });
    expect(d.kind).toBe("propio");
  });

  it("otra persona, perdida: posible duplicado", () => {
    const [d] = findDuplicates(draft, [rep({ id: "a", userId: "otra" })], { userId: "u1" });
    expect(d.kind).toBe("duplicado");
  });

  it("otra persona, encontrada: avistamiento (suma, no sobra)", () => {
    const d = findDuplicates({ ...draft, tipo: "encontrada" }, [rep({ id: "a", tipo: "encontrada", userId: "otra" })], { userId: "u1" });
    expect(d[0].kind).toBe("avistamiento");
  });

  it("perdida contra encontrada no es duplicado (es una coincidencia)", () => {
    expect(findDuplicates(draft, [rep({ id: "a", tipo: "encontrada" })])).toEqual([]);
  });

  it("ignora reencontradas, otra especie, lejos o muy distintas", () => {
    const reports = [
      rep({ id: "a", resuelto: true }),
      rep({ id: "b", especie: "gato" }),
      rep({ id: "c", lat: -31.42, lng: -64.19 }),
      rep({ id: "d", color: "Blanco", tamano: "grande", sexo: "Hembra", fotos: [{ hist: [1, 0], embedding: OTRO_EMB }] }),
    ];
    expect(findDuplicates(draft, reports)).toEqual([]);
  });

  it("sin tipo o especie no compara", () => {
    expect(findDuplicates({ ...draft, tipo: "" }, [rep({ id: "a" })])).toEqual([]);
  });

  it("primero los propios y respeta el límite", () => {
    const reports = [rep({ id: "otra", userId: "x" }), rep({ id: "mia", userId: "u1" })];
    const out = findDuplicates(draft, reports, { userId: "u1", limit: 2 });
    expect(out.map((d) => d.report.id)).toEqual(["mia", "otra"]);
    expect(findDuplicates(draft, reports, { userId: "u1" })).toHaveLength(1);
  });
});

describe("duplicateMessage", () => {
  it("tiene título y texto para cada caso", () => {
    for (const k of ["identico", "propio", "duplicado", "avistamiento"]) {
      const m = duplicateMessage(k);
      expect(m.title).toBeTruthy();
      expect(m.body).toBeTruthy();
    }
  });
});
