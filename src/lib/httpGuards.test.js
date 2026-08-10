import { describe, expect, it } from "vitest";
import { isJsonRequest, getClientIp, isRateLimitMessage } from "./httpGuards";

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

  it("devuelve null sin el header", () => {
    expect(getClientIp(makeRequest({}))).toBeNull();
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
