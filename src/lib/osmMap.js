// Mapas de Felpus con OpenStreetMap + Leaflet (2026-10-26).
//
// Antes eran de Google Maps. El 2026-10-26 Google empezó a rechazar la key
// con BillingNotEnabledMapError (el proyecto de Google Cloud se quedó sin
// facturación) y TODOS los mapas mostraban "This page can't load Google
// Maps correctly". Se pasó todo a herramientas abiertas, sin key, sin
// cuenta y sin facturación:
//   - Mapa: Leaflet (librería) + teselas de OpenStreetMap.
//   - Buscar mientras se escribe (zona): Photon (photon.komoot.io), hecho
//     para autocompletar sobre datos de OpenStreetMap.
//   - Coordenadas → barrio/ciudad, y zona escrita → punto: Nominatim
//     (nominatim.openstreetmap.org). Su política pide como máximo 1 pedido
//     por segundo y NO usarlo para autocompletar: acá se usa solo ante un
//     toque de la persona (marcar punto, GPS, abrir una ficha), con caché.
// Las dos políticas de uso piden atribución visible: el mapa muestra
// "© OpenStreetMap" (control de Leaflet).
import { logError } from "./log";

export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';

let leafletPromise = null;

// Leaflet toca window al importarse: se carga solo en el navegador.
export function loadLeaflet() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (!leafletPromise) {
    leafletPromise = import("leaflet")
      .then((m) => m.default || m)
      .catch((e) => {
        leafletPromise = null;
        throw e;
      });
  }
  return leafletPromise;
}

// Mapa con las teselas de OpenStreetMap. interactive=false: se ve pero no se
// mueve ni hace zoom (la vista chica en el celular, ver MapPicker).
export function createMap(L, el, { center, zoom, interactive = true, zoomControl = true } = {}) {
  const map = L.map(el, {
    center: [center.lat, center.lng],
    zoom,
    zoomControl: interactive && zoomControl,
    attributionControl: true,
    dragging: interactive,
    touchZoom: interactive,
    scrollWheelZoom: interactive,
    doubleClickZoom: interactive,
    boxZoom: interactive,
    keyboard: interactive,
    tap: interactive,
  });
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
  map.attributionControl.setPrefix(false);
  return map;
}

// Activa o desactiva el movimiento del mapa sin recrearlo.
export function setMapInteractive(map, on) {
  for (const h of ["dragging", "touchZoom", "scrollWheelZoom", "doubleClickZoom", "boxZoom", "keyboard"]) {
    if (map[h]) on ? map[h].enable() : map[h].disable();
  }
}

// Leaflet mide su contenedor al crearse: si después cambia de tamaño (se
// mueve a pantalla completa, aparece un elemento al lado) hay que avisarle.
export function observeMapResize(map, el) {
  if (typeof ResizeObserver === "undefined") return () => {};
  const observer = new ResizeObserver(() => {
    try {
      map.invalidateSize();
    } catch (e) {
      logError("No se pudo re-medir el mapa tras un resize", e);
    }
  });
  observer.observe(el);
  return () => observer.disconnect();
}

// Pin rojo clásico (gota) para marcar un punto. ghost: semitransparente,
// para un punto propuesto que todavía no se confirmó.
export function pinIcon(L, color, { ghost = false } = {}) {
  return L.divIcon({
    className: "",
    iconSize: [36, 48],
    iconAnchor: [18, 46],
    html: `<svg width="36" height="48" viewBox="0 0 24 32" style="opacity:${ghost ? 0.55 : 1};filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))" aria-hidden="true"><path d="M12 0C5.4 0 0 5.2 0 11.7 0 20.5 12 32 12 32s12-11.5 12-20.3C24 5.2 18.6 0 12 0z" fill="${color}" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="11.5" r="4.5" fill="#fff"/></svg>`,
  });
}

