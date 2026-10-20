import { getAuthUserId, supabaseServerEnv } from "../../../../lib/serverAuth";
import { makePusher } from "../../../../lib/alertsServer";

// Solo en desarrollo: manda un push de prueba a los dispositivos del usuario
// actual (ver /dev/test-push). En producción responde 404.
export const runtime = "nodejs";

export async function POST(request) {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  const env = supabaseServerEnv();
  const userId = await getAuthUserId(request, env);
  if (!userId) return Response.json({ error: "Iniciá sesión." }, { status: 401 });
  const push = await makePusher();
  if (!push) return Response.json({ error: "Faltan las claves VAPID en .env.local." }, { status: 501 });
  const res = await fetch(`${env.supabaseUrl}/rest/v1/push_subscriptions?user_id=eq.${userId}&select=endpoint,p256dh,auth`, {
    headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` },
  });
  const subs = res.ok ? await res.json() : [];
  let sent = 0;
  for (const s of subs) {
    try {
      await push.send(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        { title: "🐾 Prueba de Felpus", body: "Si ves esto, las alertas funcionan.", url: "/" }
      );
      sent++;
    } catch {
      // seguimos con los demás dispositivos
    }
  }
  return Response.json({ devices: subs.length, sent });
}
