import { describe, it, expect } from "vitest";
import { contactoCapturaParaForm, avisoContactoCaptura, formConContactoCaptura } from "./contactoCaptura";

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

describe("formConContactoCaptura: si ya había teléfono", () => {
  const conTelefono = {
    nombre: "Luna",
    contactoWhatsapp: "11 2345-6789",
    contactoWhatsappCountry: "AR",
    contactoEmail: "yo@mail.com",
  };

  it("el teléfono del flyer reemplaza al que estaba cargado", async () => {
    const capt = await contactoCapturaParaForm({ telefono: "387 15 588-5427", email: "" }, conTelefono.contactoWhatsappCountry);
    const f = formConContactoCaptura(conTelefono, capt);
    expect(f.contactoWhatsapp).toBe("387 588-5427");
    expect(f.contactoWhatsappCountry).toBe("AR");
    // Lo demás queda como estaba (el email no venía en el flyer).
    expect(f.contactoEmail).toBe("yo@mail.com");
    expect(f.nombre).toBe("Luna");
  });

  it("también si el número cargado era de otro país y el flyer no trae +54", async () => {
    const uruguayo = { ...conTelefono, contactoWhatsapp: "94 123 456", contactoWhatsappCountry: "UY" };
    const capt = await contactoCapturaParaForm({ telefono: "387 15 588-5427" }, uruguayo.contactoWhatsappCountry);
    const f = formConContactoCaptura(uruguayo, capt);
    expect(f.contactoWhatsapp).toBe("387 588-5427");
    expect(f.contactoWhatsappCountry).toBe("AR");
  });

  it("si el flyer no trae teléfono, se mantiene el que había", async () => {
    const capt = await contactoCapturaParaForm({ telefono: "", email: "duenio@mail.com" }, "AR");
    const f = formConContactoCaptura(conTelefono, capt);
    expect(f.contactoWhatsapp).toBe("11 2345-6789");
    expect(f.contactoWhatsappCountry).toBe("AR");
    expect(f.contactoEmail).toBe("duenio@mail.com");
  });

  it("si el teléfono del flyer no es válido, se mantiene el que había", async () => {
    const capt = await contactoCapturaParaForm({ telefono: "123" }, "AR");
    expect(formConContactoCaptura(conTelefono, capt)).toEqual(conTelefono);
  });
});
