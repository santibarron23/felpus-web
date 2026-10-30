// Despacho de alertas automáticas (servidor). Lo usan /api/notify-match (el
// trigger de siempre), /api/alerts/dispatch y /api/alerts/flush. Todo lo que
// toca red (Supabase, web-push) entra por `deps`, así se testea con dobles.
import { findMatches, marcarDudosas } from "./matching";
import {
  matchThresholds,
  classifyMatch,
  isQuietHours,
  argentinaDayStartIso,
  matchNotification,
  sightingNotification,
  zoneNotification,
  inactivityNotification,
  isMatchCandidate,
  reportCanAlert,
  lostAndFound,
  inactivityAction,
  isAllowedPushEndpoint,
  userRecipient,
  reportRecipient,
  ZONE_DAILY_CAP,
  AVISTAMIENTO_COOLDOWN_MIN,
} from "./alerts";

// Fila de `reports` → formato de scoreMatch. Antes vivía (casi igual) adentro
// de api/notify-match; se movió acá para compartirla.
export function rowToMatchable(row) {
  const fotosBase =
    Array.isArray(row.foto_urls) && row.foto_urls.length
      ? row.foto_urls.map((url, i) => ({ url, hist: row.hists?.[i] ?? null, embedding: row.embeddings?.[i] ?? null }))
      : [{ url: row.foto_url, hist: row.hist, embedding: row.embedding || null }];
  const fotos = marcarDudosas(fotosBase, row.detalles);
  return {
    id: row.id,
    tipo: row.tipo,
    especie: row.especie,
    raza: row.raza || "",
    detalles: row.detalles || {},
    nombre: row.nombre || "",
    color: row.color,
    colorOtro: row.color_otro || "",
    tamano: row.tamano,
    sexo: row.sexo || "",
    edad: row.edad || "",
    peso: row.peso || "",
    zona: row.zona,
    provincia: row.provincia || "",
    lat: row.lat,
    lng: row.lng,
    fecha: row.fecha || null,
    descripcion: row.descripcion,
    pushSubscription: row.push_subscription || null,
    fotos,
    hist: fotos[0]?.hist,
    embedding: fotos[0]?.embedding,
    creadoEn: row.creado_en ? new Date(row.creado_en).getTime() : Date.now(),
  };
}

// Columnas para el despacho: sin contacto (revocado) y con push/estado.
export const DISPATCH_COLUMNS =
  "id,tipo,especie,raza,detalles,nombre,color,color_otro,tamano,sexo,edad,peso,zona,provincia,lat,lng,fecha,descripcion,push_subscription,foto_url,hist,embedding,foto_urls,hists,embeddings,creado_en,user_id,resuelto,oculto,inactivo,actividad_en,aviso_inactividad_en";

