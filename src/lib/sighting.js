// Avistamientos ("Vi una mascota suelta", 2026-10-27; estado propio desde el
// 2026-10-28). Una mascota vista en la calle que nadie tiene NO es una
// "encontrada": en toda la app se muestra como "Avistamiento", con su
// etiqueta, color, filtro y textos (estadoReporte más abajo).
//
// En la base se guarda como tipo "encontrada" + detalles.avistamiento = true:
// así se sigue cruzando contra las PERDIDAS (matching, avisos de coincidencia
// y alertas, sin cambios) — que es lo que le sirve a quien la busca.
// Además, en `detalles`:
//  - hora: "HH:MM" en que la vieron (la fecha va en `fecha`).
//  - sin_foto: true → no había foto; la imagen guardada es una genérica, que
//    va en fotos_dudosas para no usarse al comparar fotos.
//  - avistamiento_de: id del reporte de perdida desde el que se tocó "La vi".
//  - direccion: hacia dónde iba (DIRECCIONES), opcional (2026-10-30).
//  - comentario: texto libre ≤ COMENTARIO_MAX, opcional y público (2026-10-30).
// El contacto es opcional (ver validateReportContact).
import { composeDescripcionBase } from "./matching";

export const PUNTOS_AVISTAMIENTO = 10;
export const COMENTARIO_MAX = 300;
export const DIRECCIONES = [
  { id: "norte", label: "Norte" },
  { id: "sur", label: "Sur" },
  { id: "este", label: "Este" },
  { id: "oeste", label: "Oeste" },
  { id: "no_se", label: "No sé" },
]; // award_points acepta ("reporte", 10)
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const TZ = "America/Argentina/Salta";

export function isSighting(report) {
  return report?.detalles?.avistamiento === true;
}

// Estado que se MUESTRA: perdida | encontrada | avistamiento | reencontrada.
export function estadoReporte(report) {
  if (report?.resuelto) return "reencontrada";
  if (report?.tipo === "perdida") return "perdida";
  return isSighting(report) ? "avistamiento" : "encontrada";
}

export const ESTADO_LABEL = {
  perdida: "Perdida",
  encontrada: "Encontrada",
  avistamiento: "Avistamiento",
  reencontrada: "Reencontrada",
};

export function estadoLabel(report) {
  return ESTADO_LABEL[estadoReporte(report)];
}

// Color del estado (claves del tema: ver theme.js).
export function estadoColor(report, C) {
  const e = estadoReporte(report);
  if (e === "reencontrada") return C.greenSolid;
  if (e === "perdida") return C.redSolid;
  if (e === "avistamiento") return C.sightingSolid;
  return C.mapFound;
}

// ¿El reporte pasa el filtro de tipo de Explorar? ("todos" | "perdida" |
// "encontrada" | "avistamiento"; "resuelto" lo maneja quien llama).
export function pasaFiltroTipo(report, filtro) {
  if (!filtro || filtro === "todos") return true;
  return estadoReporte({ ...report, resuelto: false }) === filtro;
}

// "Vista el 27 de octubre a las 18:30." en hora argentina.
export function sightingWhen(ms) {
  const d = new Date(ms);
  const fecha = d.toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: TZ });
  return `Vista el ${fecha} a las ${horaLocal(ms)}.`;
}

// Fecha AAAA-MM-DD en hora argentina (no UTC: a las 22 h de Salta ya es
// "mañana" en UTC).
export function fechaLocal(ms) {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ });
}

// "HH:MM" en hora argentina.
export function horaLocal(ms) {
  return new Date(ms).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
}

// "AAAA-MM-DDTHH:MM" (input datetime-local) en hora argentina → ms. Argentina
// no tiene horario de verano: siempre UTC-3. null si no es válido, si es en
// el futuro (más de 10 min de margen) o de hace más de 30 días.
export function vistaEnDesdeInput(value, now = Date.now()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const ms = new Date(`${value}:00-03:00`).getTime();
  if (!Number.isFinite(ms) || ms > now + 10 * 60 * 1000 || now - ms > 30 * 864e5) return null;
  return ms;
}

// ms → valor para el input datetime-local, en hora argentina.
export function vistaEnParaInput(ms) {
  return `${fechaLocal(ms)}T${horaLocal(ms)}`;
}

// "Visto el 27/10 a las 21:30" para la ficha, si el reporte tiene hora.
export function avistamientoCuando(report) {
  if (!isSighting(report) || !report?.fecha) return "";
  const [, m, d] = String(report.fecha).split("-");
  const hora = /^\d{2}:\d{2}$/.test(report.detalles?.hora || "") ? ` a las ${report.detalles.hora}` : "";
  return d && m ? `${Number(d)}/${Number(m)}${hora}` : "";
}

