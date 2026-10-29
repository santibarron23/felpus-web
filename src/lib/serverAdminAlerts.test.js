import { describe, it, expect, vi } from "vitest";
import { evaluarError, esRuido, esCritico, enviarAlertaAdmin, esFallaDePublicacion, firmaMensaje, SILENCIO_MIN } from "./serverAdminAlerts";

const UA = (n) => `Mozilla/5.0 navegador-${n}`;
const MIN = 60_000;

describe("evaluarError", () => {
  it("el listado que no carga por un error de la base avisa con el primero", () => {
    const e = { message: "No se pudieron cargar los reportes — permission denied for table reports — code 42501", user_agent: UA(1) };
    const a = evaluarError(e, [e]);
    expect(a.titulo).toBe("El listado de reportes no carga");
    expect(a.firma).toMatch(/^critico:/);
  });

  it("un corte de red de una persona no es crítico", () => {
    const e = { message: "No se pudieron cargar los reportes — TypeError: Failed to fetch", user_agent: UA(1) };
    expect(esCritico(e.message)).toBe(false);
    expect(evaluarError(e, [e])).toBeNull();
  });

  it("pico: el mismo error en 3 navegadores distintos", () => {
    const msg = "No se pudo cargar el ranking — algo raro 123";
    const recientes = [1, 2, 3].map((n) => ({ message: msg.replace("123", String(n)), user_agent: UA(n) }));
    expect(evaluarError(recientes[2], recientes).firma).toMatch(/^pico:/);
  });

  it("una sola persona repitiendo el error no es un pico", () => {
    const e = { message: "No se pudo cargar el ranking — algo raro", user_agent: UA(1) };
    expect(evaluarError(e, Array(10).fill(e))).toBeNull();
  });

  it("el ruido conocido nunca avisa, aunque sean muchos", () => {
    for (const m of [
      "Google Identity Services no expuso window.google.accounts.id",
      "No se pudo activar las notificaciones push — No diste permiso",
      "No se pudo cargar el contacto del reporte — Demasiadas consultas de contacto",
      "No se pudieron cargar los reportes — JWT issued at future — code PGRST303",
    ]) {
      expect(esRuido(m)).toBe(true);
      const rec = [1, 2, 3, 4].map((n) => ({ message: m, user_agent: UA(n) }));
      expect(evaluarError(rec[0], rec)).toBeNull();
    }
  });

  it("agrupa el mismo error aunque cambien números e ids", () => {
    expect(firmaMensaje("Loading chunk 734 failed")).toBe(firmaMensaje("Loading chunk 912 failed"));
  });
});

describe("esFallaDePublicacion", () => {
  it("los datos de la persona o el límite por hora no son fallas", () => {
    expect(esFallaDePublicacion({ code: "23514" })).toBe(false);
    expect(esFallaDePublicacion({ code: "P0001" })).toBe(false);
    expect(esFallaDePublicacion({ code: "42501" })).toBe(true);
    expect(esFallaDePublicacion(null)).toBe(false);
  });
});

describe("enviarAlertaAdmin", () => {
  const alerta = { firma: "salud:listado", titulo: "El listado no carga", detalle: "detalle" };
  function deps(over = {}) {
    const marcas = new Map();
    const db = {
      ultimaAlerta: vi.fn(async (f) => marcas.get(f) ?? null),
      marcarAlerta: vi.fn(async (f, now) => marcas.set(f, now)),
      sumarRepeticion: vi.fn(async () => {}),
      adminPushSubs: vi.fn(async () => [{ endpoint: "https://fcm.googleapis.com/fcm/send/x", p256dh: "k", auth: "a" }]),
    };
    return { db, sendEmail: vi.fn(async () => true), pusher: { send: vi.fn(async () => {}) }, adminEmail: "admin@felpus.test", ...over };
  }

  it("manda por email y push, y no repite la misma en 30 minutos", async () => {
    const d = deps();
    expect(await enviarAlertaAdmin(alerta, { ...d, now: 0 })).toMatchObject({ enviada: true, canales: ["email", "push"] });
    expect(d.sendEmail.mock.calls[0][0]).toMatchObject({ to: "admin@felpus.test", subject: "⚠️ Felpus: El listado no carga" });
    expect(d.pusher.send.mock.calls[0][1]).toMatchObject({ title: "⚠️ Felpus: El listado no carga" });

    expect(await enviarAlertaAdmin(alerta, { ...d, now: 10 * MIN })).toMatchObject({ enviada: false, motivo: "silencio" });
    expect(d.db.sumarRepeticion).toHaveBeenCalledWith("salud:listado");
    expect(d.sendEmail).toHaveBeenCalledTimes(1);

    expect((await enviarAlertaAdmin(alerta, { ...d, now: (SILENCIO_MIN + 1) * MIN })).enviada).toBe(true);
    expect(d.sendEmail).toHaveBeenCalledTimes(2);
  });

  it("sin la tabla (migración sin correr) igual avisa, con silencio en memoria", async () => {
    const d = deps();
    d.db.ultimaAlerta = vi.fn(async () => {
      throw new Error("Supabase 404");
    });
    const a = { ...alerta, firma: "sin-tabla" };
    expect((await enviarAlertaAdmin(a, { ...d, now: 0 })).enviada).toBe(true);
    expect((await enviarAlertaAdmin(a, { ...d, now: 5 * MIN })).enviada).toBe(false);
  });

  it("si falla el email igual manda el push, y nunca tira", async () => {
    const d = deps({ sendEmail: vi.fn(async () => { throw new Error("Resend 500"); }) });
    expect(await enviarAlertaAdmin({ ...alerta, firma: "x" }, { ...d, now: 0 })).toMatchObject({ enviada: true, canales: ["push"] });
    const roto = deps();
    roto.db.marcarAlerta = vi.fn(async () => { throw new Error("boom"); });
    await expect(enviarAlertaAdmin({ ...alerta, firma: "y" }, { ...roto, now: 0 })).resolves.toMatchObject({ enviada: false });
  });

  it("descarta suscripciones push de dominios no permitidos", async () => {
    const d = deps();
    d.db.adminPushSubs = vi.fn(async () => [{ endpoint: "https://evil.example/x", p256dh: "k", auth: "a" }]);
    await enviarAlertaAdmin({ ...alerta, firma: "z" }, { ...d, now: 0 });
    expect(d.pusher.send).not.toHaveBeenCalled();
  });
});
