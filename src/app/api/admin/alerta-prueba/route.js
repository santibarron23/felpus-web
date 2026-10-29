import { isJsonRequest } from "../../../../lib/httpGuards";
import { getAuthUser, supabaseServerEnv } from "../../../../lib/serverAuth";
import { ADMIN_EMAIL } from "../../../../lib/adminEdit";
import { alertarAdmin } from "../../../../lib/serverAdminAlerts";

// "Mandarme una alerta de prueba" del panel de admin: verifica que el email
// y el push de las alertas (serverAdminAlerts.js) lleguen. Solo el admin; como
// cualquier alerta, no se repite antes de 30 minutos.
export const runtime = "nodejs";

export async function POST(request) {
  if (!isJsonRequest(request)) return Response.json({ error: "Content-Type inválido." }, { status: 415 });
  const env = supabaseServerEnv();
  if (!env.supabaseUrl || !env.serviceKey) return Response.json({ error: "Servidor no configurado." }, { status: 501 });
  const user = await getAuthUser(request, env);
  if (!user || user.email !== ADMIN_EMAIL) return Response.json({ error: "No autorizado." }, { status: 403 });
  const r = await alertarAdmin({
    firma: "prueba",
    titulo: "Alerta de prueba",
    detalle: "Si te llegó esto, las alertas de Felpus funcionan. Cuando algo deje de andar (el listado, publicar, un error que les pasa a varias personas), te llega un aviso así.",
  });
  return Response.json(r);
}