// ---------------------------------------------------------------------------
// Acceso a Supabase (REST con service_role, solo servidor).
// ---------------------------------------------------------------------------
export function makeDb({ supabaseUrl, serviceKey, fetchImpl = fetch }) {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  const rest = async (path, init = {}) => {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    if (!res.ok) throw new Error(`Supabase ${res.status} en ${path.split("?")[0]}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
  const insertIgnore = async (table, row) => {
    const rows = await rest(table, {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(row),
    });
    return Array.isArray(rows) && rows.length > 0;
  };
  return {
    async getCandidates(row) {
      const opuesto = row.tipo === "perdida" ? "encontrada" : "perdida";
      const p = new URLSearchParams({
        tipo: `eq.${opuesto}`,
        especie: `eq.${row.especie}`,
        resuelto: "eq.false",
        oculto: "not.is.true",
        inactivo: "not.is.true",
        id: `neq.${row.id}`,
        select: DISPATCH_COLUMNS,
        limit: "300",
      });
      return (await rest(`reports?${p}`)) || [];
    },
    insertMatch: ({ lostId, foundId, score, notificado }) =>
      insertIgnore("matches", { report_lost_id: lostId, report_found_id: foundId, score, notificado }),
    getUserSubs: async (userId) =>
      (await rest(`push_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=endpoint,p256dh,auth`)) || [],
    deleteSub: (endpoint) => rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: "DELETE" }),
    clearReportSub: (reportId) =>
      rest(`reports?id=eq.${encodeURIComponent(reportId)}`, { method: "PATCH", body: JSON.stringify({ push_subscription: null }) }),
    logNotification: (row) => insertIgnore("notifications_log", row),
    markSent: (id, payload) =>
      rest(`notifications_log?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "enviada", ...(payload ? { payload } : {}) }) }),
    zoneRecipients: async (reportId) =>
      (await rest("rpc/alert_zone_recipients", { method: "POST", body: JSON.stringify({ p_report_id: reportId }) })) || [],
    async countZoneSince(userId, sinceIso) {
      const p = new URLSearchParams({ user_id: `eq.${userId}`, kind: "eq.zona", status: "eq.enviada", created_at: `gte.${sinceIso}`, select: "id" });
      return ((await rest(`notifications_log?${p}`)) || []).length;
    },
    async countKindSince(recipient, kind, sinceIso) {
      const p = new URLSearchParams({ recipient: `eq.${recipient}`, kind: `eq.${kind}`, created_at: `gte.${sinceIso}`, select: "id" });
      return ((await rest(`notifications_log?${p}`)) || []).length;
    },
    pendingZone: async () =>
      (await rest("notifications_log?status=eq.pendiente&kind=eq.zona&select=id,user_id,report_id,payload,created_at&order=created_at.asc&limit=500")) || [],
    async getReport(id) {
      const rows = await rest(`reports?id=eq.${encodeURIComponent(id)}&select=${DISPATCH_COLUMNS}&limit=1`);
      return Array.isArray(rows) ? rows[0] || null : null;
    },
    lifecycleCandidates: async () =>
      (await rest(`reports?resuelto=eq.false&inactivo=eq.false&select=id,tipo,especie,nombre,user_id,push_subscription,resuelto,inactivo,actividad_en,aviso_inactividad_en,creado_en&limit=1000`)) || [],
    setAvisoInactividad: (id, iso) =>
      rest(`reports?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ aviso_inactividad_en: iso }) }),
    setInactivo: (id) => rest(`reports?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ inactivo: true }) }),
  };
}

// web-push con VAPID. Devuelve null si faltan las claves (push apagado).
export async function makePusher(env = process.env) {
  const pub = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null;
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(env.VAPID_SUBJECT || "mailto:contacto@felpus.com", pub, priv);
  return {
    send: (subscription, payload) => webpush.sendNotification(subscription, JSON.stringify(payload)),
  };
}

