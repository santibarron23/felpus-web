// Revisión (2026-10-11) — caso real en error_logs: "Loading chunk 734
// failed". Pasa cuando alguien tiene Felpus abierto desde ANTES de un
// deploy: la página vieja sigue pidiendo archivos JS con el hash del build
// anterior, que Vercel ya no sirve. Es el mismo síntoma que se reportó a
// mano como "no cargan los reportes / lista vacía" y se resolvió
// recargando. En vez de mostrarle a la persona la pantalla de error y
// esperar que se le ocurra recargar, se recarga sola UNA vez.
//
// El guard anti-bucle es importante: si el chunk faltara por otro motivo
// (no un deploy), recargar no lo arregla, y sin guard la página quedaría
// recargándose para siempre. Por eso solo se recarga si no se hizo ya en
// los últimos RELOAD_GUARD_MS — y si sessionStorage no está disponible
// (modo privado estricto, etc.), no se recarga: sin forma de recordar que
// ya lo intentamos, es más seguro mostrar la pantalla de error normal.

const RELOAD_FLAG_KEY = "felpus-stale-deploy-reload-at";
const RELOAD_GUARD_MS = 30 * 1000;

const CHUNK_ERROR_PATTERNS = [
  /Loading chunk [\w-]+ failed/i,
  /Loading CSS chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
];

export function isChunkLoadError(error) {
  if (!error) return false;
  if (error.name === "ChunkLoadError") return true;
  const message = typeof error === "string" ? error : error.message || "";
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(message));
}

// Mismo caso, otra cara (2026-10-29, caso real en error_logs): una página
// abierta desde antes de un deploy pide columnas que una migración posterior
// dejó de habilitar (lat/lng tras 20261029_01) y Supabase rechaza el listado
// entero con 42501. La versión nueva ya pide las columnas correctas, así que
// recargar lo arregla.
export function isStaleListingError(error) {
  if (!error) return false;
  const text = `${error.code || ""} ${error.message || ""}`;
  return /42501|permission denied for table reports/i.test(text);
}

// Devuelve true si disparó la recarga (el llamador puede dejar de hacer
// otras cosas). `match` elige qué errores cuentan (chunks por defecto);
// `storage`/`reload`/`now` inyectables solo para tests.
export function reloadOnceForStaleDeploy(
  error,
  {
    match = isChunkLoadError,
    storage = typeof window !== "undefined" ? window.sessionStorage : null,
    reload = () => window.location.reload(),
    now = Date.now(),
  } = {}
) {
  if (!match(error)) return false;
  try {
    if (!storage) return false;
    const last = Number(storage.getItem(RELOAD_FLAG_KEY) || 0);
    if (last && now - last < RELOAD_GUARD_MS) return false;
    storage.setItem(RELOAD_FLAG_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}
