import { logError } from "../../../lib/log";
import { isJsonRequest, getClientIp } from "../../../lib/httpGuards";
import { callServiceRpc, CONTRIBUTOR_ID_RE } from "../../../lib/serverSupport";
import { normalizeLinkCobro } from "../../../lib/support";

// Alias y link de cobro de un colaborador para "Apoyar" (ver serverSupport.js). El alias no se
// puede leer por la API pública: solo por acá, de a uno y con límite por IP
// (30 por hora, la IP la determina Vercel). No se devuelve si la persona no
// acepta apoyos, está baneada o su alias tiene 3+ denuncias sin revisar.
export const runtime = "nodejs";

export async function POST(request) {
  if (!isJsonRequest(request)) return Response.json({ error: "Content-Type inválido." }, { status: 415 });
  let contributorId;
  try {
    contributorId = (await request.json())?.contributorId;
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }
  if (typeof contributorId !== "string" || !CONTRIBUTOR_ID_RE.test(contributorId)) {
    return Response.json({ error: "Falta contributorId." }, { status: 400 });
  }
  try {
    const r = await callServiceRpc(
      "get_support_alias",
      { p_contributor_id: contributorId, p_client_ip: getClientIp(request) },
      "No se pudo obtener el alias."
    );
    if (r.error) {
      if (r.status !== 429) logError("get_support_alias rechazó el pedido", r.raw || r.error);
      return Response.json({ error: r.error }, { status: r.status });
    }
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    // El link se vuelve a validar acá aunque la base ya lo controla: nunca
    // devolver un link que no sea de Mercado Pago o Cafecito.
    const link = normalizeLinkCobro(row?.link_cobro).link || "";
    if (!row?.alias_pago && !link) return Response.json({ error: "Esta persona no recibe apoyos en este momento." }, { status: 404 });
    return Response.json({ alias: row.alias_pago || "", link, nickname: row.nickname || "" });
  } catch (e) {
    logError("Fallo inesperado en /api/support-alias", e);
    return Response.json({ error: "No se pudo obtener el alias." }, { status: 500 });
  }
}
