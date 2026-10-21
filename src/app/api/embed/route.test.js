import { beforeEach, describe, expect, it, vi } from "vitest";

// El modelo real (DINOv2 vía onnxruntime-node) se probó aparte contra las
// fotos de producción y con "next start"; acá se mockea para cubrir solo
// la lógica de la ruta: validaciones, forma de la respuesta y errores.
vi.mock("../../../lib/imageEmbedding", () => ({ embedImage: vi.fn() }));
vi.mock("../../../lib/log", () => ({ logError: vi.fn() }));

const { embedImage } = await import("../../../lib/imageEmbedding");
const { POST } = await import("./route");

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function req(body, contentType = "application/json") {
  return new Request("http://localhost/api/embed", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/embed", () => {
  beforeEach(() => {
    vi.mocked(embedImage).mockReset();
    // Sin Supabase el rate limit deja pasar (ver checkRateLimit).
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("devuelve { embedding } con el vector del modelo, sin pedir ningún token", async () => {
    vi.mocked(embedImage).mockResolvedValue([0.6, 0.8]);
    const res = await POST(req({ imageDataUrl: PNG_1PX }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ embedding: [0.6, 0.8] });
    const bytes = vi.mocked(embedImage).mock.calls[0][0];
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  });

  it("rechaza un Content-Type que no sea JSON", async () => {
    const res = await POST(req({ imageDataUrl: PNG_1PX }, "text/plain"));
    expect(res.status).toBe(415);
  });

  it("rechaza algo que no sea un data URL de imagen", async () => {
    const res = await POST(req({ imageDataUrl: "https://example.com/foto.jpg" }));
    expect(res.status).toBe(400);
    expect(embedImage).not.toHaveBeenCalled();
  });

  it("rechaza imágenes demasiado grandes sin llegar al modelo", async () => {
    const huge = "data:image/jpeg;base64," + "A".repeat(12 * 1024 * 1024);
    const res = await POST(req({ imageDataUrl: huge }));
    expect(res.status).toBe(413);
    expect(embedImage).not.toHaveBeenCalled();
  });

  it("si el modelo falla responde 502 sin filtrar el detalle (el cliente cae al histograma)", async () => {
    vi.mocked(embedImage).mockRejectedValue(new Error("onnx: /var/task/node_modules/... no encontrado"));
    const res = await POST(req({ imageDataUrl: PNG_1PX }));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("onnx");
  });
});
