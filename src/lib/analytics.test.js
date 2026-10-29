import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanParams, track } from "./analytics";

describe("cleanParams", () => {
  it("deja pasar números, booleanos y palabras cortas", () => {
    expect(cleanParams({ tipo: "perdida", segundos: 42.123, con_foto: true })).toEqual({
      tipo: "perdida",
      segundos: 42.12,
      con_foto: true,
    });
  });

  it("descarta texto libre que podría ser un dato personal", () => {
    expect(
      cleanParams({
        zona: "Tres Cerritos",
        email: "ana@example.com",
        telefono: "+54 387 555-1234",
        id: "1730000000000-abc12",
        nombre: "luna",
      })
    ).toEqual({});
  });

  it("descarta claves raras, objetos y NaN", () => {
    expect(cleanParams({ "Mal-Clave": 1, obj: { a: 1 }, n: NaN, lista: [1] })).toEqual({});
  });
});

describe("track", () => {
  afterEach(() => {
    delete globalThis.window;
  });

  it("solo manda eventos conocidos, con parámetros limpios", () => {
    const gtag = vi.fn();
    globalThis.window = { gtag };
    track("reporte_publicado", { tipo: "perdida", zona: "Centro" });
    track("evento_inventado", { tipo: "x" });
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith("event", "reporte_publicado", { tipo: "perdida" });
  });

  it("no rompe si gtag no está o tira error", () => {
    globalThis.window = {};
    expect(() => track("tutorial_abierto")).not.toThrow();
    globalThis.window = {
      gtag: () => {
        throw new Error("x");
      },
    };
    expect(() => track("tutorial_abierto")).not.toThrow();
  });
});
