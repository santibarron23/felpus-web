import { logError } from "./log";

let mapsLoadingPromise = null;

// Carga el script de Google Maps (con las librerías "places", para el
// autocompletado de zona vía PlaceAutocompleteElement — la API nueva, no la
// legacy que rompía toda la sesión compartida — y "marker", para los
// AdvancedMarkerElement con foto de mascota en ReportsMap) una sola vez y la
// comparte entre todos los componentes que la necesiten (MapPicker,
// ReportsMap, ZonaAutocomplete, etc).
export function loadGoogleMaps(apiKey) {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps?.places && window.google?.maps?.marker) return Promise.resolve(window.google.maps);
  if (mapsLoadingPromise) return mapsLoadingPromise;
  mapsLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places,marker`;
    script.async = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error("No se pudo cargar el script de Google Maps."));
    document.head.appendChild(script);
  });
  return mapsLoadingPromise;
}

// Google Maps mide el tamaño de su contenedor una sola vez, al inicializarse
// (new maps.Map(...)). Si ese contenedor cambia de tamaño después — por
// ejemplo porque un elemento hermano (como el autocompletado de zona) hace
// un layout shift al terminar de cargar — el mapa queda "pintado" para el
// tamaño viejo: se ve cortado o con una mitad en blanco/gris hasta que algo
// dispare manualmente el evento "resize" de Maps. Este observer lo hace
// automáticamente cada vez que el contenedor cambia de tamaño, y vuelve a
// centrar el mapa (el resize por sí solo puede correr el centro visual).
export function observeMapResize(map, container) {
  if (typeof ResizeObserver === "undefined" || !window.google?.maps) return () => {};
  let lastCenter = map.getCenter();
  const centerListener = map.addListener("center_changed", () => {
    lastCenter = map.getCenter();
  });
  const observer = new ResizeObserver(() => {
    // Si el mapa nunca terminó de inicializarse bien (ej. la key rechazada
    // por dominio no autorizado), disparar "resize" sobre ese objeto roto
    // puede tirar una excepción interna de la librería de Google y voltear
    // toda la página. Un resize fallido no es crítico — se ignora en vez de
    // dejar que reviente el árbol de React entero.
    try {
      window.google.maps.event.trigger(map, "resize");
      if (lastCenter) map.setCenter(lastCenter);
    } catch (e) {
      logError("No se pudo re-medir el mapa tras un resize", e);
    }
  });
  observer.observe(container);
  return () => {
    observer.disconnect();
    window.google.maps.event.removeListener(centerListener);
  };
}
