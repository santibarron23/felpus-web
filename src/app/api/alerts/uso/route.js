import { isAlertsWebhookAuthorized } from "../../../../lib/serverAuth";
import { revisarUso } from "../../../../lib/serverUsoSupabase";
import { alertarAdmin } from "../../../../lib/serverAdminAlerts";

// Cada hora (pg_cron, migración 20261102_01_uso_cada_hora.sql): ¿se disparó
// el uso de logs de Supabase? Si sí, alerta al admin con el detalle (ver
// serverUsoSupabase.js). Mismo secreto que /api/alerts/flush.
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request) {
  if (!isAlertsWebhookAuthorized(request)) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const r = await revisarUso();
    const enviada = r.alerta ? await alertarAdmin(r.alerta) : null;
    const { alerta: _a, ...resumen } = r;
    return Response.json({ ok: true, ...resumen, ...(enviada ? { alertaEnviada: enviada.enviada } : {}) });
  } catch (e) {
    // Token vencido o sin permiso: queda en el log del servidor (y el botón
    // del admin lo muestra). No se alerta para no mandar un mail por hora.
    console.error("No se pudo revisar el uso de Supabase", e);
    return Response.json({ ok: false, error: e?.message || "Error" }, { status: 502 });
  }
}
