// Esta ruta corre en el servidor (nunca en el navegador), así que el token
// de Hugging Face nunca queda expuesto al público.
export const runtime = "nodejs";

const HF_MODEL = "openai/clip-vit-base-patch32";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB — de sobra para una foto ya redimensionada en el cliente.

// Rate limit básico en memoria (por IP). No sobrevive a reinicios ni se
// comparte entre instancias serverless, pero frena el abuso trivial de un
// endpoint que consume una API de terceros con costo/límite propio.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 12;
const requestLog = new Map();

function isRateLimited(key) {
  const now = Date.now();
  const timestamps = (requestLog.get(key) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(key, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
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
      // puede reintentar una vez; si no, cae al histograma de color.
      return Response.json(
        { error: `Hugging Face respondió ${hfRes.status}: ${text.slice(0, 300)}` },
        { status: 502 }
      );
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
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
