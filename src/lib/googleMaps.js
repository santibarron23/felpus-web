let mapsLoadingPromise = null;

// Carga el script de Google Maps (con la librería "places", para el
// autocompletado de zona vía PlaceAutocompleteElement — la API nueva, no la
// legacy que rompía toda la sesión compartida) una sola vez y la comparte
// entre todos los componentes que la necesiten (MapPicker, ReportsMap,
// ZonaAutocomplete, etc).
export function loadGoogleMaps(apiKey) {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps?.places) return Promise.resolve(window.google.maps);
  if (mapsLoadingPromise) return mapsLoadingPromise;
  mapsLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error("No se pudo cargar el script de Google Maps."));
    document.head.appendChild(script);
  });
  return mapsLoadingPromise;
}
