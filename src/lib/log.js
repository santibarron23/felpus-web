// Punto único para errores no fatales (fetch fallido, foto que no se pudo
// procesar, etc.) — antes solo delegaba a console.error, así que un error en
// producción era invisible salvo que el usuario lo reportara a mano. Ahora
// además intenta mandarlo a /api/log-error (tabla error_logs, ver
// schema.sql) para poder revisarlos desde el Table Editor. No es un
// servicio de monitoreo de verdad (sin agrupación, sin alertas) pero cuesta
// cero — reutiliza el Supabase que la app ya tiene, sin cuentas nuevas.
//
// Nunca debe tirar ni bloquear al que llama: si la ruta no está configurada,
// si falla el pedido, o si algo más sale mal, el console.error de siempre
// sigue funcionando igual.
//
// Hallazgo de auditoría de seguridad (2026-08-09): antes esto insertaba
// directo en error_logs con el cliente de Supabase — ahora pasa por
// /api/log-error (server-side, ver ese route.js) para que el rate limiting
// use la IP real de Vercel en vez de un header que quien llama a la API de
// Supabase directo podía falsificar. Del lado servidor (API routes, que
// también usan logError) no tiene sentido pegarle a esta ruta con fetch
// (no hay "página actual" contra la cual resolver una URL relativa, y esos
// errores ya quedan capturados en los logs de función de Vercel/Vercel
// Functions directamente) — reportToSupabase() solo corre en el navegador.
export function logError(...args) {
  console.error(...args);
  if (typeof window === "undefined") return;
  try {
    reportToSupabase(args);
  } catch {
    // ver comentario de arriba — jamás debe romper al llamador
  }
}

// Revisión (2026-10-11): antes solo se reconocían errores `instanceof
// Error`. Pero @supabase/postgrest-js arma sus errores como OBJETO PLANO en
// varios caminos (respuesta HTTP de error, falla de red: `error = {
// message: body }`), no como instancia de Error — así que esos se perdían
// enteros y en error_logs quedaba solo el texto del llamador, sin causa.
// Caso real encontrado en producción: "No se pudieron cargar los reportes"
// desde un iPhone, con stack null y sin ningún detalle para diagnosticar.
// Ahora cualquier objeto con un `message` de texto cuenta como error, y de
// los de Supabase se conservan también code/details/hint.
function isErrorLike(a) {
  return a instanceof Error || (a !== null && typeof a === "object" && typeof a.message === "string");
}

export function buildErrorPayload(args, { url = null, userAgent = null } = {}) {
  const errorArg = args.find(isErrorLike);
  const textParts = args.filter((a) => typeof a === "string");
  const supabaseExtra =
    errorArg && !(errorArg instanceof Error)
      ? [errorArg.code && `code ${errorArg.code}`, errorArg.details, errorArg.hint].filter(Boolean).join(" | ")
      : "";
  const message =
    [...textParts, errorArg?.message, supabaseExtra].filter(Boolean).join(" — ") || "Error sin mensaje";

  return {
    message: message.slice(0, 2000),
    stack: errorArg?.stack ? String(errorArg.stack).slice(0, 8000) : null,
    url: url ? String(url).slice(0, 500) : null,
    userAgent: userAgent ? String(userAgent).slice(0, 500) : null,
  };
}

function reportToSupabase(args) {
  const payload = buildErrorPayload(args, {
    url: window.location?.href,
    userAgent: navigator.userAgent,
  });

  // Fire-and-forget a propósito: nadie espera este resultado, y un .catch
  // vacío evita el "unhandled promise rejection" si la ruta no responde
  // (no configurada, red caída, rate limit propio, etc.).
  // keepalive: que el pedido sobreviva aunque la página se recargue o se
  // cierre justo después (ver lib/staleDeploy.js, que recarga sola apenas
  // loguea un error de chunk viejo) — el payload ya está acotado a ~11KB,
  // muy por debajo del límite de 64KB de keepalive.
  fetch("/api/log-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).then(null, () => {});
}
