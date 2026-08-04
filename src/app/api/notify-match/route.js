import webpush from "web-push";
import { findMatches } from "../../../lib/matching";
import { logError } from "../../../lib/log";

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

function rowToMatchable(row) {
  const fotos =
    Array.isArray(row.foto_urls) && row.foto_urls.length
      ? row.foto_urls.map((url, i) => ({ url, hist: row.hists?.[i] ?? null, embedding: row.embeddings?.[i] ?? null }))
      : [{ url: row.foto_url, hist: row.hist, embedding: row.embedding || null }];
  return {
    id: row.id,
    tipo: row.tipo,
    especie: row.especie,
    nombre: row.nombre || "",
    color: row.color,
    colorOtro: row.color_otro || "",
    tamano: row.tamano,
    sexo: row.sexo || "",
    edad: row.edad || "",
    peso: row.peso || "",
    zona: row.zona,
    lat: row.lat,
    lng: row.lng,
    descripcion: row.descripcion,
    contactoEmail: row.contacto_email || "",
    pushSubscription: row.push_subscription || null,
    fotos,
    hist: fotos[0]?.hist,
    embedding: fotos[0]?.embedding,
    creadoEn: row.creado_en ? new Date(row.creado_en).getTime() : Date.now(),
  };
}

async function fetchCandidates(supabaseUrl, apiKey, newReport) {
  const opuesto = newReport.tipo === "perdida" ? "encontrada" : "perdida";
  const params = new URLSearchParams({
    tipo: `eq.${opuesto}`,
    especie: `eq.${newReport.especie}`,
    resuelto: "eq.false",
    id: `neq.${newReport.id}`,
    select: "*",
    limit: "200",
  });
  const res = await fetch(`${supabaseUrl}/rest/v1/reports?${params.toString()}`, {
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return [];
  return res.json();
}

async function sendMatchEmail({ resendKey, toEmail, matchedReport, newReport, score }) {
  const siteUrl = "https://felpus-web.vercel.app";
  const link = `${siteUrl}/r/${newReport.id}`;
  const nombre = newReport.nombre || (newReport.especie === "gato" ? "un gato" : "un perro");
  const pct = Math.round(score * 100);
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#D31C22;">🐾 Posible coincidencia en Felpus</h2>
      <p>Alguien publicó ${newReport.tipo === "perdida" ? "una mascota perdida" : "una mascota encontrada"}
        (<strong>${nombre}</strong>, ${newReport.color}, zona ${newReport.zona}) que se parece a tu publicación
        de <strong>${matchedReport.nombre || matchedReport.especie}</strong> — ${pct}% de compatibilidad.</p>
      <p><a href="${link}" style="display:inline-block;background:#D31C22;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Ver la publicación</a></p>
      <p style="color:#6B5643;font-size:12px;">Entrá a Felpus para ver el detalle completo y confirmar si es tu mascota.</p>
    </div>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Felpus <onboarding@resend.dev>",
      to: [toEmail],
      subject: `🐾 Posible coincidencia con ${matchedReport.nombre || matchedReport.especie} en Felpus`,
      html,
    }),
  });
}

async function sendMatchPush({ subscription, matchedReport, newReport, score }) {
  const siteUrl = "https://felpus-web.vercel.app";
  const nombre = newReport.nombre || (newReport.especie === "gato" ? "un gato" : "un perro");
  const pct = Math.round(score * 100);
  const payload = JSON.stringify({
    title: "🐾 Posible coincidencia en Felpus",
    body: `${nombre} (${newReport.color}, zona ${newReport.zona}) se parece a tu publicación de ${matchedReport.nombre || matchedReport.especie} — ${pct}% de compatibilidad.`,
    url: `${siteUrl}/r/${newReport.id}`,
    tag: `felpus-match-${matchedReport.id}`,
  });
  await webpush.sendNotification(subscription, payload);
}

// Push es opcional: si no están las claves VAPID configuradas (ver
// PENDIENTE_DECISION.md), simplemente no se manda nada por ese canal — el
// email sigue funcionando igual, no hace que todo el webhook falle.
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const pushConfigured = !!(vapidPublicKey && vapidPrivateKey);
if (pushConfigured) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:contacto@felpus.app", vapidPublicKey, vapidPrivateKey);
}

export async function POST(request) {
  const secret = request.headers.get("x-webhook-secret");
  if (!process.env.NOTIFY_WEBHOOK_SECRET || secret !== process.env.NOTIFY_WEBHOOK_SECRET) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!supabaseUrl || !supabaseKey || !resendKey) {
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

  const newReport = rowToMatchable(row);
  const candidateRows = await fetchCandidates(supabaseUrl, supabaseKey, row);
  const candidates = candidateRows.map(rowToMatchable);

  // Mismo umbral y tope para los dos canales — un push es tan intrusivo
  // como un email (o más, en el momento), así que no tiene sentido ser más
  // permisivo con uno que con otro.
  const matches = findMatches(newReport, candidates)
    .filter((m) => m.score >= EMAIL_SCORE_THRESHOLD && (m.report.contactoEmail || m.report.pushSubscription))
    .slice(0, MAX_EMAILS_PER_REPORT);

  let notified = 0;
  for (const m of matches) {
    let sentSomething = false;
    if (m.report.contactoEmail) {
      try {
        await sendMatchEmail({ resendKey, toEmail: m.report.contactoEmail, matchedReport: m.report, newReport, score: m.score });
        sentSomething = true;
      } catch (e) {
        logError("No se pudo mandar el email de coincidencia", e);
      }
    }
    if (pushConfigured && m.report.pushSubscription) {
      try {
        await sendMatchPush({ subscription: m.report.pushSubscription, matchedReport: m.report, newReport, score: m.score });
        sentSomething = true;
      } catch (e) {
        // Código 404/410 = la suscripción ya no es válida (el usuario
        // desinstaló, borró datos del navegador, etc.) — no hay forma de
        // limpiarla desde acá sin otra función security definer aparte, así
        // que por ahora solo se loguea distinto para diferenciarlo de un
        // error real.
        logError(e?.statusCode === 404 || e?.statusCode === 410 ? "Suscripción push vencida" : "No se pudo mandar la notificación push", e);
      }
    }
    if (sentSomething) notified++;
  }

  return Response.json({ notified });
}
