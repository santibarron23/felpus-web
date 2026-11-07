import { logError } from "../../../../lib/log";
import { isJsonRequest, getClientIp, esPedidoDeOtroSitio, respuestaOtroSitio } from "../../../../lib/httpGuards";
import { getAuthUserId, supabaseServerEnv } from "../../../../lib/serverAuth";
import { makeAiRateLimit } from "../../../../lib/serverAiRateLimit";
import { pedidoSinLimite } from "../../../../lib/serverCuentasSinLimite";
import { EXT_PERMITIDAS, firmarSubida, prefijoPermitido } from "../../../../lib/serverFotos";

// Permiso para subir UNA foto a Storage, después de pasar el cupo. Ver
// serverFotos.js. El nombre final lo arma el servidor (prefijo + UUID), así
// que nadie puede pisar ni elegir el archivo de otro.
export const runtime = "nodejs";

// Cupo "foto" en felpus_limite (migración 20261107_01): por IP y un tope
// global por día. Sin esa migración, solo el respaldo en memoria por IP.
// failClosed: false — si la base no responde, se deja subir (no cuesta
// plata y no debe trabar una publicación).
const checkRateLimit = makeAiRateLimit({ maxPerMinute: 15, bucket: "foto", legacy: [], failClosed: false });

export async function POST(request) {
  if (esPedidoDeOtroSitio(request)) return respuestaOtroSitio();
  if (!isJsonRequest(request)) return Response.json({ error: "Content-Type inválido." }, { status: 415 });
  const env = supabaseServerEnv();
  if (!env.supabaseUrl || !env.serviceKey) return Response.json({ error: "Servidor no configurado." }, { status: 501 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }
  const ext = typeof body?.ext === "string" ? body.ext : "";
  if (!EXT_PERMITIDAS.has(ext)) {
    return Response.json({ error: "Formato de imagen no permitido. Subí una foto JPG, PNG o WebP." }, { status: 400 });
  }
  // La sesión solo hace falta para la foto de perfil (avatars/<id>/).
  const pideAvatar = typeof body?.prefijo === "string" && body.prefijo.startsWith("avatars/");
  const userId = pideAvatar ? await getAuthUserId(request, env) : null;
  const prefijo = prefijoPermitido(body?.prefijo, userId);
  if (!prefijo) return Response.json({ error: "Nombre de foto inválido." }, { status: 400 });

  // Cuentas sin cupos (cuentasSinLimite.js): primero, así no cuentan para el tope global.
  if (!(await pedidoSinLimite(request, env)) && !(await checkRateLimit(getClientIp(request)))) {
    return Response.json({ error: "Subiste muchas fotos seguidas. Esperá un rato y probá de nuevo." }, { status: 429 });
  }

  try {
    const permiso = await firmarSubida(`${prefijo}-${crypto.randomUUID()}.${ext}`, env);
    return Response.json(permiso);
  } catch (e) {
    logError("No se pudo preparar la subida de una foto", e);
    return Response.json({ error: "No se pudo preparar la subida." }, { status: 502 });
  }
}
