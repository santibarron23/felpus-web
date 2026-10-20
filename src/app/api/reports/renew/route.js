import { logError } from "../../../../lib/log";
import { isJsonRequest } from "../../../../lib/httpGuards";
import { getAuthUserId, supabaseServerEnv } from "../../../../lib/serverAuth";

// "Seguir buscando": reactiva un reporte (vuelve a generar alertas por 60
// días). Dueño logueado, o push_token del reporte para invitados.
export const runtime = "nodejs";

export async function POST(request) {
  if (!isJsonRequest(request)) return Response.json({ error: "Content-Type inválido." }, { status: 415 });
  const env = supabaseServerEnv();
  if (!env.supabaseUrl || !env.serviceKey) return Response.json({ error: "Servidor no configurado." }, { status: 501 });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }
  const reportId = typeof body?.reportId === "string" && /^[A-Za-z0-9-]{1,64}$/.test(body.reportId) ? body.reportId : null;
  const pushToken = typeof body?.pushToken === "string" && /^[0-9a-f-]{36}$/i.test(body.pushToken) ? body.pushToken : null;
  if (!reportId) return Response.json({ error: "Falta reportId." }, { status: 400 });
  const userId = await getAuthUserId(request, env);
  const filter = userId ? `user_id=eq.${userId}` : pushToken ? `push_token=eq.${pushToken}` : null;
  if (!filter) return Response.json({ error: "No autorizado." }, { status: 401 });
  try {
    const res = await fetch(`${env.supabaseUrl}/rest/v1/reports?id=eq.${encodeURIComponent(reportId)}&${filter}&resuelto=eq.false`, {
      method: "PATCH",
      headers: {
        apikey: env.serviceKey,
        Authorization: `Bearer ${env.serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ actividad_en: new Date().toISOString(), inactivo: false, aviso_inactividad_en: null }),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return Response.json({ error: "No es tu reporte." }, { status: 403 });
    return Response.json({ ok: true });
  } catch (e) {
    logError("No se pudo renovar el reporte", e);
    return Response.json({ error: "No se pudo renovar." }, { status: 500 });
  }
}
