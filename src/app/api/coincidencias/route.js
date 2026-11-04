import { logError } from "../../../lib/log";
import { isJsonRequest, getClientIp, esPedidoDeOtroSitio, respuestaOtroSitio } from "../../../lib/httpGuards";
import { makeAiRateLimit } from "../../../lib/serverAiRateLimit";
import { makeReportesFuente, coincidenciasDe, LIMITE_MAX } from "../../../lib/serverCoincidencias";

// Coincidencias de uno o más avisos, calculadas en el servidor (ver
// serverCoincidencias.js). Body: { reportIds: ["id", ...] (hasta 10),
// limit?: 1..50 (6 por defecto) }. Respuesta:
// { resultados: { <id>: { hayCandidatos, coincidencias: [...] } } }.
// Un id que no existe (o está oculto) no aparece en resultados.
export const runtime = "nodejs";
export const maxDuration = 30;

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const MAX_IDS = 10;

// Cupo por IP y global (bucket "coincidencias" en limites_config, migración
// 20261104_02). Sin esa migración, solo el respaldo en memoria por IP. Si la
// base no responde se deja pasar: no cuesta plata de un proveedor y es una
// función central de la app.
const checkRateLimit = makeAiRateLimit({ maxPerMinute: 40, bucket: "coincidencias", legacy: [], failClosed: false });

let fuente = null;
function fuenteReportes() {
  if (!fuente) {
    fuente = makeReportesFuente({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
  }
  return fuente;
}

export async function POST(request) {
  if (esPedidoDeOtroSitio(request)) return respuestaOtroSitio();
  if (!isJsonRequest(request)) return Response.json({ error: "Content-Type inválido." }, { status: 415 });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return Response.json({ error: "Servidor no configurado." }, { status: 501 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }
  const ids = Array.isArray(body?.reportIds) ? [...new Set(body.reportIds)] : [];
  if (!ids.length || ids.length > MAX_IDS || !ids.every((id) => typeof id === "string" && ID_RE.test(id))) {
    return Response.json({ error: "Faltan los avisos a comparar." }, { status: 400 });
  }
  const limitRaw = Number(body?.limit ?? 6);
  const limit = Number.isInteger(limitRaw) && limitRaw >= 1 ? Math.min(limitRaw, LIMITE_MAX) : 6;

  if (!(await checkRateLimit(getClientIp(request)))) {
    return Response.json({ error: "Demasiadas búsquedas seguidas. Probá de nuevo en un rato." }, { status: 429 });
  }

  try {
    const resultados = {};
    for (const id of ids) {
      const { reporte, lista } = await fuenteReportes().uno(id);
      if (reporte) resultados[id] = coincidenciasDe(reporte, lista, { limit });
    }
    return Response.json({ resultados });
  } catch (e) {
    logError("No se pudieron calcular las coincidencias", e);
    return Response.json({ error: "No pudimos buscar coincidencias ahora." }, { status: 503 });
  }
}
