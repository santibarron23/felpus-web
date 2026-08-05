import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.hoisted: el mock necesita existir ANTES de que vi.mock("./supabaseClient")
// corra (vitest lo hoistea al tope del archivo), así que no puede ser una
// variable normal declarada más abajo — vi.hoisted es el escape hatch para eso.
const { supabaseMock } = vi.hoisted(() => {
  const supabaseMock = {
    from: vi.fn(),
    rpc: vi.fn(),
    storage: { from: vi.fn() },
  };
  return { supabaseMock };
});

vi.mock("./supabaseClient", () => ({ supabase: supabaseMock }));

const { fetchReports, createReport, fetchReportContact, awardPoints } = await import("./store");

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

beforeEach(() => {
  supabaseMock.from.mockReset();
  supabaseMock.rpc.mockReset();
  supabaseMock.storage.from.mockReset();
  // Mocks por defecto de Storage — createReport() siempre pasa por acá
  // (uploadPhoto), así que sin esto cada test de createReport tendría que
  // repetirlo.
  supabaseMock.storage.from.mockReturnValue({
    upload: vi.fn(() => Promise.resolve({ error: null })),
    getPublicUrl: vi.fn((path) => ({ data: { publicUrl: `https://fake.supabase.co/${path}` } })),
    remove: vi.fn(() => Promise.resolve({ error: null })),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ blob: () => Promise.resolve(new Blob(["x"], { type: "image/jpeg" })) }))
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

  it("inserta en un solo intento cuando todas las columnas existen", async () => {
    supabaseMock.from.mockReturnValueOnce(makeBuilder({ error: null }));
    const saved = await createReport(draft);
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
    expect(saved.foto).toContain("https://fake.supabase.co/");
  });

  it("si falta 'detalles', reintenta el insert sin esa clave en la fila", async () => {
    const builder1 = makeBuilder({ error: missingColumnError("detalles") });
    const builder2 = makeBuilder({ error: null });
    supabaseMock.from.mockReturnValueOnce(builder1).mockReturnValueOnce(builder2);

    await createReport(draft);

    expect(supabaseMock.from).toHaveBeenCalledTimes(2);
    const firstInsertRow = builder1.insert.mock.calls[0][0];
    const secondInsertRow = builder2.insert.mock.calls[0][0];
    expect(firstInsertRow).toHaveProperty("detalles");
    expect(secondInsertRow).not.toHaveProperty("detalles");
    // El resto de los campos no debería perderse en el reintento
    expect(secondInsertRow.raza).toBe("Siamés");
  });

  it("si faltan 'raza' y 'detalles', reintenta hasta lograrlo sin ninguna de las dos", async () => {
    supabaseMock.from
      .mockReturnValueOnce(makeBuilder({ error: missingColumnError("raza") }))
      .mockReturnValueOnce(makeBuilder({ error: missingColumnError("detalles") }))
      .mockReturnValueOnce(makeBuilder({ error: null }));
    await createReport(draft);
    expect(supabaseMock.from).toHaveBeenCalledTimes(3);
  });

  it("un error que no es de columna faltante se propaga sin reintentar de más", async () => {
    const constraintError = { code: "23514", message: "violates check constraint reports_descripcion_len" };
    supabaseMock.from.mockReturnValueOnce(makeBuilder({ error: constraintError }));
    await expect(createReport(draft)).rejects.toBe(constraintError);
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });
});

describe("fetchReportContact", () => {
  it("con la RPC disponible, devuelve el contacto directo", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: [{ contacto_whatsapp: "5491112345678", contacto_email: "a@a.com" }],
      error: null,
    });
    const contact = await fetchReportContact("r1");
    expect(supabaseMock.rpc).toHaveBeenCalledWith("get_report_contact", { p_report_id: "r1" });
    expect(contact).toEqual({ contactoWhatsapp: "5491112345678", contactoEmail: "a@a.com" });
  });

  it("si la RPC todavía no existe (migración no corrida), cae al SELECT directo", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: missingFunctionError() });
    supabaseMock.from.mockReturnValueOnce(
      makeBuilder({ data: { contacto_whatsapp: "5491112345678", contacto_email: "" }, error: null })
    );
    const contact = await fetchReportContact("r1");
    expect(contact).toEqual({ contactoWhatsapp: "5491112345678", contactoEmail: "" });
  });

  it("un error real de la RPC (no 'función no existe') se propaga, sin caer al SELECT", async () => {
    const realError = { code: "P0001", message: "Demasiadas consultas de contacto desde esta conexión." };
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: realError });
    await expect(fetchReportContact("r1")).rejects.toBe(realError);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("si no hay fila para ese id, devuelve contacto vacío en vez de romper", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await fetchReportContact("no-existe")).toEqual({ contactoWhatsapp: "", contactoEmail: "" });
  });
});

// Hallazgo de auditoría (2026-08-05): el caso "bono-reporte-original" le
// suma puntos al DUEÑO DE OTRO REPORTE (no a quien está confirmando el
// reencuentro) — una fila ajena, que la policy RLS contributors_update_own
// bloquea siempre en el lee-y-escribe directo de antes. award_points (RPC,
// ver schema.sql) es la solución; estos tests fijan que awardPoints() la use
// primero y sólo caiga al viejo comportamiento si todavía no existe.
describe("awardPoints", () => {
  it("con la RPC disponible, la llama con los parámetros correctos y no toca .from()", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: null });
    await awardPoints("user-1", "Ana", 50, "reencuentro");
    expect(supabaseMock.rpc).toHaveBeenCalledWith("award_points", {
      p_user_id: "user-1",
      p_display_name: "Ana",
      p_delta: 50,
      p_reason: "reencuentro",
    });
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("sin userId, no llama a nada (guest sin cuenta)", async () => {
    await awardPoints(null, "Invitado", 10, "reporte");
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

    await awardPoints("user-1", "Ana", 50, "reencuentro");

    expect(supabaseMock.from).toHaveBeenCalledTimes(2);
    const upserted = upsertBuilder.upsert.mock.calls[0][0];
    expect(upserted.points).toBe(150);
    expect(upserted.reencuentros).toBe(2);
  });

  it("un error real de la RPC (no 'función no existe') se propaga, sin caer al lee-y-escribe", async () => {
    const realError = { code: "P0001", message: "Solo podés sumarte puntos a vos mismo con este motivo." };
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: realError });
    await expect(awardPoints("otro-user", "X", 20, "reencuentro")).rejects.toBe(realError);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});
