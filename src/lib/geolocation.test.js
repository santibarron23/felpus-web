import { describe, expect, it } from "vitest";
import { geolocationErrorMessage } from "./geolocation";

// Auditoría integral (2026-08-09): función pura sin ningún test hasta
// ahora — el caso más importante a cubrir es PERMISSION_DENIED (código 1),
// que es el único de los 4 con un mensaje específico y accionable (el
// resto son variaciones de "probá de nuevo").
describe("geolocationErrorMessage", () => {
  it("código 1 (PERMISSION_DENIED): explica cómo desbloquear el permiso", () => {
    expect(geolocationErrorMessage({ code: 1 })).toMatch(/candado|permiso|bloqueaste/i);
  });

  it("código 2 (POSITION_UNAVAILABLE): pide reintentar", () => {
    expect(geolocationErrorMessage({ code: 2 })).toMatch(/no pudimos determinar/i);
  });

  it("código 3 (TIMEOUT): menciona que tardó demasiado", () => {
    expect(geolocationErrorMessage({ code: 3 })).toMatch(/tardó/i);
  });

  it("código desconocido o sin error: mensaje genérico, nunca vacío", () => {
    expect(geolocationErrorMessage({ code: 99 })).toBeTruthy();
    expect(geolocationErrorMessage(null)).toBeTruthy();
    expect(geolocationErrorMessage(undefined)).toBeTruthy();
  });

  it("los 4 mensajes son todos distintos entre sí (cada código dice algo propio)", () => {
    const mensajes = [1, 2, 3, 99].map((code) => geolocationErrorMessage({ code }));
    expect(new Set(mensajes).size).toBe(4);
  });
});
