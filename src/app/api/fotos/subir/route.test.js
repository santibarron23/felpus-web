import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const permitir = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../../../../lib/log", () => ({ logError: vi.fn() }));
vi.mock("../../../../lib/serverAiRateLimit", () => ({ makeAiRateLimit: () => permitir }));
vi.mock("../../../../lib/serverAuth", () => ({
  supabaseServerEnv: () => ({ supabaseUrl: "https://s.supabase.co", serviceKey: "service" }),
  getAuthUserId: vi.fn(async () => null),
  getAuthUser: vi.fn(async () => null),
}));

const USER = "11111111-2222-3333-4444-555555555555";
function req(body) {
  return new Request("https://felpus.com/api/fotos/subir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/fotos/subir", () => {
  let POST;
  let getAuthUserId;
  beforeEach(async () => {
    permitir.mockReset().mockResolvedValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        const path = String(url).split("/felpus-photos/")[1];
        return new Response(JSON.stringify({ url: `/object/upload/sign/felpus-photos/${path}?token=TKN` }));
      })
    );
    ({ POST } = await import("./route"));
    ({ getAuthUserId } = await import("../../../../lib/serverAuth"));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("entrega un permiso para un nombre nuevo elegido por el servidor", async () => {
    const res = await POST(req({ prefijo: "170-abc-0", ext: "jpg" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBe("TKN");
    expect(data.path).toMatch(/^170-abc-0-[0-9a-f-]{36}\.jpg$/);
  });

  it("sin cupo: 429 y no pide nada a Storage", async () => {
    permitir.mockResolvedValueOnce(false);
    const res = await POST(req({ prefijo: "170-abc", ext: "jpg" }));
    expect(res.status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rechaza formatos y nombres no permitidos", async () => {
    expect((await POST(req({ prefijo: "170-abc", ext: "svg" }))).status).toBe(400);
    expect((await POST(req({ prefijo: "../otro", ext: "jpg" }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("foto de perfil: solo en la carpeta de la cuenta con sesión", async () => {
    expect((await POST(req({ prefijo: `avatars/${USER}/avatar`, ext: "jpg" }))).status).toBe(400);
    getAuthUserId.mockResolvedValueOnce(USER);
    expect((await POST(req({ prefijo: `avatars/${USER}/avatar`, ext: "jpg" }))).status).toBe(200);
  });

  it("la cuenta de Felpus no pasa por el cupo", async () => {
    const { getAuthUser } = await import("../../../../lib/serverAuth");
    getAuthUser.mockResolvedValueOnce({ id: "u1", email: "contacto.felpus@gmail.com" });
    permitir.mockResolvedValue(false);
    const r = new Request("https://felpus.com/api/fotos/subir", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
      body: JSON.stringify({ prefijo: "170-abc", ext: "jpg" }),
    });
    expect((await POST(r)).status).toBe(200);
    expect(permitir).not.toHaveBeenCalled();
  });

  it("rechaza pedidos de otros sitios", async () => {
    const r = new Request("https://felpus.com/api/fotos/subir", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://malo.com" },
      body: JSON.stringify({ prefijo: "170-abc", ext: "jpg" }),
    });
    expect((await POST(r)).status).toBe(403);
  });
});
