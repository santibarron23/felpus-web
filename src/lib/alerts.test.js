import { describe, it, expect, vi } from "vitest";
import {
  matchThresholds,
  classifyMatch,
  isQuietHours,
  argentinaDayStartIso,
  roundedDistance,
  matchNotification,
  zoneNotification,
  isMatchCandidate,
  inactivityAction,
  normalizeZoneInput,
  normalizePushSubscription,
} from "./alerts";
import { dispatchNewReport, flushPending } from "./alertsServer";

const NOW = new Date("2026-10-20T15:00:00Z"); // 12:00 en Argentina
const NIGHT = new Date("2026-10-21T04:00:00Z"); // 01:00 en Argentina
const hoy = "2026-10-20";

function report(over = {}) {
  return {
    id: "r-nuevo",
    tipo: "perdida",
    especie: "perro",
    nombre: "Luna",
    color: "Marrón",
    color_otro: "",
    tamano: "chico",
    sexo: "Hembra",
    zona: "Tres Cerritos",
    lat: -24.77,
    lng: -65.4,
    fecha: hoy,
    creado_en: NOW.toISOString(),
    descripcion: "Perrita marrón con collar rosa",
    user_id: "u-autor",
    resuelto: false,
    push_subscription: null,
    ...over,
  };
}

describe("umbrales y clasificación", () => {
  it("toma los valores de las variables de entorno, con los del plan por defecto", () => {
    expect(matchThresholds({})).toEqual({ high: 0.8, mid: 0.65 });
    expect(matchThresholds({ MATCH_THRESHOLD_HIGH: "0.7", MATCH_THRESHOLD_MID: "0.5" })).toEqual({ high: 0.7, mid: 0.5 });
    expect(matchThresholds({ MATCH_THRESHOLD_HIGH: "abc", MATCH_THRESHOLD_MID: "2" })).toEqual({ high: 0.8, mid: 0.65 });
  });
  it("alta / media / nada", () => {
    const t = { high: 0.8, mid: 0.65 };
    expect(classifyMatch(0.85, t)).toBe("alta");
    expect(classifyMatch(0.7, t)).toBe("media");
    expect(classifyMatch(0.5, t)).toBeNull();
  });
});

describe("horario y día en Argentina", () => {
  it("silencio de 23 a 8", () => {
    expect(isQuietHours(NOW)).toBe(false);
    expect(isQuietHours(NIGHT)).toBe(true);
    expect(isQuietHours(new Date("2026-10-21T02:30:00Z"))).toBe(true); // 23:30
    expect(isQuietHours(new Date("2026-10-21T11:00:00Z"))).toBe(false); // 08:00
  });
  it("inicio del día argentino", () => {
    expect(argentinaDayStartIso(NOW)).toBe("2026-10-20T03:00:00.000Z");
    expect(argentinaDayStartIso(NIGHT)).toBe("2026-10-21T03:00:00.000Z");
  });
});

describe("textos", () => {
  it("distancia siempre redondeada", () => {
    expect(roundedDistance(0.3)).toBe("a menos de 1 km");
    expect(roundedDistance(2.4)).toBe("a 2 km");
    expect(roundedDistance(null)).toBe("");
  });
  it("match: el del plan, sin datos personales", () => {
    const n = matchNotification({ recipientReport: report(), otherReport: report({ id: "r-otro", tipo: "encontrada", lat: -24.78, lng: -65.41 }), siteUrl: "https://felpus.com" });
    expect(n.title).toBe("🐾 Puede ser tu mascota");
    expect(n.body).toBe("Reportaron un perro parecido a Luna a 2 km. Tocá para verlo.");
    expect(n.url).toBe("https://felpus.com/r/r-otro");
    expect(matchNotification({ recipientReport: report({ nombre: "" }), otherReport: report({ id: "x", lat: null }) }).body).toBe(
      "Reportaron un perro parecido a tu mascota. Tocá para verlo."
    );
  });
  it("zona: perdido y encontrado", () => {
    expect(zoneNotification({ report: report(), distanceM: 2300 })).toMatchObject({
      title: "Se perdió un perro cerca tuyo",
      body: "Marrón, chico, a 2 km. Si lo ves, avisá en Felpus.",
    });
    expect(zoneNotification({ report: report({ tipo: "encontrada", especie: "gato", color: "Otro color", color_otro: "Naranja" }), distanceM: 500 })).toMatchObject({
      title: "Encontraron un gato cerca tuyo",
      body: "Naranja, chico, a menos de 1 km. ¿Lo conocés?",
    });
  });
});

