import { timingSafeEqual } from "node:crypto";

// Usuario real de la sesión (token "Authorization: Bearer" de Supabase Auth),
// verificado contra Supabase — nunca se confía en un user_id que mande el
// cliente. Mismo criterio que api/create-report y api/subscribe-push.
export async function getAuthUser(request, { supabaseUrl, serviceKey, fetchImpl = fetch } = {}) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ") || !supabaseUrl || !serviceKey) return null;
  try {
    const res = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: header },
    });
    if (!res.ok) return null;
    const user = await res.json();
    if (typeof user?.id !== "string") return null;
    return { id: user.id, email: typeof user.email === "string" ? user.email.toLowerCase() : null };
  } catch {
    return null;
  }
}

export async function getAuthUserId(request, env) {
  return (await getAuthUser(request, env))?.id || null;
}

// Comparación de tiempo constante para secretos de webhook.
export function secretsMatch(received, expected) {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Los dos secretos que aceptan las rutas de alertas: el del plan
// (x-alerts-secret = ALERTS_WEBHOOK_SECRET) y el del trigger que ya existía
// (x-webhook-secret = NOTIFY_WEBHOOK_SECRET, el que guarda Supabase Vault).
export function isAlertsWebhookAuthorized(request, env = process.env) {
  return (
    secretsMatch(request.headers.get("x-alerts-secret"), env.ALERTS_WEBHOOK_SECRET) ||
    secretsMatch(request.headers.get("x-webhook-secret"), env.NOTIFY_WEBHOOK_SECRET)
  );
}

export function supabaseServerEnv(env = process.env) {
  return { supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY };
}
