// Avistamientos en el mapa de una perdida (2026-10-30): el dueño ve dónde se
// perdió y, numerados del más viejo al más nuevo, los puntos donde la vieron,
// unidos por una línea punteada para ver hacia dónde se mueve.
// Siempre con la ubicación aproximada (approxLocation), igual que el resto.
import { approxLocation } from "./approxLocation";
import { avistamientoCuando, direccionLabel } from "./sighting";

function cronologico(a, b) {
  const ka = `${a.fecha || ""}T${a.detalles?.hora || ""}`;
  const kb = `${b.fecha || ""}T${b.detalles?.hora || ""}`;
  return ka === kb ? (a.creadoEn || 0) - (b.creadoEn || 0) : ka < kb ? -1 : 1;
}

// { origen: {lat,lng} | null, puntos: [{ id, lat, lng, n, etiqueta }] }.
// Los avistamientos sin punto marcado quedan afuera (solo están en la lista).
export function recorridoAvistamientos(perdida, avistamientos) {
  const origen = approxLocation(perdida);
  const puntos = [...(avistamientos || [])]
    .sort(cronologico)
    .map((a) => ({ a, loc: approxLocation(a) }))
    .filter((x) => x.loc)
    .map(({ a, loc }, i) => {
      const cuando = avistamientoCuando(a);
      const dir = direccionLabel(a.detalles?.direccion);
      const etiqueta = [`${i + 1}. Vista${cuando ? ` el ${cuando}` : ""}`, dir ? `iba hacia el ${dir.toLowerCase()}` : ""].filter(Boolean).join(" · ");
      return { id: a.id, lat: loc.lat, lng: loc.lng, n: i + 1, etiqueta };
    });
  return { origen, puntos };
}

// Para textos que Leaflet mete como HTML (tooltips, íconos).
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
