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
  if (!whatsappOk && !emailOk) {
    return { ok: false, error: "Dejá un WhatsApp o un email de contacto — así pueden avisarte si la reconocen." };
  }
  return { ok: true, whatsapp: whatsapp || null, email: email || null };
}
