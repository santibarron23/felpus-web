import { logError } from "../../../../lib/log";
import { isJsonRequest } from "../../../../lib/httpGuards";
import { getAuthUserId, supabaseServerEnv } from "../../../../lib/serverAuth";
import { ownerFilter } from "../edit/route";

// El contacto de un aviso PROPIO, para precargarlo en "Editar mi aviso"
// (2026-11-02). Mismo criterio de autoría que /api/reports/edit (sesión o
// push_token del dispositivo, comprobado en la base). No pasa por
// /api/report-contact, que es el del público: tiene límite por IP y deja
// registro de cada consulta.
export const runtime = "nodejs";

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const TOKEN_RE = /^[0-9a-f-]{36}$/i;

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
  const reportId = typeof body?.reportId === "string" && ID_RE.test(body.reportId) ? body.reportId : null;
  const pushToken = typeof body?.pushToken === "string" && TOKEN_RE.test(body.pushToken) ? body.pushToken : null;
  if (!reportId) return Response.json({ error: "Falta reportId." }, { status: 400 });

  const userId = await getAuthUserId(request, env);
  const filter = ownerFilter(userId, pushToken);
  if (!filter) return Response.json({ error: "Iniciá sesión con la cuenta con la que publicaste." }, { status: 401 });

  try {
    const res = await fetch(
      `${env.supabaseUrl}/rest/v1/reports?id=eq.${encodeURIComponent(reportId)}&${filter}&select=contacto_whatsapp,contacto_email`,
      { headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` } }
    );
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    const [row] = await res.json();
    if (!row) return Response.json({ error: "Solo quien publicó el aviso puede ver su contacto acá." }, { status: 403 });
    return Response.json({ whatsapp: row.contacto_whatsapp || "", email: row.contacto_email || "" });
  } catch (e) {
    logError("No se pudo leer el contacto (dueño)", e);
    return Response.json({ error: "No pudimos cargar el contacto." }, { status: 500 });
  }
}
