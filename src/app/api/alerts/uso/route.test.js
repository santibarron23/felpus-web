import { describe, it, expect, vi, beforeEach } from "vitest";

const { revisarUso, alertarAdmin } = vi.hoisted(() => ({
  revisarUso: vi.fn(),
  alertarAdmin: vi.fn(async () => ({ enviada: true })),
}));
vi.mock("../../../../lib/serverUsoSupabase", () => ({ revisarUso }));
vi.mock("../../../../lib/serverAdminAlerts", () => ({ alertarAdmin }));
const { POST } = await import("./route");

const req = (secret) =>
  new Request("http://localhost/api/alerts/uso", { method: "POST", headers: secret ? { "x-webhook-secret": secret } : {} });

describe("POST /api/alerts/uso", () => {
  beforeEach(() => {
    process.env.NOTIFY_WEBHOOK_SECRET = "s3creto";
    revisarUso.mockReset();
    alertarAdmin.mockClear();
  });

  it("sin el secreto no hace nada", async () => {
    expect((await POST(req())).status).toBe(401);
    expect(revisarUso).not.toHaveBeenCalled();
  });

  it("uso normal: no alerta", async () => {
    revisarUso.mockResolvedValue({ configurado: true, total: 300, alto: false });
    const res = await POST(req("s3creto"));
    expect(await res.json()).toMatchObject({ ok: true, total: 300 });
    expect(alertarAdmin).not.toHaveBeenCalled();
  });

  it("pico: manda la alerta", async () => {
    revisarUso.mockResolvedValue({ configurado: true, total: 90000, alto: true, alerta: { firma: "uso:logs", titulo: "t", detalle: "d" } });
    const res = await POST(req("s3creto"));
    expect(await res.json()).toMatchObject({ ok: true, alto: true, alertaEnviada: true });
    expect(alertarAdmin).toHaveBeenCalledWith({ firma: "uso:logs", titulo: "t", detalle: "d" });
  });

  it("si la API falla, responde 502 sin alertar", async () => {
    revisarUso.mockRejectedValue(new Error("Management API 401"));
    const res = await POST(req("s3creto"));
    expect(res.status).toBe(502);
    expect(alertarAdmin).not.toHaveBeenCalled();
  });
});
