import { describe, it, expect } from "vitest";
import { contactoCapturaParaForm, avisoContactoCaptura } from "./contactoCaptura";

describe("contactoCapturaParaForm", () => {
  it("normaliza un celular argentino del flyer como el PhoneInput", async () => {
    const r = await contactoCapturaParaForm({ telefono: "387 15 588-5427", email: "" }, "AR");
    expect(r.whatsapp).toEqual({ national: "387 588-5427", country: "AR" });
    expect(r.email).toBeNull();
  });

  it("acepta un número internacional con + aunque el país del form sea otro", async () => {
    const r = await contactoCapturaParaForm({ telefono: "+598 94 123 456" }, "AR");
    expect(r.whatsapp?.country).toBe("UY");
    expect(r.whatsapp?.national.replace(/\D/g, "")).toBe("94123456");
  });

  it("devuelve el email del aviso", async () => {
    const r = await contactoCapturaParaForm({ telefono: "", email: " duenio@mail.com " }, "AR");
    expect(r).toEqual({ whatsapp: null, email: "duenio@mail.com" });
  });

  it("sin contacto en el flyer no toca nada", async () => {
    expect(await contactoCapturaParaForm({ telefono: "", email: "" }, "AR")).toEqual({ whatsapp: null, email: null });
    expect(await contactoCapturaParaForm(null, "AR")).toEqual({ whatsapp: null, email: null });
    expect(await contactoCapturaParaForm(undefined)).toEqual({ whatsapp: null, email: null });
  });

  it("un teléfono o email inválido se ignora (se conserva el que estaba)", async () => {
    const r = await contactoCapturaParaForm({ telefono: "123", email: "no-es-mail" }, "AR");
    expect(r).toEqual({ whatsapp: null, email: null });
  });
});

describe("avisoContactoCaptura", () => {
  it("dice qué se tomó del aviso", () => {
    expect(avisoContactoCaptura({ telefono: true, email: false })).toBe("Usamos el teléfono del aviso.");
    expect(avisoContactoCaptura({ telefono: false, email: true })).toBe("Usamos el email del aviso.");
    expect(avisoContactoCaptura({ telefono: true, email: true })).toBe("Usamos el teléfono y el email del aviso.");
    expect(avisoContactoCaptura({ telefono: false, email: false })).toBe("");
  });
});
