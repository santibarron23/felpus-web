// Lógica pura de las alertas automáticas (ver PLAN-alertas.md): umbrales,
// horario de silencio, tope diario, textos de las notificaciones y filtros de
// candidatos. Sin red ni base de datos — eso vive en alertsServer.js — para
// poder testearla sola.
import { haversineKm } from "./matching";

export const ALERTS_TZ = "America/Argentina/Salta";
export const MATCH_MAX_KM = 15;
export const MATCH_MAX_DAYS = 45;
export const ZONE_DAILY_CAP = 5;
export const INACTIVE_AFTER_DAYS = 60;
export const INACTIVE_WARNING_DAYS = 7;
const DAY_MS = 24 * 3600 * 1000;

function parseThreshold(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : fallback;
}

// MATCH_THRESHOLD_HIGH: push inmediato a los dos dueños. MATCH_THRESHOLD_MID:
// se guarda la coincidencia sin avisar. Escala 0–1 (la de scoreMatch).
export function matchThresholds(env = process.env) {
  const high = parseThreshold(env.MATCH_THRESHOLD_HIGH, 0.8);
  const mid = Math.min(parseThreshold(env.MATCH_THRESHOLD_MID, 0.65), high);
  return { high, mid };
}

export function classifyMatch(score, { high, mid }) {
  if (score >= high) return "alta";
  if (score >= mid) return "media";
  return null;
}

// Hora local de Argentina (0–23), sin depender de la zona horaria del
// servidor (Vercel corre en UTC).
export function argentinaHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: ALERTS_TZ, hour: "numeric", hourCycle: "h23" }).format(now));
}

// Entre las 23:00 y las 8:00 las alertas de zona no se mandan: quedan
// "pendiente" y salen a las 8:00 (ver /api/alerts/flush).
export function isQuietHours(now = new Date()) {
  const h = argentinaHour(now);
  return h >= 23 || h < 8;
}

// Inicio del día de hoy en Argentina, en ISO (para contar el tope diario).
// Argentina es UTC-3 todo el año.
export function argentinaDayStartIso(now = new Date()) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: ALERTS_TZ }).format(now);
  return new Date(`${ymd}T00:00:00-03:00`).toISOString();
}

// "a 2 km" — siempre redondeado, nunca un punto exacto.
export function roundedDistance(km) {
  if (km == null || !Number.isFinite(km)) return "";
  if (km < 1) return "a menos de 1 km";
  return `a ${Math.round(km)} km`;
}

function especieWord(especie) {
  if (especie === "perro") return "perro";
  if (especie === "gato") return "gato";
  return "animal";
}

function colorWord(r) {
  const c = r.color === "Otro color" && r.color_otro ? r.color_otro : r.color;
  return (c || "").toString().toLowerCase();
}

export function distanceKmBetween(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
  return haversineKm(a.lat, a.lng, b.lat, b.lng);
}

// Textos del plan. Nunca incluyen direcciones, teléfonos ni nombres de
// personas (el nombre de la MASCOTA del destinatario sí, como pide el plan).
export function matchNotification({ recipientReport, otherReport, siteUrl = "" }) {
  const km = distanceKmBetween(recipientReport, otherReport);
  const nombre = (recipientReport.nombre || "").trim() || "tu mascota";
  const dist = km != null ? ` ${roundedDistance(km)}` : "";
  return {
    title: "🐾 Puede ser tu mascota",
    body: `Reportaron un ${especieWord(otherReport.especie)} parecido a ${nombre}${dist}. Tocá para verlo.`,
    url: `${siteUrl}/r/${encodeURIComponent(otherReport.id)}`,
    tag: `felpus-match-${recipientReport.id}-${otherReport.id}`,
  };
}

export function zoneNotification({ report, distanceM, siteUrl = "" }) {
  const especie = especieWord(report.especie);
  const rasgos = [colorWord(report), report.tamano].filter(Boolean).join(", ");
  const dist = roundedDistance(distanceM != null ? distanceM / 1000 : null);
  const detalle = [rasgos, dist].filter(Boolean).join(", ");
  const perdida = report.tipo === "perdida";
  return {
    title: perdida ? `Se perdió un ${especie} cerca tuyo` : `Encontraron un ${especie} cerca tuyo`,
    body: `${detalle ? `${capitalize(detalle)}. ` : ""}${perdida ? "Si lo ves, avisá en Felpus." : "¿Lo conocés?"}`,
    url: `${siteUrl}/r/${encodeURIComponent(report.id)}`,
    tag: `felpus-zona-${report.id}`,
  };
}

