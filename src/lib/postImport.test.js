import { describe, it, expect } from "vitest";
import {
  scrubPersonalData,
  buildGeminiRequest,
  parseGeminiResponse,
  sanitizeBox,
  interpretExtraction,
  importSummary,
  importToFormFields,
  GEMINI_RESPONSE_SCHEMA,
} from "./postImport";
import { COLOR_OPTIONS } from "./matching";

function geminiJson(obj, extra = {}) {
  return { candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(obj) }] }, ...extra }] };
}

const today = new Date().toISOString().slice(0, 10);

const ejemplo = {
  es_publicacion_mascota: true,
  tipo: "perdida",
  especie: "perro",
  nombre: "Luna",
  raza: "Mestizo",
  color: "Manchado / bicolor",
  color_detalle: "negra con manchas blancas",
  tamano: "mediano",
  sexo: "Hembra",
  edad: "no_se",
  zona: "Tres Cerritos",
  provincia: "Salta",
  fecha: today,
  accesorios: ["collar"],
  marcas: ["cojea", "mancha"],
  detalle_libre: "Lleva collar rosa. Llamar al 387 4123456 o escribir a juan@mail.com",
  foto_recuadro: [100, 200, 600, 800],
};

describe("scrubPersonalData", () => {
  it("borra teléfonos, mails, links y @usuarios", () => {
    const out = scrubPersonalData(
      "Perrita negra. Llamar al +54 9 387 412-3456, wsp 3874123456, mail juan.perez@gmail.com, ver https://wa.me/123 o @juanperez"
    );
    expect(out).not.toMatch(/\d{3}/);
    expect(out).not.toMatch(/@/);
    expect(out).not.toMatch(/https?:/);
    expect(out).toContain("Perrita negra.");
  });

  it("deja números cortos (edades, alturas de calle aproximadas)", () => {
    expect(scrubPersonalData("Tiene 3 años, por la calle 20 de Febrero")).toBe("Tiene 3 años, por la calle 20 de Febrero");
  });

  it("no rompe con valores que no son texto", () => {
    expect(scrubPersonalData(undefined)).toBe("");
  });
});

describe("buildGeminiRequest", () => {
  it("manda texto e imagen con salida JSON y el schema", () => {
    const req = buildGeminiRequest({ text: "Se perdió Luna", image: { media_type: "image/jpeg", data: "AAAA" }, now: new Date("2026-10-27T12:00:00Z") });
    expect(req.systemInstruction.parts[0].text).toContain("Hoy es 2026-10-27");
    expect(req.contents[0].parts[0].text).toContain("Se perdió Luna");
    expect(req.contents[0].parts[1]).toEqual({ inlineData: { mimeType: "image/jpeg", data: "AAAA" } });
    expect(req.generationConfig.responseMimeType).toBe("application/json");
    expect(req.generationConfig.responseSchema).toBe(GEMINI_RESPONSE_SCHEMA);
  });

  it("sin texto avisa que todo está en la imagen", () => {
    const req = buildGeminiRequest({ image: { media_type: "image/png", data: "AA==" } });
    expect(req.contents[0].parts[0].text).toMatch(/imagen/);
  });

  it("el schema usa exactamente las opciones del formulario", () => {
    expect(GEMINI_RESPONSE_SCHEMA.properties.color.enum).toEqual([...COLOR_OPTIONS, "no_se"]);
    expect(GEMINI_RESPONSE_SCHEMA.required).toEqual(Object.keys(GEMINI_RESPONSE_SCHEMA.properties));
  });
});

describe("parseGeminiResponse", () => {
  it("parsea el JSON del primer candidato", () => {
    expect(parseGeminiResponse(geminiJson({ tipo: "perdida" }))).toEqual({ data: { tipo: "perdida" } });
  });

  it("tolera el JSON envuelto en ```json y partido en varias partes", () => {
    const json = { candidates: [{ content: { parts: [{ text: '```json\n{"tipo":' }, { text: '"encontrada"}\n```' }] } }] };
    expect(parseGeminiResponse(json)).toEqual({ data: { tipo: "encontrada" } });
  });

  it("errores: bloqueado, vacío, JSON roto o que no es objeto", () => {
    expect(parseGeminiResponse({ promptFeedback: { blockReason: "SAFETY" } })).toEqual({ error: "blocked" });
    expect(parseGeminiResponse(geminiJson({}, { finishReason: "SAFETY" }))).toEqual({ error: "blocked" });
    expect(parseGeminiResponse({ candidates: [] })).toEqual({ error: "empty" });
    expect(parseGeminiResponse(null)).toEqual({ error: "empty" });
    expect(parseGeminiResponse({ candidates: [{ content: { parts: [{ text: "{roto" }] } }] })).toEqual({ error: "invalid" });
    expect(parseGeminiResponse({ candidates: [{ content: { parts: [{ text: "[1,2]" }] } }] })).toEqual({ error: "invalid" });
  });
});

