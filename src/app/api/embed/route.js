// Esta ruta corre en el servidor (nunca en el navegador), así que el token
// de Hugging Face nunca queda expuesto al público.
export const runtime = "nodejs";

const HF_MODEL = "openai/clip-vit-base-patch32";

export async function POST(request) {
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

  if (!imageDataUrl || !imageDataUrl.startsWith("data:")) {
    return Response.json({ error: "Falta imageDataUrl (debe ser un data URL)." }, { status: 400 });
  }

  try {
    const base64 = imageDataUrl.split(",")[1];
    const bytes = Buffer.from(base64, "base64");

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
