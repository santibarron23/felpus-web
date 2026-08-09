import { createClient } from "@supabase/supabase-js";
import { logError } from "../../../lib/log";
import { isJsonRequest, getClientIp } from "../../../lib/httpGuards";

// Corre en el servidor — nunca en el navegador, así que la service role key
// nunca queda expuesta al público.
export const runtime = "nodejs";

const MAX_PER_HOUR = 8;
// Misma lista que REPORT_LIST_OPTIONAL_COLUMNS en store.js — columnas que
// pueden no existir todavía si no se corrió la migración más reciente de
// schema.sql. Duplicada acá (no importada) porque esta ruta corre en un
// entorno de servidor separado del cliente y así queda explícito qué
// columnas puede llegar a faltar sin depender de un import cruzado.
const OPTIONAL_COLUMNS = ["raza", "detalles", "oculto", "ciudad", "provincia"];

export function missingOptionalColumn(error) {
  if (!error) return null;
  const text = `${error.message || ""} ${error.code || ""}`;
  if (!text.includes("42703") && !text.includes("PGRST204") && !/does not exist/i.test(text)) return null;
  return OPTIONAL_COLUMNS.find((c) => new RegExp(`\\b${c}\\b`, "i").test(text)) || null;
}

// Hallazgo de auditoría de seguridad (2026-08-07): publicar un reporte
// (antes, insert directo con la anon key) dejaba el rate limit de 8/hora en
// manos de un trigger de base que leía la IP de un header HTTP falsificable
// por quien llama a la API de Supabase directo — mismo hueco que
// get_report_contact/flag_report. Ver PENDIENTE_DECISION.md #-14 para el
// detalle completo, incluida la prueba en vivo contra la base real.
//
// Esta ruta reemplaza ese insert directo. Dos protecciones que antes vivían
// en RLS/un trigger pasan a vivir acá, donde sí se puede confiar en la IP
// (la determina Vercel) y en la identidad real de quien publica:
// 1. Rate limit de 8/hora — mismo cupo y misma tabla (report_submissions)
//    que ya usaba el trigger, ahora consultada/actualizada desde acá.
// 2. user_id NUNCA sale de lo que mande el cliente — se deriva del token
//    de sesión real (verificado contra Supabase Auth), igual que ya
//    protege reports_insert_own_or_guest (RLS) para cualquier otro camino
//    de inserción. Publicar como invitado (sin sesión) sigue funcionando
//    igual: si no hay token, user_id queda null.
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

  let row;
  try {
    const body = await request.json();
    row = body?.row;
  } catch (e) {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }
  if (!row || typeof row !== "object" || !row.id) {
    return Response.json({ error: "Falta el reporte a publicar." }, { status: 400 });
  }

  let realUserId = null;
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const { data, error } = await supabase.auth.getUser(authHeader.slice(7));
      if (!error && data?.user) realUserId = data.user.id;
    } catch (e) {
      // Token inválido/vencido: se sigue como invitado (user_id null) en
      // vez de romper la publicación — mismo criterio permisivo que el
      // resto de esta app con sesiones inválidas.
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
          { error: "Se alcanzó el límite de reportes por hora desde esta conexión. Probá de nuevo más tarde." },
          { status: 429 }
        );
      }

      await supabase.from("report_submissions").insert({ ip });
    } catch (e) {
      // Un problema con el rate limiting en sí (tabla no migrada todavía,
      // etc.) no debería impedir publicar — mismo criterio de "falla
      // abierto" que ya usaba el trigger anterior.
      logError("No se pudo aplicar el rate limit de creación de reportes", e);
    }
  }

  let attemptRow = { ...row, user_id: realUserId, resuelto: false };
  let finalError = null;
  for (let attempt = 0; attempt <= OPTIONAL_COLUMNS.length; attempt++) {
    const result = await supabase.from("reports").insert(attemptRow);
    const missing = missingOptionalColumn(result.error);
    if (!missing || !(missing in attemptRow)) {
      finalError = result.error;
      break;
    }
    const { [missing]: _omit, ...rest } = attemptRow;
    attemptRow = rest;
    finalError = result.error;
  }

  if (finalError) {
    logError("No se pudo publicar el reporte", finalError);
    return Response.json({ error: finalError.message || "No se pudo publicar el reporte." }, { status: 400 });
  }

  // push_token (auditoría integral, 2026-08-09): capability token para
  // activar notificaciones push de ESTE reporte sin necesitar login (ver
  // subscribe_report_push en schema.sql) — se genera solo con un default en
  // la base y se entrega UNA sola vez acá, en la respuesta directa de quien
  // acaba de publicar. Select aparte (no en el mismo insert) y en su propio
  // try/catch: si todavía no se corrió la migración que agrega la columna,
  // esto no debe romper la publicación en sí, solo dejar "activar
  // notificaciones" indisponible para invitados hasta entonces.
  let pushToken = null;
  try {
    const { data } = await supabase.from("reports").select("push_token").eq("id", attemptRow.id).maybeSingle();
    pushToken = data?.push_token || null;
  } catch (e) {
    logError("No se pudo leer push_token del reporte recién publicado", e);
  }

  return Response.json({ ok: true, pushToken });
}
