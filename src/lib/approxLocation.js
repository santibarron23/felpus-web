// Ubicación aproximada (nivel ciudad, sin pedir permiso) vía /api/geo — ver
// src/app/api/geo/route.js. Se pide una sola vez por visita y se comparte
// entre los mapas de la app (formulario, asistente, Explorar).
let pending = null;

export function getApproxLocation(fetchImpl = typeof fetch !== "undefined" ? fetch : null) {
  if (!fetchImpl) return Promise.resolve(null);
  if (!pending) {
    pending = fetchImpl("/api/geo", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data && Number.isFinite(data.lat) && Number.isFinite(data.lng) ? { lat: data.lat, lng: data.lng } : null))
      .catch(() => null);
  }
  return pending;
}

// Solo para tests.
export function resetApproxLocationCache() {
  pending = null;
}