describe("sanitizeBox", () => {
  it("convierte a fracciones con margen", () => {
    const b = sanitizeBox([100, 200, 600, 800]);
    expect(b.top).toBeCloseTo(0.09);
    expect(b.left).toBeCloseTo(0.19);
    expect(b.bottom).toBeCloseTo(0.61);
    expect(b.right).toBeCloseTo(0.81);
  });

  it("descarta recuadros inválidos, minúsculos o de la imagen entera", () => {
    expect(sanitizeBox([])).toBeNull();
    expect(sanitizeBox([600, 200, 100, 800])).toBeNull();
    expect(sanitizeBox([0, 0, 100, 100])).toBeNull();
    expect(sanitizeBox([0, 0, 1000, 1000])).toBeNull();
    expect(sanitizeBox([0, 0, 2000, 500])).toBeNull();
    expect(sanitizeBox(["a", 1, 2, 3])).toBeNull();
    expect(sanitizeBox("100,200,600,800")).toBeNull();
  });
});

describe("interpretExtraction", () => {
  it("valida contra el formulario, saca datos personales y descarta 'no_se'", () => {
    const r = interpretExtraction(ejemplo);
    expect(r.esMascota).toBe(true);
    expect(r.especieNoSoportada).toBe(false);
    expect(r.draft).toMatchObject({
      tipo: "perdida",
      especie: "perro",
      nombre: "Luna",
      color: "Manchado / bicolor",
      colorDetalle: "negra con manchas blancas",
      tamano: "mediano",
      sexo: "Hembra",
      edad: "",
      zona: "Tres Cerritos",
      fecha: today,
      accesorios: ["collar"],
      marcas: ["cojea"],
    });
    expect(r.draft.detalleLibre).toContain("collar rosa");
    expect(r.draft.detalleLibre).not.toMatch(/387|@/);
    expect(r.box).not.toBeNull();
  });

  it("valores fuera de las opciones quedan vacíos", () => {
    const r = interpretExtraction({ ...ejemplo, color: "Violeta", tamano: "gigante", sexo: "nene", tipo: "adopcion", fecha: "2001-01-01", accesorios: ["corona"] });
    expect(r.draft).toMatchObject({ color: "", tamano: "", sexo: "", tipo: "", fecha: "", accesorios: [] });
  });

  it("marca avisos que no son de mascotas y especies que Felpus no cubre", () => {
    expect(interpretExtraction({ es_publicacion_mascota: false }).esMascota).toBe(false);
    const r = interpretExtraction({ ...ejemplo, especie: "otra" });
    expect(r.especieNoSoportada).toBe(true);
    expect(r.draft.especie).toBe("");
  });

  it("tolera basura", () => {
    const r = interpretExtraction(null);
    expect(r.esMascota).toBe(true);
    expect(r.draft.tipo).toBe("");
    expect(r.box).toBeNull();
  });
});

describe("importToFormFields / importSummary", () => {
  it("mapea al formato de applyChatDraft", () => {
    const { draft } = interpretExtraction(ejemplo);
    const f = importToFormFields(draft);
    expect(f.reportKind).toBe("perdida");
    expect(f.form).toMatchObject({
      especie: "perro",
      nombre: "Luna",
      raza: "Mestizo",
      color: "Manchado / bicolor",
      tamano: "mediano",
      sexo: "Hembra",
      zona: "Tres Cerritos",
      provincia: "Salta",
      fecha: today,
    });
    expect(f.accesorioChips).toEqual(["collar"]);
    expect(f.marcaChips).toEqual(["cojea"]);
    expect(f.detalleLibre).toContain("Color: negra con manchas blancas.");
  });

  it("lo que no se detectó no pisa el formulario con valores por defecto", () => {
    const { draft } = interpretExtraction({ color: "Negro" });
    const f = importToFormFields(draft);
    expect(f.reportKind).toBeNull();
    expect("especie" in f.form).toBe(false);
    expect("tamano" in f.form).toBe(false);
    expect("fecha" in f.form).toBe(false);
    expect("nombre" in f.form).toBe(false);
    expect("zona" in f.form).toBe(false);
    expect("lat" in f.form).toBe(false);
    expect(f.form.color).toBe("Negro");
  });

  it("resume lo completado y lo obligatorio que falta", () => {
    const { draft } = interpretExtraction({ tipo: "encontrada", especie: "gato", color: "Gris" });
    const s = importSummary(draft, { hasPhoto: true });
    expect(s.completados).toEqual(["perdida/encontrada", "especie", "color"]);
    expect(s.faltan).toEqual(["zona", 'sexo (puede ser "No sé")']);
  });
});
