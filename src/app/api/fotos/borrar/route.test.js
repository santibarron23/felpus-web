import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/log", () => ({ logError: vi.fn() }));
vi.mock("../../../../lib/serverAuth", () => ({
  supabaseServerEnv: () => ({ supabaseUrl: "https://s.supabase.co", serviceKey: "service" }),
  getAuthUserId: vi.fn(async () => null),
}));

const USER = "11111111-2222-3333-4444-555555555555";
const TOKEN = "aaaaaaaa-2222-3333-4444-555555555555";
const BASE = "https://s.supabase.co/storage/v1/object/public/felpus-photos/";
function req(body) {
  return new Request("https://felpus.com/api/fotos/borrar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const borrados = () =>
  fetch.mock.calls.filter(([, init]) => init?.method === "DELETE").flatMap(([, init]) => JSON.parse(init.body).prefixes);

describe("POST /api/fotos/borrar", () => {
  let POST;
  let getAuthUserId;
  let filas;
  beforeEach(async () => {
    filas = [{ id: "170-abc" }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => (init?.method === "DELETE" ? new Response("[]") : new Response(JSON.stringify(filas))))
    );
    ({ POST } = await import("./route"));
    ({ getAuthUserId } = await import("../../../../lib/serverAuth"));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("borra solo las fotos de ese aviso, si es del que pide", async () => {
    getAuthUserId.mockResolvedValueOnce(USER);
    const urls = [`${BASE}170-abc-0-u.jpg`, `${BASE}999-ajeno-0-u.jpg`, `${BASE}avatars/${USER}/avatar-u.jpg`];
    const res = await POST(req({ reportId: "170-abc", urls }));
    expect(res.status).toBe(200);
    expect(borrados()).toEqual(["170-abc-0-u.jpg"]);
    expect(decodeURIComponent(fetch.mock.calls[0][0])).toContain(`or=(user_id.eq.${USER})`);
  });

  it("invitado con el token del dispositivo también puede", async () => {
    const res = await POST(req({ reportId: "170-abc", pushToken: TOKEN, urls: [`${BASE}170-abc-u.jpg`] }));
    expect(res.status).toBe(200);
    expect(borrados()).toEqual(["170-abc-u.jpg"]);
  });

  it("si el aviso no es suyo: 403 y no borra nada", async () => {
    filas = [];
    getAuthUserId.mockResolvedValueOnce(USER);
    const res = await POST(req({ reportId: "170-abc", urls: [`${BASE}170-abc-u.jpg`] }));
    expect(res.status).toBe(403);
    expect(borrados()).toEqual([]);
  });

  it("sin sesión ni token: 401", async () => {
    const res = await POST(req({ reportId: "170-abc", urls: [`${BASE}170-abc-u.jpg`] }));
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("foto de perfil: solo la propia", async () => {
    getAuthUserId.mockResolvedValue(USER);
    await POST(req({ avatarUrl: `${BASE}avatars/99999999-2222-3333-4444-555555555555/avatar-u.jpg` }));
    expect(borrados()).toEqual([]);
    await POST(req({ avatarUrl: `${BASE}avatars/${USER}/avatar-u.jpg` }));
    expect(borrados()).toEqual([`avatars/${USER}/avatar-u.jpg`]);
    getAuthUserId.mockReset().mockResolvedValue(null);
  });
});