// Círculo con la foto de la mascota y borde de color (Explorar y ficha).
export function photoIcon(L, { foto, color, size = 40 }) {
  const safe = String(foto || "").replace(/"/g, "%22");
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;overflow:hidden;border:4px solid ${color};background:${color};box-shadow:0 2px 6px rgba(0,0,0,.35);cursor:pointer">${
      safe ? `<img src="${safe}" alt="" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.remove()">` : ""
    }</div>`,
  });
}

// ---------------------------------------------------------------------------
// Direcciones
// ---------------------------------------------------------------------------

const reverseCache = new Map();

// "Zona" a partir de la dirección de Nominatim: barrio si lo hay, si no la
// ciudad — nunca calle y altura (demasiado específico para mostrar).
export function placeFromNominatimAddress(address) {
  const a = address || {};
  const ciudad = a.city || a.town || a.village || a.municipality || a.county || "";
  const barrio = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.hamlet || "";
  return { zona: barrio || ciudad, ciudad, provincia: a.state || "" };
}

// Coordenadas → { zona, ciudad, provincia }, o null si no se pudo. Nunca
// tira: es siempre un extra (la persona puede escribir la zona a mano).
export async function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (reverseCache.has(key)) return reverseCache.get(key);
  try {
    const params = new URLSearchParams({ format: "jsonv2", lat: String(lat), lon: String(lng), zoom: "16", addressdetails: "1", "accept-language": "es" });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const place = data?.address ? placeFromNominatimAddress(data.address) : null;
    reverseCache.set(key, place);
    return place;
  } catch (e) {
    logError("No se pudo obtener el barrio de la ubicación (Nominatim)", e);
    return null;
  }
}

// Texto ("Tres Cerritos, Salta") → { lat, lng } o null. Para ubicar una
// publicación que solo tiene la zona escrita.
export async function geocodeText(text) {
  const q = String(text || "").trim();
  if (!q) return null;
  try {
    const params = new URLSearchParams({ format: "jsonv2", q, limit: "1", countrycodes: "ar", "accept-language": "es" });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
    if (!res.ok) return null;
    const [first] = await res.json();
    return first ? { lat: Number(first.lat), lng: Number(first.lon) } : null;
  } catch (e) {
    logError("No se pudo ubicar la zona escrita (Nominatim)", e);
    return null;
  }
}

// Sugerencias de lugares mientras se escribe (Photon). Solo Argentina; se
// priorizan los cercanos a `near` si se pasa. Devuelve
// [{ label, zona, ciudad, provincia, lat, lng }].
export function photonToPlace(feature) {
  const p = feature?.properties || {};
  const [lng, lat] = feature?.geometry?.coordinates || [];
  const ciudad = p.city || p.town || p.village || p.county || "";
  const barrio = p.district || p.locality || p.suburb || "";
  const calle = p.street ? `${p.street}${p.housenumber ? ` ${p.housenumber}` : ""}` : "";
  const nombre = p.name && p.name !== ciudad ? p.name : "";
  const zona = nombre || calle || barrio || ciudad;
  const detalle = [nombre && calle ? calle : "", barrio && barrio !== zona ? barrio : "", ciudad && ciudad !== zona ? ciudad : "", p.state || ""]
    .filter(Boolean)
    .join(", ");
  return {
    label: detalle ? `${zona} — ${detalle}` : zona,
    zona,
    ciudad,
    provincia: p.state || "",
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    countrycode: (p.countrycode || "").toUpperCase(),
  };
}

export async function searchPlaces(query, { near = null, signal } = {}) {
  const q = String(query || "").trim();
  if (q.length < 3) return [];
  const params = new URLSearchParams({ q, limit: "8" });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lng));
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
  if (!res.ok) return [];
  const data = await res.json();
  const seen = new Set();
  return (data?.features || [])
    .map(photonToPlace)
    .filter((p) => p.zona && p.countrycode === "AR")
    .filter((p) => (seen.has(p.label) ? false : seen.add(p.label)))
    .slice(0, 5);
}
