import { logError } from "../../../lib/log";

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

  let reportId;
  try {
    const body = await request.json();
    reportId = body?.reportId;
  } catch (e) {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }
  if (!reportId || typeof reportId !== "string") {
    return Response.json({ error: "Falta reportId." }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_report_contact`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_report_id: reportId, p_client_ip: ip }),
    });

    if (!res.ok) {
      // Postgres RAISE EXCEPTION (ej. "Demasiadas consultas...") llega acá
      // como 400 con el mensaje real en .message — se lo pasamos tal cual
      // al cliente, es el mismo texto pensado para mostrarle a la persona.
      const errBody = await res.json().catch(() => ({}));
      const status = res.status === 400 ? 429 : res.status;
      return Response.json({ error: errBody?.message || "No se pudo obtener el contacto." }, { status });
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
