import { logError } from "../../../lib/log";
import { petTitle, nombreReal } from "../../../lib/petTitle";
import { supabaseServerEnv } from "../../../lib/serverAuth";
import { ACCIONES, linkSecret, makeEmailDb, verificarAviso } from "../../../lib/serverEmailAvisos";

// Respuestas a los mails de aviso (emailAvisos.js). El link del mail trae un
// token firmado que sirve solo para ese reporte (serverEmailAvisos.js):
//  - GET  ?t=…           → qué reporte es y en qué estado está (no cambia nada:
//                          algunos correos "visitan" los links para revisarlos).
//  - POST t + accion     → volvio | sigo | no_busco | baja. Lo manda la página
//                          /aviso después de que la persona confirma, o el
//                          botón "Darse de baja" del propio cliente de correo
//                          (List-Unsubscribe-Post, RFC 8058: solo "baja").
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contexto() {
  const env = supabaseServerEnv();
  const secret = linkSecret();
  if (!env.supabaseUrl || !env.serviceKey || !secret) return null;
  return { db: makeEmailDb(env), secret };
}

function estadoDe(r) {
  if (!r) return "no_existe";
  if (r.resuelto) return "resuelto";
  if (r.inactivo) return "inactivo";
  return "activo";
}

export async function GET(request) {
  const ctx = contexto();
  if (!ctx) return Response.json({ error: "No disponible." }, { status: 501 });
  const reportId = verificarAviso(new URL(request.url).searchParams.get("t"), ctx.secret);
  if (!reportId) return Response.json({ error: "El link no es válido o ya venció.", code: "token" }, { status: 400 });
  try {
    const r = await ctx.db.getReport(reportId);
    if (!r) return Response.json({ error: "Ese reporte ya no existe.", code: "no_existe" }, { status: 404 });
    return Response.json({
      id: r.id,
      tipo: r.tipo,
      nombre: nombreReal(r) || petTitle(r).toLowerCase(),
      estado: estadoDe(r),
      avisos: r.avisos_email !== false,
    });
  } catch (e) {
    logError("No se pudo leer el reporte del aviso", e);
    return Response.json({ error: "No pudimos cargar el reporte." }, { status: 500 });
  }
}

export async function POST(request) {
  const ctx = contexto();
  if (!ctx) return Response.json({ error: "No disponible." }, { status: 501 });
  const url = new URL(request.url);
  let t = url.searchParams.get("t");
  let accion = url.searchParams.get("accion");
  const type = request.headers.get("content-type") || "";
  try {
    if (type.includes("application/json")) {
      const body = await request.json();
      t = body?.t ?? t;
      accion = body?.accion ?? accion;
    } else if (type.includes("form")) {
      const form = await request.formData();
      // Baja en un clic del cliente de correo: el body es
      // "List-Unsubscribe=One-Click" y t/accion vienen en la URL.
      if (form.get("List-Unsubscribe") === "One-Click") accion = "baja";
      t = form.get("t") ?? t;
      accion = form.get("accion") ?? accion;
    }
  } catch {
    return Response.json({ error: "Pedido inválido." }, { status: 400 });
  }
  if (!ACCIONES.includes(accion)) return Response.json({ error: "Acción inválida." }, { status: 400 });
  const reportId = verificarAviso(typeof t === "string" ? t : "", ctx.secret);
  if (!reportId) return Response.json({ error: "El link no es válido o ya venció.", code: "token" }, { status: 400 });
  try {
    const r = await ctx.db.getReport(reportId);
    if (!r) return Response.json({ error: "Ese reporte ya no existe.", code: "no_existe" }, { status: 404 });
    if (accion !== "baja" && r.resuelto) return Response.json({ ok: true, estado: "resuelto" });
    await ctx.db.aplicarAccion(reportId, accion, new Date().toISOString(), r.nickname);
    console.info(JSON.stringify({ event: "aviso_email_respuesta", accion }));
    return Response.json({ ok: true, accion });
  } catch (e) {
    logError("No se pudo aplicar la respuesta del aviso", e);
    return Response.json({ error: "No pudimos guardar tu respuesta. Probá de nuevo." }, { status: 500 });
  }
}
