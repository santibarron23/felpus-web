import { createClient } from "@supabase/supabase-js";
import { isJsonRequest, getClientIp } from "../../../lib/httpGuards";

// Corre en el servidor — nunca en el navegador, así que la service role key
// nunca queda expuesta al público.
export const runtime = "nodejs";

const MAX_PER_HOUR = 40;
const RETENTION_DAYS = 30;

// IMPORTANTE: nunca usar logError() acá adentro — este endpoint ES el
// destino de logError() del lado del cliente; si un fallo interno acá
// volviera a llamar logError(), se metería en un loop. Cualquier problema
// se traga en silencio (best-effort, ver el comentario de log.js: "nunca
// debe tirar ni bloquear al que llama").
//
// Hallazgo de auditoría de seguridad (2026-08-09): antes esto era un
// INSERT directo del cliente a la tabla error_logs, con el rate limit
// resuelto en un trigger que leía la IP de un header falsificable por
// quien llama a la API de Supabase directo — mismo hueco que ya se cerró
// en el resto de esta app (ver PENDIENTE_DECISION.md #-14). Ahora la IP la
// determina Vercel acá, y la tabla quedó completamente cerrada a
// anon/authenticated (ver schema.sql) — este es el único camino posible.
export async function POST(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ ok: false }, { status: 501 });
  }
  if (!isJsonRequest(request)) {
    return Response.json({ ok: false }, { status: 415 });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ ok: false }, { status: 400 });
  }

  // Allowlist explícita de campos — nunca reenviar el body tal cual a la
  // base. message/stack/url/userAgent son los únicos que logError() manda
  // (ver src/lib/log.js); cualquier otra cosa que alguien intente mandar
  // llamando esta ruta a mano se descarta sin más. Los mismos límites de
  // longitud viven también como CHECK constraint en la tabla — repetidos
  // acá para no depender solo de eso.
  const row = {
    message: String(body?.message || "Error sin mensaje").slice(0, 2000),
    stack: body?.stack ? String(body.stack).slice(0, 8000) : null,
    url: body?.url ? String(body.url).slice(0, 500) : null,
    user_agent: body?.userAgent ? String(body.userAgent).slice(0, 500) : null,
  };

  const ip = getClientIp(request);
  try {
    if (ip) {
      await supabase
        .from("error_log_submissions")
        .delete()
        .lt("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());

      const { count } = await supabase
        .from("error_log_submissions")
        .select("*", { count: "exact", head: true })
        .eq("ip", ip)
        .gt("created_at", new Date(Date.now() - 3600 * 1000).toISOString());

      // Más permisivo que el de reports (8/hora): un mismo bug real puede
      // disparar varios errores encadenados en poco tiempo para una persona.
      if ((count || 0) >= MAX_PER_HOUR) {
        return Response.json({ ok: false }, { status: 429 });
      }

      await supabase.from("error_log_submissions").insert({ ip });
    }

    // Retención acotada: sin esto, error_logs crece para siempre. Podarla
    // en cada escritura (mismo patrón que report_submissions/embed_requests)
    // evita necesitar un cron job aparte.
    await supabase
      .from("error_logs")
      .delete()
      .lt("created_at", new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString());

    await supabase.from("error_logs").insert(row);
  } catch (e) {
    // Best-effort a propósito — ver la nota de arriba sobre no usar
    // logError() acá. console.error sigue siendo válido (no es logError).
    console.error("No se pudo guardar el log de error", e);
  }

  return Response.json({ ok: true });
}
