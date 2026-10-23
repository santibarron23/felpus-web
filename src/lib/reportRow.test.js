import { describe, it, expect } from "vitest";
import { sanitizeReportRow, REPORT_INSERT_COLUMNS } from "./reportRow";

const PREFIX = "https://proj.supabase.co/storage/v1/object/public/felpus-photos/";

function validRow(extra = {}) {
  return {
    id: "1791980986984-pjqbv0",
    tipo: "perdida",
    especie: "perro",
    color: "Negro",
    tamano: "Mediano",
    zona: "Tres Cerritos, Salta",
    lat: -24.77,
    lng: -65.41,
    fecha: "2026-10-20",
    descripcion: "Perro negro con collar rojo",
    contacto_whatsapp: "+5493875000000",
    foto_url: `${PREFIX}a.jpg`,
    foto_urls: [`${PREFIX}a.jpg`],
    hist: [0.1, 0.2],
    hists: [[0.1, 0.2]],
    embedding: null,
    embeddings: [null],
    nickname: "Ana",
    ...extra,
  };
}

describe("sanitizeReportRow", () => {
  it("acepta la fila que arma el formulario", () => {
    const { row, error } = sanitizeReportRow(validRow(), { photosPrefix: PREFIX });
    expect(error).toBeUndefined();
    expect(row.id).toBe("1791980986984-pjqbv0");
  });

  it("descarta columnas que el formulario nunca manda (asignación masiva)", () => {
    const { row } = sanitizeReportRow(
      validRow({
        push_token: "00000000-0000-0000-0000-000000000000",
        creado_en: "2099-01-01T00:00:00Z",
        oculto: false,
        inactivo: false,
        actividad_en: "2099-01-01T00:00:00Z",
        resuelto_por_user_id: "11111111-1111-1111-1111-111111111111",
        user_id: "22222222-2222-2222-2222-222222222222",
        push_subscription: { endpoint: "x" },
      }),
      { photosPrefix: PREFIX }
    );
    for (const col of ["push_token", "creado_en", "oculto", "inactivo", "actividad_en", "resuelto_por_user_id", "user_id", "push_subscription"]) {
      expect(row).not.toHaveProperty(col);
    }
    expect(Object.keys(row).every((k) => REPORT_INSERT_COLUMNS.includes(k))).toBe(true);
  });

  it("rechaza fotos que no vienen del bucket propio", () => {
    expect(sanitizeReportRow(validRow({ foto_url: "https://evil.example/x.jpg" }), { photosPrefix: PREFIX }).error).toBeTruthy();
    expect(
      sanitizeReportRow(validRow({ foto_urls: [`${PREFIX}a.jpg`, "https://otro.supabase.co/x.jpg"] }), { photosPrefix: PREFIX }).error
    ).toBeTruthy();
  });

  it("rechaza más de 3 fotos o ninguna", () => {
    const four = [1, 2, 3, 4].map((i) => `${PREFIX}${i}.jpg`);
    expect(sanitizeReportRow(validRow({ foto_urls: four }), { photosPrefix: PREFIX }).error).toBeTruthy();
    expect(sanitizeReportRow(validRow({ foto_url: undefined, foto_urls: [] }), { photosPrefix: PREFIX }).error).toBeTruthy();
  });

  it("rechaza ids con caracteres raros (no se usan en filtros de PostgREST)", () => {
    for (const id of ["a,b", "x)", "../x", "a b", "", "abc"]) {
      expect(sanitizeReportRow(validRow({ id }), { photosPrefix: PREFIX }).error).toBeTruthy();
    }
  });

  it("rechaza tipo, coordenadas y vectores inválidos", () => {
    expect(sanitizeReportRow(validRow({ tipo: "otro" }), { photosPrefix: PREFIX }).error).toBeTruthy();
    expect(sanitizeReportRow(validRow({ lat: 200 }), { photosPrefix: PREFIX }).error).toBeTruthy();
    expect(sanitizeReportRow(validRow({ embedding: ["x"] }), { photosPrefix: PREFIX }).error).toBeTruthy();
    expect(sanitizeReportRow(validRow({ hists: "no" }), { photosPrefix: PREFIX }).error).toBeTruthy();
    expect(sanitizeReportRow(validRow({ detalles: [1] }), { photosPrefix: PREFIX }).error).toBeTruthy();
  });

  it("acepta coordenadas vacías (reporte sin pin en el mapa)", () => {
    expect(sanitizeReportRow(validRow({ lat: null, lng: null }), { photosPrefix: PREFIX }).error).toBeUndefined();
  });
});
