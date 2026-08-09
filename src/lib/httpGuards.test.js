import { describe, expect, it } from "vitest";
import { isJsonRequest, getClientIp } from "./httpGuards";

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
