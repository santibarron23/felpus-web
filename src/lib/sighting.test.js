import { describe, it, expect } from "vitest";
import {
  buildSightingDraft,
  sightingMissing,
  isSighting,
  sightingWhen,
  fechaLocal,
  horaLocal,
  estadoReporte,
  estadoLabel,
  estadoColor,
  pasaFiltroTipo,
  vistaEnDesdeInput,
  vistaEnParaInput,
  avistamientoCuando,
} from "./sighting";

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
  it("siempre es avistamiento (encontrada + marca), con hora y sin contacto obligatorio", () => {
    const d = buildSightingDraft(base, NOW);
    expect(d.tipo).toBe("encontrada");
    expect(d.detalles).toEqual({ avistamiento: true, hora: "21:30" });
    expect(isSighting(d)).toBe(true);
    expect(estadoReporte(d)).toBe("avistamiento");
    expect(d.contactoWhatsapp).toBe("");
    expect(d.nickname).toBe("Vecino/a");
    expect(d.descripcion).toMatch(/^Es un perro, de tamaño chico, color negro\. Vista el 27 de octubre a las 21:30\. La vieron suelta/);
  });

  it("usa cuándo la vieron, no cuándo se publica", () => {
    const vistaEn = Date.UTC(2026, 9, 27, 13, 5); // 27/10 10:05 en Salta
    const d = buildSightingDraft({ ...base, vistaEn }, NOW);
    expect(d.fecha).toBe("2026-10-27");
    expect(d.detalles.hora).toBe("10:05");
    expect(d.creadoEn).toBe(NOW);
  });

  it("sin foto: lo marca y la imagen genérica no se usa al comparar", () => {
    const d = buildSightingDraft({ ...base, sinFoto: true }, NOW);
    expect(d.detalles).toMatchObject({ sin_foto: true, fotos_dudosas: [0] });
    expect(d.descripcion).toContain("Sin foto.");
  });

  it("fecha en hora argentina, no UTC", () => {
    expect(buildSightingDraft(base, NOW).fecha).toBe("2026-10-27");
    expect(fechaLocal(NOW)).toBe("2026-10-27");
    expect(horaLocal(NOW)).toBe("21:30");
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
});

describe("estado propio", () => {
  const C = { greenSolid: "g", redSolid: "r", sightingSolid: "s", mapFound: "b" };
  const avist = { tipo: "encontrada", detalles: { avistamiento: true } };
  it("distingue perdida, encontrada, avistamiento y reencontrada", () => {
    expect(estadoLabel({ tipo: "perdida" })).toBe("Perdida");
    expect(estadoLabel({ tipo: "encontrada", detalles: {} })).toBe("Encontrada");
    expect(estadoLabel(avist)).toBe("Avistamiento");
    expect(estadoLabel({ ...avist, resuelto: true })).toBe("Reencontrada");
    expect([{ tipo: "perdida" }, { tipo: "encontrada" }, avist, { tipo: "perdida", resuelto: true }].map((r) => estadoColor(r, C))).toEqual(["r", "b", "s", "g"]);
  });

  it("filtro de Explorar: un avistamiento no aparece como encontrada", () => {
    expect(pasaFiltroTipo(avist, "encontrada")).toBe(false);
    expect(pasaFiltroTipo(avist, "avistamiento")).toBe(true);
    expect(pasaFiltroTipo({ tipo: "encontrada" }, "encontrada")).toBe(true);
    expect(pasaFiltroTipo({ tipo: "encontrada" }, "avistamiento")).toBe(false);
    expect(pasaFiltroTipo(avist, "todos")).toBe(true);
  });

  it("avistamientoCuando para la ficha", () => {
    expect(avistamientoCuando({ ...avist, fecha: "2026-10-27", detalles: { avistamiento: true, hora: "21:30" } })).toBe("27/10 a las 21:30");
    expect(avistamientoCuando({ ...avist, fecha: "2026-10-27" })).toBe("27/10");
    expect(avistamientoCuando({ tipo: "encontrada", fecha: "2026-10-27" })).toBe("");
  });
});

describe("cuándo la viste (input datetime-local)", () => {
  it("ida y vuelta en hora argentina", () => {
    expect(vistaEnParaInput(NOW)).toBe("2026-10-27T21:30");
    expect(vistaEnDesdeInput("2026-10-27T21:30", NOW)).toBe(NOW);
  });
  it("rechaza futuro, más de 30 días o basura", () => {
    expect(vistaEnDesdeInput("2026-10-28T10:00", NOW)).toBeNull();
    expect(vistaEnDesdeInput("2026-09-01T10:00", NOW)).toBeNull();
    expect(vistaEnDesdeInput("ayer", NOW)).toBeNull();
  });
});

describe("sightingMissing", () => {
  it("la foto es opcional; pide ubicación, especie y cuándo", () => {
    expect(sightingMissing({})).toEqual(["ubicación", "perro o gato"]);
    expect(sightingMissing({ lat: 1, lng: 2, especie: "gato" })).toEqual([]);
    expect(sightingMissing({ zona: "Centro", especie: "perro" })).toEqual([]);
    expect(sightingMissing({ zona: "Centro", especie: "perro", vistaEn: null })).toEqual(["cuándo la viste"]);
  });
});
