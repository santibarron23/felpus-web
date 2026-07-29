let mapsLoadingPromise = null;

// Carga el script de Google Maps una sola vez y la comparte entre todos los
// componentes que la necesiten (MapPicker, ReportsMap, etc). Ya no pide la
// librería "places" — se usaba solo para el autocompletado de zona, que se
// sacó porque su API (legacy) rompía toda la sesión de Maps compartida en
// proyectos de Google Cloud creados después de marzo 2025.
export function loadGoogleMaps(apiKey) {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (mapsLoadingPromise) return mapsLoadingPromise;
  mapsLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error("No se pudo cargar el script de Google Maps."));
    document.head.appendChild(script);
  });
  return mapsLoadingPromise;
}
