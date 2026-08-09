import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.hoisted: el mock necesita existir ANTES de que vi.mock("./supabaseClient")
// corra (vitest lo hoistea al tope del archivo), así que no puede ser una
// variable normal declarada más abajo — vi.hoisted es el escape hatch para eso.
const { supabaseMock } = vi.hoisted(() => {
  const supabaseMock = {
    from: vi.fn(),
    rpc: vi.fn(),
    storage: { from: vi.fn() },
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null } })) },
  };
  return { supabaseMock };
});

vi.mock("./supabaseClient", () => ({ supabase: supabaseMock }));

const {
  fetchReports,
  createReport,
  resolveReports,
  fetchReportContact,
  flagReport,
  awardPoints,
  bumpStreak,
  fetchProfile,
  updateProfile,
  fetchSavedReportIds,
  saveReport,
  unsaveReport,
} = await import("./store");

// Imita el query builder encadenable de supabase-js: cada método de la
// cadena (.select/.eq/.order/...) devuelve el mismo objeto, y el objeto es
// "thenable" (tiene .then) para que un simple `await` al final de la cadena
// resuelva `result` — igual que el cliente real, sin tener que simular cada
// método del SDK completo.
function makeBuilder(result) {
  const builder = {};
  ["select", "insert", "update", "delete", "upsert", "eq", "neq", "gt", "in", "order", "limit"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function missingColumnError(columnName) {
  return { code: "42703", message: `column reports.${columnName} does not exist` };
}

function missingFunctionError() {
  return { code: "PGRST202", message: "Could not find the function public.get_report_contact(p_report_id) in the schema cache" };
}

function missingTableError(table) {
  return { code: "PGRST205", message: `Could not find the table 'public.${table}' in the schema cache` };
}

beforeEach(() => {
  supabaseMock.from.mockReset();
  supabaseMock.rpc.mockReset();
  supabaseMock.storage.from.mockReset();
  supabaseMock.auth.getSession.mockReset().mockResolvedValue({ data: { session: null } });
  // Mocks por defecto de Storage — createReport() siempre pasa por acá
  // (uploadPhoto), así que sin esto cada test de createReport tendría que
  // repetirlo.
  supabaseMock.storage.from.mockReturnValue({
    upload: vi.fn(() => Promise.resolve({ error: null })),
    getPublicUrl: vi.fn((path) => ({ data: { publicUrl: `https://fake.supabase.co/${path}` } })),
    remove: vi.fn(() => Promise.resolve({ error: null })),
  });
  // createReport() usa fetch() para dos cosas distintas: bajar el Blob de
  // cada foto (dataUrl) vía uploadPhoto, y ahora también para publicar de
  // verdad (POST a /api/create-report, ver hallazgo de auditoría de
  // seguridad más abajo) — este mock por defecto cubre las dos, así que
  // los tests que no les importa el segundo no tienen que repetirlo.
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      if (typeof url === "string" && url.startsWith("data:")) {
        return Promise.resolve({ blob: () => Promise.resolve(new Blob(["x"], { type: "image/jpeg" })) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function baseRow(overrides = {}) {
  return {
    id: "r1",
    tipo: "perdida",
    especie: "perro",
    raza: "Labrador",
    detalles: { accesorios: ["collar"] },
    nombre: "Rocky",
    color: "Negro",
    color_otro: null,
    tamano: "mediano",
    sexo: "Macho",
    edad: "",
    peso: "",
    zona: "Palermo",
    lat: -34.5,
    lng: -58.4,
    fecha: "2026-08-01",
    descripcion: "Perro negro",
    foto_url: "https://fake/foto.jpg",
    hist: null,
    embedding: null,
    foto_urls: null,
    hists: null,
    embeddings: null,
    nickname: "Vecina",
    resuelto: false,
    resuelto_por: null,
    resuelto_por_user_id: null,
    resuelto_en: null,
    creado_en: "2026-08-01T00:00:00Z",
    user_id: null,
    ...overrides,
  };
}

// -----------------------------------------------------------------------
// El fallback de columnas opcionales (raza/detalles) es exactamente la
// lógica que la sesión de hoy señaló como "la más fácil de romper sin
// darse cuenta": si algún día se agrega una tercera columna opcional, o se
// toca reportListColumns/missingOptionalColumn, estos tests deberían
// avisar antes de que llegue a producción.
// -----------------------------------------------------------------------
describe("fetchReports", () => {
  it("con las dos columnas opcionales disponibles, pide todo en un solo intento", async () => {
    supabaseMock.from.mockReturnValueOnce(makeBuilder({ data: [baseRow()], error: null }));
    const result = await fetchReports();
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "r1", raza: "Labrador", detalles: { accesorios: ["collar"] } });
  });

  it("si falta la columna 'raza', reintenta sin ella y de ahí en más funciona", async () => {
    supabaseMock.from
      .mockReturnValueOnce(makeBuilder({ data: null, error: missingColumnError("raza") }))
      .mockReturnValueOnce(makeBuilder({ data: [baseRow({ raza: undefined })], error: null }));
    const result = await fetchReports();
    expect(supabaseMock.from).toHaveBeenCalledTimes(2);
    // rowToReport pone "" cuando la fila no trae raza (columna no existe todavía)
    expect(result[0].raza).toBe("");
  });

  it("con ciudad/provincia disponibles, las mapea al reporte", async () => {
    supabaseMock.from.mockReturnValueOnce(
      makeBuilder({ data: [baseRow({ ciudad: "Salta", provincia: "Salta" })], error: null })
    );
    const result = await fetchReports();
    expect(result[0]).toMatchObject({ ciudad: "Salta", provincia: "Salta" });
  });

  it("si falta la columna 'ciudad' (migración no corrida), reintenta sin ella y de ahí en más funciona", async () => {
    supabaseMock.from
      .mockReturnValueOnce(makeBuilder({ data: null, error: missingColumnError("ciudad") }))
      .mockReturnValueOnce(makeBuilder({ data: [baseRow({ ciudad: undefined, provincia: undefined })], error: null }));
    const result = await fetchReports();
    expect(supabaseMock.from).toHaveBeenCalledTimes(2);
    expect(result[0].ciudad).toBe("");
    expect(result[0].provincia).toBe("");
  });

  it("si faltan 'raza' Y 'detalles', reintenta hasta 3 veces y termina funcionando", async () => {
    supabaseMock.from
      .mockReturnValueOnce(makeBuilder({ data: null, error: missingColumnError("raza") }))
      .mockReturnValueOnce(makeBuilder({ data: null, error: missingColumnError("detalles") }))
      .mockReturnValueOnce(makeBuilder({ data: [baseRow({ raza: undefined, detalles: undefined })], error: null }));
    const result = await fetchReports();
    expect(supabaseMock.from).toHaveBeenCalledTimes(3);
    expect(result[0].raza).toBe("");
    expect(result[0].detalles).toEqual({});
  });

  it("un error que NO es de columna faltante se propaga de inmediato, sin reintentar", async () => {
    const networkError = { code: "500", message: "Internal Server Error" };
    supabaseMock.from.mockReturnValueOnce(makeBuilder({ data: null, error: networkError }));
    await expect(fetchReports()).rejects.toBe(networkError);
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });

  it("con la lista vacía, no rompe (devuelve array vacío)", async () => {
    supabaseMock.from.mockReturnValueOnce(makeBuilder({ data: [], error: null }));
    expect(await fetchReports()).toEqual([]);
  });
});

describe("createReport", () => {
  const draft = {
    id: "new1",
    tipo: "encontrada",
    especie: "gato",
    raza: "Siamés",
    detalles: { accesorios: ["collar"] },
    nombre: "",
    color: "Blanco",
    colorOtro: "",
    tamano: "chico",
    sexo: "Hembra",
    edad: "",
    peso: "",
    zona: "Recoleta",
    ciudad: "Buenos Aires",
    provincia: "Buenos Aires",
    lat: null,
    lng: null,
    fecha: "2026-08-05",
    descripcion: "Gata blanca",
    contactoWhatsapp: "",
    contactoEmail: "",
    fotos: [{ dataUrl: "data:image/jpeg;base64,AAAA", hist: null, embedding: null }],
    nickname: "Alguien",
    userId: null,
  };

  // Hallazgo de auditoría de seguridad (2026-08-07): el insert directo a
  // "reports" (antes con la anon key) dejaba el rate limit de 8/hora en
  // manos de un trigger que leía la IP de un header HTTP falsificable —
  // ver PENDIENTE_DECISION.md #-14. createReport() ahora publica vía
  // /api/create-report (server-side); el reintento sin columnas opcionales
  // se movió a esa ruta (tests propios más abajo, en
  // src/app/api/create-report/route.test.js) — acá solo importa que
  // store.js arme bien el pedido.

  it("publica vía /api/create-report con la fila armada, sin Authorization si no hay sesión", async () => {
    const fetchMock = vi.fn((url) => {
      if (typeof url === "string" && url.startsWith("data:")) {
        return Promise.resolve({ blob: () => Promise.resolve(new Blob(["x"], { type: "image/jpeg" })) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const saved = await createReport(draft);

    const apiCall = fetchMock.mock.calls.find((c) => c[0] === "/api/create-report");
    expect(apiCall).toBeTruthy();
    expect(apiCall[1].headers.Authorization).toBeUndefined();
    const body = JSON.parse(apiCall[1].body);
    expect(body.row).toMatchObject({ ciudad: "Buenos Aires", provincia: "Buenos Aires", id: "new1" });
    expect(saved.foto).toContain("https://fake.supabase.co/");
  });

  it("con sesión activa, manda el access_token como Authorization: Bearer", async () => {
    supabaseMock.auth.getSession.mockResolvedValueOnce({ data: { session: { access_token: "tok-123" } } });
    const fetchMock = vi.fn((url) => {
      if (typeof url === "string" && url.startsWith("data:")) {
        return Promise.resolve({ blob: () => Promise.resolve(new Blob(["x"], { type: "image/jpeg" })) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    await createReport(draft);

    const apiCall = fetchMock.mock.calls.find((c) => c[0] === "/api/create-report");
    expect(apiCall[1].headers.Authorization).toBe("Bearer tok-123");
  });

  it("si la ruta devuelve un error (ej. rate limit), lo propaga con el mensaje real", async () => {
    const fetchMock = vi.fn((url) => {
      if (typeof url === "string" && url.startsWith("data:")) {
        return Promise.resolve({ blob: () => Promise.resolve(new Blob(["x"], { type: "image/jpeg" })) });
      }
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: "Se alcanzó el límite de reportes por hora desde esta conexión." }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(createReport(draft)).rejects.toThrow("Se alcanzó el límite de reportes por hora");
  });
});

// Auditoría integral (2026-08-09): resolveReports() era la única función
// crítica de store.js sin ningún test — y no por casualidad: PENDIENTE_
// DECISION.md #-10 documenta que este flujo (marcar reencuentro + otorgar
// puntos) rompió una vez en producción en silencio porque una escritura
// denegada por RLS tumbaba todo el try sin que el error fuera visible. Ese
// bug ya se arregló (ver markResolvedAndReward en FelpusMatcher.jsx), pero
// hasta ahora nada hubiera atrapado una regresión similar.
describe("resolveReports", () => {
  it("marca resuelto=true, guarda quién lo resolvió, y borra el contacto de los ids indicados", async () => {
    const updateBuilder = makeBuilder({ error: null });
    supabaseMock.from.mockReturnValueOnce(updateBuilder);

    await resolveReports(["r1", "r2"], "user-1", "Ana");

    expect(supabaseMock.from).toHaveBeenCalledWith("reports");
    const payload = updateBuilder.update.mock.calls[0][0];
    expect(payload.resuelto).toBe(true);
    expect(payload.resuelto_por).toBe("Ana");
    expect(payload.resuelto_por_user_id).toBe("user-1");
    // Los datos de contacto se borran al resolver (ya cumplieron su
    // propósito) — no debería quedar teléfono/email expuesto indefinidamente
    // en un reporte ya cerrado.
    expect(payload.contacto_whatsapp).toBeNull();
    expect(payload.contacto_email).toBeNull();
    expect(updateBuilder.in).toHaveBeenCalledWith("id", ["r1", "r2"]);
  });

  it("un error real (ej. RLS deniega la escritura) se propaga, nunca se traga en silencio", async () => {
    const realError = { code: "42501", message: "new row violates row-level security policy for table \"reports\"" };
    supabaseMock.from.mockReturnValueOnce(makeBuilder({ error: realError }));
    await expect(resolveReports(["r1"], "user-1", "Ana")).rejects.toBe(realError);
  });
});

// Hallazgo de auditoría de seguridad (2026-08-07): antes fetchReportContact
// llamaba a la RPC get_report_contact directo con la anon key, que leía la
// IP de un header falsificable por quien llama a la API — ver
// PENDIENTE_DECISION.md #-14. Ahora pasa por /api/report-contact
// (server-side, IP determinada por Vercel), así que estos tests mockean
// fetch() en vez de supabaseMock.rpc.
describe("fetchReportContact", () => {
  it("con la ruta disponible, pide /api/report-contact y devuelve el contacto", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url) =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ contactoWhatsapp: "5491112345678", contactoEmail: "a@a.com" }),
        })
      )
    );
    const contact = await fetchReportContact("r1");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/report-contact",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ reportId: "r1" }) })
    );
    expect(contact).toEqual({ contactoWhatsapp: "5491112345678", contactoEmail: "a@a.com" });
  });

  it("si la ruta devuelve un error (ej. rate limit), lo propaga con el mensaje real", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "Demasiadas consultas de contacto desde esta conexión." }),
        })
      )
    );
    await expect(fetchReportContact("r1")).rejects.toThrow("Demasiadas consultas de contacto desde esta conexión.");
  });

  it("si no hay fila para ese id, devuelve contacto vacío en vez de romper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }))
    );
    expect(await fetchReportContact("no-existe")).toEqual({ contactoWhatsapp: "", contactoEmail: "" });
  });
});

