// Título de una mascota en tarjetas, detalle, flyer y mensajes.
//
// Rediseño (2026-10-22, a pedido del usuario): sin nombre, varias tarjetas
// mostraban solo el color ("Blanco") y la gente lo leía como el nombre del
// animal. Ahora:
//   1. Con nombre real → el nombre.
//   2. Sin nombre → una descripción con lo que SÍ se cargó: especie, sexo
//      (solo para concordar: "Perra", "blanca"), color y tamaño.
//      Ej.: "Perra blanca, tamaño chico", "Gato negro".
//   3. Sin color → "Perro encontrado", "Gata perdida", etc.
// Nunca se inventa nada: sin sexo se usa la forma general ("Perro").
// Es solo presentación: no cambia ni guarda nada en el reporte, así que
// aplica igual a los reportes viejos y no toca matching ni filtros.
// (Antes, una perdida sin nombre decía "Perro sin nombre", que sonaba a
// dato faltante.)

// Adjetivo de cada opción de color del formulario, en masculino/femenino.
const COLOR_ADJ = {
  negro: ["negro", "negra"],
  blanco: ["blanco", "blanca"],
  marron: ["marrón", "marrón"],
  gris: ["gris", "gris"],
  "dorado / beige": ["dorado", "dorada"],
  atigrado: ["atigrado", "atigrada"],
  "manchado / bicolor": ["manchado", "manchada"],
};

const norm = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const COLOR_WORDS = new Set([...Object.keys(COLOR_ADJ), ...Object.values(COLOR_ADJ).flat().map(norm), "otro color"]);

function colorOtroDe(report) {
  return (report?.colorOtro ?? report?.color_otro ?? "").trim();
}

// ¿Hembra/macho según lo que se cargó? "No sé" o vacío → null.
function fem(report) {
  if (report?.sexo === "Hembra") return true;
  if (report?.sexo === "Macho") return false;
  return null;
}

function sustantivo(report) {
  const f = fem(report);
  if (report?.especie === "perro") return f ? "Perra" : "Perro";
  if (report?.especie === "gato") return f ? "Gata" : "Gato";
  return "Mascota";
}

// "Mascota" es femenino; perro/gato concuerdan con el sexo si se sabe.
function esFemenino(report) {
  if (report?.especie !== "perro" && report?.especie !== "gato") return true;
  return fem(report) === true;
}

function colorTexto(report) {
  const color = (report?.color || "").trim();
  if (!color) return "";
  if (color === "Otro color") {
    const otro = colorOtroDe(report);
    return otro ? `color ${otro.toLowerCase()}` : "";
  }
  const adj = COLOR_ADJ[norm(color)];
  if (adj) return adj[esFemenino(report) ? 1 : 0];
  return `color ${color.toLowerCase()}`;
}

// Nombre real: si lo guardado como nombre es en realidad un color (reportes
// viejos, o alguien que escribió "Blanco" en el campo), no se muestra como
// nombre. El dato guardado no se toca.
export function nombreReal(report) {
  const nombre = (report?.nombre || "").trim();
  if (!nombre) return "";
  const n = norm(nombre);
  const otro = norm(colorOtroDe(report));
  if (COLOR_WORDS.has(n) || (otro && n === otro) || n === norm(report?.color)) return "";
  return nombre;
}

// Descripción física sin nombre: "Perra blanca, tamaño chico". null si no
// hay ni color ni tamaño cargados.
export function petDescriptor(report) {
  const color = colorTexto(report);
  const tamano = (report?.tamano || "").trim();
  if (!color && !tamano) return null;
  const base = color ? `${sustantivo(report)} ${color}` : sustantivo(report);
  return tamano ? `${base}, tamaño ${tamano.toLowerCase()}` : base;
}

function estado(report) {
  const a = esFemenino(report) ? "a" : "o";
  if (report?.resuelto) return `reencontrad${a}`;
  return report?.tipo === "encontrada" ? `encontrad${a}` : `perdid${a}`;
}

export function petTitle(report) {
  const nombre = nombreReal(report);
  if (nombre) return nombre;
  if (colorTexto(report)) return petDescriptor(report);
  // Sin color: "Perro encontrado" (y el tamaño si se sabe).
  const base = `${sustantivo(report)} ${estado(report)}`;
  const tamano = (report?.tamano || "").trim();
  return tamano ? `${base}, tamaño ${tamano.toLowerCase()}` : base;
}
