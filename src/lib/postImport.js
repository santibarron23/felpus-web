// Lógica pura de "Importar una publicación de Facebook" (/api/import-post):
// qué links se aceptan, cómo se leen los metadatos públicos (og:*), qué se le
// pide a Gemini y cómo se valida lo que devuelve antes de que toque el
// formulario. Separado de la ruta para poder testearlo sin red ni API key.
//
// Lo que devuelve Gemini termina en el MISMO borrador que usa el Asistente
// Felpus (normalizeDraft / draftToFormFields en chatbot.js): una sola
// validación contra las opciones reales del formulario. Nada se publica
// desde acá — la persona revisa el formulario y toca Publicar como siempre.
//
// Protección de datos: el link no se guarda en ningún lado, y del texto del
// post se borran teléfonos, mails, links y @usuarios (el contacto se lo pide
// Felpus a quien publica, como en cualquier reporte).
import { COLOR_OPTIONS, TAMANO_OPTIONS } from "./matching";
import {
  normalizeDraft,
  draftToFormFields,
  missingFields,
  SEXO_CHAT_OPTIONS,
  EDAD_CHAT_OPTIONS,
  ACCESORIO_IDS,
  MARCA_IDS,
} from "./chatbot";

// Plan gratuito: los modelos "lite" tienen bastante más cupo diario que los
// "flash" comunes. Los alias "-latest" siguen al modelo vigente sin tener
// que tocar código cuando Google da de baja uno. GEMINI_MODEL lo pisa.
export const DEFAULT_GEMINI_MODEL = "gemini-flash-lite-latest";
export const FALLBACK_GEMINI_MODEL = "gemini-flash-latest";

export const MAX_POST_TEXT_CHARS = 3000;
export const MAX_PAGE_BYTES = 1_500_000;
export const MAX_REMOTE_IMAGE_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------
const FACEBOOK_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "web.facebook.com",
  "mbasic.facebook.com",
  "touch.facebook.com",
  "fb.com",
  "www.fb.com",
  "fb.me",
  "fb.watch",
]);

// Devuelve el link normalizado (https, sin usuario/puerto/#) o null si no es
// de Facebook. Se usa en cada salto de redirección, no solo en el primero:
// así la función del servidor nunca termina pidiendo otra cosa (SSRF).
export function normalizeFacebookUrl(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > 2000) return null;
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  if (!FACEBOOK_HOSTS.has(host)) return null;
  u.protocol = "https:";
  u.hash = "";
  return u.toString();
}

// Las fotos de las publicaciones las sirve el CDN de Facebook.
export function isAllowedImageUrl(value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return host.endsWith(".fbcdn.net") || host === "lookaside.fbsbx.com";
}

