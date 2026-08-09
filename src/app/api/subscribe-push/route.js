import { createClient } from "@supabase/supabase-js";
import { logError } from "../../../lib/log";
import { isJsonRequest, getClientIp } from "../../../lib/httpGuards";

// Corre en el servidor — nunca en el navegador, así que la service role key
// nunca queda expuesta al público.
export const runtime = "nodejs";

const MAX_PER_HOUR = 8;

// Auditoría integral (2026-08-09): subscribe_report_push (RPC) leía la IP
// de un header HTTP que quien llama a la API de Supabase directo controla
// por completo — mismo hueco que ya se cerró para get_report_contact/
// flag_report/create-report (ver PENDIENTE_DECISION.md #-14). Ahora la RPC
// quedó restringida a service_role, y esta ruta es el único camino: la IP
// la determina Vercel en el request real, no falsificable.
//
// De paso cierra un segundo hueco que quedaba documentado como "riesgo
// aceptado" sin arreglar: como el id de un reporte no es secreto (aparece
// en la URL pública /r/<id>), cualquiera que lo conociera podía llamar la
// RPC vieja y pisar la suscripción push de OTRA persona. Ahora hace falta
// además el push_token (capability token, entregado una sola vez al
// publicar — ver create-report/route.js) o estar logueado como el dueño
// real del reporte.
export async function POST(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: "Servidor no configurado (falta SUPABASE_SERVICE_ROLE_KEY)." }, { status: 501 });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  if (!isJsonRequest(request)) {
    return Response.json({ error: "Content-Type inválido." }, { status: 415 });
  }

  let reportId, subscription, pushToken;
  try {
    const body = await request.json();
    reportId = body?.reportId;
    subscription = body?.subscription;
    pushToken = body?.pushToken || null;
  } catch (e) {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }
  if (!reportId || typeof reportId !== "string") {
    return Response.json({ error: "Falta reportId." }, { status: 400 });
  }
  if (!subscription || typeof subscription !== "object") {
    return Response.json({ error: "Falta la suscripción." }, { status: 400 });
  }

  // Igual que create-report: sesión real verificada contra Supabase Auth,
  // nunca confiando en lo que el cliente diga que es su propio user_id. Se
  // le pasa a la RPC como parámetro explícito (p_caller_user_id), no vía
  // auth.uid() — la función corre exclusivamente como service_role (no como
  // el rol del JWT de quien llama), así que auth.uid() ahí adentro nunca
  // reflejaría al usuario real. Ver el comentario largo en schema.sql.
  let realUserId = null;
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const { data, error } = await supabase.auth.getUser(authHeader.slice(7));
      if (!error && data?.user) realUserId = data.user.id;
    } catch (e) {
      // Token inválido/vencido: se sigue sin identidad — si además no hay
      // pushToken válido, la RPC va a rechazar el pedido igual.
    }
  }

  const ip = getClientIp(request);
  if (ip) {
    try {
      await supabase
        .from("report_submissions")
        .delete()
        .lt("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());

      const { count } = await supabase
        .from("report_submissions")
        .select("*", { count: "exact", head: true })
        .eq("ip", ip)
        .gt("created_at", new Date(Date.now() - 3600 * 1000).toISOString());

      if ((count || 0) >= MAX_PER_HOUR) {
        return Response.json(
          { error: "Demasiados intentos desde esta conexión. Probá de nuevo más tarde." },
          { status: 429 }
        );
      }

      await supabase.from("report_submissions").insert({ ip });
    } catch (e) {
      logError("No se pudo aplicar el rate limit de activar notificaciones", e);
    }
  }

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/subscribe_report_push`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_report_id: reportId,
        p_subscription: subscription,
        p_push_token: pushToken,
        p_caller_user_id: realUserId,
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const status = res.status === 400 ? 403 : res.status;
      return Response.json({ error: errBody?.message || "No se pudo activar las notificaciones." }, { status });
    }
    return Response.json({ ok: true });
  } catch (e) {
    logError("Fallo inesperado en /api/subscribe-push", e);
    return Response.json({ error: "No se pudo activar las notificaciones." }, { status: 500 });
  }
}
