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
