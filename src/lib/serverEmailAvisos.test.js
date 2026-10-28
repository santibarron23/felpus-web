import { describe, it, expect, vi } from "vitest";
import { firmarAviso, verificarAviso, linkSecret, avisoUrls, makeEmailSender, enviarSeguimientos } from "./serverEmailAvisos";

const SECRET = linkSecret({ SUPABASE_SERVICE_ROLE_KEY: "clave-de-prueba" });
const NOW = Date.UTC(2026, 9, 28, 12);

describe("links firmados", () => {
  it("firma y verifica el mismo reporte", () => {
    const t = firmarAviso("1792685777000-urnffd", SECRET, NOW);
    expect(verificarAviso(t, SECRET, NOW)).toBe("1792685777000-urnffd");
  });

  it("rechaza tokens alterados, de otra clave o vencidos", () => {
    const t = firmarAviso("abc-1", SECRET, NOW);
    const [id, vence, sig] = t.split(".");
    expect(verificarAviso(`otro-2.${vence}.${sig}`, SECRET, NOW)).toBeNull();
    expect(verificarAviso(`${id}.${vence}.${sig.slice(0, -1)}x`, SECRET, NOW)).toBeNull();
    expect(verificarAviso(t, linkSecret({ SUPABASE_SERVICE_ROLE_KEY: "otra" }), NOW)).toBeNull();
    expect(verificarAviso(t, SECRET, NOW + 61 * 864e5)).toBeNull();
    expect(verificarAviso("basura", SECRET, NOW)).toBeNull();
    expect(verificarAviso(null, SECRET, NOW)).toBeNull();
  });

  it("sin clave no firma", () => {
    expect(firmarAviso("abc-1", null)).toBeNull();
    expect(linkSecret({})).toBeNull();
  });

  it("urls: la de acción abre la página; la baja en un clic va a la API", () => {
    const u = avisoUrls("https://felpus.com", "a.b.c");
    expect(u.accionUrl).toBe("https://felpus.com/aviso?t=a.b.c");
    expect(u.unsubscribePostUrl).toBe("https://felpus.com/api/aviso?t=a.b.c&accion=baja");
  });
});

describe("makeEmailSender", () => {
  it("sin RESEND_API_KEY, apagado", () => {
    expect(makeEmailSender({})).toBeNull();
  });

  it("manda desde avisos@felpus.com, responde a Gmail y agrega la baja en un clic", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    const send = makeEmailSender({ RESEND_API_KEY: "re_x" }, fetchImpl);
    await send({ to: "a@b.com", subject: "s", html: "<p>h</p>", text: "t", unsubscribeUrl: "https://felpus.com/api/aviso?t=x&accion=baja" });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.from).toBe("Felpus <avisos@felpus.com>");
    expect(body.reply_to).toBe("contacto.felpus@gmail.com");
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});

describe("enviarSeguimientos", () => {
  const due = (id) => ({ id, tipo: "perdida", especie: "perro", nombre: "Luna", zona: "Centro", contacto_email: `${id}@mail.com`, avisos_email: true, resuelto: false, inactivo: false, creado_en: new Date(NOW - 40 * 864e5).toISOString(), actividad_en: new Date(NOW - 40 * 864e5).toISOString() });
  const makeDb = (rows, yaEnviados = 0) => ({
    countEmailsSince: vi.fn(async () => yaEnviados),
    seguimientoCandidates: vi.fn(async () => rows),
    markSeguimiento: vi.fn(async () => {}),
    logEmail: vi.fn(async () => {}),
  });

  it("manda a los que corresponden y los marca", async () => {
    const db = makeDb([due("a"), { ...due("b"), actividad_en: new Date(NOW - 2 * 864e5).toISOString() }]);
    const send = vi.fn(async () => true);
    const s = await enviarSeguimientos({ db, send, secret: SECRET, siteUrl: "https://felpus.com", now: new Date(NOW) });
    expect(s).toMatchObject({ enviados: 1, pendientes: 0 });
    expect(send.mock.calls[0][0].to).toBe("a@mail.com");
    expect(db.markSeguimiento).toHaveBeenCalledWith("a", new Date(NOW).toISOString());
    expect(db.logEmail).toHaveBeenCalledWith(expect.objectContaining({ reportId: "a", kind: "email_seguimiento" }));
  });

  it("respeta el tope diario: lo que sobra queda para mañana", async () => {
    const db = makeDb([due("a"), due("b"), due("c")], 78);
    const send = vi.fn(async () => true);
    const s = await enviarSeguimientos({ db, send, secret: SECRET, siteUrl: "https://felpus.com", now: new Date(NOW) });
    expect(s).toMatchObject({ enviados: 2, pendientes: 1 });
  });

  it("si un envío falla, no lo marca y sigue con el resto", async () => {
    const db = makeDb([due("a"), due("b")]);
    const send = vi.fn().mockRejectedValueOnce(new Error("Resend 500")).mockResolvedValueOnce(true);
    const s = await enviarSeguimientos({ db, send, secret: SECRET, siteUrl: "https://felpus.com", now: new Date(NOW) });
    expect(s).toMatchObject({ enviados: 1, errores: 1 });
    expect(db.markSeguimiento).toHaveBeenCalledTimes(1);
  });

  it("sin Resend o sin clave, apagado", async () => {
    expect(await enviarSeguimientos({ db: makeDb([]), send: null, secret: SECRET, siteUrl: "x" })).toMatchObject({ apagado: true });
  });
});
