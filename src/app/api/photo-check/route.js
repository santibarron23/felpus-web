import { logError } from "../../../lib/log";
import { isJsonRequest, getClientIp } from "../../../lib/httpGuards";
import { checkPhoto } from "../../../lib/photoCheck";

// ¿Foto real o flyer/captura/ilustración? Ver photoCheck.js. Mismo modelo
// de ejecución y mismos controles que /api/embed (Node, ONNX Runtime nativo,
// rate limit en la base). Es un pedido aparte del embedding a propósito: el
// cliente no lo espera para nada (el aviso aparece cuando llega), así un
// arranque en frío de CLIP no demora la carga de la foto.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// Mismo límite por IP que /api/embed (check_embed_rate_limit, 12 por
// minuto, compartido): una foto usa un pedido de cada uno.
async function checkRateLimit(ip) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!ip || !supabaseUrl || !serviceKey) return true;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/check_embed_rate_limit`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ client_ip: ip }),
    });
    if (!res.ok) return true;
    return await res.json();
  } catch (e) {
    return true;
  }
}

export async function POST(request) {
  if (!isJsonRequest(request)) {
    return Response.json({ error: "Content-Type inválido." }, { status: 415 });
  }
  const allowed = await checkRateLimit(getClientIp(request));
  if (!allowed) {
    return Response.json({ error: "Demasiadas solicitudes, probá de nuevo en un minuto." }, { status: 429 });
  }

  let imageDataUrl;
  try {
    imageDataUrl = (await request.json()).imageDataUrl;
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }
  if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
    return Response.json({ error: "Falta imageDataUrl (debe ser un data URL de imagen)." }, { status: 400 });
  }
  if (imageDataUrl.length > MAX_IMAGE_BYTES * 1.4) {
    return Response.json({ error: "La imagen es demasiado grande." }, { status: 413 });
  }

  try {
    const bytes = Buffer.from(imageDataUrl.split(",")[1] || "", "base64");
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
      return Response.json({ error: "La imagen es demasiado grande." }, { status: 413 });
    }
    return Response.json(await checkPhoto(bytes));
  } catch (e) {
    // El cliente ante cualquier error sigue sin aviso: nunca bloquea subir
    // una foto por un problema de este chequeo.
    logError("No se pudo revisar la foto (photo-check)", e);
    return Response.json({ error: "No se pudo revisar la foto." }, { status: 502 });
  }
}
