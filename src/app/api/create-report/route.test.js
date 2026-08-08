import { describe, expect, it } from "vitest";
import { missingOptionalColumn } from "./route";

// El insert de "reports" se mueve acá (server-side, service_role) como
// parte del hallazgo de auditoría de seguridad #-14 (rate limiting por IP
// evadible con X-Forwarded-For falso, ver PENDIENTE_DECISION.md) — el
// reintento sin columnas opcionales (raza/detalles/ciudad/etc., para
// bases que no corrieron la migración más reciente) que antes vivía en
// store.js pasa a vivir acá. Estos tests cubren esa función pura;
// el resto del handler (rate limit, verificación de token, insert real)
// se verificó en vivo contra la base real una vez configurada la service
// role key — no tiene sentido mockear todo el cliente de Supabase acá
// para eso.
describe("missingOptionalColumn", () => {
  it("detecta una columna opcional faltante (código 42703)", () => {
    const error = { code: "42703", message: "column reports.raza does not exist" };
    expect(missingOptionalColumn(error)).toBe("raza");
  });

  it("detecta una columna opcional faltante (código PGRST204, el que usa PostgREST)", () => {
    const error = { code: "PGRST204", message: "Could not find the 'ciudad' column of 'reports' in the schema cache" };
    expect(missingOptionalColumn(error)).toBe("ciudad");
  });

  it("devuelve null si el error no menciona ninguna columna opcional conocida", () => {
    const error = { code: "23514", message: "violates check constraint reports_descripcion_len" };
    expect(missingOptionalColumn(error)).toBeNull();
  });

  it("devuelve null sin error", () => {
    expect(missingOptionalColumn(null)).toBeNull();
  });
});
