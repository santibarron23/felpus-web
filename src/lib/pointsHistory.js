// Historial de huellitas y referidos (2026-10-27). Funciones puras: lo que
// viene de get_my_points_history (ver la migración 20261027_02) se agrupa
// por día y se traduce a texto acá, así se puede testear sin la base.

// Mismo valor que el trigger points_events_referral_reward de la base.
export const PUNTOS_REFERIDO = 20;

export const REF_PARAM = "invita";
export const REF_STORAGE_KEY = "felpus_ref";
// Un link de invitación abierto hace más de 30 días ya no cuenta.
const REF_TTL_MS = 30 * 24 * 3600 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function referralLink(origin, userId) {
  return `${origin}/?${REF_PARAM}=${userId}`;
}

// Id de quien invita a partir del ?invita= de la URL, o null si no es válido.
export function parseReferrer(search) {
  const id = new URLSearchParams(search || "").get(REF_PARAM);
  return id && UUID_RE.test(id) ? id.toLowerCase() : null;
}

// Lo guardado en el dispositivo ({ id, at }), o null si no sirve o venció.
export function storedReferrer(raw, now = Date.now()) {
  try {
    const v = JSON.parse(raw || "null");
    if (!v || !UUID_RE.test(v.id || "") || !(now - v.at < REF_TTL_MS)) return null;
    return v.id;
  } catch {
    return null;
  }
}

export function eventLabel(ev) {
  switch (ev.reason) {
    case "reporte":
      if (ev.tipo === "perdida") return "Publicaste una mascota perdida";
      if (ev.tipo === "encontrada") return "Publicaste una mascota encontrada";
      return "Publicaste un reporte";
    case "reencuentro":
      return "Confirmaste un reencuentro";
    case "bono-reporte-original":
      return "Volvió a casa una mascota que reportaste";
    case "referido":
      return "Invitaste a alguien y publicó su primer reporte";
    default:
      return "Huellitas";
  }
}

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dayLabel(date, now = new Date()) {
  const ayer = new Date(now);
  ayer.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(now)) return "Hoy";
  if (dayKey(date) === dayKey(ayer)) return "Ayer";
  const opts = { weekday: "long", day: "numeric", month: "long" };
  if (date.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return date.toLocaleDateString("es-AR", opts);
}

// [{ label: "Hoy", items: [...] }, ...] en el mismo orden en que vienen
// (la base ya los manda del más nuevo al más viejo).
export function groupByDay(events, now = new Date()) {
  const groups = [];
  let last = null;
  for (const ev of events || []) {
    const d = new Date(ev.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = dayKey(d);
    if (!last || last.key !== key) {
      last = { key, label: dayLabel(d, now), items: [] };
      groups.push(last);
    }
    last.items.push(ev);
  }
  return groups;
}

export function pointsToday(events, now = new Date()) {
  const key = dayKey(now);
  return (events || []).reduce((sum, ev) => (dayKey(new Date(ev.created_at)) === key ? sum + (ev.points || 0) : sum), 0);
}
