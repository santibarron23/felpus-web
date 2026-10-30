// Revisión (2026-10-11): el formulario exige "al menos un WhatsApp o un
// email" (ver handleSubmit en FelpusMatcher.jsx), pero /api/create-report
// no lo verificaba — alguien llamando a la API directo podía publicar
// reportes sin ninguna forma de contactar a quien publica, que para esta
// app equivale a un reporte inútil (o spam). Mismo principio que el resto
// de las rutas server-side: el cliente pide, el servidor verifica.
//
// Deliberadamente más permisivo que el cliente en el formato del teléfono
// (el cliente ya lo valida con libphonenumber vía PhoneInput): acá solo se
// exige que sean 8-15 dígitos (rango de E.164), sin intentar reimplementar
// esa validación — el objetivo es frenar reportes sin contacto, no
// rechazar números reales por un detalle de formato.

import { LUGAR_MAX } from "./resguardo";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Devuelve { ok, whatsapp, email, error } — whatsapp/email ya
// normalizados (solo dígitos / sin espacios alrededor), o null si vienen
// vacíos, listos para guardar.
export function validateReportContact(row) {
  const whatsapp = row?.contacto_whatsapp == null ? "" : String(row.contacto_whatsapp).replace(/\D/g, "");
  const email = row?.contacto_email == null ? "" : String(row.contacto_email).trim();

  const whatsappOk = whatsapp.length >= 8 && whatsapp.length <= 15;
  const emailOk = email.length <= 254 && EMAIL_RE.test(email);

  if (whatsapp && !whatsappOk) {
    return { ok: false, error: "Revisá el WhatsApp de contacto, no parece válido." };
  }
  if (email && !emailOk) {
    return { ok: false, error: "Revisá el email de contacto, no parece válido." };
  }
  // "Lo vi suelto" (sighting.js): quien solo VIO la mascota en la calle
  // puede avisar sin dejar contacto — lo que sirve es el dónde y el cuándo,
  // y quien la perdió recibe la coincidencia igual. Si deja uno, se valida.
  if (!whatsapp && !email && row?.tipo === "encontrada" && row?.detalles?.avistamiento === true) {
    return { ok: true, whatsapp: null, email: null };
  }
  if (!whatsappOk && !emailOk) {
    return { ok: false, error: "Dejá un WhatsApp o un email de contacto — así pueden avisarte si la reconocen." };
  }
  return { ok: true, whatsapp: whatsapp || null, email: email || null };
}

// "¿Dónde está ahora?" (resguardo.js): valida y normaliza
// detalles.resguardo/lugar antes de insertar.
// Devuelve { detalles } o { error }.
export function validarResguardo(row) {
  const d = row?.detalles;
  if (!d || (d.resguardo === undefined && d.lugar === undefined)) return { detalles: d ?? null };
  if (row.tipo !== "encontrada" || d.avistamiento === true) return { error: "Datos de resguardo inválidos." };
  if (d.resguardo !== "conmigo" && d.resguardo !== "terceros") return { error: "Datos de resguardo inválidos." };
  if (d.lugar !== undefined) {
    if (d.resguardo !== "terceros" || typeof d.lugar !== "string") return { error: "Datos de resguardo inválidos." };
    if (d.lugar.trim().length > LUGAR_MAX) return { error: `El nombre del lugar puede tener hasta ${LUGAR_MAX} caracteres.` };
  }
  const { lugar, ...resto } = d;
  const limpio = lugar === undefined ? "" : lugar.trim();
  return { detalles: limpio ? { ...resto, lugar: limpio } : resto };
}
