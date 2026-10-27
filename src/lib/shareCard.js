// Resumen de un reporte para las imágenes al compartir (2026-10-27): la
// vista previa de WhatsApp/Facebook/X (1200x630) y la historia de Instagram
// (1080x1920). Lógica pura (texto y colores), testeable sin generar
// imágenes; el dibujo está en shareImage.jsx.
import { petTitle, nombreReal, petDescriptor } from "./petTitle";

const COLORES = {
  perdida: { accent: "#D71925", label: "SE BUSCA" },
  encontrada: { accent: "#D45516", label: "ENCONTRAD" },
  reencontrada: { accent: "#2F7955", label: "¡VOLVIÓ A CASA!" },
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function esFemenino(report) {
  if (report?.especie !== "perro" && report?.especie !== "gato") return true;
  return report?.sexo === "Hembra";
}

// "2026-10-25" → "25 de octubre". Sin año si es el año en curso.
export function fechaCorta(fecha, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha || ""));
  if (!m) return "";
  const [, y, mo, d] = m;
  const mes = MESES[Number(mo) - 1];
  if (!mes) return "";
  const anio = Number(y) !== now.getFullYear() ? ` de ${y}` : "";
  return `${Number(d)} de ${mes}${anio}`;
}

function recortar(texto, max) {
  const t = String(texto || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > max * 0.6 ? corte.slice(0, espacio) : corte).replace(/[.,;:\s]+$/, "")}…`;
}

export function shareCardData(report, now = new Date()) {
  const estado = report?.resuelto ? "reencontrada" : report?.tipo === "encontrada" ? "encontrada" : "perdida";
  const fem = esFemenino(report);
  const { accent, label } = COLORES[estado];
  const badge = estado === "encontrada" ? `${label}${fem ? "A" : "O"}` : label;

  const nombre = nombreReal(report);
  const title = recortar(petTitle(report), 42);
  // Con nombre, el título es el nombre y abajo va cómo es ("Perra blanca,
  // tamaño chico"); sin nombre, el título ya es esa descripción.
  const subtitleParts = [];
  if (nombre) subtitleParts.push(petDescriptor(report));
  const raza = String(report?.raza || "").trim();
  if (raza && !/^(mestiz|no s|sin raza|otra)/i.test(raza)) subtitleParts.push(raza);
  const subtitle = recortar(subtitleParts.filter(Boolean).join(" · "), 60);

  const zona = recortar([report?.zona, report?.ciudad].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", "), 56);
  const dia = fechaCorta(report?.fecha || report?.creado_en, now);
  const a = fem ? "a" : "o";
  const cuando = dia
    ? estado === "perdida"
      ? `Se perdió el ${dia}`
      : estado === "encontrada"
        ? `Encontrad${a} el ${dia}`
        : `Reencontrad${a} con su familia`
    : "";
  const description = recortar(report?.descripcion, 140);
  const cta =
    estado === "perdida"
      ? "¿L" + a + " viste? Avisá en felpus.com"
      : estado === "encontrada"
        ? "¿Es tuy" + a + "? Contactá en felpus.com"
        : "Gracias a todos los que compartieron";

  return { estado, accent, badge, title, subtitle, zona, cuando, description, cta };
}

// Texto corto que acompaña al link (WhatsApp, hoja de compartir del
// celular). La foto y el resumen ya van en la vista previa del link, así que
// el mensaje es breve: qué pasó, dónde y qué hacer.
export function buildShareMessage(report, now = new Date()) {
  const d = shareCardData(report, now);
  const emoji = d.estado === "perdida" ? "🔴" : d.estado === "encontrada" ? "🟠" : "💚";
  const badge = d.estado === "reencontrada" ? "¡Volvió a casa!" : d.badge;
  return [`${emoji} ${badge}: ${d.title}`, d.zona && `📍 ${d.zona}`, d.cuando, d.estado === "reencontrada" ? "" : `${d.cta.replace(/ en felpus\.com$/, "")} 👇`]
    .filter(Boolean)
    .join("\n");
}
