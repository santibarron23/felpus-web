// Errores que ningún try/catch atrapó (2026-11-02): un error en un handler
// de evento o una promesa rechazada sin .catch no llegaban a ningún lado (solo
// los de render los veía error.js). Ahora van al mismo registro que
// logError, sin el ruido que no es de Felpus.
import { logError } from "./log";
import { reloadOnceForStaleDeploy, isChunkLoadError } from "./staleDeploy";

const RUIDO = [
  // Error de otro origen que el navegador oculta: no trae ningún dato útil.
  /^Script error\.?$/i,
  // Aviso inofensivo del navegador, no es una falla.
  /ResizeObserver loop/i,
  // Sin conexión: es de la red de la persona, no de la plataforma.
  /^(TypeError: )?(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/i,
  // Un pedido cancelado a propósito (cambio de pantalla, timeout propio).
  /AbortError|The (user|operation) aborted/i,
];

// Archivos que no son de Felpus: extensiones del navegador y scripts que
// inyectan otras apps.
const ORIGEN_AJENO = /^(chrome|moz|safari(-web)?|ms-browser)-extension:\/\//i;

export function esErrorIgnorable({ message, filename } = {}) {
  if (filename && ORIGEN_AJENO.test(filename)) return true;
  const m = String(message || "").trim();
  if (!m) return true;
  return RUIDO.some((re) => re.test(m));
}

function aError(reason) {
  if (reason instanceof Error) return reason;
  if (reason && typeof reason === "object" && typeof reason.message === "string") return reason;
  return new Error(typeof reason === "string" ? reason : "Promesa rechazada sin motivo");
}

// Instala los dos escuchas en `win` y devuelve cómo sacarlos. log y recargar
// se inyectan para los tests.
export function instalarCapturaGlobal(win, { log = logError, recargar = reloadOnceForStaleDeploy } = {}) {
  if (!win?.addEventListener) return () => {};
  const onError = (e) => {
    const error = e?.error || { message: e?.message };
    if (esErrorIgnorable({ message: error?.message || e?.message, filename: e?.filename })) return;
    // Pestaña abierta desde antes de un deploy: se recarga una vez, igual
    // que en error.js.
    if (isChunkLoadError(error) && recargar(error)) return;
    log("Error no capturado", error);
  };
  const onRejection = (e) => {
    const error = aError(e?.reason);
    if (esErrorIgnorable({ message: error.message })) return;
    if (isChunkLoadError(error) && recargar(error)) return;
    log("Promesa rechazada sin manejar", error);
  };
  win.addEventListener("error", onError);
  win.addEventListener("unhandledrejection", onRejection);
  return () => {
    win.removeEventListener("error", onError);
    win.removeEventListener("unhandledrejection", onRejection);
  };
}
