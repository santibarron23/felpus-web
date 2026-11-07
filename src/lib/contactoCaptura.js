// Contacto que figuraba en una captura o flyer importado (/api/import-post,
// extraerContacto en postImport.js) -> valores listos para el formulario.
//
// 2026-11-07: el contacto del aviso REEMPLAZA al que estaba cargado (por
// ejemplo, el WhatsApp guardado de una publicación anterior): si la persona
// sube el flyer, el número del flyer es el que tiene que quedar. Si la
// captura no trae teléfono (o no es un número válido), o no trae email, ese
// campo devuelve null y el formulario conserva lo que ya tenía.
//
// El teléfono se normaliza igual que el resto del formulario (phone.js): se
// valida con parseWhatsappPhone y se separa en país + número nacional con
// splitStoredWhatsapp, que es lo que espera el PhoneInput.
import { parseWhatsappPhone, splitStoredWhatsapp, DEFAULT_COUNTRY } from "./phone";

export async function contactoCapturaParaForm(contacto, paisActual) {
  const out = { whatsapp: null, email: null };
  if (!contacto || typeof contacto !== "object") return out;

  const telefono = typeof contacto.telefono === "string" ? contacto.telefono.trim() : "";
  if (telefono) {
    const parsed = await parseWhatsappPhone(telefono, paisActual || DEFAULT_COUNTRY);
    if (parsed.isValid) {
      const { country, national } = await splitStoredWhatsapp(parsed.digits);
      if (national) out.whatsapp = { national, country: country || paisActual || DEFAULT_COUNTRY };
    }
  }

  const email = typeof contacto.email === "string" ? contacto.email.trim() : "";
  if (email && email.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out.email = email;

  return out;
}

// Texto del aviso chico junto al contacto: qué se tomó de la captura.
export function avisoContactoCaptura({ telefono, email }) {
  if (telefono && email) return "Usamos el teléfono y el email del aviso.";
  if (telefono) return "Usamos el teléfono del aviso.";
  if (email) return "Usamos el email del aviso.";
  return "";
}
