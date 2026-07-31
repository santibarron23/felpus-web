import { scoreMatch } from "../../../lib/matching";

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

  const matches = candidates
    .map((c) => ({ candidate: c, ...scoreMatch(newReport, c) }))
    .filter((m) => m.score >= EMAIL_SCORE_THRESHOLD && m.candidate.contactoEmail)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_EMAILS_PER_REPORT);

  let notified = 0;
  for (const m of matches) {
    try {
      await sendMatchEmail({
        resendKey,
        toEmail: m.candidate.contactoEmail,
        matchedReport: m.candidate,
        newReport,
        score: m.score,
      });
      notified++;
    } catch (e) {
      console.error("No se pudo mandar el email de coincidencia", e);
    }
  }

  return Response.json({ notified });
}
