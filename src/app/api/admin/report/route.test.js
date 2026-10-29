import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PATCH } from "./route";

const ROW = { foto_url: "a", foto_urls: ["a", "b"], hist: [1], hists: [[1], [2]], embedding: null, embeddings: null };

function request(body, token = "tok") {
  return new Request("http://localhost/api/admin/report", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/report", () => {
  let calls;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    calls = [];
  });
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(email) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init = {}) => {
        calls.push({ url: String(url), method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
        if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "u1", email });
        if ((init.method || "GET") === "GET") return Response.json([ROW]);
        return Response.json([{ id: "r1" }]);
      })
    );
  }

  it("rechaza a quien no es el admin", async () => {
    stubFetch("otra@persona.com");
    const res = await PATCH(request({ reportId: "r1", fields: { nombre: "X" } }));
    expect(res.status).toBe(403);
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("el admin reordena fotos y edita datos en un solo cambio", async () => {
    stubFetch("santiagobarronlf@gmail.com");
    const res = await PATCH(request({ reportId: "r1", fields: { nombre: "Morena", user_id: "hack" }, fotoOrder: ["b", "a"] }));
    expect(res.status).toBe(200);
    const patch = calls.find((c) => c.method === "PATCH").body;
    expect(patch).toMatchObject({ nombre: "Morena", foto_urls: ["b", "a"], foto_url: "b", hists: [[2], [1]], hist: [2] });
    expect(patch.user_id).toBeUndefined();
  });

  it("no acepta un orden con fotos que no son de la publicación", async () => {
    stubFetch("santiagobarronlf@gmail.com");
    const res = await PATCH(request({ reportId: "r1", fotoOrder: ["a", "zzz"] }));
    expect(res.status).toBe(400);
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });
});

describe("PATCH /api/admin/report — sacar y recortar fotos", () => {
  let calls;
  const B = "https://x.supabase.co/storage/v1/object/public/felpus-photos/";
  const FILA = { foto_url: `${B}r1-0-a.jpg`, foto_urls: [`${B}r1-0-a.jpg`, `${B}r1-1-b.jpg`], hist: [1], hists: [[1], [2]], embedding: null, embeddings: [null, null], detalles: {} };
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init = {}) => {
        calls.push({ url: String(url), method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
        if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "u1", email: "santiagobarronlf@gmail.com" });
        if ((init.method || "GET") === "GET") return Response.json([FILA]);
        return Response.json([{ id: "r1" }]);
      })
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reemplaza una foto por la recortada y borra la vieja del bucket", async () => {
    const nueva = `${B}r1-r-123e4567-e89b-12d3-a456-426614174000.jpg`;
    const res = await PATCH(request({ reportId: "r1", fotos: [{ url: `${B}r1-0-a.jpg` }, { url: nueva, hist: [7], embedding: null }] }));
    expect(res.status).toBe(200);
    const patch = calls.find((c) => c.method === "PATCH").body;
    expect(patch.foto_urls).toEqual([`${B}r1-0-a.jpg`, nueva]);
    const borrado = calls.find((c) => c.method === "DELETE");
    expect(borrado.url).toBe("https://x.supabase.co/storage/v1/object/felpus-photos");
    expect(borrado.body).toEqual({ prefixes: ["r1-1-b.jpg"] });
  });

  it("no acepta una foto de otro lado ni dejar la publicación sin fotos", async () => {
    expect((await PATCH(request({ reportId: "r1", fotos: [{ url: "https://evil.example/x.jpg" }] }))).status).toBe(400);
    expect((await PATCH(request({ reportId: "r1", fotos: [] }))).status).toBe(400);
    expect(calls.some((c) => c.method === "PATCH" || c.method === "DELETE")).toBe(false);
  });
});
