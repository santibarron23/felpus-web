import { describe, it, expect, vi } from "vitest";
import { esErrorIgnorable, instalarCapturaGlobal } from "./erroresGlobales";

// Ventana falsa: guarda los escuchas para dispararlos a mano.
function ventana() {
  const h = {};
  return {
    h,
    addEventListener: vi.fn((t, fn) => (h[t] = fn)),
    removeEventListener: vi.fn((t) => delete h[t]),
  };
}

describe("esErrorIgnorable", () => {
  it("descarta el ruido que no es de Felpus", () => {
    for (const message of ["Script error.", "ResizeObserver loop completed with undelivered notifications.", "Failed to fetch", "TypeError: Load failed", "AbortError: The user aborted a request.", ""]) {
      expect(esErrorIgnorable({ message }), message).toBe(true);
    }
    expect(esErrorIgnorable({ message: "x is not a function", filename: "chrome-extension://abc/content.js" })).toBe(true);
  });

  it("deja pasar los errores reales", () => {
    expect(esErrorIgnorable({ message: "Cannot read properties of undefined (reading 'foto')", filename: "https://felpus.com/_next/static/chunks/app.js" })).toBe(false);
  });
});

describe("instalarCapturaGlobal", () => {
  it("registra errores no capturados y promesas rechazadas, sin el ruido", () => {
    const w = ventana();
    const log = vi.fn();
    instalarCapturaGlobal(w, { log, recargar: () => false });
    const err = new Error("boom");
    w.h.error({ error: err, message: "boom", filename: "https://felpus.com/x.js" });
    w.h.unhandledrejection({ reason: "falló el guardado" });
    w.h.error({ message: "Script error.", error: null });
    w.h.unhandledrejection({ reason: new TypeError("Failed to fetch") });
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0]).toEqual(["Error no capturado", err]);
    expect(log.mock.calls[1][0]).toBe("Promesa rechazada sin manejar");
    expect(log.mock.calls[1][1].message).toBe("falló el guardado");
  });

  it("ignora el error del navegador de Instagram/Facebook al salir de la página", () => {
    const w = ventana();
    const log = vi.fn();
    instalarCapturaGlobal(w, { log, recargar: () => false });
    const err = new Error("Error invoking postMessage: Java object is gone");
    err.stack = `Error: ${err.message}\n    at sendDataToNative (iabjs://navigation_performance_logger_android:1:11722)\n    at sendBeforeUnloadMessage (iabjs://navigation_performance_logger_android:1:15376)`;
    w.h.error({ error: err, message: `Uncaught ${err.message}`, filename: "" });
    w.h.unhandledrejection({ reason: err });
    expect(log).not.toHaveBeenCalled();
  });

  it("un chunk viejo recarga una vez en vez de registrar", () => {
    const w = ventana();
    const log = vi.fn();
    const recargar = vi.fn(() => true);
    instalarCapturaGlobal(w, { log, recargar });
    w.h.unhandledrejection({ reason: new Error("Loading chunk 123 failed") });
    expect(recargar).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it("devuelve cómo sacar los escuchas", () => {
    const w = ventana();
    const quitar = instalarCapturaGlobal(w, { log: vi.fn() });
    quitar();
    expect(w.removeEventListener).toHaveBeenCalledTimes(2);
    expect(instalarCapturaGlobal(null)).toBeTypeOf("function");
  });
});
