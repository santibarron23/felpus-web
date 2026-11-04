import { describe, expect, it, vi } from "vitest";

vi.mock("./serverAdminAlerts", () => ({ alertarAdmin: vi.fn(async () => ({ enviada: true })) }));

const { ipParaLimite, clavesLimite, consultarLimite, makeWindowLimiter, avisarTopeGlobal } = await import("./serverRateLimit");
const { alertarAdmin } = await import("./serverAdminAlerts");
const { makeAiRateLimit } = await import("./serverAiRateLimit");
const { permitirPublicacion } = await import("../app/api/create-report/route");

const ENV = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("ipParaLimite", () => {
  it("deja igual una IPv4", () => {
    expect(ipParaLimite("200.45.1.2")).toBe("200.45.1.2");
  });
  it("agrupa IPv6 por bloque /64 (rotar dentro del bloque no da cupo nuevo)", () => {
    expect(ipParaLimite("2800:810:4a1:2b3::1")).toBe("2800:810:4a1:2b3::/64");
    expect(ipParaLimite("2800:0810:04a1:02b3:aaaa:bbbb:cccc:dddd")).toBe("2800:810:4a1:2b3::/64");
    expect(ipParaLimite("2800:810::5")).toBe("2800:810:0:0::/64");
    expect(ipParaLimite("2800:810:4a1:2b3:1::9")).toBe(ipParaLimite("2800:810:4a1:2b3:ffff::1"));
  });
  it("una IPv4 dentro de IPv6 cuenta como la IPv4", () => {
    expect(ipParaLimite("::ffff:200.45.1.2")).toBe("200.45.1.2");
  });
  it("sin IP usa un balde común", () => {
    expect(ipParaLimite("")).toBe("sin-ip");
    expect(ipParaLimite(null)).toBe("sin-ip");
  });
});

describe("clavesLimite", () => {
  it("sin sesión: IP + global", () => {
    expect(clavesLimite({ ip: "1.2.3.4" })).toEqual(["ip:1.2.3.4", "global"]);
  });
  it("con sesión: cuenta primero, IP con margen y global", () => {
    expect(clavesLimite({ ip: "1.2.3.4", userId: "u1" })).toEqual(["user:u1", "ipc:1.2.3.4", "global"]);
  });
});

