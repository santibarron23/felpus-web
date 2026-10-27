import { logError } from "../../../lib/log";
import { isJsonRequest, getClientIp } from "../../../lib/httpGuards";
import { parseImageDataUrl } from "../../../lib/chatbot";
import { makeAiRateLimit } from "../../../lib/serverAiRateLimit";
import {
  DEFAULT_GEMINI_MODEL,
  FALLBACK_GEMINI_MODEL,
  buildGeminiRequest,
  parseGeminiResponse,
  interpretExtraction,
} from "../../../lib/postImport";

// Leer la captura de una publicación (Facebook, Instagram, WhatsApp, un
// flyer) y devolver un borrador para el formulario de reporte. Corre solo en
// el servidor: GEMINI_API_KEY nunca llega al navegador. No escribe nada en la
// base ni guarda la imagen: la persona revisa el formulario y publica (o no)
// con el botón de siempre.
//
// Antes también aceptaba el link de un post de Facebook (metadatos og:*),
// pero Facebook casi nunca los entrega sin sesión — se sacó (2026-10-27).
export const runtime = "nodejs";
export const maxDuration = 45;

// A lo sumo una captura ya achicada en el navegador (ver chatbot.js).
const MAX_BODY_CHARS = 1_600_000;
const GEMINI_TIMEOUT_MS = 30_000;

const checkRateLimit = makeAiRateLimit({ maxPerMinute: 6 });

function logEvent(event, data) {
  // Va a los logs de Vercel. Sin el contenido de la captura ni la IP.
  console.info(JSON.stringify({ event, ...data }));
}

const json = (body, status = 200) => Response.json(body, { status });

// Gemini (plan gratuito). Con 429/404/5xx prueba una vez con el modelo de
// respaldo: el cupo gratis es por modelo.
async function callGemini(apiKey, request) {
  const models = [...new Set([process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL])];
  let lastStatus = 0;
  for (const model of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    if (res.ok) return { model, body: await res.json() };
    lastStatus = res.status;
    if (![404, 429, 500, 503].includes(res.status)) break;
  }
  return { status: lastStatus };
}

export async function POST(request) {
  if (!isJsonRequest(request)) return json({ error: "Content-Type inválido." }, 415);

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return json({ error: "La lectura con IA no está disponible ahora.", code: "unavailable" }, 501);

  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return json({ error: "La imagen es demasiado grande." }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "Body inválido." }, 400);
  }

  const img = parseImageDataUrl(body?.image);
  if (img.error) return json({ error: img.error }, 400);
  if (!img.image) return json({ error: "Falta la captura." }, 400);

  if (!(await checkRateLimit(getClientIp(request)))) {
    return json({ error: "Demasiados intentos seguidos. Probá de nuevo en un rato.", code: "rate_limit" }, 429);
  }

  try {
    const result = await callGemini(apiKey, buildGeminiRequest({ image: img.image }));
    if (!result.body) {
      logEvent("import_post_gemini_error", { status: result.status });
      if (result.status === 429) return json({ error: "La IA está saturada. Probá de nuevo en un rato.", code: "unavailable" }, 503);
      if ([400, 401, 403].includes(result.status)) {
        logError("Gemini: GEMINI_API_KEY inválida, sin permisos o pedido rechazado", new Error(`status ${result.status}`));
      }
      return json({ error: "No pudimos leer la captura ahora.", code: "unavailable" }, 503);
    }
    const parsed = parseGeminiResponse(result.body);
    if (parsed.error) {
      logEvent("import_post_respuesta_invalida", { model: result.model, motivo: parsed.error });
      return json({ error: "No pudimos entender la captura. Completá el formulario a mano.", code: "error" }, 502);
    }
    const out = interpretExtraction(parsed.data);
    logEvent("import_post_ok", { model: result.model, esMascota: out.esMascota, conRecuadro: !!out.box });
    if (!out.esMascota) {
      return json({ error: "No parece un aviso de un perro o gato perdido o encontrado.", code: "not_pet" }, 422);
    }
    if (out.especieNoSoportada) {
      return json({ error: "Por ahora Felpus es solo para perros y gatos.", code: "not_pet" }, 422);
    }
    // box: recuadro de la mascota dentro de la captura (el navegador la recorta).
    return json({ draft: out.draft, box: out.box });
  } catch (e) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError") {
      return json({ error: "La IA tardó demasiado. Probá de nuevo.", code: "unavailable" }, 503);
    }
    logError("Fallo inesperado en /api/import-post", e);
    return json({ error: "No pudimos leer la captura ahora.", code: "error" }, 500);
  }
}
