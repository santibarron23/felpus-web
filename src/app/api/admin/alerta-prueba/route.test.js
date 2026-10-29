import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { alertarAdmin } = vi.hoisted(() => ({ alertarAdmin: vi.fn(async () => ({ enviada: true, canales: ["email"] })) }));
vi.mock("../../../../lib/serverAdminAlerts", () => ({ alertarAdmin }));
const { POST } = await import("./route");

function request(token = "tok") {
  return new Request("http://localhost/api/admin/alerta-prueba", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: "{}",
  });
}

describe("POST /api/admin/alerta-prueba", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    alertarAdmin.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  const stubUser = (email) => vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "u1", email })));

  it("solo el admin puede mandarla", async () => {
    stubUser("otra@persona.com");
    expect((await POST(request())).status).toBe(403);
    expect(alertarAdmin).not.toHaveBeenCalled();
  });

  it("el admin la manda", async () => {
    stubUser("santiagobarronlf@gmail.com");
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ enviada: true });
    expect(alertarAdmin.mock.calls[0][0]).toMatchObject({ firma: "prueba" });
  });
});
