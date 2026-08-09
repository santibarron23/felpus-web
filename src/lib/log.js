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

function reportToSupabase(args) {
  const errorArg = args.find((a) => a instanceof Error);
  const textParts = args.filter((a) => typeof a === "string");
  const message = [...textParts, errorArg?.message].filter(Boolean).join(" — ") || "Error sin mensaje";

  const payload = {
    message: message.slice(0, 2000),
    stack: errorArg?.stack ? String(errorArg.stack).slice(0, 8000) : null,
    url: window.location?.href?.slice(0, 500) || null,
    userAgent: navigator.userAgent?.slice(0, 500) || null,
  };

  // Fire-and-forget a propósito: nadie espera este resultado, y un .catch
  // vacío evita el "unhandled promise rejection" si la ruta no responde
  // (no configurada, red caída, rate limit propio, etc.).
  fetch("/api/log-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(null, () => {});
}
