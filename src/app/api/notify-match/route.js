import { timingSafeEqual } from "node:crypto";
import { findMatches } from "../../../lib/matching";
import { rowToMatchable, makeDb, makePusher, dispatchNewReport } from "../../../lib/alertsServer";
import { logError } from "../../../lib/log";
import { petTitle, nombreReal } from "../../../lib/petTitle";
import { SITE_URL } from "../../../lib/site";
import { C } from "../../../lib/theme";

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

// Umbral más alto que el de la app (0.15, "ver posibles coincidencias"):
// un email es más intrusivo que una tarjeta en una lista, así que solo
// avisamos por mail ante probabilidad media/alta real.
const EMAIL_SCORE_THRESHOLD = 0.4;
const MAX_EMAILS_PER_REPORT = 3;


// Columnas explícitas, SIN contacto_whatsapp/contacto_email: esas dos
// tienen el SELECT revocado a nivel de Postgres incluso para service_role
// vía la RPC get_report_contact (que sí las expone, rate-limitada) — acá se
// listan aparte porque select=* no las traería de todos modos. El email de
// la coincidencia que termina superando el umbral se pide aparte, recién
// cuando hace falta (ver fetchReportContactServer más abajo).
//
// push_subscription: auditoría integral (2026-08-09) — se sacó del SELECT
// otorgado a anon/authenticated (una PushSubscription no debería ser
// legible en bloque por nadie con la anon key). Este webhook nunca corrió
// en el navegador (lo dispara Postgres server-to-server, protegido por
// x-webhook-secret) así que no había motivo real para que usara la anon
// key en primer lugar — pasa a usar SUPABASE_SERVICE_ROLE_KEY para esta
// consulta también (antes solo se usaba para el contacto de la coincidencia
// puntual, ver fetchReportContactServer).
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

// Mismo camino que usa el navegador (get_report_contact en schema.sql), pero
// llamado servidor-a-servidor sin IP real que identificar, así que no
// compite contra el cupo de 30/hora por IP de gente real abriendo detalles
// de reportes (ver el comentario junto a esa función). Se pide solo para
// las coincidencias que ya superaron el umbral, nunca en bloque para los
// 200 candidatos.
//
// Hallazgo de auditoría de seguridad (2026-08-07): get_report_contact ahora
// exige el rol service_role (ver PENDIENTE_DECISION.md #-14) — la anon key
// que usaba esta llamada ya no alcanza, así que pasa a requerir
// SUPABASE_SERVICE_ROLE_KEY explícitamente.
async function fetchReportContactServer(supabaseUrl, serviceKey, reportId) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_report_contact`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_report_id: reportId, p_client_ip: null }),
  });
  if (!res.ok) return "";
  const rows = await res.json();
  return (Array.isArray(rows) ? rows[0]?.contacto_email : null) || "";
}

// nombre/color/zona son texto libre que cualquier persona controla al
// publicar un reporte (zona en particular viene de Google Places o texto a
// mano) — sin escapar, alguien podría meter HTML/enlaces propios en el
// email de coincidencia que le llega a OTRA persona (ej. un "nombre" como
// `<a href="...">` para un enlace de phishing disfrazado de Felpus). Nunca
// se ejecutaría como <script> (los clientes de correo lo filtran), pero sí
// se renderiza como HTML real, así que el resto (links, estilos, tags)
// pasa sin filtro si no se escapa acá.
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

async function sendMatchEmail({ resendKey, toEmail, matchedReport, newReport, score }) {
  const link = `${SITE_URL}/r/${encodeURIComponent(newReport.id)}`;
  const nombre = escapeHtml(nombreReal(newReport) || petTitle(newReport).toLowerCase());
  const color = escapeHtml(newReport.color);
  const zona = escapeHtml(newReport.zona);
  const matchedNombre = escapeHtml(petTitle(matchedReport));
  const pct = Math.round(score * 100);
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:${C.red};">🐾 Posible coincidencia en Felpus</h2>
      <p>Alguien publicó ${newReport.tipo === "perdida" ? "una mascota perdida" : "una mascota encontrada"}
        (<strong>${nombre}</strong>, ${color}, zona ${zona}) que se parece a tu publicación
        de <strong>${matchedNombre}</strong> — ${pct}% de compatibilidad.</p>
      <p><a href="${link}" style="display:inline-block;background:${C.redSolid};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Ver la publicación</a></p>
      <p style="color:${C.muted};font-size:12px;">Entrá a Felpus para ver el detalle completo y confirmar si es tu mascota.</p>
    </div>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Felpus <onboarding@resend.dev>",
      to: [toEmail],
      subject: `🐾 Posible coincidencia con ${petTitle(matchedReport)} en Felpus`,
      html,
    }),
  });
}

export async function POST(request) {
  const secret = request.headers.get("x-webhook-secret");
  if (!secretsMatch(secret, process.env.NOTIFY_WEBHOOK_SECRET)) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const resendKey = process.env.RESEND_API_KEY;
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

  // 1) Email al dueño del otro reporte (igual que siempre; se mantiene a
  // pedido del usuario, 2026-10-20). El push ya no sale de acá: lo manda el
  // despacho de alertas de abajo, con umbrales propios y sin repetir.
  let notified = 0;
  if (resendKey) {
    try {
      const newReport = rowToMatchable(row);
      const candidateRows = await fetchCandidates(supabaseUrl, serviceKey, row);
      const candidates = candidateRows.map(rowToMatchable);
      const matches = findMatches(newReport, candidates, { limit: 10 }).filter((m) => m.score >= EMAIL_SCORE_THRESHOLD);
      for (const m of matches) {
        if (notified >= MAX_EMAILS_PER_REPORT) break;
        let contactoEmail = "";
        try {
          contactoEmail = await fetchReportContactServer(supabaseUrl, serviceKey, m.report.id);
        } catch (e) {
          logError("No se pudo obtener el email de contacto para la coincidencia", e);
        }
        if (!contactoEmail) continue;
        try {
          await sendMatchEmail({ resendKey, toEmail: contactoEmail, matchedReport: m.report, newReport, score: m.score });
          notified++;
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