// Datos de la hoja → el mismo objeto que arma handleSubmit para createReport.
// vistaEn: cuándo la vieron (ms); por defecto, ahora.
export function buildSightingDraft(input, now = Date.now()) {
  const i = input || {};
  const vistaEn = Number.isFinite(i.vistaEn) ? i.vistaEn : now;
  const sinFoto = i.sinFoto === true;
  const form = { especie: i.especie, color: i.color || "", colorOtro: "", raza: i.raza || "", tamano: i.tamano || "", sexo: "", edad: "" };
  const detalleLibre = [sightingWhen(vistaEn), "La vieron suelta; quien avisó no la tiene.", sinFoto ? "Sin foto." : ""]
    .filter(Boolean)
    .join(" ");
  const vistaDe = typeof i.vistaDe === "string" && ID_RE.test(i.vistaDe) ? i.vistaDe : null;
  const dudosas = sinFoto ? [0] : Array.isArray(i.fotosDudosas) ? i.fotosDudosas : [];
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
    fecha: fechaLocal(vistaEn),
    descripcion: `${composeDescripcionBase(form)} ${detalleLibre}`.trim(),
    detalles: {
      avistamiento: true,
      hora: horaLocal(vistaEn),
      ...(sinFoto ? { sin_foto: true } : {}),
      ...(vistaDe ? { avistamiento_de: vistaDe } : {}),
      ...(DIRECCIONES.some((d) => d.id === i.direccion) && i.direccion !== "no_se" ? { direccion: i.direccion } : {}),
      ...((i.comentario || "").trim() ? { comentario: i.comentario.trim().slice(0, COMENTARIO_MAX) } : {}),
      ...(dudosas.length ? { fotos_dudosas: dudosas } : {}),
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

// Qué falta para poder publicar (vacío = listo). La foto es opcional: con
// dónde, cuándo y si es perro o gato ya sirve para cruzar con las perdidas.
export function sightingMissing({ lat, lng, zona, especie, vistaEn }) {
  const faltan = [];
  if ((lat == null || lng == null) && !(zona || "").trim()) faltan.push("ubicación");
  if (especie !== "perro" && especie !== "gato") faltan.push("perro o gato");
  if (vistaEn === null) faltan.push("cuándo la viste");
  return faltan;
}

// Servidor (create-report): direccion, comentario y avistamiento_de solo en
// un avistamiento, con valores válidos. Devuelve { detalles } o { error }.
export function validarDatosAvistamiento(row) {
  const d = row?.detalles;
  if (!d) return { detalles: d ?? null };
  const tiene = ["direccion", "comentario", "avistamiento_de"].filter((k) => d[k] !== undefined);
  if (!tiene.length) return { detalles: d };
  if (row.tipo !== "encontrada" || d.avistamiento !== true) return { error: "Datos de avistamiento inválidos." };
  if (d.direccion !== undefined && !DIRECCIONES.some((x) => x.id === d.direccion && x.id !== "no_se")) return { error: "Dirección inválida." };
  if (d.avistamiento_de !== undefined && (typeof d.avistamiento_de !== "string" || !ID_RE.test(d.avistamiento_de))) return { error: "Datos de avistamiento inválidos." };
  if (d.comentario === undefined) return { detalles: d };
  if (typeof d.comentario !== "string") return { error: "Comentario inválido." };
  const comentario = d.comentario.trim();
  if (comentario.length > COMENTARIO_MAX) return { error: `El comentario puede tener hasta ${COMENTARIO_MAX} caracteres.` };
  const { comentario: _c, ...resto } = d;
  return { detalles: comentario ? { ...resto, comentario } : resto };
}

export function direccionLabel(id) {
  return DIRECCIONES.find((d) => d.id === id && d.id !== "no_se")?.label || "";
}

// Historial de una perdida: avistamientos vinculados (avistamiento_de), sin
// los ocultos ni los que el dueño marcó "No es mi mascota", del más nuevo al
// más viejo (por cuándo la vieron; si no, por cuándo se publicó).
export const DESCARTADOS_MAX = 50;
function vistoMs(r) {
  const hora = /^\d{2}:\d{2}$/.test(r.detalles?.hora || "") ? r.detalles.hora : "00:00";
  const ms = r.fecha ? new Date(`${r.fecha}T${hora}:00-03:00`).getTime() : NaN;
  return Number.isFinite(ms) ? ms : r.creadoEn || 0;
}
export function avistamientosDe(perdida, reports) {
  if (!perdida?.id) return [];
  const descartados = new Set(Array.isArray(perdida.detalles?.avistamientos_descartados) ? perdida.detalles.avistamientos_descartados : []);
  return (reports || [])
    .filter((r) => isSighting(r) && r.detalles?.avistamiento_de === perdida.id && !r.oculto && !descartados.has(r.id))
    .sort((a, b) => vistoMs(b) - vistoMs(a));
}
