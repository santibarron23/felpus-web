import { logError } from "../../../lib/log";
import { isJsonRequest, getClientIp } from "../../../lib/httpGuards";

// Corre en el servidor — nunca en el navegador, así que la service role key
// nunca queda expuesta al público.
export const runtime = "nodejs";

const VALID_REASONS = ["falsa", "info_incorrecta", "inapropiado", "otro"];

// Hallazgo de auditoría de seguridad (2026-08-07) — el más grave de los
// encontrados: flag_report (RPC de Supabase) auto-oculta un reporte apenas
// ve 3 IPs DISTINTAS denunciando, y antes leía esa IP de un header HTTP que
// quien llama a la API controla por completo. Con IPs falsas rotando
// libremente, cualquiera podía ocultar CUALQUIER reporte ajeno en 3
// pedidos. Ver PENDIENTE_DECISION.md #-14 para el detalle completo.
//
// Mismo fix que /api/report-contact: flag_report ahora exige el rol
// service_role (revocado para anon/authenticated en schema.sql), y la IP
// que se le pasa acá es la que determina Vercel en el request real, no
// falsificable por quien visita el sitio.
export async function POST(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: "Servidor no configurado (falta SUPABASE_SERVICE_ROLE_KEY)." }, { status: 501 });
  }

  if (!isJsonRequest(request)) {
    return Response.json({ error: "Content-Type inválido." }, { status: 415 });
  }

  let reportId, reason;
  try {
    const body = await request.json();
    reportId = body?.reportId;
    reason = body?.reason;
  } catch (e) {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }
  if (!reportId || typeof reportId !== "string") {
    return Response.json({ error: "Falta reportId." }, { status: 400 });
  }
  if (!VALID_REASONS.includes(reason)) {
    return Response.json({ error: "Motivo de denuncia no reconocido." }, { status: 400 });
  }

  const ip = getClientIp(request);

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/flag_report`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_report_id: reportId, p_reason: reason, p_client_ip: ip }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const status = res.status === 400 ? 429 : res.status;
      return Response.json({ error: errBody?.message || "No se pudo enviar la denuncia." }, { status });
    }

    return Response.json({ ok: true });
  } catch (e) {
    logError("Fallo inesperado en /api/flag-report", e);
    return Response.json({ error: "No se pudo enviar la denuncia." }, { status: 500 });
  }
}
