import { logError } from "../../../../lib/log";
import { isJsonRequest } from "../../../../lib/httpGuards";
import { getAuthUser, supabaseServerEnv } from "../../../../lib/serverAuth";
import { ADMIN_EMAIL, buildAdminPatch, reorderPhotos } from "../../../../lib/adminEdit";

// El administrador corrige una publicación: datos y orden de las fotos.
// La sesión se verifica contra Supabase Auth (nunca se confía en lo que
// mande el cliente) y el cambio se guarda con la service role key, así que
// no hace falta ninguna función ni permiso nuevo en la base. Solo se pueden
// tocar los campos de buildAdminPatch; el contacto, el dueño, el estado de
// reencuentro y las fotos en sí (agregar o borrar) quedan fuera.
export const runtime = "nodejs";

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const PHOTO_COLUMNS = "foto_url,foto_urls,hist,hists,embedding,embeddings";

export async function PATCH(request) {
  if (!isJsonRequest(request)) return Response.json({ error: "Content-Type inválido." }, { status: 415 });
  const env = supabaseServerEnv();
  if (!env.supabaseUrl || !env.serviceKey) return Response.json({ error: "Servidor no configurado." }, { status: 501 });
  const user = await getAuthUser(request, env);
  if (!user || user.email !== ADMIN_EMAIL) return Response.json({ error: "No autorizado." }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }
  const reportId = typeof body?.reportId === "string" && ID_RE.test(body.reportId) ? body.reportId : null;
  if (!reportId) return Response.json({ error: "Falta reportId." }, { status: 400 });

  const fields = buildAdminPatch(body.fields || {});
  if (fields.error) return Response.json({ error: fields.error }, { status: 400 });

  const headers = { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json" };
  const base = `${env.supabaseUrl}/rest/v1/reports?id=eq.${encodeURIComponent(reportId)}`;
  try {
    let photos = { patch: {} };
    if (body.fotoOrder !== undefined) {
      const res = await fetch(`${base}&select=${PHOTO_COLUMNS}`, { headers });
      if (!res.ok) throw new Error(`Supabase ${res.status}`);
      const [row] = await res.json();
      if (!row) return Response.json({ error: "No se encontró la publicación." }, { status: 404 });
      photos = reorderPhotos(row, body.fotoOrder);
      if (photos.error) return Response.json({ error: photos.error }, { status: 400 });
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
    if (!Array.isArray(rows) || rows.length === 0) return Response.json({ error: "No se encontró la publicación." }, { status: 404 });
    return Response.json({ ok: true, changed: Object.keys(patch).length });
  } catch (e) {
    logError("No se pudo editar la publicación (admin)", e);
    return Response.json({ error: "No se pudo guardar el cambio." }, { status: 500 });
  }
}
