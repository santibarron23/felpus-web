// Borrador del formulario de reporte guardado EN ESTE DISPOSITIVO
// (localStorage), para no perder lo cargado si se cierra la pestaña, se
// recarga o se va la señal (2026-10-27). Sin fotos (pesan demasiado) ni
// contacto (el WhatsApp ya se recuerda aparte, ver felpus_saved_whatsapp).
// Vence a las 24 h y se borra al publicar.
export const REPORT_DRAFT_KEY = "felpus_borrador_reporte";
export const REPORT_DRAFT_TTL_MS = 24 * 3600 * 1000;

const FORM_KEYS = [
  "especie", "raza", "nombre", "color", "colorOtro", "tamano", "sexo", "edad", "peso",
  "zona", "ciudad", "provincia", "lat", "lng", "fecha",
];
const LIST_KEYS = ["accesorioChips", "reaccionChips", "marcaChips"];
const TEXT_KEYS = ["manchaUbicacion", "manchaColor", "detalleLibre"];

const str = (v, max = 400) => (typeof v === "string" ? v.slice(0, max) : "");
const coord = (v, max) => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max ? v : null);

// ¿Hay algo cargado que valga la pena guardar? Los valores por defecto
// (perro, mediano, fecha de hoy) no cuentan.
export function draftHasContent(s) {
  const f = s?.form || {};
  return !!(
    str(f.zona).trim() ||
    str(f.color) ||
    str(f.raza).trim() ||
    str(f.nombre).trim() ||
    str(f.sexo) ||
    str(f.edad) ||
    str(f.peso) ||
    (f.lat != null && f.lng != null) ||
    LIST_KEYS.some((k) => Array.isArray(s?.[k]) && s[k].length) ||
    str(s?.detalleLibre).trim()
  );
}

export function serializeReportDraft(state, now = Date.now()) {
  const form = {};
  for (const k of FORM_KEYS) form[k] = state.form?.[k] ?? null;
  const out = { v: 1, savedAt: now, reportKind: state.reportKind === "encontrada" ? "encontrada" : "perdida", form };
  for (const k of LIST_KEYS) out[k] = Array.isArray(state[k]) ? state[k] : [];
  for (const k of TEXT_KEYS) out[k] = str(state[k]);
  return JSON.stringify(out);
}

// Texto guardado -> estado para restaurar, o null (vencido, roto o vacío).
export function parseReportDraft(raw, now = Date.now()) {
  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!d || d.v !== 1 || typeof d.savedAt !== "number" || now - d.savedAt > REPORT_DRAFT_TTL_MS || now < d.savedAt - 60_000) {
    return null;
  }
  const form = {};
  for (const k of FORM_KEYS) {
    if (k === "lat") form.lat = coord(d.form?.lat, 90);
    else if (k === "lng") form.lng = coord(d.form?.lng, 180);
    else form[k] = str(d.form?.[k], 120);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.fecha)) delete form.fecha;
  if (!form.especie) delete form.especie;
  if (!form.tamano) delete form.tamano;
  if (form.lat == null || form.lng == null) {
    form.lat = null;
    form.lng = null;
  }
  const out = { reportKind: d.reportKind === "encontrada" ? "encontrada" : "perdida", form };
  for (const k of LIST_KEYS) out[k] = Array.isArray(d[k]) ? d[k].filter((x) => typeof x === "string").slice(0, 20) : [];
  for (const k of TEXT_KEYS) out[k] = str(d[k]);
  return draftHasContent(out) ? out : null;
}
