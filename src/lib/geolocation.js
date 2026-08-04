// Boilerplate de geolocalización que se repetía 2 veces en FelpusMatcher.jsx
// (chequeo de soporte + timeout) con distinto manejo de éxito/error en cada
// llamador — se deja esa parte a cargo de quien llama.
export const GEOLOCATION_TIMEOUT_MS = 8000;

export function requestLocation(onSuccess, onError) {
  if (!navigator.geolocation) {
    onError(new Error("Geolocalización no soportada"));
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => onSuccess({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    (err) => onError(err),
    { timeout: GEOLOCATION_TIMEOUT_MS }
  );
}