// ---------------------------------------------------------------------------
// Metadatos públicos (Open Graph) — lo mismo que usa cualquier vista previa
// de link. Sin sesión, sin JavaScript, sin saltear nada: si Facebook no los
// entrega, la persona sube una captura.
// ---------------------------------------------------------------------------
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodeEntities(s) {
  return String(s || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function attr(tag, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return m ? (m[2] ?? m[3] ?? "") : null;
}

export function extractOgTags(html) {
  const out = {};
  const tags = String(html || "").match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = (attr(tag, "property") || attr(tag, "name") || "").toLowerCase();
    if (!["og:title", "og:description", "og:image", "description"].includes(key)) continue;
    const content = attr(tag, "content");
    if (content == null || out[key]) continue;
    out[key] = decodeEntities(content).trim();
  }
  return {
    title: out["og:title"] || "",
    description: out["og:description"] || out.description || "",
    image: out["og:image"] || "",
  };
}

// Facebook a veces devuelve la página de "Iniciá sesión" con su propio
// og:title genérico: eso no es la publicación.
const GENERIC_TITLES = /^(facebook|log in|login|iniciar sesi[oó]n|inicia sesi[oó]n|entrar|log into facebook)\b/i;
export function postTextFromOg(og) {
  const title = GENERIC_TITLES.test(og.title || "") ? "" : og.title || "";
  const description = /log in|inicia sesi[oó]n|iniciá sesi[oó]n|see posts, photos and more/i.test(og.description || "")
    ? ""
    : og.description || "";
  const parts = [title, description].map((s) => s.trim()).filter(Boolean);
  // El og:title suele repetir el comienzo de la descripción.
  if (parts.length === 2 && parts[1].startsWith(parts[0].replace(/[.…]+$/, ""))) parts.shift();
  return parts.join("\n").slice(0, MAX_POST_TEXT_CHARS);
}

// ---------------------------------------------------------------------------
// Datos personales de terceros: fuera antes de llegar al formulario.
// ---------------------------------------------------------------------------
export function scrubPersonalData(text) {
  if (typeof text !== "string") return "";
  return (
    text
      // Links y mails.
      .replace(/\b(?:https?:\/\/|www\.)\S+/gi, " ")
      .replace(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, " ")
      // @usuarios.
      .replace(/(^|\s)@[\w.]{2,}/g, "$1")
      // Teléfonos: 7 o más dígitos, con o sin +, espacios, guiones o paréntesis.
      .replace(/\+?\d[\d\s().-]{5,}\d/g, (m) => (m.replace(/\D/g, "").length >= 7 ? " " : m))
      .replace(/\b(tel(?:[eé]fono)?|cel(?:ular)?|whatsapp|wsp|wpp|contacto|llamar al|comunicarse al)\s*[:.]?\s*(?=[\s,.;]|$)/gi, " ")
      .replace(/\s+([,.;:])/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
  );
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------
const NO_SE = "no_se";
const S = (extra = {}) => ({ type: "STRING", ...extra });
const E = (values, extra = {}) => ({ type: "STRING", enum: [...values, NO_SE], ...extra });

export const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    es_publicacion_mascota: { type: "BOOLEAN", description: "true si es un aviso de un perro o gato perdido o encontrado." },
    tipo: E(["perdida", "encontrada"], { description: "perdida = la persona perdió su mascota; encontrada = encontró una ajena (o la vio suelta)." }),
    especie: E(["perro", "gato", "otra"]),
    nombre: S({ description: "Nombre de la mascota, solo si el aviso lo dice. Nunca el nombre de una persona." }),
    raza: S({ description: "Solo si el aviso la nombra. \"Mestizo\" si dice que no tiene raza." }),
    color: E(COLOR_OPTIONS, { description: "Categoría más cercana. Dos o más colores marcados = \"Manchado / bicolor\"." }),
    color_detalle: S({ description: "El color con las palabras del aviso o lo que se ve en la foto." }),
    tamano: E(TAMANO_OPTIONS),
    sexo: E(SEXO_CHAT_OPTIONS.filter((s) => s !== "No sé"), { description: "Solo si el aviso lo dice (perrita/gatita/hembra = Hembra)." }),
    edad: E(EDAD_CHAT_OPTIONS),
    zona: S({ description: "Barrio, calle o lugar aproximado donde se perdió o se encontró. Nunca la dirección exacta de una casa." }),
    provincia: S({ description: "Provincia argentina, si se sabe." }),
    fecha: S({ description: "AAAA-MM-DD en que se perdió o se encontró, solo si el aviso permite saberla. Vacío si no." }),
    accesorios: { type: "ARRAY", items: { type: "STRING", enum: ACCESORIO_IDS } },
    marcas: { type: "ARRAY", items: { type: "STRING", enum: MARCA_IDS } },
    detalle_libre: {
      type: "STRING",
      description:
        "1 a 3 oraciones con lo útil para reconocerla que no entra en otros campos (collar, hora, cómo reacciona). " +
        "Sin teléfonos, nombres de personas, direcciones exactas, recompensas ni links.",
    },
    foto_recuadro: {
      type: "ARRAY",
      items: { type: "INTEGER" },
      description:
        "Recuadro [ymin, xmin, ymax, xmax] (0 a 1000) de la FOTO del animal dentro de la imagen. Lista vacía si no hay una foto del animal.",
    },
  },
  required: [
    "es_publicacion_mascota", "tipo", "especie", "nombre", "raza", "color", "color_detalle", "tamano", "sexo",
    "edad", "zona", "provincia", "fecha", "accesorios", "marcas", "detalle_libre", "foto_recuadro",
  ],
};

export function buildGeminiPrompt(now = new Date()) {
  const hoy = now.toISOString().slice(0, 10);
  return [
    "Leés avisos de redes sociales sobre perros y gatos perdidos o encontrados en Argentina (sobre todo Salta) y",
    "completás un formulario. Recibís el texto de la publicación, una foto o una captura de pantalla, o ambos.",
    `Hoy es ${hoy}. Si dice "ayer", "hoy" o una fecha sin año, calculala; si no hay forma de saberla, dejala vacía.`,
    "Reglas:",
    "- Usá solo lo que dice el aviso o se ve claramente en la foto. Si no lo sabés, \"no_se\" o \"\". No inventes.",
    "- Color, tamaño y especie se pueden sacar de la foto; sexo, nombre, edad y raza solo si el aviso lo dice.",
    "- NO copies teléfonos, mails, links, nombres de personas, direcciones exactas ni recompensas en ningún campo.",
    "- Si es otra cosa (adopción, venta, un meme, algo que no es un animal perdido/encontrado), es_publicacion_mascota = false.",
    "- foto_recuadro: si es una captura de pantalla, el recuadro de la foto del animal (sin textos ni bordes de la app).",
  ].join("\n");
}

export function buildGeminiRequest({ text = "", image = null, now = new Date() } = {}) {
  const parts = [];
  const t = (text || "").slice(0, MAX_POST_TEXT_CHARS).trim();
  parts.push({ text: t ? `Texto de la publicación:\n"""\n${t}\n"""` : "No hay texto aparte: está todo en la imagen." });
  if (image) parts.push({ inlineData: { mimeType: image.media_type, data: image.data } });
  return {
    systemInstruction: { parts: [{ text: buildGeminiPrompt(now) }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: GEMINI_RESPONSE_SCHEMA,
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  };
}

// Respuesta cruda de generateContent -> objeto, o { error }.
export function parseGeminiResponse(json) {
  if (!json || typeof json !== "object") return { error: "empty" };
  if (json.promptFeedback?.blockReason) return { error: "blocked" };
  const cand = json.candidates?.[0];
  if (!cand) return { error: "empty" };
  if (cand.finishReason && !["STOP", "MAX_TOKENS"].includes(cand.finishReason)) return { error: "blocked" };
  const text = (cand.content?.parts || []).map((p) => (typeof p.text === "string" ? p.text : "")).join("").trim();
  if (!text) return { error: "empty" };
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const data = JSON.parse(clean);
    if (!data || typeof data !== "object" || Array.isArray(data)) return { error: "invalid" };
    return { data };
  } catch {
    return { error: "invalid" };
  }
}

// [ymin, xmin, ymax, xmax] en 0..1000 -> fracciones 0..1 con un margen
// mínimo (más grande se mete la barra de "Me gusta" o el texto del post y
// la foto parece una captura), o null si no sirve o ya es (casi) la imagen
// entera.
export function sanitizeBox(value, margin = 0.01) {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const n = value.map((v) => Number(v));
  if (n.some((v) => !Number.isFinite(v) || v < 0 || v > 1000)) return null;
  let [top, left, bottom, right] = n.map((v) => v / 1000);
  if (bottom <= top || right <= left) return null;
  const area = (bottom - top) * (right - left);
  if (area < 0.03 || area > 0.9) return null;
  top = Math.max(0, top - margin);
  left = Math.max(0, left - margin);
  bottom = Math.min(1, bottom + margin);
  right = Math.min(1, right + margin);
  return { top, left, bottom, right };
}

const noSe = (v) => (v === NO_SE ? "" : v);
const TEXT_FIELDS = ["nombre", "raza", "color_detalle", "zona", "provincia", "detalle_libre"];

// Lo que devolvió Gemini (ya parseado) -> { esMascota, especieNoSoportada,
// draft (formato de chatbot.js, validado), box }.
export function interpretExtraction(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const input = {};
  for (const k of ["tipo", "especie", "color", "tamano", "sexo", "edad", "fecha"]) input[k] = noSe(r[k]);
  for (const k of TEXT_FIELDS) input[k] = scrubPersonalData(noSe(r[k]));
  input.accesorios = r.accesorios;
  input.marcas = r.marcas;
  const draft = normalizeDraft(input);
  // Sin mancha_ubicacion/color en el schema: una "mancha" sin dónde ni de
  // qué color no suma y deja la frase rara en la descripción.
  draft.marcas = draft.marcas.filter((m) => m !== "mancha");
  return {
    esMascota: r.es_publicacion_mascota !== false,
    especieNoSoportada: r.especie === "otra",
    draft,
    box: sanitizeBox(r.foto_recuadro),
  };
}

const FIELD_LABELS = {
  tipo: "perdida/encontrada",
  especie: "especie",
  nombre: "nombre",
  raza: "raza",
  color: "color",
  tamano: "tamaño",
  sexo: "sexo",
  edad: "edad",
  zona: "zona",
  fecha: "fecha",
  detalleLibre: "detalles",
};

// Qué se completó (para el resumen que ve la persona) y qué falta de lo
// obligatorio del formulario.
export function importSummary(draft, { hasPhoto = false } = {}) {
  const d = normalizeDraft(draft);
  const completados = Object.keys(FIELD_LABELS)
    .filter((k) => (k === "color" ? d.color || d.colorDetalle : d[k]))
    .map((k) => FIELD_LABELS[k]);
  const faltan = missingFields(d, { hasPhoto })
    .filter((f) => f.requerido)
    .map((f) => f.campo);
  return { completados, faltan };
}

// Borrador -> lo que espera applyChatDraft en FelpusMatcher (mismo camino
// que el Asistente). Lo que el aviso no dice queda vacío, no con un valor
// inventado: tipo y especie solo si se detectaron.
export function importToFormFields(draft) {
  const d = normalizeDraft(draft);
  const fields = draftToFormFields(d);
  // Solo lo que el aviso dice: lo vacío no pisa lo que la persona ya había
  // escrito, y draftToFormFields completa "perro"/"mediano" por defecto —
  // acá no, así queda lo que tenía el formulario y la persona lo elige.
  const form = Object.fromEntries(Object.entries(fields.form).filter(([, v]) => v !== "" && v != null));
  if (!d.especie) delete form.especie;
  if (!d.tamano) delete form.tamano;
  return { ...fields, reportKind: d.tipo || null, form };
}
