import { logError } from "../../../../lib/log";
import { isJsonRequest } from "../../../../lib/httpGuards";
import { getAuthUserId, supabaseServerEnv } from "../../../../lib/serverAuth";
import { buildOwnerPatch, reorderPhotos } from "../../../../lib/adminEdit";
import { respuestaValida } from "../../../../lib/consejos";
import { DESCARTADOS_MAX } from "../../../../lib/sighting";

// Quien publicó corrige su aviso (2026-10-29): nombre, datos, zona, fecha,
// descripción y orden de las fotos — los mismos campos que el admin
// (buildOwnerPatch), menos el tipo. Dueño con sesión, o el push_token del
// reporte para quien publicó como invitado desde este dispositivo (mismo
// criterio que /api/reports/renew). La autoría se comprueba en la base, en
// el mismo PATCH (filtro por user_id o push_token): nunca se confía en lo
// que diga el cliente. El contacto, el dueño y el reencuentro quedan fuera.
// También guarda la respuesta a la pregunta opcional de los consejos
// (consejo: { clave, valor }, ver consejos.js), sumándola a `detalles`, y
// "No es mi mascota" sobre un avistamiento vinculado (descartarAvistamiento:
// id, ver avistamientosDe en sighting.js).
export const runtime = "nodejs";

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const TOKEN_RE = /^[0-9a-f-]{36}$/i;
// detalles: para mover la marca de foto dudosa al reordenar (rebuildPhotos).
const PHOTO_COLUMNS = "foto_url,foto_urls,hist,hists,embedding,embeddings,detalles";

// Filtro PostgREST "es tuyo": por cuenta, por token del dispositivo, o
// cualquiera de los dos. null si no hay con qué probarlo.
export function ownerFilter(userId, pushToken) {
  const conds = [userId && `user_id.eq.${userId}`, pushToken && `push_token.eq.${pushToken}`].filter(Boolean);
  return conds.length ? `or=(${conds.join(",")})` : null;
}

export async function PATCH(request) {
  if (!isJsonRequest(request)) return Response.json({ error: "Content-Type inválido." }, { status: 415 });
  const env = supabaseServerEnv();
  if (!env.supabaseUrl || !env.serviceKey) return Response.json({ error: "Servidor no configurado." }, { status: 501 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }
  const reportId = typeof body?.reportId === "string" && ID_RE.test(body.reportId) ? body.reportId : null;
  const pushToken = typeof body?.pushToken === "string" && TOKEN_RE.test(body.pushToken) ? body.pushToken : null;
  if (!reportId) return Response.json({ error: "Falta reportId." }, { status: 400 });

  const userId = await getAuthUserId(request, env);
  const filter = ownerFilter(userId, pushToken);
  if (!filter) return Response.json({ error: "Iniciá sesión con la cuenta con la que publicaste." }, { status: 401 });

  const fields = buildOwnerPatch(body.fields || {});
  if (fields.error) return Response.json({ error: fields.error }, { status: 400 });
  const descartar = body.descartarAvistamiento;
  if (descartar !== undefined && (typeof descartar !== "string" || !ID_RE.test(descartar))) {
    return Response.json({ error: "Avistamiento inválido." }, { status: 400 });
  }
  const consejo = body.consejo;
  if (consejo !== undefined && !respuestaValida(consejo?.clave, consejo?.valor)) {
    return Response.json({ error: "Respuesta inválida." }, { status: 400 });
  }

  const headers = { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json" };
  const base = `${env.supabaseUrl}/rest/v1/reports?id=eq.${encodeURIComponent(reportId)}&${filter}`;
  const noEsTuyo = () => Response.json({ error: "Solo quien publicó el aviso puede editarlo." }, { status: 403 });
  try {
    let photos = { patch: {} };
    if (body.fotoOrder !== undefined || consejo !== undefined || descartar !== undefined) {
      const res = await fetch(`${base}&select=${PHOTO_COLUMNS}`, { headers });
      if (!res.ok) throw new Error(`Supabase ${res.status}`);
      const [row] = await res.json();
      if (!row) return noEsTuyo();
      if (body.fotoOrder !== undefined) {
        photos = reorderPhotos(row, body.fotoOrder);
        if (photos.error) return Response.json({ error: photos.error }, { status: 400 });
      }
      if (consejo !== undefined) {
        const detalles = photos.patch.detalles !== undefined ? photos.patch.detalles : row.detalles;
        photos.patch.detalles = { ...(detalles || {}), [consejo.clave]: consejo.valor };
      }
      if (descartar !== undefined) {
        const detalles = photos.patch.detalles !== undefined ? photos.patch.detalles : row.detalles;
        const previos = Array.isArray(detalles?.avistamientos_descartados) ? detalles.avistamientos_descartados : [];
        const lista = [...previos.filter((id) => id !== descartar), descartar].slice(-DESCARTADOS_MAX);
        photos.patch.detalles = { ...(detalles || {}), avistamientos_descartados: lista };
      }
    }
    const patch = { ...fields.patch, ...photos.patch };
    if (Object.keys(patch).length === 0) return Response.json({ ok: true, changed: 0 });

    const res = await fetch(base, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return noEsTuyo();
    return Response.json({ ok: true, changed: Object.keys(patch).length });
  } catch (e) {
    logError("No se pudo editar el aviso (dueño)", e);
    return Response.json({ error: "No se pudo guardar el cambio. Probá de nuevo." }, { status: 500 });
  }
}