describe("candidatos y ciclo de vida", () => {
  const nuevo = report();
  it("tipo opuesto, misma especie, activo, 45 días, 15 km", () => {
    const base = report({ id: "c", tipo: "encontrada" });
    expect(isMatchCandidate(nuevo, base, NOW.getTime())).toBe(true);
    expect(isMatchCandidate(nuevo, { ...base, tipo: "perdida" }, NOW.getTime())).toBe(false);
    expect(isMatchCandidate(nuevo, { ...base, especie: "gato" }, NOW.getTime())).toBe(false);
    expect(isMatchCandidate(nuevo, { ...base, resuelto: true }, NOW.getTime())).toBe(false);
    expect(isMatchCandidate(nuevo, { ...base, inactivo: true }, NOW.getTime())).toBe(false);
    expect(isMatchCandidate(nuevo, { ...base, fecha: "2026-08-01" }, NOW.getTime())).toBe(false);
    expect(isMatchCandidate(nuevo, { ...base, lat: -24.6, lng: -65.4 }, NOW.getTime())).toBe(false); // ~19 km
    expect(isMatchCandidate(nuevo, { ...base, lat: null, lng: null }, NOW.getTime())).toBe(true); // sin punto: decide el matcher
  });
  it("aviso 7 días antes y pasa a inactivo a los 60", () => {
    const d = (days) => new Date(NOW.getTime() - days * 86400000).toISOString();
    expect(inactivityAction({ actividad_en: d(10) }, NOW.getTime())).toBeNull();
    expect(inactivityAction({ actividad_en: d(54) }, NOW.getTime())).toBe("avisar");
    expect(inactivityAction({ actividad_en: d(54), aviso_inactividad_en: d(1) }, NOW.getTime())).toBeNull();
    expect(inactivityAction({ actividad_en: d(61) }, NOW.getTime())).toBe("inactivar");
    expect(inactivityAction({ actividad_en: d(61), resuelto: true }, NOW.getTime())).toBeNull();
  });
});

