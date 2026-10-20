import { logError } from "../../../lib/log";
import { isJsonRequest } from "../../../lib/httpGuards";
import { getAuthUserId, supabaseServerEnv } from "../../../lib/serverAuth";

// Coincidencias guardadas de los reportes propios (tabla matches): listar y
// marcar "Es mi mascota" (confirmado) / "No es" (descartado). Solo el dueño
// logueado de alguno de los dos reportes del par.
export const runtime = "nodejs";

const ESTADOS = ["visto", "descartado", "confirmado"];
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

function rest(env) {
  const headers = { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json" };
  return async (path, init = {}) => {
    const res = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  };
}

// ids ya validados con ID_RE (solo letras, números y guiones).
async function ownedIds(r, userId, ids) {
  const p = new URLSearchParams({ id: `in.(${ids.join(",")})`, user_id: `eq.${userId}`, select: "id" });
  return new Set(((await r(`reports?${p}`)) || []).map((x) => x.id));
}

export async function GET(request) {
  const env = supabaseServerEnv();
  if (!env.supabaseUrl || !env.serviceKey) return Response.json({ error: "Servidor no configurado." }, { status: 501 });
  const userId = await getAuthUserId(request, env);
  if (!userId) return Response.json({ matches: [] });
  const reportId = new URL(request.url).searchParams.get("reportId") || "";
  if (!ID_RE.test(reportId)) return Response.json({ error: "reportId inválido." }, { status: 400 });
  try {
    const r = rest(env);
    if (!(await ownedIds(r, userId, [reportId])).has(reportId)) return Response.json({ matches: [] });
    const p = new URLSearchParams({
      or: `(report_lost_id.eq.${reportId},report_found_id.eq.${reportId})`,
      select: "report_lost_id,report_found_id,score,estado",
    });
    return Response.json({ matches: (await r(`matches?${p}`)) || [] });
  } catch (e) {
    logError("No se pudieron leer las coincidencias guardadas", e);
    return Response.json({ matches: [] });
  }
}

export async function PATCH(request) {
  if (!isJsonRequest(request)) return Response.json({ error: "Content-Type inválido." }, { status: 415 });
  const env = supabaseServerEnv();
  if (!env.supabaseUrl || !env.serviceKey) return Response.json({ error: "Servidor no configurado." }, { status: 501 });
  const userId = await getAuthUserId(request, env);
  if (!userId) return Response.json({ error: "Iniciá sesión con Google." }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }
  const { lostId, foundId, estado } = body || {};
  if (![lostId, foundId].every((x) => typeof x === "string" && ID_RE.test(x)) || !ESTADOS.includes(estado)) {
    return Response.json({ error: "Datos inválidos." }, { status: 400 });
  }
  try {
    const r = rest(env);
    if ((await ownedIds(r, userId, [lostId, foundId])).size === 0) {
      return Response.json({ error: "No es tu reporte." }, { status: 403 });
    }
    // Si el par todavía no estaba guardado (score por debajo del umbral), se
    // guarda igual para recordar la decisión ("No es" no vuelve a aparecer).
    await r("matches?on_conflict=report_lost_id,report_found_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ report_lost_id: lostId, report_found_id: foundId, score: 0, estado }),
    });
    const p = new URLSearchParams({ report_lost_id: `eq.${lostId}`, report_found_id: `eq.${foundId}` });
    await r(`matches?${p}`, { method: "PATCH", body: JSON.stringify({ estado }) });
    return Response.json({ ok: true });
  } catch (e) {
    logError("No se pudo actualizar la coincidencia", e);
    return Response.json({ error: "No se pudo guardar." }, { status: 500 });
  }
}
