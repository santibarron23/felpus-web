import { timingSafeEqual } from "node:crypto";
import { findMatches } from "../../../lib/matching";
import { rowToMatchable, makeDb, makePusher, dispatchNewReport } from "../../../lib/alertsServer";
import { logError } from "../../../lib/log";
import { SITE_URL } from "../../../lib/site";
import { argentinaDayStartIso } from "../../../lib/alerts";
import { matchEmail, matchEmailAllowed, cupoRestante } from "../../../lib/emailAvisos";
import { makeEmailDb, makeEmailSender, linkSecret, firmarAviso, avisoUrls } from "../../../lib/serverEmailAvisos";

// Comparación de tiempo constante para el secreto del webhook: `!==` sobre
// strings corta apenas encuentra el primer carácter distinto, lo que en
// teoría deja adivinar el secreto midiendo cuánto tarda cada intento
// carácter a carácter. timingSafeEqual exige buffers de igual longitud (si
// no, tira), así que primero se descarta la longitud — eso sí es seguro de
// filtrar, ya que la longitud del secreto no es información sensible en sí.
function secretsMatch(received, expected) {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Corre en el servidor: lo dispara un Database Webhook de Supabase cada vez
// que se inserta un reporte nuevo (ver PENDIENTE_DECISION.md para la
// configuración exacta). Reutiliza el mismo scoreMatch() que ya usa la app
// en el navegador — sus funciones internas (imageSimilarity,
// structuredFieldSimilarity, haversineKm, etc.) son puro cálculo sobre
// datos ya guardados en la fila (hist/embedding/color/zona/lat/lng), no
// dependen del DOM, así que corren igual de bien acá que en el cliente.
export const runtime = "nodejs";

// Mails de coincidencia (2026-10-28, ver emailAvisos.js): solo coincidencias
// ALTAS, como mucho 1 por semana por reporte, respetando la baja y el tope
// diario. Antes salían desde 40 % y hasta 3 por reporte nuevo.
const MAX_EMAILS_POR_REPORTE_NUEVO = 3;


// Columnas explícitas, SIN contacto_whatsapp/contacto_email: esas dos
// tienen el SELECT revocado a nivel de Postgres incluso para service_role
// vía la RPC get_report_contact (que sí las expone, rate-limitada) — acá se
// listan aparte porque select=* no las traería de todos modos. El email de
// la coincidencia que termina superando el umbral se pide aparte, recién
// cuando hace falta (makeEmailDb.getReport en serverEmailAvisos.js).
//
// push_subscription: auditoría integral (2026-08-09) — se sacó del SELECT
// otorgado a anon/authenticated (una PushSubscription no debería ser
// legible en bloque por nadie con la anon key). Este webhook nunca corrió
// en el navegador (lo dispara Postgres server-to-server, protegido por
// x-webhook-secret) así que no había motivo real para que usara la anon
// key en primer lugar — pasa a usar SUPABASE_SERVICE_ROLE_KEY para esta
// consulta también (antes solo se usaba para el contacto de la coincidencia
// puntual).
const CANDIDATE_COLUMNS =
  "id,tipo,especie,raza,detalles,nombre,color,color_otro,tamano,sexo,edad,peso,zona,provincia,lat,lng,fecha,descripcion,push_subscription,foto_url,hist,embedding,foto_urls,hists,embeddings,creado_en";

async function fetchCandidates(supabaseUrl, apiKey, newReport) {
  const opuesto = newReport.tipo === "perdida" ? "encontrada" : "perdida";
  const params = new URLSearchParams({
    tipo: `eq.${opuesto}`,
    especie: `eq.${newReport.especie}`,
    resuelto: "eq.false",
    id: `neq.${newReport.id}`,
    select: CANDIDATE_COLUMNS,
    limit: "200",
  });
  const res = await fetch(`${supabaseUrl}/rest/v1/reports?${params.toString()}`, {
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return [];
  return res.json();
}

// nombre/color/zona son texto libre que cualquier persona controla al
// publicar un reporte (zona en particular viene de Google Places o texto a
// mano) — sin escapar, alguien podría meter HTML/enlaces propios en el
// email de coincidencia que le llega a OTRA persona (ej. un "nombre" como
// `<a href="...">` para un enlace de phishing disfrazado de Felpus). Nunca
// se ejecutaría como <script> (los clientes de correo lo filtran), pero sí
// se renderiza como HTML real, así que el resto (links, estilos, tags)
// pasa sin filtro si no se escapa acá.
export { escapeHtml } from "../../../lib/emailAvisos";

export async function POST(request) {
  const secret = request.headers.get("x-webhook-secret");
  if (!secretsMatch(secret, process.env.NOTIFY_WEBHOOK_SECRET)) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: "Faltan variables de entorno en el servidor." }, { status: 501 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const row = payload?.record;
  if (!row || row.resuelto) {
    return Response.json({ notified: 0 });
  }

  // 1) Email al dueño del otro reporte, solo si la coincidencia es alta (ver
  // emailAvisos.js). El push lo manda el despacho de alertas de abajo.
  let notified = 0;
  const send = makeEmailSender();
  const linkKey = linkSecret();
  if (send && linkKey) {
    try {
      const now = new Date();
      const newReport = rowToMatchable(row);
      const candidateRows = await fetchCandidates(supabaseUrl, serviceKey, row);
      const candidates = candidateRows.map(rowToMatchable);
      const matches = findMatches(newReport, candidates, { limit: 10 });
      const emailDb = makeEmailDb({ supabaseUrl, serviceKey });
      const dayStart = argentinaDayStartIso(now);
      let cupo = null;
      for (const m of matches) {
        if (notified >= MAX_EMAILS_POR_REPORTE_NUEVO) break;
        // Sin la migración 20261028_01, getReport falla y no se manda nada
        // (no hay cómo respetar la baja).
        const destino = await emailDb.getReport(m.report.id);
        if (!matchEmailAllowed(destino, m.score, now.getTime())) continue;
        if (cupo == null) cupo = cupoRestante(await emailDb.countEmailsSince(dayStart));
        if (cupo <= 0) break;
        const token = firmarAviso(destino.id, linkKey, now.getTime());
        const urls = avisoUrls(SITE_URL, token);
        try {
          const mail = matchEmail({
            report: destino,
            otro: row,
            score: m.score,
            verUrl: `${SITE_URL}/r/${encodeURIComponent(row.id)}`,
            bajaUrl: urls.bajaUrl,
          });
          await send({ to: destino.contacto_email, ...mail, unsubscribeUrl: urls.unsubscribePostUrl });
          await emailDb.markMatchEmail(destino.id, now.toISOString());
          await emailDb.logEmail({ reportId: destino.id, kind: "email_match", day: dayStart.slice(0, 10) });
          notified++;
          cupo--;
        } catch (e) {
          logError("No se pudo mandar el email de coincidencia", e);
        }
      }
    } catch (e) {
      logError("Fallo el envío de emails de coincidencia", e);
    }
  }

  // 2) Alertas automáticas (push): coincidencias guardadas + zonas. Un error
  // acá nunca tumba los emails de arriba (ver alertsServer.js).
  let alerts = null;
  try {
    alerts = await dispatchNewReport(row, {
      db: makeDb({ supabaseUrl, serviceKey }),
      push: await makePusher(),
      siteUrl: SITE_URL,
      log: (event, data) => console.info(JSON.stringify({ event, ...data })),
    });
  } catch (e) {
    logError("Fallo el despacho de alertas", e);
  }

  return Response.json({ notified, alerts });
}
