import { describe, expect, it, vi } from "vitest";
import { isChunkLoadError, reloadOnceForStaleDeploy } from "./staleDeploy";

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

describe("isChunkLoadError", () => {
  it("reconoce el error real visto en producción", () => {
    expect(isChunkLoadError(new Error("Loading chunk 734 failed.\n(error: https://felpus.com/_next/static/chunks/734.js)"))).toBe(true);
  });

  it("reconoce ChunkLoadError por nombre y las variantes de Safari/Firefox/Chrome", () => {
    expect(isChunkLoadError({ name: "ChunkLoadError", message: "" })).toBe(true);
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/a.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Loading CSS chunk 12 failed"))).toBe(true);
  });

  it("no confunde otros errores", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe("reloadOnceForStaleDeploy", () => {
  const chunkErr = new Error("Loading chunk 734 failed.");

  it("recarga la primera vez", () => {
    const reload = vi.fn();
    expect(reloadOnceForStaleDeploy(chunkErr, { storage: memoryStorage(), reload, now: 1000 })).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("NO recarga de nuevo dentro de la ventana de guardia (evita bucle infinito)", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    reloadOnceForStaleDeploy(chunkErr, { storage, reload, now: 1000 });
    expect(reloadOnceForStaleDeploy(chunkErr, { storage, reload, now: 5000 })).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("vuelve a permitir recargar pasada la ventana (otro deploy, más tarde)", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    reloadOnceForStaleDeploy(chunkErr, { storage, reload, now: 1000 });
    expect(reloadOnceForStaleDeploy(chunkErr, { storage, reload, now: 1000 + 31_000 })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("no recarga si el error no es de chunk", () => {
    const reload = vi.fn();
    expect(reloadOnceForStaleDeploy(new Error("otra cosa"), { storage: memoryStorage(), reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("sin storage disponible (o si tira), no recarga — más seguro que arriesgar un bucle", () => {
    const reload = vi.fn();
    expect(reloadOnceForStaleDeploy(chunkErr, { storage: null, reload })).toBe(false);
    const throwing = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => {} };
    expect(reloadOnceForStaleDeploy(chunkErr, { storage: throwing, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
