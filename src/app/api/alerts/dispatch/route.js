import { logError } from "../../../../lib/log";
import { SITE_URL } from "../../../../lib/site";
import { isAlertsWebhookAuthorized, supabaseServerEnv } from "../../../../lib/serverAuth";
import { makeDb, makePusher, dispatchNewReport } from "../../../../lib/alertsServer";

// Despacho de alertas para un reporte nuevo (Database Webhook de Supabase o
// el trigger existente). Mismo trabajo que hace /api/notify-match además del
// email. Protegido con x-alerts-secret (ALERTS_WEBHOOK_SECRET).
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  if (!isAlertsWebhookAuthorized(request)) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  const { supabaseUrl, serviceKey } = supabaseServerEnv();
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: "Faltan variables de entorno en el servidor." }, { status: 501 });
  }
  let row;
  try {
    row = (await request.json())?.record;
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }
  if (!row?.id) return Response.json({ error: "Falta record." }, { status: 400 });
  try {
    const summary = await dispatchNewReport(row, {
      db: makeDb({ supabaseUrl, serviceKey }),
      push: await makePusher(),
      siteUrl: SITE_URL,
      log: (event, data) => console.info(JSON.stringify({ event, ...data })),
    });
    return Response.json(summary);
  } catch (e) {
    logError("Fallo /api/alerts/dispatch", e);
    return Response.json({ error: "No se pudo despachar." }, { status: 500 });
  }
}
