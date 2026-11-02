import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const IMG = "data:image/jpeg;base64,AAAA";

function request(body) {
  return new Request("http://localhost/api/import-post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Respuesta de Gemini con lo que "leyó".
const gemini = (data) => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(data) }] } }] });

describe("POST /api/import-post (varias capturas y texto)", () => {
  let enviado;
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    enviado = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        enviado = JSON.parse(init.body);
        return Response.json(
          gemini({ es_publicacion_mascota: true, tipo: "perdida", especie: "perro", nombre: "Luna", foto_recuadro: [100, 100, 600, 600], foto_imagen: 2, contacto_telefono: "", contacto_email: "" })
        );
      })
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const imagenes = () => enviado.contents[0].parts.filter((p) => p.inlineData);

  it("lee hasta 3 capturas juntas y dice en cuál está la foto", async () => {
    const res = await POST(request({ images: [IMG, IMG], text: "Se perdió Luna en Tres Cerritos, perrita negra" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(imagenes()).toHaveLength(2);
    expect(enviado.contents[0].parts[0].text).toContain("Se perdió Luna");
    expect(body.draft.nombre).toBe("Luna");
    expect(body.boxImagen).toBe(1);
  });

  it("solo con el texto pegado también funciona (sin recuadro de foto)", async () => {
    const res = await POST(request({ text: "Se perdió Luna en Tres Cerritos, perrita negra" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(imagenes()).toHaveLength(0);
    expect(body.box).toBeNull();
  });

  it("sigue aceptando una sola captura como antes (`image`)", async () => {
    const res = await POST(request({ image: IMG }));
    expect(res.status).toBe(200);
    expect(imagenes()).toHaveLength(1);
    expect((await res.json()).boxImagen).toBe(0);
  });

  it("rechaza más de 3 capturas, o nada para leer", async () => {
    expect((await POST(request({ images: [IMG, IMG, IMG, IMG] }))).status).toBe(400);
    expect((await POST(request({ text: "corto" }))).status).toBe(400);
    expect((await POST(request({}))).status).toBe(400);
    expect(enviado).toBeNull();
  });
});
