import { logError } from "../../../../lib/log";
import { SITE_URL } from "../../../../lib/site";
import { isAlertsWebhookAuthorized, supabaseServerEnv } from "../../../../lib/serverAuth";
import { makeDb, makePusher, flushPending } from "../../../../lib/alertsServer";
import { makeEmailDb, makeEmailSender, linkSecret, enviarSeguimientos } from "../../../../lib/serverEmailAvisos";

// Tarea diaria de las 8:00 (pg_cron, ver supabase/migrations/…_cron.sql):
// alertas de zona que esperaron la noche + ciclo de vida de los reportes +
// el mail de "¿Hubo novedades?" a los 30 días (serverEmailAvisos.js).
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
  try {
    const summary = await flushPending({
      db: makeDb({ supabaseUrl, serviceKey }),
      push: await makePusher(),
      siteUrl: SITE_URL,
      log: (event, data) => console.info(JSON.stringify({ event, ...data })),
    });
    // Aparte: si los mails fallan (o falta la migración 20261028_01), lo de
    // arriba ya quedó hecho.
    let emails = null;
    try {
      emails = await enviarSeguimientos({
        db: makeEmailDb({ supabaseUrl, serviceKey }),
        send: makeEmailSender(),
        secret: linkSecret(),
        siteUrl: SITE_URL,
        log: (event, data) => console.info(JSON.stringify({ event, ...data })),
      });
    } catch (e) {
      logError("Fallaron los mails de seguimiento", e);
    }
    return Response.json({ ...summary, emails });
  } catch (e) {
    logError("Fallo /api/alerts/flush", e);
    return Response.json({ error: "No se pudo completar." }, { status: 500 });
  }
}