describe("consultarLimite", () => {
  it("manda bucket, claves y ref a felpus_limite con la service key", async () => {
    const fetchImpl = vi.fn(async () => json(null));
    expect(await consultarLimite("contacto", ["ip:1.1.1.1"], { ref: "r1", env: ENV, fetchImpl })).toEqual({ estado: "ok" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://x.supabase.co/rest/v1/rpc/felpus_limite");
    expect(init.headers.Authorization).toBe("Bearer service");
    expect(JSON.parse(init.body)).toEqual({ p_bucket: "contacto", p_claves: ["ip:1.1.1.1"], p_ref: "r1" });
  });
  it("interpreta límite, función inexistente y errores", async () => {
    expect(await consultarLimite("ia", [], { env: ENV, fetchImpl: async () => json("global") })).toEqual({ estado: "limite", tipo: "global" });
    expect(await consultarLimite("ia", [], { env: ENV, fetchImpl: async () => json({}, 404) })).toEqual({ estado: "sin_funcion" });
    expect(await consultarLimite("ia", [], { env: ENV, fetchImpl: async () => json({}, 500) })).toEqual({ estado: "error" });
    expect(await consultarLimite("ia", [], { env: ENV, fetchImpl: async () => { throw new Error("red"); } })).toEqual({ estado: "error" });
    expect(await consultarLimite("ia", [], { env: {} })).toEqual({ estado: "error" });
  });
});

describe("makeWindowLimiter", () => {
  it("cuenta por clave dentro de la ventana", () => {
    const ok = makeWindowLimiter({ max: 2, windowMs: 1000 });
    expect(ok("a", 0)).toBe(true);
    expect(ok("a", 10)).toBe(true);
    expect(ok("a", 20)).toBe(false);
    expect(ok("b", 20)).toBe(true);
    expect(ok("a", 1500)).toBe(true);
  });
});

describe("avisarTopeGlobal", () => {
  it("avisa al admin una sola vez cada 10 minutos por tipo", async () => {
    vi.mocked(alertarAdmin).mockClear();
    await avisarTopeGlobal("prueba", ENV, 1_000_000);
    await avisarTopeGlobal("prueba", ENV, 1_000_000 + 60_000);
    expect(alertarAdmin).toHaveBeenCalledTimes(1);
    expect(vi.mocked(alertarAdmin).mock.calls[0][0].firma).toBe("limite-global:prueba");
    await avisarTopeGlobal("prueba", ENV, 1_000_000 + 11 * 60_000);
    expect(alertarAdmin).toHaveBeenCalledTimes(2);
  });
});

describe("makeAiRateLimit", () => {
  it("usa el cupo de la base (IP en /64 + global)", async () => {
    const fetchImpl = vi.fn(async () => json(null));
    const check = makeAiRateLimit({ env: ENV, fetchImpl });
    expect(await check("2800:810:4a1:2b3::77")).toBe(true);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ p_bucket: "ia", p_claves: ["ip:2800:810:4a1:2b3::/64", "global"], p_ref: null });
  });

  it("frena cuando la base dice que se pasó (y no filtra cuál)", async () => {
    const check = makeAiRateLimit({ env: ENV, fetchImpl: async () => json("ip") });
    expect(await check("1.1.1.1")).toBe(false);
  });

  it("sin la migración nueva usa la función vieja", async () => {
    const fetchImpl = vi.fn(async (url) => (url.endsWith("/felpus_limite") ? json({}, 404) : json(false)));
    const check = makeAiRateLimit({ env: ENV, fetchImpl });
    expect(await check("1.1.1.1")).toBe(false);
    expect(fetchImpl.mock.calls[1][0]).toMatch(/check_chat_rate_limit$/);
  });

  it("IA: si la base no responde ya no deja pasar todo (cupo chico por instancia)", async () => {
    const check = makeAiRateLimit({ env: ENV, fetchImpl: async () => json({}, 500), maxPerMinute: 100, instanceMaxPerMinute: 3 });
    const res = [];
    for (let i = 0; i < 5; i++) res.push(await check(`9.9.9.${i}`));
    expect(res).toEqual([true, true, true, false, false]);
  });

  it("fotos (failClosed: false): si la base no responde deja pasar", async () => {
    const check = makeAiRateLimit({ env: ENV, fetchImpl: async () => json({}, 500), bucket: "embed", failClosed: false, maxPerMinute: 100 });
    for (let i = 0; i < 30; i++) expect(await check(`8.8.8.${i}`)).toBe(true);
  });

  it("el respaldo en memoria frena una ráfaga de la misma IP sin ir a la base", async () => {
    const fetchImpl = vi.fn(async () => json(null));
    const check = makeAiRateLimit({ env: ENV, fetchImpl, maxPerMinute: 2 });
    expect(await check("7.7.7.7")).toBe(true);
    expect(await check("7.7.7.7")).toBe(true);
    expect(await check("7.7.7.7")).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("permitirPublicacion (create-report)", () => {
  const supabaseQueNoSeUsa = { from: () => { throw new Error("no debería usarse"); } };

  it("con la migración: deja publicar o frena según la base, con claves por cuenta si hay sesión", async () => {
    const consultar = vi.fn(async () => ({ estado: "ok" }));
    expect(await permitirPublicacion(supabaseQueNoSeUsa, "1.2.3.4", "u1", { consultar })).toBe(true);
    expect(consultar).toHaveBeenCalledWith("reporte", ["user:u1", "ipc:1.2.3.4", "global"]);
    expect(await permitirPublicacion(supabaseQueNoSeUsa, "1.2.3.4", null, { consultar: async () => ({ estado: "limite", tipo: "ip" }) })).toBe(false);
  });

  it("si la base falla deja publicar, pero con un respaldo en memoria por IP", async () => {
    const consultar = async () => ({ estado: "error" });
    const res = [];
    for (let i = 0; i < 10; i++) res.push(await permitirPublicacion(supabaseQueNoSeUsa, "5.5.5.123", null, { consultar }));
    expect(res.filter(Boolean)).toHaveLength(8);
  });

  it("sin la migración usa report_submissions; si esa consulta falla, el respaldo en memoria", async () => {
    const chain = {
      delete: () => chain,
      lt: async () => ({}),
      select: () => chain,
      eq: () => chain,
      gt: async () => ({ count: null, error: { message: "relation does not exist" } }),
      insert: async () => ({}),
    };
    const supabase = { from: () => chain };
    expect(await permitirPublicacion(supabase, "6.6.6.6", null, { consultar: async () => ({ estado: "sin_funcion" }) })).toBe(true);
  });
});
