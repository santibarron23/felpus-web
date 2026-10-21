import { describe, expect, it, vi } from "vitest";
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

describe("requestLocation con opciones de mapa", () => {
  it("pasa timeout y maximumAge al navegador", async () => {
    const { requestLocation, MAP_GEOLOCATION_OPTIONS } = await import("./geolocation");
    let opts;
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: (ok, _err, o) => { opts = o; ok({ coords: { latitude: -24.8, longitude: -65.4 } }); } } });
    let got;
    requestLocation((p) => (got = p), () => {}, MAP_GEOLOCATION_OPTIONS);
    expect(got).toEqual({ lat: -24.8, lng: -65.4 });
    expect(opts).toEqual({ timeout: 15000, maximumAge: 600000 });
    requestLocation(() => {}, () => {});
    expect(opts).toEqual({ timeout: 8000, maximumAge: 0 });
    vi.unstubAllGlobals();
  });
});

describe("navegador interno de apps (Instagram, Facebook…)", () => {
  const IG_IOS =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.27.83 (iPhone15,2; iOS 18_5; es_AR; es; scale=3.00; 1179x2556; 742218154)";
  const FB_IOS =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/500.0.0.0;FBBV/1;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.5;FBSS/3;FBLC/es_LA]";
  const SAFARI_IOS =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

  it("detecta Instagram y Facebook, no Safari", async () => {
    const { isInAppBrowser } = await import("./geolocation");
    expect(isInAppBrowser(IG_IOS)).toBe(true);
    expect(isInAppBrowser(FB_IOS)).toBe(true);
    expect(isInAppBrowser(SAFARI_IOS)).toBe(false);
    expect(isInAppBrowser("")).toBe(false);
  });

  it("permiso denegado dentro de Instagram: sugiere abrir en Safari/Chrome, no el candado", () => {
    const msg = geolocationErrorMessage({ code: 1 }, IG_IOS);
    expect(msg).toMatch(/Safari o Chrome/);
    expect(msg).not.toMatch(/candado/);
  });

  it("permiso denegado en Safari: sigue explicando el candado", () => {
    expect(geolocationErrorMessage({ code: 1 }, SAFARI_IOS)).toMatch(/candado/);
  });
});
