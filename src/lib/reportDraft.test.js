import { describe, it, expect } from "vitest";
import { serializeReportDraft, parseReportDraft, draftHasContent, REPORT_DRAFT_TTL_MS } from "./reportDraft";

const NOW = 1_800_000_000_000;
const estado = {
  reportKind: "encontrada",
  form: {
    especie: "gato",
    raza: "",
    nombre: "",
    color: "Gris",
    colorOtro: "",
    tamano: "chico",
    sexo: "",
    edad: "",
    peso: "",
    zona: "Tres Cerritos",
    ciudad: "Salta",
    provincia: "Salta",
    lat: -24.77,
    lng: -65.41,
    fecha: "2026-10-26",
    fotos: [{ dataUrl: "data:image/jpeg;base64,AAAA" }],
    contactoWhatsapp: "3874123456",
    contactoEmail: "x@y.com",
  },
  accesorioChips: ["collar"],
  reaccionChips: [],
  marcaChips: [],
  manchaUbicacion: "",
  manchaColor: "",
  detalleLibre: "Asustadizo",
};

describe("reportDraft", () => {
  it("guarda y recupera el formulario, sin fotos ni contacto", () => {
    const raw = serializeReportDraft(estado, NOW);
    expect(raw).not.toMatch(/AAAA|3874123456|x@y\.com/);
    const d = parseReportDraft(raw, NOW + 1000);
    expect(d.reportKind).toBe("encontrada");
    expect(d.form).toMatchObject({ especie: "gato", color: "Gris", zona: "Tres Cerritos", lat: -24.77, lng: -65.41, fecha: "2026-10-26" });
    expect(d.form.fotos).toBeUndefined();
    expect(d.form.contactoWhatsapp).toBeUndefined();
    expect(d.accesorioChips).toEqual(["collar"]);
    expect(d.detalleLibre).toBe("Asustadizo");
  });

  it("vence a las 24 h", () => {
    const raw = serializeReportDraft(estado, NOW);
    expect(parseReportDraft(raw, NOW + REPORT_DRAFT_TTL_MS + 1)).toBeNull();
  });

  it("descarta lo roto o sin datos propios", () => {
    expect(parseReportDraft("{roto", NOW)).toBeNull();
    expect(parseReportDraft(JSON.stringify({ v: 2, savedAt: NOW }), NOW)).toBeNull();
    const vacio = serializeReportDraft({ reportKind: "perdida", form: { especie: "perro", tamano: "mediano", fecha: "2026-10-27" } }, NOW);
    expect(parseReportDraft(vacio, NOW)).toBeNull();
  });

  it("limpia valores raros", () => {
    const raw = JSON.stringify({ v: 1, savedAt: NOW, reportKind: "x", form: { zona: "Centro", lat: 999, lng: 1, fecha: "ayer", especie: 3 }, accesorioChips: [1, "collar"] });
    const d = parseReportDraft(raw, NOW);
    expect(d.reportKind).toBe("perdida");
    expect(d.form.lat).toBeNull();
    expect(d.form.lng).toBeNull();
    expect("fecha" in d.form).toBe(false);
    expect("especie" in d.form).toBe(false);
    expect(d.accesorioChips).toEqual(["collar"]);
  });

  it("draftHasContent ignora los valores por defecto", () => {
    expect(draftHasContent({ form: { especie: "perro", tamano: "mediano" } })).toBe(false);
    expect(draftHasContent({ form: {}, detalleLibre: "algo" })).toBe(true);
  });
});