// Mismo hallazgo que fetchReportContact — flag_report es, de hecho, el más
// grave de los dos: auto-oculta un reporte con solo 3 IPs distintas, y esa
// IP también se leía de un header que quien llama a la API controlaba.
describe("flagReport", () => {
  it("pide /api/flag-report con reportId y reason", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }))
    );
    await flagReport("r1", "falsa");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/flag-report",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ reportId: "r1", reason: "falsa" }) })
    );
  });

  it("si la ruta devuelve un error (ej. rate limit), lo propaga con el mensaje real", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "Se alcanzó el límite de denuncias por hora desde esta conexión." }),
        })
      )
    );
    await expect(flagReport("r1", "falsa")).rejects.toThrow("Se alcanzó el límite de denuncias por hora");
  });
});

// Hallazgo de auditoría (2026-08-05): el caso "bono-reporte-original" le
// suma puntos al DUEÑO DE OTRO REPORTE (no a quien está confirmando el
// reencuentro) — una fila ajena, que la policy RLS contributors_update_own
// bloquea siempre en el lee-y-escribe directo de antes. award_points (RPC,
// ver schema.sql) es la solución; estos tests fijan que awardPoints() la use
// primero y sólo caiga al viejo comportamiento si todavía no existe.
describe("awardPoints", () => {
  // sourceId (auditoría integral, 2026-08-09): award_points pasó a ser
  // event-sourced — la RPC verifica contra "reports" que el evento sea real
  // y usa (reason, source_id) como clave única para no otorgar puntos dos
  // veces por el mismo reporte. awardPoints() ahora tiene que mandar
  // p_source_id siempre (server-side es quien decide si corresponde o no).
  it("con la RPC disponible, la llama con los parámetros correctos (incluido p_source_id) y no toca .from()", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: null });
    await awardPoints("user-1", "Ana", 50, "reencuentro", "report-abc");
    expect(supabaseMock.rpc).toHaveBeenCalledWith("award_points", {
      p_user_id: "user-1",
      p_display_name: "Ana",
      p_delta: 50,
      p_reason: "reencuentro",
      p_source_id: "report-abc",
    });
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("sin userId, no llama a nada (guest sin cuenta)", async () => {
    await awardPoints(null, "Invitado", 10, "reporte", "report-xyz");
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("si la RPC todavía no existe (migración no corrida), cae al lee-y-escribe de siempre", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: missingFunctionError() });
    supabaseMock.from.mockReturnValueOnce(
      makeBuilder({ data: { id: "user-1", nickname: "Ana", points: 100, reportes: 2, reencuentros: 1 }, error: null })
    );
    const upsertBuilder = makeBuilder({ error: null });
    supabaseMock.from.mockReturnValueOnce(upsertBuilder);

    await awardPoints("user-1", "Ana", 50, "reencuentro", "report-abc");

    expect(supabaseMock.from).toHaveBeenCalledTimes(2);
    const upserted = upsertBuilder.upsert.mock.calls[0][0];
    expect(upserted.points).toBe(150);
    expect(upserted.reencuentros).toBe(2);
  });

  it("un error real de la RPC (no 'función no existe') se propaga, sin caer al lee-y-escribe", async () => {
    const realError = { code: "P0001", message: "Solo podés sumarte puntos por tus propios reencuentros." };
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: realError });
    await expect(awardPoints("otro-user", "X", 20, "reencuentro", "report-abc")).rejects.toBe(realError);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("un intento de doble otorgamiento (mismo evento) es rechazado del lado del servidor, no silencioso en el cliente", async () => {
    // La RPC deduplica con un unique index (reason, source_id) — cuando SÍ
    // hay conflicto real, no tira error (insert con conflicto → no-op), así
    // que del lado del cliente esto se ve igual que un award_points exitoso
    // (rpcResult.error es null). El caso a cubrir del lado del cliente es
    // que awardPoints() no haga NINGÚN chequeo propio de "ya se lo di" —
    // toda la idempotencia vive server-side, awardPoints() solo pasa los
    // datos tal cual.
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: null });
    await awardPoints("user-1", "Ana", 10, "reporte", "report-ya-premiado");
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "award_points",
      expect.objectContaining({ p_source_id: "report-ya-premiado" })
    );
  });
});

