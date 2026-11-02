import { isJsonRequest } from "../../../../lib/httpGuards";
import { getAuthUser, supabaseServerEnv } from "../../../../lib/serverAuth";
import { ADMIN_EMAIL } from "../../../../lib/adminEdit";
import { revisarUso } from "../../../../lib/serverUsoSupabase";

// "Revisar uso de Supabase ahora" (Admin → Métricas): lo mismo que la
// revisión de cada hora, sin mandar alerta. Sirve para confirmar que el
// token (SUPABASE_ACCESS_TOKEN) está bien configurado. Solo el admin.
export const runtime = "nodejs";

export async function POST(request) {
  if (!isJsonRequest(request)) return Response.json({ error: "Content-Type inválido." }, { status: 415 });
  const env = supabaseServerEnv();
  if (!env.supabaseUrl || !env.serviceKey) return Response.json({ error: "Servidor no configurado." }, { status: 501 });
  const user = await getAuthUser(request, env);
  if (!user || user.email !== ADMIN_EMAIL) return Response.json({ error: "No autorizado." }, { status: 403 });
  try {
    const { alerta: _a, ...resumen } = await revisarUso();
    return Response.json(resumen);
  } catch (e) {
    return Response.json({ configurado: true, error: e?.message || "Error" }, { status: 502 });
  }
}
