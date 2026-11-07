import { describe, it, expect } from "vitest";
import { esDeScriptInyectado } from "./scriptsInyectados";

// Stacks reales de error_logs (Instagram y Facebook en Android, 11/2026).
const JAVA_GONE = `Error: Error invoking postMessage: Java object is gone
    at sendDataToNative (iabjs://navigation_performance_logger_android:1:11722)
    at sendBeforeUnloadMessage (iabjs://navigation_performance_logger_android:1:15376)
    at iabjs://navigation_performance_logger_android:1:20806`;
const JAVA_BRIDGE = `Error: Error invoking postMessage: Java bridge method invocation error
    at sendDataToNative (iabjs://navigation_performance_logger_android:1:11722)
    at iabjs://navigation_performance_logger_android:1:19971
    at PerformanceObserver.<anonymous> (iabjs://navigation_performance_logger_android:1:20000)`;

describe("esDeScriptInyectado", () => {
  it("reconoce el script del navegador de Instagram/Facebook", () => {
    expect(esDeScriptInyectado({ stack: JAVA_GONE })).toBe(true);
    expect(esDeScriptInyectado({ stack: JAVA_BRIDGE })).toBe(true);
    expect(esDeScriptInyectado({ filename: "iabjs://navigation_performance_logger_android" })).toBe(true);
  });

  it("si en el stack aparece código de Felpus, se sigue registrando", () => {
    const mezclado = `${JAVA_GONE}\n    at onClick (https://felpus.com/_next/static/chunks/app/page-abc.js:1:200)`;
    expect(esDeScriptInyectado({ stack: mezclado })).toBe(false);
  });

  it("los errores de Felpus o sin stack no cuentan", () => {
    expect(esDeScriptInyectado({ stack: "TypeError: x\n    at https://felpus.com/_next/static/chunks/app.js:1:1" })).toBe(false);
    expect(esDeScriptInyectado({ stack: "Error: Java object is gone" })).toBe(false);
    expect(esDeScriptInyectado({ stack: null })).toBe(false);
    expect(esDeScriptInyectado()).toBe(false);
  });
});
