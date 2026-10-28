import { describe, it, expect } from "vitest";
import { esErrorDeRed, conReintentos } from "./retry";

const sinEspera = () => Promise.resolve();

describe("esErrorDeRed", () => {
  it("reconoce cortes de red de Safari, Chrome y Firefox", () => {
    expect(esErrorDeRed(new TypeError("Load failed"))).toBe(true);
    expect(esErrorDeRed(new TypeError("Failed to fetch"))).toBe(true);
    expect(esErrorDeRed(new TypeError("NetworkError when attempting to fetch resource."))).toBe(true);
    expect(esErrorDeRed({ name: "StorageUnknownError", message: "x", originalError: new TypeError("Load failed") })).toBe(true);
  });
  it("no confunde errores del servidor ni bugs con cortes de red", () => {
    expect(esErrorDeRed(new Error("Se alcanzó el límite de reportes por hora"))).toBe(false);
    expect(esErrorDeRed(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
    expect(esErrorDeRed(null)).toBe(false);
  });
});

describe("conReintentos", () => {
  it("reintenta un corte de red y devuelve el resultado", async () => {
    let n = 0;
    const r = await conReintentos(async () => {
      n++;
      if (n < 3) throw new TypeError("Load failed");
      return "ok";
    }, { esperarFn: sinEspera });
    expect(r).toBe("ok");
    expect(n).toBe(3);
  });
  it("no reintenta errores que no son de red", async () => {
    let n = 0;
    await expect(conReintentos(async () => {
      n++;
      throw new Error("Datos inválidos");
    }, { esperarFn: sinEspera })).rejects.toThrow("Datos inválidos");
    expect(n).toBe(1);
  });
  it("se rinde después del último intento", async () => {
    let n = 0;
    await expect(conReintentos(async () => {
      n++;
      throw new TypeError("Load failed");
    }, { intentos: 2, esperarFn: sinEspera })).rejects.toThrow("Load failed");
    expect(n).toBe(2);
  });
});
