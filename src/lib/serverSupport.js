// Lado del servidor de los "apoyos" (alias de colaboradores, ver
// supabase/migrations/20261026_02_apoyos_y_antifraude.sql). Comparte el
// llamado a las RPC que solo puede usar el service role.
import { publicRpcError, isRateLimitMessage } from "./httpGuards";
export { SUPPORT_FLAG_REASONS, normalizeAlias } from "./support";

export const CONTRIBUTOR_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function callServiceRpc(fn, args, fallbackError) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { status: 501, error: "Servidor no configurado." };
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const status = res.status === 400 && isRateLimitMessage(body?.message) ? 429 : res.status;
    return { status, error: publicRpcError(res.status, body, fallbackError), raw: body };
  }
  const text = await res.text();
  return { status: 200, data: text ? JSON.parse(text) : null };
}
