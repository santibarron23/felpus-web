// Ubicación aproximada para MOSTRAR un reporte (2026-10-27). El punto que
// marca quien publica puede ser su casa: en la ficha, en el mapa de Explorar
// y en el link a Google Maps se muestra un punto corrido entre
// APPROX_MIN_M y APPROX_MAX_M, y la ficha dibuja un círculo de
// APPROX_RADIUS_M que siempre contiene el punto real.
//
// El corrimiento sale del id del reporte (siempre el mismo para cada uno):
// si fuera al azar en cada carga, alcanzaría con recargar varias veces y
// promediar para volver al punto real.
//
// Solo es para mostrar: el matching, las alertas y lo guardado en la base
// siguen usando las coordenadas reales.
export const APPROX_MIN_M = 150;
export const APPROX_MAX_M = 350;
export const APPROX_RADIUS_M = 400;

// Desde la migración 20261029_01 el listado público ya trae coordenadas
// aproximadas (grilla de 0,004°, hasta ~315 m del punto real: media
// diagonal en el ecuador) y el punto exacto no sale de la base. Ahí el
// corrimiento es solo para que no se encimen los pines de una misma celda:
// 315 + 90 < APPROX_RADIUS_M, así que el círculo sigue conteniendo el punto real.
export const JITTER_MIN_M = 20;
export const JITTER_MAX_M = 90;

const METROS_POR_GRADO = 111_320;

// FNV-1a de 32 bits + el mezclador final de MurmurHash3: sin el mezclador,
// ids parecidos ("r-1", "r-2") daban direcciones parecidas.
function hash32(str, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// { lat, lng } corrido, o null si el reporte no tiene punto.
export function approxLocation(report) {
  const lat = report?.lat;
  const lng = report?.lng;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const id = String(report.id ?? `${lat},${lng}`);
  const [min, max] = report.coordAprox ? [JITTER_MIN_M, JITTER_MAX_M] : [APPROX_MIN_M, APPROX_MAX_M];
  const distancia = min + (hash32(id) / 0xffffffff) * (max - min);
  const angulo = (hash32(id, 0x9747b28c) / 0xffffffff) * 2 * Math.PI;
  const dLat = (distancia * Math.cos(angulo)) / METROS_POR_GRADO;
  const dLng = (distancia * Math.sin(angulo)) / (METROS_POR_GRADO * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  // 5 decimales (~1 m): no hace falta más para mostrar.
  const round = (v) => Math.round(v * 1e5) / 1e5;
  return { lat: round(lat + dLat), lng: round(lng + dLng) };
}