// Filas guardadas antes de validar el endpoint (o escritas por otro camino)
// tampoco salen: ver isAllowedPushEndpoint en alerts.js.
function toWebPushSub(s) {
  if (!s || !isAllowedPushEndpoint(s.endpoint)) return null;
  if (s.endpoint && s.keys) return s; // formato PushSubscription.toJSON()
  if (s.endpoint && s.p256dh && s.auth) return { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
  return null;
}

const GONE = new Set([404, 410]);

// Manda a todos los dispositivos de una persona. 404/410 = suscripción
// vencida → se borra. Devuelve cuántos envíos salieron bien.
async function sendToUser(deps, userId, payload) {
  if (!deps.push) return 0;
  let ok = 0;
  for (const s of await deps.db.getUserSubs(userId)) {
    const sub = toWebPushSub(s);
    if (!sub) continue;
    try {
      await deps.push.send(sub, payload);
      ok++;
    } catch (e) {
      if (GONE.has(e?.statusCode)) await deps.db.deleteSub(s.endpoint).catch(() => {});
      else deps.log("push_error", { statusCode: e?.statusCode || null });
    }
  }
  return ok;
}

async function sendToReportSub(deps, report, payload) {
  const sub = toWebPushSub(report.push_subscription);
  if (!deps.push || !sub) return 0;
  try {
    await deps.push.send(sub, payload);
    return 1;
  } catch (e) {
    if (GONE.has(e?.statusCode)) await deps.db.clearReportSub(report.id).catch(() => {});
    else deps.log("push_error", { statusCode: e?.statusCode || null });
    return 0;
  }
}

// Avisa al dueño de `ownerReport` (cuenta + push del propio reporte, para
// invitados). `aboutReportId` es el reporte del que se avisa (para no repetir).
async function notifyReportOwner(deps, ownerReport, aboutReportId, kind, payload) {
  const recipients = [];
  if (ownerReport.user_id) {
    const recipient = userRecipient(ownerReport.user_id);
    if (await deps.db.logNotification({ recipient, user_id: ownerReport.user_id, report_id: aboutReportId, kind, status: "enviada", payload })) {
      await sendToUser(deps, ownerReport.user_id, payload);
      recipients.push(recipient);
    }
  }
  if (ownerReport.push_subscription) {
    const recipient = reportRecipient(ownerReport.id);
    if (await deps.db.logNotification({ recipient, user_id: ownerReport.user_id || null, report_id: aboutReportId, kind, status: "enviada", payload })) {
      await sendToReportSub(deps, ownerReport, payload);
      recipients.push(recipient);
    }
  }
  return recipients;
}

// Devuelve el id de la perdida vinculada si corresponde avisar por ella (se
// haya mandado o no por el enfriamiento), o null.
async function notifySightingOwner(row, deps, now, summary) {
  const lostId = row.tipo === "encontrada" && row.detalles?.avistamiento === true ? row.detalles.avistamiento_de : null;
  if (typeof lostId !== "string" || !lostId) return null;
  const lost = await deps.db.getReport(lostId);
  if (!lost || lost.tipo !== "perdida" || !reportCanAlert(lost)) return null;
  // Quien avisó es el dueño (con su cuenta): no tiene sentido avisarle.
  if (lost.user_id && lost.user_id === row.user_id) return null;
  const since = new Date(now.getTime() - AVISTAMIENTO_COOLDOWN_MIN * 60 * 1000).toISOString();
  const recipients = [lost.user_id && userRecipient(lost.user_id), lost.push_subscription && reportRecipient(lost.id)].filter(Boolean);
  for (const r of recipients) {
    if ((await deps.db.countKindSince(r, "avistamiento", since)) > 0) return lost.id;
  }
  const payload = sightingNotification({ lostReport: lost, sighting: row, siteUrl: deps.siteUrl });
  summary.sightingAlerts += (await notifyReportOwner(deps, lost, row.id, "avistamiento", payload)).length;
  return lost.id;
}

export async function dispatchNewReport(row, deps) {
  const now = deps.now || new Date();
  const thresholds = deps.thresholds || matchThresholds();
  const summary = { matches: 0, matchAlerts: 0, sightingAlerts: 0, zoneSent: 0, zonePending: 0 };
  if (!reportCanAlert(row)) return summary;

  // 0) Avistamiento vinculado ("La vi" desde una perdida): aviso directo al
  // dueño de esa perdida, sin depender del puntaje. Aislado: si falla (por
  // ejemplo, sin la migración que habilita el tipo "avistamiento"), el
  // resto de las alertas sigue igual.
  const avisada = await notifySightingOwner(row, deps, now, summary).catch((e) => {
    deps.log("avistamiento_error", { message: String(e?.message || e).slice(0, 200) });
    return null;
  });

  // A) Coincidencias (primero).
  const alertedUsers = new Set();
  const candidates = (await deps.db.getCandidates(row)).filter((c) => isMatchCandidate(row, c, now.getTime()));
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const found = findMatches(rowToMatchable(row), candidates.map(rowToMatchable), { limit: 20 });
  for (const m of found) {
    const level = classifyMatch(m.score, thresholds);
    if (!level) continue;
    const other = byId.get(m.report.id);
    const { lost, found: foundR } = lostAndFound(row, other);
    // Par ya existente (también si está descartado): no se vuelve a avisar.
    const created = await deps.db.insertMatch({ lostId: lost.id, foundId: foundR.id, score: Math.round(m.score * 1000) / 1000, notificado: level === "alta" });
    if (!created) continue;
    summary.matches++;
    if (level !== "alta") continue;
    for (const [mine, theirs] of [[row, other], [other, row]]) {
      // Al dueño de esa perdida ya le llegó (o le está por llegar) el aviso
      // de avistamiento por este mismo reporte: no se repite como coincidencia.
      if (avisada && mine.id === avisada) continue;
      const payload = matchNotification({ recipientReport: mine, otherReport: theirs, siteUrl: deps.siteUrl });
      const sent = await notifyReportOwner(deps, mine, theirs.id, "match", payload);
      if (mine.user_id && sent.length) alertedUsers.add(mine.user_id);
      summary.matchAlerts += sent.length;
    }
  }

  // B) Zona.
  if (row.lat != null && row.lng != null) {
    const quiet = isQuietHours(now);
    const dayStart = argentinaDayStartIso(now);
    for (const z of await deps.db.zoneRecipients(row.id)) {
      if (!z.user_id || z.user_id === row.user_id || alertedUsers.has(z.user_id)) continue;
      if (!quiet && (await deps.db.countZoneSince(z.user_id, dayStart)) >= ZONE_DAILY_CAP) continue;
      const payload = zoneNotification({ report: row, distanceM: z.distance_m, siteUrl: deps.siteUrl });
      const status = quiet ? "pendiente" : "enviada";
      const inserted = await deps.db.logNotification({ recipient: userRecipient(z.user_id), user_id: z.user_id, report_id: row.id, kind: "zona", status, payload });
      if (!inserted) continue;
      if (quiet) summary.zonePending++;
      else if (await sendToUser(deps, z.user_id, payload)) summary.zoneSent++;
    }
  }
  return summary;
}

// Tarea de las 8:00: alertas de zona pendientes + ciclo de vida.
export async function flushPending(deps) {
  const now = deps.now || new Date();
  const summary = { zoneSent: 0, skipped: 0, warned: 0, inactivated: 0 };
  const dayStart = argentinaDayStartIso(now);
  for (const n of await deps.db.pendingZone()) {
    // Más de 20 h esperando: ya no es noticia; se cierra sin mandar.
    if (now.getTime() - new Date(n.created_at).getTime() > 20 * 3600 * 1000) {
      await deps.db.markSent(n.id, { ...(n.payload || {}), omitida: true });
      summary.skipped++;
      continue;
    }
    if ((await deps.db.countZoneSince(n.user_id, dayStart)) >= ZONE_DAILY_CAP) continue;
    const report = await deps.db.getReport(n.report_id);
    if (!reportCanAlert(report)) {
      await deps.db.markSent(n.id, { ...(n.payload || {}), omitida: true });
      summary.skipped++;
      continue;
    }
    await deps.db.markSent(n.id);
    if (await sendToUser(deps, n.user_id, n.payload)) summary.zoneSent++;
  }
  for (const r of await deps.db.lifecycleCandidates()) {
    const action = inactivityAction(r, now.getTime());
    if (action === "inactivar") {
      await deps.db.setInactivo(r.id);
      summary.inactivated++;
    } else if (action === "avisar") {
      await deps.db.setAvisoInactividad(r.id, now.toISOString());
      const sent = await notifyReportOwner(deps, r, r.id, "inactividad", inactivityNotification({ report: r, siteUrl: deps.siteUrl }));
      if (sent.length) summary.warned++;
    }
  }
  return summary;
}
