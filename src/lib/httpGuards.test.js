import { describe, expect, it } from "vitest";
import { isJsonRequest, getClientIp, isRateLimitMessage, publicRpcError } from "./httpGuards";

function makeRequest(headers) {
  return { headers: new Map(Object.entries(headers)) };
}

// isJsonRequest (auditoría de seguridad, 2026-08-09): defensa contra el
// truco clásico de CSRF sobre APIs JSON — un <form enctype="text/plain">
// nunca puede mandar Content-Type: application/json, así que exigirlo
// exacto bloquea ese vector sin afectar a los llamadores legítimos (todos
// mandan ese header explícito, ver store.js/push.js/matching.js).
describe("isJsonRequest", () => {
  it("acepta application/json exacto", () => {
    expect(isJsonRequest(makeRequest({ "content-type": "application/json" }))).toBe(true);
  });

  it("acepta application/json con charset (lo que mandan algunos clientes)", () => {
    expect(isJsonRequest(makeRequest({ "content-type": "application/json; charset=utf-8" }))).toBe(true);
  });

  it("es case-insensitive", () => {
    expect(isJsonRequest(makeRequest({ "content-type": "APPLICATION/JSON" }))).toBe(true);
  });

  it("rechaza text/plain (el truco de CSRF con <form enctype>)", () => {
    expect(isJsonRequest(makeRequest({ "content-type": "text/plain" }))).toBe(false);
  });

  it("rechaza application/x-www-form-urlencoded", () => {
    expect(isJsonRequest(makeRequest({ "content-type": "application/x-www-form-urlencoded" }))).toBe(false);
  });

  it("rechaza sin Content-Type", () => {
    expect(isJsonRequest(makeRequest({}))).toBe(false);
  });
});

describe("getClientIp", () => {
  it("toma la primera IP de x-forwarded-for", () => {
    expect(getClientIp(makeRequest({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("recorta espacios", () => {
    expect(getClientIp(makeRequest({ "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("sin el header, un balde común (nunca null: ninguna ruta saltea su límite)", () => {
    expect(getClientIp(makeRequest({}))).toBe("sin-ip");
    expect(getClientIp(makeRequest({ "x-forwarded-for": "  " }))).toBe("sin-ip");
  });
});

// isRateLimitMessage (control integral, 2026-08-10): report-contact y
// flag-report etiquetaban CUALQUIER 400 de la RPC como 429 — este helper
// distingue el rate limit real de otros 400 legítimos (ej. "no se encontró
// ese reporte") por el texto del mensaje, que son los mismos que
// realmente devuelve schema.sql hoy.
describe("isRateLimitMessage", () => {
  it("reconoce los mensajes de límite reales de schema.sql", () => {
    expect(isRateLimitMessage("Demasiadas consultas de contacto desde esta conexión. Probá de nuevo más tarde.")).toBe(true);
    expect(isRateLimitMessage("Se alcanzó el límite de denuncias por hora desde esta conexión. Probá de nuevo más tarde.")).toBe(true);
    expect(isRateLimitMessage("Demasiadas operaciones de puntos en poco tiempo. Probá de nuevo más tarde.")).toBe(true);
  });

  it("no confunde otros 400 legítimos con rate limit", () => {
    expect(isRateLimitMessage("No se encontró ese reporte.")).toBe(false);
    expect(isRateLimitMessage("Motivo de denuncia no reconocido.")).toBe(false);
  });

  it("nunca explota con mensaje vacío o ausente", () => {
    expect(isRateLimitMessage("")).toBe(false);
    expect(isRateLimitMessage(null)).toBe(false);
    expect(isRateLimitMessage(undefined)).toBe(false);
  });
});

// publicRpcError (revisión de seguridad, 2026-10-26): solo los RAISE
// EXCEPTION de schema.sql llegan al navegador; el resto de los errores de
// PostgREST trae nombres internos.
describe("publicRpcError", () => {
  it("pasa el texto de un RAISE EXCEPTION (400 + P0001)", () => {
    expect(publicRpcError(400, { code: "P0001", message: "Demasiadas consultas." }, "x")).toBe("Demasiadas consultas.");
  });
  it("oculta errores internos de Postgres/PostgREST", () => {
    expect(publicRpcError(400, { code: "22P02", message: 'invalid input syntax for type uuid: "a"' }, "Genérico")).toBe("Genérico");
    expect(publicRpcError(404, { code: "PGRST202", message: "Could not find the function public.flag_report" }, "Genérico")).toBe("Genérico");
    expect(publicRpcError(401, { code: "42501", message: "permission denied for function flag_report" }, "Genérico")).toBe("Genérico");
    expect(publicRpcError(400, null, "Genérico")).toBe("Genérico");
  });
});

describe("esPedidoDeOtroSitio", () => {
  const req = (headers) => new Request("https://felpus.com/api/chat", { method: "POST", headers });
  it("deja pasar pedidos del propio sitio (felpus.com, www, previews de Vercel)", async () => {
    const { esPedidoDeOtroSitio } = await import("./httpGuards");
    expect(esPedidoDeOtroSitio(req({ origin: "https://felpus.com", host: "felpus.com", "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(esPedidoDeOtroSitio(req({ origin: "https://www.felpus.com", host: "felpus.com" }))).toBe(false);
    expect(esPedidoDeOtroSitio(req({ origin: "https://felpus-web-git-x.vercel.app", host: "felpus-web-git-x.vercel.app" }))).toBe(false);
    expect(esPedidoDeOtroSitio(req({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(false);
  });
  it("sin Origin (curl, servidores, la app) pasa: lo frenan los cupos", async () => {
    const { esPedidoDeOtroSitio } = await import("./httpGuards");
    expect(esPedidoDeOtroSitio(req({ host: "felpus.com" }))).toBe(false);
  });
  it("frena pedidos que el navegador marca como de otro sitio", async () => {
    const { esPedidoDeOtroSitio } = await import("./httpGuards");
    expect(esPedidoDeOtroSitio(req({ origin: "https://clon-felpus.example", host: "felpus.com" }))).toBe(true);
    expect(esPedidoDeOtroSitio(req({ "sec-fetch-site": "cross-site", host: "felpus.com" }))).toBe(true);
    expect(esPedidoDeOtroSitio(req({ origin: "null", host: "felpus.com" }))).toBe(true);
    expect(esPedidoDeOtroSitio(req({ origin: "https://felpus.com.evil.example", host: "felpus.com" }))).toBe(true);
  });
});
