import { logError } from "../../../../lib/log";
import { isJsonRequest, esPedidoDeOtroSitio, respuestaOtroSitio } from "../../../../lib/httpGuards";
import { getAuthUserId, supabaseServerEnv } from "../../../../lib/serverAuth";
import { ownerFilter } from "../../reports/edit/route";
import { borrarArchivos, esAvatarDe, esFotoDelAviso, pathDesdeUrl } from "../../../../lib/serverFotos";

// Borra fotos de Storage con la service key, después de comprobar de quién
// son (ver serverFotos.js):
//   { reportId, urls, pushToken? } -> fotos de un aviso propio (cuenta o
//     token del dispositivo, mismo criterio que /api/reports/edit). Se llama
//     ANTES de borrar la fila, así que el aviso todavía existe.
//   { avatarUrl } -> la foto de perfil anterior (con sesión).
// Solo se borran paths que pertenecen a ese aviso o a esa cuenta; el resto
// se ignora.
export const runtime = "nodejs";

const MAX_URLS = 10;

export async function POST(request) {
  if (esPedidoDeOtroSitio(request)) return respuestaOtroSitio();
  if (!isJsonRequest(request)) return Response.json({ error: "Content-Type inválido." }, { status: 415 });
  const env = supabaseServerEnv();
  if (!env.supabaseUrl || !env.serviceKey) return Response.json({ error: "Servidor no configurado." }, { status: 501 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }
  const userId = await getAuthUserId(request, env);

  try {
    if (typeof body?.avatarUrl === "string") {
      if (!userId) return Response.json({ error: "No autorizado." }, { status: 401 });
      const path = pathDesdeUrl(body.avatarUrl);
      const paths = esAvatarDe(path, userId) ? [path] : [];
      await borrarArchivos(paths, env);
      return Response.json({ ok: true, borradas: paths.length });
    }

    const reportId = typeof body?.reportId === "string" && /^[A-Za-z0-9-]{1,64}$/.test(body.reportId) ? body.reportId : null;
    const pushToken = typeof body?.pushToken === "string" && /^[0-9a-f-]{36}$/i.test(body.pushToken) ? body.pushToken : null;
    const urls = Array.isArray(body?.urls) ? body.urls.slice(0, MAX_URLS) : null;
    if (!reportId || !urls) return Response.json({ error: "Faltan reportId o urls." }, { status: 400 });
    const filter = ownerFilter(userId, pushToken);
    if (!filter) return Response.json({ error: "No autorizado." }, { status: 401 });

    const res = await fetch(`${env.supabaseUrl}/rest/v1/reports?id=eq.${encodeURIComponent(reportId)}&${filter}&select=id`, {
      headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return Response.json({ error: "No es tu reporte." }, { status: 403 });

    const paths = urls.map(pathDesdeUrl).filter((p) => esFotoDelAviso(p, reportId));
    await borrarArchivos(paths, env);
    return Response.json({ ok: true, borradas: paths.length });
  } catch (e) {
    logError("No se pudieron borrar fotos de Storage (servidor)", e);
    return Response.json({ error: "No se pudieron borrar las fotos." }, { status: 502 });
  }
}