// Hallazgo de auditoría de seguridad (2026-08-07): contributors_update_own
// (RLS) solo exige "auth.uid() = id" — no restringe QUÉ columnas se pueden
// tocar, así que el lee-y-escribe directo de antes dejaba que cualquier
// usuario logueado se pusiera streak_days (o points/reportes/reencuentros)
// en lo que quisiera para SU PROPIA fila, sin pasar por ninguna validación.
// bump_streak (RPC) cierra ese hueco; estos tests fijan que bumpStreak() la
// use primero y sólo caiga al viejo comportamiento si todavía no existe.
describe("bumpStreak", () => {
  // p_timezone, no p_today/p_yesterday (auditoría integral, 2026-08-09):
  // bump_streak calcula "hoy" enteramente server-side a partir de su propio
  // reloj + el timezone declarado — el cliente ya no puede mandar una fecha
  // arbitraria. bumpStreak() solo tiene que mandar el nombre IANA del
  // timezone real del navegador (Intl.DateTimeFormat().resolvedOptions()),
  // nunca una fecha.
  it("con la RPC disponible, la llama con el timezone real (no fechas) y no toca .from()", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: [{ streak_days: 3, is_new_today: true }], error: null });
    const result = await bumpStreak("user-1", "Ana");
    expect(supabaseMock.rpc).toHaveBeenCalledWith("bump_streak", {
      p_user_id: "user-1",
      p_display_name: "Ana",
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    const callArgs = supabaseMock.rpc.mock.calls[0][1];
    expect(callArgs).not.toHaveProperty("p_today");
    expect(callArgs).not.toHaveProperty("p_yesterday");
    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(result).toEqual({ streakDays: 3, isNewToday: true });
  });

  it("sin userId, no llama a nada (invitado sin cuenta)", async () => {
    expect(await bumpStreak(null, "Invitado")).toBeNull();
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("si la RPC todavía no existe (migración no corrida), cae al lee-y-escribe de siempre", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: missingFunctionError() });
    supabaseMock.from.mockReturnValueOnce(
      makeBuilder({ data: { id: "user-1", nickname: "Ana", streak_days: 2, last_active_date: null }, error: null })
    );
    const upsertBuilder = makeBuilder({ error: null });
    supabaseMock.from.mockReturnValueOnce(upsertBuilder);

    const result = await bumpStreak("user-1", "Ana");

    expect(supabaseMock.from).toHaveBeenCalledTimes(2);
    const upserted = upsertBuilder.upsert.mock.calls[0][0];
    expect(upserted.streak_days).toBe(1);
    expect(result.isNewToday).toBe(true);
  });

  it("un error real de la RPC (no 'función no existe') se propaga, sin caer al lee-y-escribe", async () => {
    const realError = { code: "P0001", message: "Solo podés actualizar tu propia racha." };
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: realError });
    await expect(bumpStreak("user-1", "Ana")).rejects.toBe(realError);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});

