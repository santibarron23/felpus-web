import { logError } from "../../../../lib/log";
import { isJsonRequest } from "../../../../lib/httpGuards";
import { getAuthUserId, supabaseServerEnv } from "../../../../lib/serverAuth";
import { normalizePushSubscription } from "../../../../lib/alerts";

// Suscripción push del dispositivo actual, asociada a la cuenta (para las
// alertas de zona y de coincidencias de todos sus reportes). Las de
// invitados siguen por /api/subscribe-push (por reporte).
export const runtime = "nodejs";

async function setup(request) {
  if (!isJsonRequest(request)) return { error: Response.json({ error: "Content-Type inválido." }, { status: 415 }) };
  const env = supabaseServerEnv();
  if (!env.supabaseUrl || !env.serviceKey) return { error: Response.json({ error: "Servidor no configurado." }, { status: 501 }) };
  const userId = await getAuthUserId(request, env);
  if (!userId) return { error: Response.json({ error: "Iniciá sesión para activar las alertas." }, { status: 401 }) };
  let body;
  try {
    body = await request.json();
  } catch {
    return { error: Response.json({ error: "Body inválido." }, { status: 400 }) };
  }
  const headers = { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json" };
  return { userId, body, env, headers };
}

export async function POST(request) {
  const { userId, body, env, headers, error } = await setup(request);
  if (error) return error;
  const sub = normalizePushSubscription(body?.subscription);
  if (!sub) return Response.json({ error: "Suscripción inválida." }, { status: 400 });
  try {
    const res = await fetch(`${env.supabaseUrl}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ ...sub, user_id: userId, user_agent: (request.headers.get("user-agent") || "").slice(0, 300) }),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    return Response.json({ ok: true });
  } catch (e) {
    logError("No se pudo guardar la suscripción push", e);
    return Response.json({ error: "No se pudieron activar las alertas." }, { status: 500 });
  }
}

export async function DELETE(request) {
  const { userId, body, env, headers, error } = await setup(request);
  if (error) return error;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return Response.json({ error: "Falta endpoint." }, { status: 400 });
  try {
    const p = new URLSearchParams({ endpoint: `eq.${endpoint}`, user_id: `eq.${userId}` });
    const res = await fetch(`${env.supabaseUrl}/rest/v1/push_subscriptions?${p}`, { method: "DELETE", headers });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    return Response.json({ ok: true });
  } catch (e) {
    logError("No se pudo borrar la suscripción push", e);
    return Response.json({ error: "No se pudo desactivar." }, { status: 500 });
  }
}
