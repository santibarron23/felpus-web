import { logError } from "../../../lib/log";
import { isJsonRequest, getClientIp } from "../../../lib/httpGuards";

// Esta ruta corre en el servidor (nunca en el navegador), así que el token
// de Hugging Face nunca queda expuesto al público.
export const runtime = "nodejs";

const HF_MODEL = "openai/clip-vit-base-patch32";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB — de sobra para una foto ya redimensionada en el cliente.

// Rate limit real (en la base, vía RPC) — el anterior vivía en un Map en
// memoria adentro de la función serverless, así que no protegía nada: cada
// cold start arranca en cero y las instancias concurrentes no comparten
// memoria. Ver check_embed_rate_limit() en supabase/schema.sql. Si el
// chequeo mismo falla (Supabase caído, no configurado, etc.) se deja pasar
// el pedido — un problema de infra ajeno no debería tumbar la función real.
//
// Auditoría integral (2026-08-09): esta RPC estaba otorgada a
// anon/authenticated — cualquiera con la anon key (pública) podía llamarla
// directo pasando cualquier client_ip inventada (mismo truco que ya se
// cerró para get_report_contact/flag_report) y un max_per_minute absurdo.
// Ahora requiere service_role — la IP que se le pasa es exclusivamente la
// que determina Vercel en este request, y el tope máximo ya no es un
// parámetro (queda fijo dentro de la función).
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

  const ip = getClientIp(request);
  const allowed = await checkRateLimit(ip);
  if (!allowed) {
    return Response.json({ error: "Demasiadas solicitudes, probá de nuevo en un minuto." }, { status: 429 });
  }

  const token = process.env.HUGGINGFACE_API_TOKEN;

  if (!token) {
    // No es un error grave: el cliente cae al histograma de color como respaldo.
    return Response.json(
      { error: "HUGGINGFACE_API_TOKEN no configurado en el servidor." },
      { status: 501 }
    );
  }

  let imageDataUrl;
  try {
    const body = await request.json();
    imageDataUrl = body.imageDataUrl;
  } catch (e) {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
    return Response.json({ error: "Falta imageDataUrl (debe ser un data URL de imagen)." }, { status: 400 });
  }

  if (imageDataUrl.length > MAX_IMAGE_BYTES * 1.4) {
    // base64 pesa ~1.37x el binario original; el margen cubre esa diferencia.
    return Response.json({ error: "La imagen es demasiado grande." }, { status: 413 });
  }

  try {
    const base64 = imageDataUrl.split(",")[1];
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length > MAX_IMAGE_BYTES) {
      return Response.json({ error: "La imagen es demasiado grande." }, { status: 413 });
    }

    const hfRes = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: bytes,
    });

    if (!hfRes.ok) {
      const text = await hfRes.text().catch(() => "");
      // 503 típico = el modelo se está "despertando" (cold start). El cliente
      // (getRemoteEmbedding en matching.js) ni siquiera lee este mensaje —
      // ante cualquier !res.ok cae directo al histograma de color, así que
      // el texto crudo de Hugging Face no le sirve a nadie del otro lado;
      // se loguea acá server-side por si hace falta diagnosticar, y se
      // devuelve solo el status, sin reenviar el cuerpo de la respuesta de
      // un tercero tal cual (auditoría integral, 2026-08-09).
      logError(`Hugging Face respondió ${hfRes.status}`, new Error(text.slice(0, 500)));
      return Response.json({ error: "No se pudo generar el embedding de la imagen." }, { status: 502 });
    }

    const data = await hfRes.json();

    // Distintos modelos devuelven el vector con distinto anidamiento;
    // lo aplanamos hasta encontrar un array plano de números.
    let embedding = data;
    while (Array.isArray(embedding) && Array.isArray(embedding[0])) {
      embedding = embedding[0];
    }

    if (!Array.isArray(embedding) || typeof embedding[0] !== "number") {
      return Response.json({ error: "Formato de respuesta inesperado de Hugging Face." }, { status: 502 });
    }

    return Response.json({ embedding });
  } catch (e) {
    // El detalle real (ruta interna, stack, nombre de librería) se loguea
    // server-side; al cliente solo le sirve saber que falló, para caer al
    // histograma de color de respaldo — no hay necesidad de exponer más.
    logError("Fallo inesperado en /api/embed", e);
    return Response.json({ error: "No se pudo generar el embedding de la imagen." }, { status: 500 });
  }
}
