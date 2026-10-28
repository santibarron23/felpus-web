import { describe, it, expect } from "vitest";
import { buildSightingDraft, sightingMissing, isSighting, sightingWhen, fechaLocal } from "./sighting";

// 27/10/2026 21:30 en Salta (UTC-3) = 28/10 00:30 UTC.
const NOW = Date.UTC(2026, 9, 28, 0, 30);

const base = {
  id: "abc-1",
  especie: "perro",
  color: "Negro",
  tamano: "chico",
  zona: "Tres Cerritos",
  ciudad: "Salta",
  provincia: "Salta",
  lat: -24.77,
  lng: -65.41,
  fotos: [{ dataUrl: "x", hist: [1], embedding: null }],
};

describe("buildSightingDraft", () => {
  it("solo la vio: encontrada marcada como avistamiento, sin contacto obligatorio", () => {
    const d = buildSightingDraft({ ...base, conmigo: false }, NOW);
    expect(d.tipo).toBe("encontrada");
    expect(d.detalles).toEqual({ avistamiento: true });
    expect(isSighting(d)).toBe(true);
    expect(d.contactoWhatsapp).toBe("");
    expect(d.nickname).toBe("Vecino/a");
    expect(d.descripcion).toMatch(/^Es un perro, de tamaño chico, color negro\. Vista el 27 de octubre a las 21:30\. La vi suelta/);
  });

  it("la tiene con ella: encontrada común", () => {
    const d = buildSightingDraft({ ...base, conmigo: true, contactoWhatsapp: "5493874123456", nickname: "Santi" }, NOW);
    expect(d.detalles).toEqual({});
    expect(isSighting(d)).toBe(false);
    expect(d.contactoWhatsapp).toBe("5493874123456");
    expect(d.nickname).toBe("Santi");
    expect(d.descripcion).toContain("La tengo conmigo.");
  });

  it("fecha en hora argentina, no UTC", () => {
    expect(buildSightingDraft(base, NOW).fecha).toBe("2026-10-27");
    expect(fechaLocal(NOW)).toBe("2026-10-27");
    expect(sightingWhen(NOW)).toBe("Vista el 27 de octubre a las 21:30.");
  });

  it("vincula el reporte desde el que se avisó, solo si el id es válido", () => {
    expect(buildSightingDraft({ ...base, vistaDe: "1792685777000-urnffd" }, NOW).detalles.avistamiento_de).toBe("1792685777000-urnffd");
    expect(buildSightingDraft({ ...base, vistaDe: "<script>" }, NOW).detalles.avistamiento_de).toBeUndefined();
  });

  it("sin zona escrita usa la ciudad o una leyenda (zona es obligatoria en la base)", () => {
    expect(buildSightingDraft({ ...base, zona: "" }, NOW).zona).toBe("Salta");
    expect(buildSightingDraft({ ...base, zona: "", ciudad: "" }, NOW).zona).toBe("Ubicación marcada en el mapa");
  });

  it("pasa las fotos dudosas a detalles", () => {
    expect(buildSightingDraft({ ...base, fotosDudosas: [0] }, NOW).detalles.fotos_dudosas).toEqual([0]);
  });
});

describe("sightingMissing", () => {
  it("lista lo que falta", () => {
    expect(sightingMissing({})).toEqual(["foto", "ubicación", "perro o gato"]);
    expect(sightingMissing({ fotos: [1], lat: 1, lng: 2, especie: "gato" })).toEqual([]);
    expect(sightingMissing({ fotos: [1], zona: "Centro", especie: "perro" })).toEqual([]);
    expect(sightingMissing({ fotos: [1], lat: 1, lng: 2, especie: "perro", conmigo: true, whatsappOk: false })).toEqual(["tu WhatsApp"]);
  });
});
