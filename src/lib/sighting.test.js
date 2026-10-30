import { describe, it, expect } from "vitest";
import {
  buildSightingDraft,
  validarDatosAvistamiento,
  avistamientosDe,
  direccionLabel,
  COMENTARIO_MAX,
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

describe("dirección y comentario (2026-10-30)", () => {
  const base = { especie: "perro", zona: "Centro", vistaEn: Date.UTC(2026, 9, 27, 21, 30), id: "s1" };

  it("se guardan solo si vienen con valores válidos", () => {
    expect(buildSightingDraft({ ...base, direccion: "norte", comentario: "  iba con collar rojo " }).detalles).toMatchObject({ direccion: "norte", comentario: "iba con collar rojo" });
    const d = buildSightingDraft({ ...base, direccion: "no_se", comentario: "   " }).detalles;
    expect(d.direccion).toBeUndefined();
    expect(d.comentario).toBeUndefined();
    expect(buildSightingDraft({ ...base, direccion: "arriba" }).detalles.direccion).toBeUndefined();
  });

  it("direccionLabel", () => {
    expect(direccionLabel("oeste")).toBe("Oeste");
    expect(direccionLabel("no_se")).toBe("");
    expect(direccionLabel(undefined)).toBe("");
  });
});

describe("validarDatosAvistamiento (servidor)", () => {
  const av = (detalles) => ({ tipo: "encontrada", detalles: { avistamiento: true, ...detalles } });

  it("deja pasar reportes sin estos datos", () => {
    expect(validarDatosAvistamiento({ tipo: "perdida", detalles: { comportamientos: ["miedoso"] } })).toEqual({ detalles: { comportamientos: ["miedoso"] } });
    expect(validarDatosAvistamiento({ tipo: "perdida", detalles: null })).toEqual({ detalles: null });
  });

  it("acepta y normaliza un avistamiento válido", () => {
    expect(validarDatosAvistamiento(av({ direccion: "sur", comentario: " cojeaba ", avistamiento_de: "123-abc" }))).toEqual({
      detalles: { avistamiento: true, direccion: "sur", comentario: "cojeaba", avistamiento_de: "123-abc" },
    });
    expect(validarDatosAvistamiento(av({ comentario: "  " })).detalles.comentario).toBeUndefined();
  });

  it("rechaza lo que no corresponde", () => {
    for (const row of [
      { tipo: "perdida", detalles: { direccion: "sur" } },
      { tipo: "encontrada", detalles: { comentario: "hola" } },
      av({ direccion: "no_se" }),
      av({ direccion: "arriba" }),
      av({ comentario: 5 }),
      av({ comentario: "a".repeat(COMENTARIO_MAX + 1) }),
      av({ avistamiento_de: "x),user_id.not.is.null,(" }),
    ]) {
      expect(validarDatosAvistamiento(row).error, JSON.stringify(row)).toBeTruthy();
    }
  });
});

describe("avistamientosDe", () => {
  const perdida = { id: "p1", tipo: "perdida", detalles: { avistamientos_descartados: ["s3"] } };
  const av = (id, fecha, hora, extra = {}) => ({ id, tipo: "encontrada", fecha, detalles: { avistamiento: true, avistamiento_de: "p1", hora }, ...extra });
  const lista = [
    av("s1", "2026-10-27", "09:00"),
    av("s2", "2026-10-28", "08:00"),
    av("s3", "2026-10-29", "08:00"),
    av("s4", "2026-10-29", "10:00", { oculto: true }),
    { id: "s5", tipo: "encontrada", fecha: "2026-10-29", detalles: { avistamiento: true, avistamiento_de: "otra" } },
    { id: "e1", tipo: "encontrada", fecha: "2026-10-29", detalles: { avistamiento_de: "p1" } },
  ];

  it("solo los vinculados, sin ocultos ni descartados, del más nuevo al más viejo", () => {
    expect(avistamientosDe(perdida, lista).map((r) => r.id)).toEqual(["s2", "s1"]);
  });

  it("sin perdida, nada", () => {
    expect(avistamientosDe(null, lista)).toEqual([]);
  });
});
