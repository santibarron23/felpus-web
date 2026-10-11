import { describe, expect, it } from "vitest";
import { validateReportContact } from "./reportValidation";

describe("validateReportContact", () => {
  it("acepta solo WhatsApp (lo que manda el cliente real: solo dígitos con código de país)", () => {
    expect(validateReportContact({ contacto_whatsapp: "5493875123456" })).toEqual({
      ok: true,
      whatsapp: "5493875123456",
      email: null,
    });
  });

  it("acepta solo email", () => {
    expect(validateReportContact({ contacto_email: "  ana@mail.com " })).toEqual({
      ok: true,
      whatsapp: null,
      email: "ana@mail.com",
    });
  });

  it("normaliza un WhatsApp con símbolos a solo dígitos", () => {
    expect(validateReportContact({ contacto_whatsapp: "+54 9 387 512-3456" }).whatsapp).toBe("5493875123456");
  });

  it("rechaza un reporte sin ningún contacto (el hueco que existía en el servidor)", () => {
    expect(validateReportContact({}).ok).toBe(false);
    expect(validateReportContact({ contacto_whatsapp: null, contacto_email: "" }).ok).toBe(false);
    expect(validateReportContact(null).ok).toBe(false);
  });

  it("rechaza un WhatsApp con cantidad de dígitos imposible, aunque haya email válido", () => {
    expect(validateReportContact({ contacto_whatsapp: "123", contacto_email: "a@b.co" }).ok).toBe(false);
    expect(validateReportContact({ contacto_whatsapp: "1".repeat(16) }).ok).toBe(false);
  });

  it("rechaza un email mal formado", () => {
    expect(validateReportContact({ contacto_email: "no-es-un-mail" }).ok).toBe(false);
    expect(validateReportContact({ contacto_email: "a@" + "x".repeat(260) + ".com" }).ok).toBe(false);
  });
});
