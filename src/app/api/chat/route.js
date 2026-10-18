import Anthropic from "@anthropic-ai/sdk";
import { logError } from "../../../lib/log";
import { isJsonRequest, getClientIp } from "../../../lib/httpGuards";
import { DEFAULT_CHAT_MODEL, sanitizeHistory, sanitizeContext, parseImageDataUrl } from "../../../lib/chatbot";
import { runChat, makeReportsReader, fetchOpenReport } from "../../../lib/chatService";

// Asistente Felpus. Corre solo en el servidor: ANTHROPIC_API_KEY nunca llega
// al navegador. El modelo no escribe en la base — ver chatService.js.
export const runtime = "nodejs";
// Una vuelta con herramientas son 2-3 llamadas a Claude; el default de
// Vercel (10-15 s) queda corto.
export const maxDuration = 60;

// El cuerpo trae el historial (acotado) y, a lo sumo, una foto ya achicada
// en el navegador. Esto corta antes de parsear cualquier cosa más grande.
const MAX_BODY_CHARS = 1_700_000;

// Rate limit real (en la base, vía RPC con service_role — misma razón que
// /api/embed: la IP la determina Vercel, no quien llama). Cada mensaje del
// chat cuesta plata de verdad, así que el cupo es chico: ver
// check_chat_rate_limit en supabase/schema.sql (8 por minuto, 80 por día).
// Si esa función todavía no existe (no se corrió la migración), se usa la
// de /api/embed como respaldo, para que nunca quede sin límite.
async function rpcRateLimit(name, ip) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ client_ip: ip }),
  });
  if (res.status === 404) return null; // función inexistente
  if (!res.ok) return true;
  return (await res.json()) !== false;
}

// Respaldo en memoria por instancia: no reemplaza al de la base (cada cold
// start arranca de cero), pero frena una ráfaga aunque Supabase falle.
const memoryHits = new Map();
const MEMORY_MAX_PER_MINUTE = 10;
function memoryRateLimit(ip) {
  const now = Date.now();
  const recent = (memoryHits.get(ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= MEMORY_MAX_PER_MINUTE) return false;
  recent.push(now);
  memoryHits.set(ip, recent);
  if (memoryHits.size > 5000) memoryHits.clear();
  return true;
}

async function checkRateLimit(ip) {
  if (!ip) return true;
  if (!memoryRateLimit(ip)) return false;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return true;
  try {
    const chat = await rpcRateLimit("check_chat_rate_limit", ip);
    if (chat !== null) return chat;
    const embed = await rpcRateLimit("check_embed_rate_limit", ip);
    return embed !== false;
  } catch {
    // Mismo criterio que el resto de las rutas: un problema de infra ajeno
    // no tumba la función (el límite en memoria sigue activo).
    return true;
  }
}

function logEvent(event, data) {
  // Va a los logs de Vercel. Sin contenido de la conversación ni IP.
  console.info(JSON.stringify({ event, ...data }));
}

export async function POST(request) {
  if (!isJsonRequest(request)) {
    return Response.json({ error: "Content-Type inválido." }, { status: 415 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!apiKey || !supabaseUrl || !anonKey) {
    // El navegador muestra la ayuda local y los accesos al formulario.
    return Response.json({ error: "El asistente no está configurado.", code: "unavailable" }, { status: 501 });
  }

  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) {
      return Response.json({ error: "El mensaje es demasiado grande." }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const history = sanitizeHistory(body?.messages);
  if (history.error) return Response.json({ error: history.error }, { status: 400 });
  const img = parseImageDataUrl(body?.image);
  if (img.error) return Response.json({ error: img.error }, { status: 400 });
  const context = sanitizeContext(body?.context);

  const ip = getClientIp(request);
  if (!(await checkRateLimit(ip))) {
    return Response.json(
      { error: "Demasiados mensajes seguidos. Probá de nuevo en un rato.", code: "rate_limit" },
      { status: 429 }
    );
  }

  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 45_000 });
  const model = process.env.ANTHROPIC_CHAT_MODEL || DEFAULT_CHAT_MODEL;
  const supa = { supabaseUrl, anonKey };

  try {
    const openReport = await fetchOpenReport(supa, context.reportId);
    const result = await runChat({
      client,
      model,
      messages: history.messages,
      draft: body?.draft,
      context,
      image: img.image,
      readReports: makeReportsReader(supa),
      openReport,
      log: logEvent,
    });
    return Response.json(result);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      logError("Claude: límite de uso de la API alcanzado", e);
      return Response.json({ error: "El asistente está saturado.", code: "unavailable" }, { status: 503 });
    }
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      logError("Claude: ANTHROPIC_API_KEY inválida o sin permisos", e);
      return Response.json({ error: "El asistente no está configurado.", code: "unavailable" }, { status: 501 });
    }
    if (e instanceof Anthropic.BadRequestError) {
      logError("Claude rechazó el pedido del chat", e);
      return Response.json({ error: "No pude procesar ese mensaje.", code: "error" }, { status: 502 });
    }
    if (e instanceof Anthropic.APIError || e instanceof Anthropic.APIConnectionError) {
      logError("Claude no respondió", e);
      return Response.json({ error: "El asistente no está disponible.", code: "unavailable" }, { status: 503 });
    }
    logError("Fallo inesperado en /api/chat", e);
    return Response.json({ error: "No pude responder ahora.", code: "error" }, { status: 500 });
  }
}
