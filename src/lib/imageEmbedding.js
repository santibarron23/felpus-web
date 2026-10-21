// Embedding visual de una foto, calculado acá mismo en el servidor (función
// de Vercel) con transformers.js + ONNX Runtime — sin API externa, sin
// token y sin costo aparte del cómputo de Vercel que ya incluye el plan.
//
// Por qué así (2026-10-21): antes /api/embed le pedía CLIP a la API
// serverless vieja de Hugging Face (api-inference.huggingface.co). Ese
// dominio ya no existe (no resuelve DNS) y su reemplazo, Inference
// Providers (router.huggingface.co), no ofrece ningún modelo de embeddings
// de imagen — ni CLIP ni otro. Resultado: 0 reportes de producción tenían
// embedding y el matching visual era solo el histograma de color.
//
// Por qué DINOv2 y no CLIP: medido con las 108 fotos reales de producción
// (pares de fotos de la MISMA mascota dentro de un reporte vs. pares de
// mascotas distintas de la misma especie), qué tan bien separa cada señal
// (AUC, 0.5 = azar, 1 = perfecto):
//   histograma de color v2 ........ 0.69
//   CLIP ViT-B/32 .................. 0.73
//   MobileCLIP S0 .................. 0.65
//   DINOv2 small ................... 0.96
// CLIP aprende "qué hay en la foto" (un perro marrón) — casi no distingue
// un perro marrón de otro. DINOv2 está entrenado para reconocer la misma
// instancia en fotos distintas, que es justo lo que necesita Felpus.
//
// La versión cuantizada (q8, 24 MB) separa igual que la completa (0.96 vs
// 0.96) y tarda ~0,5 s por foto en CPU. El modelo se baja del Hub de
// Hugging Face (público, sin token) la primera vez que arranca la función
// y queda en /tmp y en memoria mientras la instancia siga viva.
//
// IMPORTANTE: todas las fotos tienen que usar el MISMO modelo y la misma
// revisión — embeddings de modelos distintos no son comparables. Por eso
// la revisión queda fija. Si algún día se cambia de modelo, los embeddings
// viejos quedan inservibles: cosineSimilarity (matching.js) devuelve null
// si las dimensiones no coinciden y se cae al histograma, pero si el
// modelo nuevo tuviera la misma dimensión habría que recalcularlos.
export const EMBED_MODEL = "onnx-community/dinov2-small";
const EMBED_MODEL_REVISION = "8b1f705a3a7f6f062f6bdd21986c1583d3ef105d";
export const EMBED_DIMS = 384;

let modelPromise = null;

async function loadModel() {
  const { AutoModel, AutoProcessor, env } = await import("@huggingface/transformers");
  // En Vercel el único directorio escribible es /tmp.
  env.cacheDir = "/tmp/hf-cache";
  env.allowLocalModels = false;
  const opts = { revision: EMBED_MODEL_REVISION };
  const [processor, model] = await Promise.all([
    AutoProcessor.from_pretrained(EMBED_MODEL, opts),
    AutoModel.from_pretrained(EMBED_MODEL, { ...opts, dtype: "q8" }),
  ]);
  return { processor, model };
}

function getModel() {
  if (!modelPromise) {
    // Si la carga falla (ej. el Hub caído), no dejar la promesa rechazada
    // cacheada: el próximo pedido lo vuelve a intentar.
    modelPromise = loadModel().catch((e) => {
      modelPromise = null;
      throw e;
    });
  }
  return modelPromise;
}

// Normaliza a norma 1 y redondea a 4 decimales: el coseno no cambia (la
// diferencia es del orden de 1e-4) y el JSON que se guarda en la base y se
// baja con el listado de reportes pesa menos de la mitad.
export function normalizeEmbedding(vec) {
  let norm = 0;
  for (const x of vec) norm += x * x;
  norm = Math.sqrt(norm);
  if (!norm || !Number.isFinite(norm)) return null;
  return Array.from(vec, (x) => Math.round((x / norm) * 1e4) / 1e4);
}

// bytes: Buffer con la imagen (JPEG/PNG/WebP). Devuelve un array plano de
// EMBED_DIMS números, o tira error si la imagen no se puede leer.
export async function embedImage(bytes) {
  const { RawImage } = await import("@huggingface/transformers");
  const { processor, model } = await getModel();
  const image = await RawImage.fromBlob(new Blob([bytes]));
  const inputs = await processor(image);
  const output = await model(inputs);
  // Token CLS (posición 0) de la última capa: el descriptor global de la
  // foto. Este export ONNX no trae pooler_output.
  const embedding = normalizeEmbedding(output.last_hidden_state.slice(null, 0, null).data);
  if (!embedding || embedding.length !== EMBED_DIMS) {
    throw new Error(`Embedding inesperado (dimensión ${embedding?.length ?? 0})`);
  }
  return embedding;
}
