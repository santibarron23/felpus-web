import { supabase } from "./supabaseClient";

// Punto único para errores no fatales (fetch fallido, foto que no se pudo
// procesar, etc.) — antes solo delegaba a console.error, así que un error en
// producción era invisible salvo que el usuario lo reportara a mano. Ahora
// además intenta guardar una fila en Supabase (tabla error_logs, ver
// schema.sql) para poder revisarlos desde el Table Editor. No es un
// servicio de monitoreo de verdad (sin agrupación, sin alertas) pero cuesta
// cero — reutiliza el Supabase que la app ya tiene, sin cuentas nuevas.
//
// Nunca debe tirar ni bloquear al que llama: si Supabase no está
// configurado, si falla la escritura, o si la tabla todavía no existe
// (proyectos que no corrieron la migración nueva de schema.sql), el
// console.error de siempre sigue funcionando igual.
export function logError(...args) {
  console.error(...args);
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

  const row = {
    message: message.slice(0, 2000),
    stack: errorArg?.stack ? String(errorArg.stack).slice(0, 8000) : null,
    url: typeof window !== "undefined" ? window.location?.href?.slice(0, 500) : null,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent?.slice(0, 500) : null,
  };

  // Fire-and-forget a propósito: nadie espera este resultado, y un .catch
  // vacío evita el "unhandled promise rejection" si Supabase no responde
  // (sin key configurada, red caída, rate limit propio de la tabla, etc.).
  supabase.from("error_logs").insert(row).then(null, () => {});
}
