import { logError } from "../../../../lib/log";
import { isJsonRequest } from "../../../../lib/httpGuards";
import { getAuthUserId, supabaseServerEnv } from "../../../../lib/serverAuth";
import { normalizeZoneInput } from "../../../../lib/alerts";

// Zona de alerta del usuario logueado. El centro solo se le devuelve a su
// propio dueño (nunca a otros ni en respuestas públicas).
export const runtime = "nodejs";

async function rpc(name, body) {
  const { supabaseUrl, serviceKey } = supabaseServerEnv();
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} en ${name}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function requireUser(request) {
  const env = supabaseServerEnv();
  if (!env.supabaseUrl || !env.serviceKey) return { error: Response.json({ error: "Servidor no configurado." }, { status: 501 }) };
  const userId = await getAuthUserId(request, env);
  if (!userId) return { error: Response.json({ error: "Iniciá sesión para configurar tus alertas." }, { status: 401 }) };
  return { userId };
}

export async function GET(request) {
  const { userId, error } = await requireUser(request);
  if (error) return error;
  try {
    const rows = await rpc("get_alert_zone", { p_user_id: userId });
    return Response.json({ zone: Array.isArray(rows) ? rows[0] || null : null });
  } catch (e) {
    logError("No se pudo leer la zona de alertas", e);
    return Response.json({ error: "No se pudo leer tu zona." }, { status: 500 });
  }
}

export async function PUT(request) {
  if (!isJsonRequest(request)) return Response.json({ error: "Content-Type inválido." }, { status: 415 });
  const { userId, error } = await requireUser(request);
  if (error) return error;
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }
  const { zone, error: invalid } = normalizeZoneInput(body);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });
  try {
    await rpc("upsert_alert_zone", {
      p_user_id: userId,
      p_lat: zone.lat,
      p_lng: zone.lng,
      p_radius_m: zone.radius_m,
      p_species: zone.species,
      p_report_types: zone.report_types,
      p_active: zone.active,
    });
    return Response.json({ ok: true, zone });
  } catch (e) {
    logError("No se pudo guardar la zona de alertas", e);
    return Response.json({ error: "No se pudo guardar tu zona." }, { status: 500 });
  }
}
