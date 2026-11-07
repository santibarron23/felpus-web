import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/log", () => ({ logError: vi.fn() }));
vi.mock("../../../../lib/serverAuth", () => ({
  supabaseServerEnv: () => ({ supabaseUrl: "https://s.supabase.co", serviceKey: "service" }),
  getAuthUserId: vi.fn(async () => null),
}));

const TOKEN = "11111111-2222-3333-4444-555555555555";
function req(body) {
  return new Request("https://felpus.com/api/reports/renew", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/reports/renew", () => {
  let POST;
  let getAuthUserId;
  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ id: "r1" }]), { status: 200 })));
    ({ POST } = await import("./route"));
    ({ getAuthUserId } = await import("../../../../lib/serverAuth"));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("con sesión Y token del dispositivo, acepta cualquiera de los dos", async () => {
    getAuthUserId.mockResolvedValueOnce("u1");
    const res = await POST(req({ reportId: "r1", pushToken: TOKEN }));
    expect(res.status).toBe(200);
    const url = decodeURIComponent(fetch.mock.calls[0][0]);
    expect(url).toContain(`or=(user_id.eq.u1,push_token.eq.${TOKEN})`);
    expect(url).toContain("resuelto=eq.false");
  });

  it("sin sesión ni token: 401 y no toca la base", async () => {
    const res = await POST(req({ reportId: "r1" }));
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("si no es tuyo (la base no devuelve filas): 403", async () => {
    fetch.mockResolvedValueOnce(new Response("[]", { status: 200 }));
    const res = await POST(req({ reportId: "r1", pushToken: TOKEN }));
    expect(res.status).toBe(403);
  });
});
