import { logError } from "../../../lib/log";
import { isJsonRequest, getClientIp } from "../../../lib/httpGuards";
import { parseImageDataUrl } from "../../../lib/chatbot";
import { makeAiRateLimit } from "../../../lib/serverAiRateLimit";
import {
  DEFAULT_GEMINI_MODEL,
  FALLBACK_GEMINI_MODEL,
  MAX_PAGE_BYTES,
  MAX_REMOTE_IMAGE_BYTES,
  normalizeFacebookUrl,
  isAllowedImageUrl,
  extractOgTags,
  postTextFromOg,
  buildGeminiRequest,
  parseGeminiResponse,
  interpretExtraction,
} from "../../../lib/postImport";

// Importar una publicación de Facebook (link o captura) al formulario de
// reporte. Corre solo en el servidor: GEMINI_API_KEY nunca llega al
// navegador. No escribe nada en la base ni guarda el link: devuelve un
// borrador que la persona revisa y publica (o no) con el botón de siempre.
export const runtime = "nodejs";
export const maxDuration = 45;

// A lo sumo una captura ya achicada en el navegador (ver chatbot.js).
const MAX_BODY_CHARS = 1_600_000;
const FETCH_TIMEOUT_MS = 6000;
const GEMINI_TIMEOUT_MS = 25_000;
// User-Agent honesto: no nos hacemos pasar por el crawler de Facebook ni
// por un navegador. Si Facebook no entrega los metadatos, la persona sube
// una captura.
const USER_AGENT = "FelpusBot/1.0 (+https://felpus.com; vista previa de un link que pegó quien publica)";

const checkRateLimit = makeAiRateLimit({ maxPerMinute: 6 });

function logEvent(event, data) {
  // Va a los logs de Vercel. Sin el link, el texto del post ni la IP.
  console.info(JSON.stringify({ event, ...data }));
}

const json = (body, status = 200) => Response.json(body, { status });

// Lee el cuerpo hasta un máximo de bytes (corta antes si es más grande).
async function readLimited(res, maxBytes) {
  const len = Number(res.headers.get("content-length") || 0);
  if (len > maxBytes) return null;
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

// Sigue redirecciones a mano: cada salto tiene que seguir siendo Facebook.
async function fetchFacebookPage(url) {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html", "Accept-Language": "es-AR,es;q=0.9" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400) {
      const next = normalizeFacebookUrl(new URL(res.headers.get("location") || "", current).toString());
      if (!next) return null;
      current = next;
      continue;
    }
    if (!res.ok) return null;
    const buf = await readLimited(res, MAX_PAGE_BYTES);
    return buf ? buf.toString("utf8") : null;
  }
  return null;
}

async function fetchPostImage(url) {
  if (!isAllowedImageUrl(url)) return null;
  const res = await fetch(url, {
    redirect: "error",
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!res.ok || !["image/jpeg", "image/png", "image/webp"].includes(type)) return null;
  const buf = await readLimited(res, MAX_REMOTE_IMAGE_BYTES);
  return buf ? { media_type: type, data: buf.toString("base64") } : null;
}

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
  if (!apiKey) return json({ error: "La importación no está disponible ahora.", code: "unavailable" }, 501);

  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return json({ error: "La imagen es demasiado grande." }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "Body inválido." }, 400);
  }

  const url = body?.url ? normalizeFacebookUrl(body.url) : null;
  if (body?.url && !url) return json({ error: "Pegá el link de una publicación de Facebook.", code: "bad_url" }, 400);
  const img = parseImageDataUrl(body?.image);
  if (img.error) return json({ error: img.error }, 400);
  if (!url && !img.image) return json({ error: "Falta el link o la captura." }, 400);

  if (!(await checkRateLimit(getClientIp(request)))) {
    return json({ error: "Demasiados intentos seguidos. Probá de nuevo en un rato.", code: "rate_limit" }, 429);
  }

  let postText = "";
  let image = img.image;
  let photo = null; // la foto del post, para usarla como foto del reporte
  const source = url ? "link" : "captura";

  if (url) {
    try {
      const html = await fetchFacebookPage(url);
      const og = html ? extractOgTags(html) : null;
      postText = og ? postTextFromOg(og) : "";
      if (og?.image) image = await fetchPostImage(og.image).catch(() => null);
    } catch {
      // Timeout o bloqueo: igual que si no hubiera metadatos.
    }
    if (!postText) {
      logEvent("import_post_sin_metadatos", {});
      return json({ error: "Facebook no deja leer esa publicación sin iniciar sesión.", code: "needs_screenshot" }, 422);
    }
    if (image) photo = `data:${image.media_type};base64,${image.data}`;
  }

  try {
    const result = await callGemini(apiKey, buildGeminiRequest({ text: postText, image }));
    if (!result.body) {
      logEvent("import_post_gemini_error", { status: result.status });
      if (result.status === 429) return json({ error: "La IA está saturada. Probá de nuevo en un rato.", code: "unavailable" }, 503);
      if ([400, 401, 403].includes(result.status)) {
        logError("Gemini: GEMINI_API_KEY inválida, sin permisos o pedido rechazado", new Error(`status ${result.status}`));
      }
      return json({ error: "No pudimos leer la publicación ahora.", code: "unavailable" }, 503);
    }
    const parsed = parseGeminiResponse(result.body);
    if (parsed.error) {
      logEvent("import_post_respuesta_invalida", { model: result.model, motivo: parsed.error });
      return json({ error: "No pudimos entender la publicación. Completá el formulario a mano.", code: "error" }, 502);
    }
    const out = interpretExtraction(parsed.data);
    logEvent("import_post_ok", { model: result.model, source, esMascota: out.esMascota, conFoto: !!photo || !!out.box });
    if (!out.esMascota) {
      return json({ error: "No parece un aviso de un perro o gato perdido o encontrado.", code: "not_pet" }, 422);
    }
    if (out.especieNoSoportada) {
      return json({ error: "Por ahora Felpus es solo para perros y gatos.", code: "not_pet" }, 422);
    }
    return json({
      draft: out.draft,
      // Recuadro de la mascota dentro de la captura (el navegador la recorta).
      box: source === "captura" ? out.box : null,
      photo,
      source,
    });
  } catch (e) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError") {
      return json({ error: "La IA tardó demasiado. Probá de nuevo.", code: "unavailable" }, 503);
    }
    logError("Fallo inesperado en /api/import-post", e);
    return json({ error: "No pudimos leer la publicación ahora.", code: "error" }, 500);
  }
}
