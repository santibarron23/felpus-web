// ¿La foto subida es una foto real de la mascota, o un flyer/cartel, una
// captura de pantalla o una ilustración? (2026-10-22, a pedido del usuario:
// la gente subía flyers armados y capturas de redes, que no sirven para el
// matching por foto.)
//
// Corre acá mismo en el servidor, igual que el embedding (ver
// imageEmbedding.js): transformers.js + ONNX Runtime, sin API externa ni
// costo aparte. CLIP compara la imagen contra frases ("a poster or flyer
// with text", "a photo of a dog"…) — justo lo que DINOv2 NO sabe hacer, y
// lo único para lo que CLIP sí sirve en Felpus (ver la nota en
// imageEmbedding.js de por qué no se usa para comparar mascotas).
//
// Calibrado con las 133 fotos reales de producción (2026-10-22), achicadas
// igual que en el celular antes de subir (1000 px, JPEG 0,85 — eso mueve el
// puntaje hasta ±0,03, por eso importa): sumando la probabilidad de las 3
// frases "malas", ninguna foto real de una mascota pasó de 0,056 y 12 de
// los 14 flyers/capturas dieron ≥ 0,07. Las frases de "foto real" extra
// (adentro, afuera, borrosa, de cerca) absorben las fotos reales difíciles;
// con solo 3 el margen era casi nulo. Se escapan una captura de una
// historia de Instagram y un flyer muy fotográfico.
// No detecta bien imágenes generadas con IA que parecen fotos: eso sigue
// dependiendo de las denuncias y del panel de admin.
//
// Segunda señal (2026-10-22): texto en la imagen (OCR con Tesseract, gratis,
// también en el servidor). Un flyer donde la foto ocupa casi todo engaña a
// CLIP, pero sigue teniendo "Se perdió", la zona, la fecha, el teléfono…
// Calibrado con las mismas 133 fotos: todos los flyers y capturas dieron 7
// palabras legibles o más (incluida la captura de historia que CLIP no
// veía), y ninguna foto real de mascota pasó de 1. Tres "fotos reales" con
// 4 a 26 palabras resultaron ser capturas (un posteo, una noticia, la
// galería del celular). La foto se marca si CUALQUIERA de las dos señales
// lo indica.
//
// Nunca bloquea: la app avisa y la persona decide (ver FelpusMatcher). Si
// igual la publica, la foto queda marcada para revisar y no se usa al
// comparar fotos (ver fotos_dudosas en matching.js).
import { logError } from "./log";

export const CHECK_MODEL = "Xenova/clip-vit-base-patch32";
const CHECK_MODEL_REVISION = "d15189d7028b43f1d3e65039190477f6af591c2a";

const LABELS = {
  perro: "a photo of a dog",
  gato: "a photo of a cat",
  mascota: "a photo of a pet",
  adentro: "a photo of a dog indoors",
  afuera: "a photo of a dog outdoors",
  borrosa: "a blurry photo of an animal",
  cerca: "a close-up photo of an animal",
  cartel: "a poster or flyer with text",
  captura: "a screenshot of a social media post",
  ilustracion: "a digital illustration or cartoon",
};
const MALAS = ["cartel", "captura", "ilustracion"];
export const PHOTO_CHECK_THRESHOLD = 0.07;
export const OCR_WORDS_THRESHOLD = 7;

// Palabras "de verdad" que leyó el OCR: confianza alta y al menos 3 letras
// seguidas (descarta el ruido que sale de pelo, baldosas o rejas).
export function countReadableWords(words) {
  return (words || []).filter((w) => (w?.confidence ?? 0) >= 70 && /[a-záéíóúüñ]{3,}/i.test(w?.text || "")).length;
}

// scores: probabilidad de cada frase de LABELS (suman 1).
// Devuelve { dudosa, tipo, score }; tipo es la frase "mala" más probable
// (para el texto del aviso) o null si la foto parece real.
// palabras (opcional): las que leyó el OCR (null si no corrió). Con mucho
// texto y CLIP tranquilo, tipo "texto" (el aviso dice "mucho texto").
export function classifyScores(scores, palabras = null) {
  const score = Math.round(MALAS.reduce((acc, k) => acc + (scores?.[k] || 0), 0) * 1000) / 1000;
  const conTexto = palabras != null && palabras >= OCR_WORDS_THRESHOLD;
  if (score >= PHOTO_CHECK_THRESHOLD) {
    const tipo = MALAS.reduce((best, k) => ((scores[k] || 0) > (scores[best] || 0) ? k : best), MALAS[0]);
    return { dudosa: true, tipo, score, palabras };
  }
  if (conTexto) return { dudosa: true, tipo: "texto", score, palabras };
  return { dudosa: false, tipo: null, score, palabras };
}

let ocrWorkerPromise = null;

function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      // Datos del idioma: se bajan de su CDN la primera vez y quedan en /tmp.
      return createWorker("spa", 1, { cachePath: "/tmp/tesseract-cache" });
    })().catch((e) => {
      ocrWorkerPromise = null;
      throw e;
    });
  }
  return ocrWorkerPromise;
}

// Cuántas palabras legibles tiene la imagen; null si el OCR falla (en ese
// caso decide solo CLIP).
async function readWords(bytes) {
  try {
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(bytes, {}, { blocks: true });
    const words = (data.blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
    return countReadableWords(words);
  } catch (e) {
    logError("No se pudo leer el texto de la foto (OCR)", e);
    return null;
  }
}

let classifierPromise = null;

function getClassifier() {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = "/tmp/hf-cache";
      env.allowLocalModels = false;
      return pipeline("zero-shot-image-classification", CHECK_MODEL, { dtype: "q8", revision: CHECK_MODEL_REVISION });
    })().catch((e) => {
      classifierPromise = null;
      throw e;
    });
  }
  return classifierPromise;
}

// bytes: Buffer con la imagen. Tira error si no se puede leer.
export async function checkPhoto(bytes) {
  const palabrasPromise = readWords(bytes);
  const { RawImage } = await import("@huggingface/transformers");
  const classify = await getClassifier();
  const image = await RawImage.fromBlob(new Blob([bytes]));
  const keys = Object.keys(LABELS);
  const result = await classify(image, keys.map((k) => LABELS[k]));
  const byLabel = Object.fromEntries(result.map((r) => [r.label, r.score]));
  const scores = Object.fromEntries(keys.map((k) => [k, byLabel[LABELS[k]] || 0]));
  return classifyScores(scores, await palabrasPromise);
}