describe("validación de entradas", () => {
  it("zona", () => {
    expect(normalizeZoneInput({ lat: -24.7, lng: -65.4, radius_m: 3000, species: ["perro", "loro"], report_types: ["perdida"] }).zone).toEqual({
      lat: -24.7, lng: -65.4, radius_m: 3000, species: ["perro"], report_types: ["perdida"], active: true,
    });
    expect(normalizeZoneInput({ lat: -24.7, lng: -65.4, radius_m: 2000, species: ["perro"], report_types: ["perdida"] }).error).toMatch(/radio/);
    expect(normalizeZoneInput({ lat: 200, lng: 0 }).error).toMatch(/mapa/);
    expect(normalizeZoneInput({ lat: 1, lng: 1, radius_m: 1000, species: [], report_types: ["perdida"] }).error).toMatch(/especie/);
  });
  it("suscripción push", () => {
    expect(normalizePushSubscription({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "a", auth: "b" } })).toEqual({
      endpoint: "https://fcm.googleapis.com/x", p256dh: "a", auth: "b",
    });
    expect(normalizePushSubscription({ endpoint: "http://inseguro", keys: { p256dh: "a", auth: "b" } })).toBeNull();
    expect(normalizePushSubscription(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Despacho completo con una base y un web-push falsos.
// ---------------------------------------------------------------------------
function fakeDeps({ candidates = [], zones = [], subs = {}, zoneCount = 0, existingMatches = [], pending = [], reports = {}, lifecycle = [] } = {}) {
  const log = [];
  const matches = new Set(existingMatches);
  const sent = [];
  const deleted = [];
  const db = {
    getCandidates: vi.fn(async () => candidates),
    insertMatch: vi.fn(async ({ lostId, foundId }) => {
      const k = `${lostId}|${foundId}`;
      if (matches.has(k)) return false;
      matches.add(k);
      return true;
    }),
    getUserSubs: vi.fn(async (userId) => subs[userId] || []),
    deleteSub: vi.fn(async (endpoint) => deleted.push(endpoint)),
    clearReportSub: vi.fn(async () => {}),
    logNotification: vi.fn(async (row) => {
      if (log.some((l) => l.recipient === row.recipient && l.report_id === row.report_id && l.kind === row.kind)) return false;
      log.push(row);
      return true;
    }),
    markSent: vi.fn(async () => {}),
    zoneRecipients: vi.fn(async () => zones),
    countZoneSince: vi.fn(async () => zoneCount),
    pendingZone: vi.fn(async () => pending),
    getReport: vi.fn(async (id) => reports[id] || null),
    lifecycleCandidates: vi.fn(async () => lifecycle),
    setAvisoInactividad: vi.fn(async () => {}),
    setInactivo: vi.fn(async () => {}),
  };
  const push = {
    send: vi.fn(async (sub, payload) => {
      if (sub.endpoint.includes("vencida")) {
        const e = new Error("gone");
        e.statusCode = 410;
        throw e;
      }
      sent.push({ endpoint: sub.endpoint, payload });
    }),
  };
  return { db, push, log, sent, deleted, matches, deps: { db, push, now: NOW, thresholds: { high: 0.8, mid: 0.65 }, siteUrl: "https://felpus.com", log: () => {} } };
}

const sub = (name) => ({ endpoint: `https://push.example/${name}`, p256dh: "k", auth: "a" });
// Encontrado casi idéntico al perdido nuevo (score alto) y del mismo barrio.
const gemelo = report({ id: "r-encontrado", tipo: "encontrada", user_id: "u-otro", nombre: "", lat: -24.771, lng: -65.401 });

describe("dispatchNewReport", () => {
  it("match alto: guarda el par y avisa a los dos dueños (todos sus dispositivos)", async () => {
    const f = fakeDeps({ candidates: [gemelo], subs: { "u-autor": [sub("autor-cel"), sub("autor-pc")], "u-otro": [sub("otro-cel")] } });
    const r = await dispatchNewReport(report(), f.deps);
    expect(r.matches).toBe(1);
    expect(f.matches.has("r-nuevo|r-encontrado")).toBe(true);
    expect(f.sent.map((s) => s.endpoint).sort()).toEqual(["https://push.example/autor-cel", "https://push.example/autor-pc", "https://push.example/otro-cel"]);
    const toOtro = f.sent.find((s) => s.endpoint.endsWith("otro-cel")).payload;
    expect(toOtro.title).toBe("🐾 Puede ser tu mascota");
    expect(toOtro.url).toBe("https://felpus.com/r/r-nuevo");
  });

  it("no vuelve a avisar por un par que ya existe (por ejemplo, descartado)", async () => {
    const f = fakeDeps({ candidates: [gemelo], existingMatches: ["r-nuevo|r-encontrado"], subs: { "u-otro": [sub("otro-cel")] } });
    await dispatchNewReport(report(), f.deps);
    expect(f.sent).toHaveLength(0);
  });

  it("invitado: avisa por la suscripción del propio reporte", async () => {
    const invitado = { ...gemelo, user_id: null, push_subscription: { endpoint: "https://push.example/invitado", keys: { p256dh: "k", auth: "a" } } };
    const f = fakeDeps({ candidates: [invitado] });
    await dispatchNewReport(report(), f.deps);
    expect(f.sent.map((s) => s.endpoint)).toContain("https://push.example/invitado");
  });

  it("match medio: se guarda sin push", async () => {
    const parecido = { ...gemelo, color: "Negro", tamano: "grande", sexo: "Macho" };
    const f = fakeDeps({ candidates: [parecido], subs: { "u-otro": [sub("otro-cel")] } });
    f.deps.thresholds = { high: 0.99, mid: 0.05 };
    const r = await dispatchNewReport(report(), f.deps);
    expect(r.matches).toBe(1);
    expect(f.sent).toHaveLength(0);
  });

  it("zona: avisa, excluye al autor y a quien ya recibió el match, respeta el tope diario", async () => {
    const f = fakeDeps({
      candidates: [gemelo],
      zones: [{ user_id: "u-vecino", distance_m: 1800 }, { user_id: "u-autor", distance_m: 0 }, { user_id: "u-otro", distance_m: 100 }],
      subs: { "u-vecino": [sub("vecino")], "u-otro": [sub("otro-cel")] },
    });
    const r = await dispatchNewReport(report(), f.deps);
    expect(r.zoneSent).toBe(1);
    const zona = f.sent.find((s) => s.endpoint.endsWith("vecino")).payload;
    expect(zona.title).toBe("Se perdió un perro cerca tuyo");
    expect(f.log.filter((l) => l.kind === "zona").map((l) => l.user_id)).toEqual(["u-vecino"]);

    const lleno = fakeDeps({ zones: [{ user_id: "u-vecino", distance_m: 1800 }], subs: { "u-vecino": [sub("vecino")] }, zoneCount: 5 });
    expect((await dispatchNewReport(report(), lleno.deps)).zoneSent).toBe(0);
  });

  it("de noche la alerta de zona queda pendiente; repetir no duplica", async () => {
    const f = fakeDeps({ zones: [{ user_id: "u-vecino", distance_m: 1800 }], subs: { "u-vecino": [sub("vecino")] } });
    f.deps.now = NIGHT;
    const r = await dispatchNewReport(report(), f.deps);
    expect(r.zonePending).toBe(1);
    expect(f.sent).toHaveLength(0);
    await dispatchNewReport(report(), f.deps);
    expect(f.log.filter((l) => l.kind === "zona")).toHaveLength(1);
  });

  it("suscripción vencida (410) se borra", async () => {
    const f = fakeDeps({ zones: [{ user_id: "u-vecino", distance_m: 1800 }], subs: { "u-vecino": [sub("vencida")] } });
    await dispatchNewReport(report(), f.deps);
    expect(f.deleted).toEqual(["https://push.example/vencida"]);
  });

  it("un reporte reencontrado, oculto o inactivo no genera alertas", async () => {
    for (const extra of [{ resuelto: true }, { oculto: true }, { inactivo: true }]) {
      const f = fakeDeps({ candidates: [gemelo], zones: [{ user_id: "u-vecino", distance_m: 1 }], subs: { "u-vecino": [sub("v")] } });
      await dispatchNewReport(report(extra), f.deps);
      expect(f.db.getCandidates).not.toHaveBeenCalled();
      expect(f.sent).toHaveLength(0);
    }
  });
});

describe("flushPending (tarea de las 8:00)", () => {
  it("manda las pendientes, omite las viejas y las de reportes ya resueltos", async () => {
    const at8 = new Date("2026-10-21T11:05:00Z");
    const f = fakeDeps({
      subs: { "u-vecino": [sub("vecino")] },
      reports: { "r-1": report({ id: "r-1" }), "r-2": report({ id: "r-2", resuelto: true }) },
      pending: [
        { id: 1, user_id: "u-vecino", report_id: "r-1", payload: { title: "t" }, created_at: "2026-10-21T04:00:00Z" },
        { id: 2, user_id: "u-vecino", report_id: "r-2", payload: { title: "t" }, created_at: "2026-10-21T04:00:00Z" },
        { id: 3, user_id: "u-vecino", report_id: "r-1", payload: { title: "t" }, created_at: "2026-10-19T04:00:00Z" },
      ],
    });
    f.deps.now = at8;
    const r = await flushPending(f.deps);
    expect(r.zoneSent).toBe(1);
    expect(r.skipped).toBe(2);
  });
  it("ciclo de vida: avisa y pasa a inactivo", async () => {
    const d = (days) => new Date(NOW.getTime() - days * 86400000).toISOString();
    const f = fakeDeps({
      subs: { "u-autor": [sub("autor")] },
      lifecycle: [report({ id: "viejo", actividad_en: d(61) }), report({ id: "por-vencer", actividad_en: d(55) })],
    });
    const r = await flushPending(f.deps);
    expect(r.inactivated).toBe(1);
    expect(r.warned).toBe(1);
    expect(f.db.setInactivo).toHaveBeenCalledWith("viejo");
    expect(f.sent[0].payload.title).toBe("¿Seguís buscando?");
  });
});