export function inactivityNotification({ report, siteUrl = "" }) {
  const nombre = (report.nombre || "").trim() || `tu ${especieWord(report.especie)}`;
  return {
    title: "¿Seguís buscando?",
    body: `El reporte de ${nombre} va a dejar de mandar alertas en ${INACTIVE_WARNING_DAYS} días. Tocá para renovarlo.`,
    url: `${siteUrl}/?renovar=${encodeURIComponent(report.id)}`,
    tag: `felpus-renovar-${report.id}`,
  };
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Fecha de referencia de un reporte: la del evento si existe, si no la de
// carga.
function refTime(r) {
  const f = r.fecha ? new Date(r.fecha).getTime() : NaN;
  if (Number.isFinite(f)) return f;
  return r.creado_en ? new Date(r.creado_en).getTime() : NaN;
}

// Candidatos para la alerta de match del plan: tipo opuesto, misma especie,
// activos (no reencontrados, no ocultos, no inactivos), de los últimos 45
// días y a 15 km o menos (cuando los dos tienen punto en el mapa; si no, la
// distancia la evalúa el matcher por zona/provincia).
export function isMatchCandidate(newReport, c, now = Date.now()) {
  if (!c || c.id === newReport.id) return false;
  if (c.tipo === newReport.tipo || c.especie !== newReport.especie) return false;
  if (c.resuelto || c.oculto === true || c.inactivo === true) return false;
  const t = refTime(c);
  if (Number.isFinite(t) && now - t > MATCH_MAX_DAYS * DAY_MS) return false;
  const km = distanceKmBetween(newReport, c);
  if (km != null && km > MATCH_MAX_KM) return false;
  return true;
}

// Un reporte ya inactivo, oculto o reencontrado no genera alertas.
export function reportCanAlert(r) {
  return !!r && !r.resuelto && r.oculto !== true && r.inactivo !== true;
}

export function lostAndFound(a, b) {
  return a.tipo === "perdida" ? { lost: a, found: b } : { lost: b, found: a };
}

// Ciclo de vida (tarea diaria): qué reportes avisar y cuáles pasar a
// inactivos según actividad_en.
export function inactivityAction(r, now = Date.now()) {
  if (r.resuelto || r.inactivo) return null;
  const last = new Date(r.actividad_en || r.creado_en).getTime();
  if (!Number.isFinite(last)) return null;
  const days = (now - last) / DAY_MS;
  if (days >= INACTIVE_AFTER_DAYS) return "inactivar";
  if (days >= INACTIVE_AFTER_DAYS - INACTIVE_WARNING_DAYS && !r.aviso_inactividad_en) return "avisar";
  return null;
}

export const userRecipient = (userId) => `user:${userId}`;
export const reportRecipient = (reportId) => `report:${reportId}`;

// Validación de lo que manda /configuracion/alertas (PUT /api/alerts/zone).
export const ZONE_RADII = [1000, 3000, 5000, 10000];
export const ZONE_SPECIES = ["perro", "gato", "otro"];
export const ZONE_TYPES = ["perdida", "encontrada"];
export function normalizeZoneInput(body) {
  const b = body && typeof body === "object" ? body : {};
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { error: "Marcá el centro de tu zona en el mapa." };
  }
  const radius = Number(b.radius_m);
  if (!ZONE_RADII.includes(radius)) return { error: "Elegí un radio de 1, 3, 5 o 10 km." };
  const species = Array.isArray(b.species) ? [...new Set(b.species.filter((s) => ZONE_SPECIES.includes(s)))] : [];
  const types = Array.isArray(b.report_types) ? [...new Set(b.report_types.filter((t) => ZONE_TYPES.includes(t)))] : [];
  if (!species.length) return { error: "Elegí al menos una especie." };
  if (!types.length) return { error: "Elegí perdidas, encontradas o las dos." };
  return { zone: { lat, lng, radius_m: radius, species, report_types: types, active: b.active !== false } };
}

// Suscripción push que manda el navegador (PushSubscription.toJSON()).
export function normalizePushSubscription(sub) {
  const s = sub && typeof sub === "object" ? sub : {};
  const endpoint = typeof s.endpoint === "string" ? s.endpoint : "";
  const p256dh = typeof s.keys?.p256dh === "string" ? s.keys.p256dh : "";
  const auth = typeof s.keys?.auth === "string" ? s.keys.auth : "";
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint, p256dh, auth };
}
