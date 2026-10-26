import { logError } from "../../../lib/log";
import { isJsonRequest, getClientIp } from "../../../lib/httpGuards";
import { callServiceRpc, CONTRIBUTOR_ID_RE, SUPPORT_FLAG_REASONS } from "../../../lib/serverSupport";

// "Reportar abuso" desde la ventana de Apoyar. Una denuncia por IP y alias;
// con 3 de IPs distintas el alias deja de mostrarse hasta que el admin lo
// revise (ver get_support_alias en la migración 20261026_02).
export const runtime = "nodejs";

export async function POST(request) {
  if (!isJsonRequest(request)) return Response.json({ error: "Content-Type inválido." }, { status: 415 });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }
  const contributorId = body?.contributorId;
  const reason = SUPPORT_FLAG_REASONS.includes(body?.reason) ? body.reason : "Otro";
  if (typeof contributorId !== "string" || !CONTRIBUTOR_ID_RE.test(contributorId)) {
    return Response.json({ error: "Falta contributorId." }, { status: 400 });
  }
  try {
    const r = await callServiceRpc(
      "flag_support",
      { p_contributor_id: contributorId, p_reason: reason, p_client_ip: getClientIp(request) },
      "No se pudo enviar la denuncia."
    );
    if (r.error) {
      if (r.status !== 429) logError("flag_support rechazó el pedido", r.raw || r.error);
      return Response.json({ error: r.error }, { status: r.status });
    }
    return Response.json({ ok: true });
  } catch (e) {
    logError("Fallo inesperado en /api/support-flag", e);
    return Response.json({ error: "No se pudo enviar la denuncia." }, { status: 500 });
  }
}
