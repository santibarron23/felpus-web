import { logError } from "../../../lib/log";
import { isJsonRequest, getClientIp, isRateLimitMessage, publicRpcError } from "../../../lib/httpGuards";
import { getAuthUserId } from "../../../lib/serverAuth";
import { avisarTopeGlobal, clavesLimite, ipParaLimite } from "../../../lib/serverRateLimit";

// Corre en el servidor — nunca en el navegador, así que la service role key
// nunca queda expuesta al público.
export const runtime = "nodejs";

// Hallazgo de auditoría de seguridad (2026-08-07): get_report_contact (RPC
// de Supabase) antes se llamaba directo desde el navegador con la anon key,
// y leía la IP del propio header HTTP del pedido — algo que quien llama a
// la API de Supabase controla por completo, así que el límite de 30/hora
// se evadía rotando ese header. Ver PENDIENTE_DECISION.md #-14 para el
// detalle completo (incluida la prueba en vivo contra la base real).
//
// Esta ruta es el único camino nuevo hacia esa función: get_report_contact
// ahora exige el rol service_role (revocado para anon/authenticated en
// schema.sql), así que ni siquiera alguien con la anon key puede llamarla
// directo. La IP que se le pasa acá es la que determina VERCEL en el
// request que le llega a este servidor — no falsificable por quien visita
// el sitio, a diferencia del header que mandaba el cliente antes.
export async function POST(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: "Servidor no configurado (falta SUPABASE_SERVICE_ROLE_KEY)." }, { status: 501 });
  }

  // Auditoría de seguridad (2026-08-10): esta ruta era la única de las
  // nuevas (create-report, flag-report, subscribe-push, log-error) que no
  // exigía Content-Type: application/json — un <form enctype="text/plain">
  // de otro sitio podía mandar un pedido "simple" (sin preflight CORS) con
  // un body que igual parsea como JSON válido. Mismo guard que ya usan las
  // demás, por consistencia.
  if (!isJsonRequest(request)) {
    return Response.json({ error: "Content-Type inválido." }, { status: 415 });
  }

  let reportId;
  try {
    const body = await request.json();
    reportId = body?.reportId;
  } catch (e) {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }
  if (typeof reportId !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(reportId)) {
    return Response.json({ error: "Falta reportId." }, { status: 400 });
  }

  const ip = getClientIp(request);
  // Con sesión, el cupo es por cuenta (y la IP con más margen): así varias
  // personas detrás de la misma IP no se frenan entre sí. Sin sesión, por IP.
  const userId = request.headers.get("authorization")?.startsWith("Bearer ")
    ? await getAuthUserId(request, { supabaseUrl, serviceKey })
    : null;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  try {
    // Revisión de seguridad (2026-11-04): obtener_contacto_reporte suma un
    // tope por día y por cuenta, cuenta avisos distintos (reabrir el mismo
    // no gasta cupo) y uno global. Sin la migración 20261104_01, la de antes.
    const nuevo = await fetch(`${supabaseUrl}/rest/v1/rpc/obtener_contacto_reporte`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_report_id: reportId, p_claves: clavesLimite({ ip, userId }) }),
    });
    if (nuevo.status !== 404) {
      if (!nuevo.ok) {
        logError("obtener_contacto_reporte rechazó el pedido", await nuevo.json().catch(() => ({})));
        return Response.json({ error: "No se pudo obtener el contacto." }, { status: 500 });
      }
      const rows = await nuevo.json();
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (row?.limite) {
        if (row.limite === "global") await avisarTopeGlobal("contacto");
        return Response.json(
          { error: "Viste muchos contactos seguidos. Probá de nuevo más tarde." },
          { status: 429 }
        );
      }
      return Response.json({
        contactoWhatsapp: row?.contacto_whatsapp || "",
        contactoEmail: row?.contacto_email || "",
      });
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_report_contact`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_report_id: reportId, p_client_ip: ipParaLimite(ip) }),
    });

    if (!res.ok) {
      // Postgres RAISE EXCEPTION (ej. "Demasiadas consultas...") llega acá
      // como 400 con el mensaje real en .message — se lo pasamos tal cual
      // al cliente, es el mismo texto pensado para mostrarle a la persona.
      const errBody = await res.json().catch(() => ({}));
      // Control integral (2026-08-10): ver isRateLimitMessage en
      // httpGuards.js — hoy get_report_contact solo tiene una excepción de
      // 400 (el rate limit real), pero mapear TODO 400 a 429 a ciegas
      // queda mal si el día de mañana se agrega otra, así que se aplica el
      // mismo criterio acá por consistencia con flag-report.
      const status = res.status === 400 && isRateLimitMessage(errBody?.message) ? 429 : res.status;
      if (status !== 429) logError("get_report_contact rechazó el pedido", errBody);
      return Response.json({ error: publicRpcError(res.status, errBody, "No se pudo obtener el contacto.") }, { status });
    }

    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : rows;
    return Response.json({
      contactoWhatsapp: row?.contacto_whatsapp || "",
      contactoEmail: row?.contacto_email || "",
    });
  } catch (e) {
    logError("Fallo inesperado en /api/report-contact", e);
    return Response.json({ error: "No se pudo obtener el contacto." }, { status: 500 });
  }
}
