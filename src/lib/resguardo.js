// "¿Dónde está ahora?" en el formulario de encontrada (2026-10-30), opcional.
// Se guarda en `detalles` (sin migración):
//  - resguardo: "conmigo" | "terceros" (veterinaria, refugio u otro lugar
//    seguro). Sin respuesta = como antes: la tiene quien publicó.
//  - lugar: nombre del lugar (≤80), solo con "terceros".
// "No la tengo, solo la vi" no se guarda: lleva a la hoja de avistamiento
// (sighting.js), que publica un aviso de otro tipo.
// La etiqueta del aviso sigue siendo "Encontrada"; el matching no cambia.

export const LUGAR_MAX = 80;

export const RESGUARDO_OPCIONES = [
  { id: "conmigo", label: "Conmigo" },
  { id: "terceros", label: "En una veterinaria, refugio u otro lugar seguro" },
  { id: "solo_la_vi", label: "No la tengo, solo la vi" },
];

export function esTerceros(report) {
  return report?.tipo === "encontrada" && report?.detalles?.resguardo === "terceros";
}

// "Está en: Veterinaria San Roque" / "Está en una veterinaria o refugio".
export function lugarResguardo(report) {
  if (!esTerceros(report)) return "";
  const lugar = typeof report.detalles.lugar === "string" ? report.detalles.lugar.trim() : "";
  return lugar ? `Está en: ${lugar}` : "Está en una veterinaria o refugio";
}

// Lo que se suma a `detalles` al publicar.
export function detallesResguardo(resguardo, lugar) {
  if (resguardo === "conmigo") return { resguardo };
  if (resguardo !== "terceros") return {};
  const l = (lugar || "").trim().slice(0, LUGAR_MAX);
  return l ? { resguardo, lugar: l } : { resguardo };
}
