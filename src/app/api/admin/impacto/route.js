import { isJsonRequest } from "../../../../lib/httpGuards";
import { getAuthUser, supabaseServerEnv } from "../../../../lib/serverAuth";
import { ADMIN_EMAIL } from "../../../../lib/adminEdit";
import { logError } from "../../../../lib/log";
import { leerTodosLosReportes, metricasDeImpacto } from "../../../../lib/serverImpacto";

// Admin → Impacto: las métricas que antes se calculaban en el navegador
// (impactMetrics.js), ahora acá porque usan el puntaje de coincidencias,
// que ya no viaja al JS público (ver serverCoincidencias.js). Solo el admin.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request) {
  if (!isJsonRequest(request)) return Response.json({ error: "Content-Type inválido." }, { status: 415 });
  const env = supabaseServerEnv();
  if (!env.supabaseUrl || !env.serviceKey) return Response.json({ error: "Servidor no configurado." }, { status: 501 });
  const user = await getAuthUser(request, env);
  if (!user || user.email !== ADMIN_EMAIL) return Response.json({ error: "No autorizado." }, { status: 403 });
  try {
    const reports = await leerTodosLosReportes(env);
    return Response.json({ metricas: metricasDeImpacto(reports) });
  } catch (e) {
    logError("No se pudieron calcular las métricas de impacto", e);
    return Response.json({ error: "No pudimos calcular las métricas ahora." }, { status: 503 });
  }
}
