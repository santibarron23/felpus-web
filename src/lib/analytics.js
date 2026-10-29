// Eventos de uso para GA4 (2026-10-29). La idea es medir si Felpus ayuda a
// reunir mascotas (cuántos empiezan un reporte y lo terminan, en qué paso
// abandonan, si comparten, si contactan), no solo visitas.
//
// Nunca datos personales: solo se aceptan nombres de evento conocidos y
// parámetros que sean números, booleanos o una palabra corta de una lista
// cerrada (tipo de reporte, paso, canal). Nada de ids de reporte, zonas,
// nombres, teléfonos ni emails — GA4 los guardaría tal cual.
export const EVENTS = new Set([
  "reporte_iniciado",
  "reporte_publicado",
  "reporte_abandonado",
  "reporte_error",
  "foto_error",
  "duplicado_detectado",
  "coincidencias_vistas",
  "contacto_iniciado",
  "reporte_compartido",
  "reencuentro_confirmado",
  "foto_recortada",
  "tutorial_abierto",
  "tutorial_paso",
  "tutorial_completado",
  "tutorial_descartado",
  "ayuda_abierta",
  "avistamiento_publicado",
  "asistente_reporte_publicado",
]);

const KEY = /^[a-z0-9_]{1,30}$/;

// Únicos textos que pueden ir como valor: cualquier otra palabra (aunque sea
// corta, como el nombre "luna") se descarta.
export const VALUES = new Set([
  // tipo de reporte / especie
  "perdida", "encontrada", "avistamiento", "perro", "gato",
  // paso del formulario donde se frenó
  "apodo", "fotos", "zona", "color", "contacto", "color_otro", "red", "servidor",
  // canal
  "whatsapp", "email", "facebook", "instagram", "copiar", "nativo", "flyer",
  // desde dónde
  "inicio", "formulario", "pie", "confirmacion", "ficha", "resultado", "admin",
  // motivo
  "oscura", "movida", "procesar", "tamano", "tipo_archivo",
]);

export function cleanParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params || {})) {
    if (!KEY.test(k)) continue;
    if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.round(v * 100) / 100;
    else if (typeof v === "string" && VALUES.has(v)) out[k] = v;
  }
  return out;
}

export function track(name, params) {
  if (!EVENTS.has(name)) return;
  try {
    window.gtag?.("event", name, cleanParams(params));
  } catch {
    // sin analytics no pasa nada
  }
}
