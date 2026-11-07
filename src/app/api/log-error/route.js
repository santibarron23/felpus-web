import { createClient } from "@supabase/supabase-js";
import { isJsonRequest, getClientIp, esPedidoDeOtroSitio, respuestaOtroSitio } from "../../../lib/httpGuards";
import { alertarAdmin, esRuido, evaluarError, PICO_VENTANA_MIN } from "../../../lib/serverAdminAlerts";
import { ipParaLimite } from "../../../lib/serverRateLimit";
import { esDeScriptInyectado } from "../../../lib/scriptsInyectados";

// Corre en el servidor — nunca en el navegador, así que la service role key
// nunca queda expuesta al público.
export const runtime = "nodejs";

const MAX_PER_HOUR = 40;
const RETENTION_DAYS = 30;
// Revisión 2026-11-07: las dos podas (submissions de más de 24 h y logs de
// más de 30 días) corrían en CADA error: 2 de los 6 pedidos a Supabase de
// esta ruta. Con 1 de cada 20 alcanza para que las tablas no crezcan (con
// 40/hora por IP, la de submissions se poda varias veces por hora en
// cualquier día con errores) y cada error cuesta 4 pedidos en vez de 6.
export const PROB_PODA = 0.05;

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
export async function POST(request, { random = Math.random } = {}) {
  // Una página de otro sitio podía hacer que sus visitantes llenaran
  // error_logs (cada uno con su IP, así el cupo por IP no frena nada).
  if (esPedidoDeOtroSitio(request)) return respuestaOtroSitio();
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

  // Error del script que inyecta el navegador de Instagram/Facebook, no de
  // Felpus (ver scriptsInyectados.js). El navegador ya no lo manda, pero una
  // pestaña abierta con la versión anterior todavía puede: no se guarda.
  if (esDeScriptInyectado({ stack: row.stack })) {
    return Response.json({ ok: true });
  }

  const ip = ipParaLimite(getClientIp(request));
  const podar = random() < PROB_PODA;
  try {
    if (ip) {
      if (podar) {
        await supabase
          .from("error_log_submissions")
          .delete()
          .lt("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
      }

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
    // de vez en cuando al escribir (ver PROB_PODA) evita un cron job aparte.
    if (podar) {
      await supabase
        .from("error_logs")
        .delete()
        .lt("created_at", new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString());
    }

    await supabase.from("error_logs").insert(row);

    // ¿Amerita avisarle al admin? Crítico o pico de un mismo error en
    // varios navegadores (criterio y calibración en serverAdminAlerts.js).
    if (!esRuido(row.message)) {
      const desde = new Date(Date.now() - PICO_VENTANA_MIN * 60 * 1000).toISOString();
      const { data: recientes } = await supabase.from("error_logs").select("message,user_agent").gte("created_at", desde).limit(500);
      const alerta = evaluarError(row, recientes || [row]);
      if (alerta) await alertarAdmin(alerta);
    }
  } catch (e) {
    // Best-effort a propósito — ver la nota de arriba sobre no usar
    // logError() acá. console.error sigue siendo válido (no es logError).
    console.error("No se pudo guardar el log de error", e);
  }

  return Response.json({ ok: true });
}
