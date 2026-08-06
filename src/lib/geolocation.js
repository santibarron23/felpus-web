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

// Antes se mostraba siempre el mismo "No pudimos acceder a tu ubicación",
// sin importar el motivo — el caso más confuso para quien lo sufre es
// PERMISSION_DENIED (código 1) SIN que el navegador llegue a mostrar el
// cartel de "Permitir/Bloquear": pasa cuando el sitio ya quedó bloqueado en
// un intento anterior (el navegador recuerda esa decisión y no vuelve a
// preguntar) — un bug real de UX, no de código, que sin este mensaje
// específico es indistinguible de "tu ubicación no está disponible ahora".
export function geolocationErrorMessage(err) {
  const code = err?.code;
  if (code === 1) {
    return "Bloqueaste el acceso a tu ubicación en este navegador. Para arreglarlo: tocá el ícono de candado/información junto a la dirección del sitio y permití \"Ubicación\".";
  }
  if (code === 2) {
    return "No pudimos determinar tu ubicación ahora mismo. Probá de nuevo en unos segundos.";
  }
  if (code === 3) {
    return "Tardó demasiado en responder. Probá de nuevo.";
  }
  return "No pudimos acceder a tu ubicación.";
}