describe("fetchProfile", () => {
  it("sin userId, devuelve null sin llamar a la base", async () => {
    expect(await fetchProfile(null)).toBeNull();
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("devuelve la fila de contributors del usuario", async () => {
    supabaseMock.from.mockReturnValueOnce(
      makeBuilder({ data: { id: "user-1", nickname: "Ana", whatsapp: "5493875885427", points: 30 }, error: null })
    );
    expect(await fetchProfile("user-1")).toMatchObject({ nickname: "Ana", whatsapp: "5493875885427" });
  });

  it("sin fila todavía (nunca reportó ni confirmó nada), devuelve null — no es un error", async () => {
    supabaseMock.from.mockReturnValueOnce(makeBuilder({ data: null, error: null }));
    expect(await fetchProfile("user-nuevo")).toBeNull();
  });
});

describe("updateProfile", () => {
  it("sin userId, rechaza sin llamar a la base", async () => {
    await expect(updateProfile(null, { nickname: "Ana" })).rejects.toThrow(/iniciar sesión/i);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("hace upsert con id/nickname/whatsapp, sin tocar points/reportes/etc", async () => {
    const builder = makeBuilder({ error: null });
    supabaseMock.from.mockReturnValueOnce(builder);
    await updateProfile("user-1", { nickname: "Ana", whatsapp: "+5493875885427" });
    const upserted = builder.upsert.mock.calls[0][0];
    expect(upserted).toMatchObject({ id: "user-1", nickname: "Ana", whatsapp: "+5493875885427" });
    expect(upserted.points).toBeUndefined();
  });

  it("whatsapp vacío se guarda como null, no como string vacío", async () => {
    const builder = makeBuilder({ error: null });
    supabaseMock.from.mockReturnValueOnce(builder);
    await updateProfile("user-1", { nickname: "Ana", whatsapp: "" });
    expect(builder.upsert.mock.calls[0][0].whatsapp).toBeNull();
  });

  it("si la columna whatsapp todavía no existe (migración no corrida), da un mensaje claro", async () => {
    supabaseMock.from.mockReturnValueOnce(
      makeBuilder({ error: { code: "PGRST204", message: "Could not find the 'whatsapp' column of 'contributors'" } })
    );
    await expect(updateProfile("user-1", { nickname: "Ana", whatsapp: "+54" })).rejects.toThrow(/todavía no está disponible/i);
  });
});

describe("fetchSavedReportIds / saveReport / unsaveReport", () => {
  it("sin userId, fetchSavedReportIds devuelve [] sin llamar a la base", async () => {
    expect(await fetchSavedReportIds(null)).toEqual([]);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("fetchSavedReportIds devuelve solo los ids, no el reporte completo", async () => {
    supabaseMock.from.mockReturnValueOnce(
      makeBuilder({ data: [{ report_id: "r1" }, { report_id: "r2" }], error: null })
    );
    expect(await fetchSavedReportIds("user-1")).toEqual(["r1", "r2"]);
  });

  it("fetchSavedReportIds falla abierto (sin guardados) si la tabla todavía no existe", async () => {
    supabaseMock.from.mockReturnValueOnce(makeBuilder({ data: null, error: missingTableError("saved_reports") }));
    expect(await fetchSavedReportIds("user-1")).toEqual([]);
  });

  it("saveReport hace upsert con onConflict/ignoreDuplicates (evita duplicados en un doble click)", async () => {
    const builder = makeBuilder({ error: null });
    supabaseMock.from.mockReturnValueOnce(builder);
    await saveReport("user-1", "r1");
    expect(builder.upsert).toHaveBeenCalledWith(
      { user_id: "user-1", report_id: "r1" },
      { onConflict: "user_id,report_id", ignoreDuplicates: true }
    );
  });

  it("saveReport sin userId rechaza pidiendo iniciar sesión", async () => {
    await expect(saveReport(null, "r1")).rejects.toThrow(/iniciá sesión/i);
  });

  it("saveReport da un mensaje claro si la tabla todavía no existe", async () => {
    supabaseMock.from.mockReturnValueOnce(makeBuilder({ error: missingTableError("saved_reports") }));
    await expect(saveReport("user-1", "r1")).rejects.toThrow(/todavía no está disponible/i);
  });

  it("unsaveReport borra por user_id + report_id", async () => {
    const builder = makeBuilder({ error: null });
    supabaseMock.from.mockReturnValueOnce(builder);
    await unsaveReport("user-1", "r1");
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(builder.eq).toHaveBeenCalledWith("report_id", "r1");
  });

  it("unsaveReport sin userId no hace nada (no rompe si se llama sin sesión)", async () => {
    await unsaveReport(null, "r1");
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});
