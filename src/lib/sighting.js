// "Lo vi suelto" (2026-10-27): reporte express para quien ve una mascota en
// la calle. Es un reporte "encontrada" de siempre (entra al matching, a los
// avisos de coincidencia y a las alertas sin cambios) con dos datos más en
// `detalles`:
//  - avistamiento: true → quien avisa NO la tiene con ella: solo la vio.
//    En ese caso el contacto es opcional (ver validateReportContact).
//  - avistamiento_de: id del reporte de perdida desde el que se tocó "La vi",
//    si se avisó desde una ficha.
// Si la persona sí la tiene con ella, es una encontrada común (con contacto
// obligatorio), cargada por el mismo camino rápido.
import { composeDescripcionBase } from "./matching";

export const PUNTOS_AVISTAMIENTO = 10; // award_points acepta ("reporte", 10)
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

export function isSighting(report) {
  return report?.detalles?.avistamiento === true;
}

// "Vista el 27 de octubre a las 18:30." en hora argentina.
export function sightingWhen(ms) {
  const d = new Date(ms);
  const fecha = d.toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: "America/Argentina/Salta" });
  const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Salta" });
  return `Vista el ${fecha} a las ${hora}.`;
}

// Fecha AAAA-MM-DD en hora argentina (no UTC: a las 22 h de Salta ya es
// "mañana" en UTC).
export function fechaLocal(ms) {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Salta" });
}

// Datos de la hoja → el mismo objeto que arma handleSubmit para createReport.
export function buildSightingDraft(input, now = Date.now()) {
  const i = input || {};
  const conmigo = i.conmigo === true;
  const form = { especie: i.especie, color: i.color || "", colorOtro: "", raza: i.raza || "", tamano: i.tamano || "", sexo: "", edad: "" };
  const detalleLibre = [
    sightingWhen(now),
    conmigo ? "La tengo conmigo." : "La vi suelta; no la tengo conmigo.",
  ].join(" ");
  const vistaDe = typeof i.vistaDe === "string" && ID_RE.test(i.vistaDe) ? i.vistaDe : null;
  return {
    id: i.id,
    tipo: "encontrada",
    especie: i.especie,
    raza: form.raza.trim(),
    nombre: "",
    color: form.color,
    colorOtro: "",
    tamano: form.tamano,
    sexo: "",
    edad: "",
    peso: "",
    zona: (i.zona || "").trim().slice(0, 100) || (i.ciudad || "").trim() || "Ubicación marcada en el mapa",
    ciudad: (i.ciudad || "").trim().slice(0, 80),
    provincia: (i.provincia || "").trim().slice(0, 80),
    lat: i.lat ?? null,
    lng: i.lng ?? null,
    fecha: fechaLocal(now),
    descripcion: `${composeDescripcionBase(form)} ${detalleLibre}`.trim(),
    detalles: {
      ...(conmigo ? {} : { avistamiento: true }),
      ...(vistaDe ? { avistamiento_de: vistaDe } : {}),
      ...(Array.isArray(i.fotosDudosas) && i.fotosDudosas.length ? { fotos_dudosas: i.fotosDudosas } : {}),
    },
    contactoWhatsapp: i.contactoWhatsapp || "",
    contactoEmail: "",
    fotos: i.fotos || [],
    nickname: (i.nickname || "").trim().slice(0, 40) || "Vecino/a",
    userId: i.userId || null,
    resuelto: false,
    creadoEn: now,
  };
}

// Qué falta para poder publicar (vacío = listo). La especie es lo único
// obligatorio aparte de foto y ubicación: sin ella no hay con qué comparar.
export function sightingMissing({ fotos, lat, lng, zona, especie, conmigo, whatsappOk }) {
  const faltan = [];
  if (!fotos?.length) faltan.push("foto");
  if ((lat == null || lng == null) && !(zona || "").trim()) faltan.push("ubicación");
  if (especie !== "perro" && especie !== "gato") faltan.push("perro o gato");
  if (conmigo && !whatsappOk) faltan.push("tu WhatsApp");
  return faltan;
}
