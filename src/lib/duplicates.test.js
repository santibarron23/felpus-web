import { describe, it, expect } from "vitest";
import { findDuplicates, duplicateMessage, cosenoFotos, cerca } from "./duplicates";

// Vectores de prueba con coseno conocido respecto de EMB.
const EMB = [1, 0, 0, 0];
const MISMA = [1, 0.05, 0, 0]; // coseno ≈ 0,999 → la misma foto
const MUY_PARECIDA = [1, 0.6, 0, 0]; // coseno ≈ 0,857 → foto casi igual
const PARECIDA = [1, 1, 0, 0]; // coseno ≈ 0,707 → mismo tipo de perro, otra mascota
const DISTINTA = [0, 1, 0, 0]; // coseno 0

function rep(overrides = {}) {
  return {
    id: "r1",
    tipo: "perdida",
    especie: "perro",
    color: "Negro",
    tamano: "mediano",
    zona: "Tres Cerritos",
    lat: -24.77,
    lng: -65.41,
    fotos: [{ hist: [0.5, 0.5], embedding: EMB }],
    userId: null,
    nickname: "",
    resuelto: false,
    ...overrides,
  };
}
const conFoto = (embedding, o = {}) => rep({ fotos: [{ hist: [0.5, 0.5], embedding }], ...o });
const draft = rep({ id: "nuevo" });

describe("findDuplicates", () => {
  it("la misma persona con la misma foto: idéntico", () => {
    const [d] = findDuplicates(draft, [conFoto(MISMA, { id: "a", userId: "u1" })], { userId: "u1" });
    expect(d.kind).toBe("identico");
  });

  it("sin sesión, el mismo apodo cuenta como la misma persona", () => {
    const [d] = findDuplicates(draft, [conFoto(MISMA, { id: "a", nickname: "Santi " })], { nickname: "santi" });
    expect(d.kind).toBe("identico");
  });

  it("la misma persona con una foto casi igual: propio", () => {
    const [d] = findDuplicates(draft, [conFoto(MUY_PARECIDA, { id: "a", userId: "u1" })], { userId: "u1" });
    expect(d.kind).toBe("propio");
  });

  it("otra persona, perdida, foto casi igual y cerca: posible duplicado", () => {
    const [d] = findDuplicates(draft, [conFoto(MUY_PARECIDA, { id: "a", userId: "otra" })], { userId: "u1" });
    expect(d.kind).toBe("duplicado");
  });

  it("otra persona, encontrada: avistamiento", () => {
    const d = findDuplicates({ ...draft, tipo: "encontrada" }, [conFoto(MISMA, { id: "a", tipo: "encontrada", userId: "otra" })], { userId: "u1" });
    expect(d[0].kind).toBe("avistamiento");
  });

  // Lo que fallaba (2026-10-28): mismo color, zona y tamaño, pero OTRA
  // mascota (foto parecida, no igual) daba "posible duplicado".
  it("mismo color, tamaño y zona pero otra mascota: NO avisa", () => {
    expect(findDuplicates(draft, [conFoto(PARECIDA, { id: "a" })])).toEqual([]);
    expect(findDuplicates(draft, [conFoto(DISTINTA, { id: "b" })])).toEqual([]);
  });

  it("foto casi igual pero lejos: NO avisa", () => {
    expect(findDuplicates(draft, [conFoto(MISMA, { id: "a", lat: -31.42, lng: -64.19 })])).toEqual([]);
  });

  it("sin punto en el mapa, usa la zona escrita", () => {
    const sinPunto = { lat: null, lng: null };
    expect(findDuplicates({ ...draft, ...sinPunto }, [conFoto(MISMA, { id: "a", ...sinPunto, zona: "tres cerritos" })])).toHaveLength(1);
    expect(findDuplicates({ ...draft, ...sinPunto }, [conFoto(MISMA, { id: "a", ...sinPunto, zona: "Centro" })])).toEqual([]);
  });

  it("sin el análisis de la foto todavía (sin embedding), no avisa", () => {
    const sinEmb = rep({ id: "nuevo", fotos: [{ hist: [0.5, 0.5], embedding: null }] });
    expect(findDuplicates(sinEmb, [conFoto(MISMA, { id: "a" })])).toEqual([]);
  });

  it("perdida contra encontrada, otra especie, reencontradas o fotos dudosas: no cuentan", () => {
    expect(findDuplicates(draft, [conFoto(MISMA, { id: "a", tipo: "encontrada" })])).toEqual([]);
    expect(findDuplicates(draft, [conFoto(MISMA, { id: "b", especie: "gato" })])).toEqual([]);
    expect(findDuplicates(draft, [conFoto(MISMA, { id: "c", resuelto: true })])).toEqual([]);
    expect(findDuplicates(draft, [rep({ id: "d", fotos: [{ embedding: MISMA, dudosa: true }] })])).toEqual([]);
  });

  it("primero los propios y respeta el límite", () => {
    const reports = [conFoto(MISMA, { id: "otra", userId: "x" }), conFoto(MUY_PARECIDA, { id: "mia", userId: "u1" })];
    expect(findDuplicates(draft, reports, { userId: "u1", limit: 2 }).map((d) => d.report.id)).toEqual(["mia", "otra"]);
    expect(findDuplicates(draft, reports, { userId: "u1" })).toHaveLength(1);
  });
});

describe("cosenoFotos / cerca", () => {
  it("cosenoFotos: el mejor par, o null sin embeddings", () => {
    expect(cosenoFotos(draft, conFoto(MISMA))).toBeGreaterThan(0.99);
    expect(cosenoFotos(draft, rep({ fotos: [{ embedding: null }] }))).toBeNull();
    expect(cosenoFotos(rep({ fotos: [{ embedding: DISTINTA }, { embedding: MISMA }] }), draft)).toBeGreaterThan(0.99);
  });

  it("cerca: 10 km con punto; si no, la misma zona", () => {
    expect(cerca(draft, rep({ lat: -24.8, lng: -65.43 }))).toBe(true);
    expect(cerca(draft, rep({ lat: -24.0, lng: -65.43 }))).toBe(false);
    expect(cerca(rep({ lat: null }), rep({ zona: "B° Tres Cerritos" }))).toBe(true);
    expect(cerca(rep({ lat: null, zona: "" }), rep({ zona: "" }))).toBe(false);
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
