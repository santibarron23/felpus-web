import { describe, expect, it } from "vitest";
import { buildErrorPayload } from "./log";

// buildErrorPayload (revisión 2026-10-11): caso real de producción — un
// error de Supabase (objeto plano, no instanceof Error) llegaba a
// error_logs sin ningún detalle, solo con el texto del llamador.
describe("buildErrorPayload", () => {
  it("con un Error real: junta el texto del llamador + el mensaje + el stack", () => {
    const err = new Error("boom");
    const p = buildErrorPayload(["No se pudieron cargar los reportes", err]);
    expect(p.message).toBe("No se pudieron cargar los reportes — boom");
    expect(p.stack).toContain("boom");
  });

  it("con un error de Supabase (objeto plano): conserva message, code, details y hint", () => {
    const supabaseError = { message: "TypeError: Load failed", code: "", details: "net", hint: "" };
    const p = buildErrorPayload(["No se pudieron cargar los reportes", supabaseError]);
    expect(p.message).toBe("No se pudieron cargar los reportes — TypeError: Load failed — net");
  });

  it("incluye el code de Postgres cuando viene", () => {
    const p = buildErrorPayload(["x", { message: "permission denied for table reports", code: "42501" }]);
    expect(p.message).toContain("permission denied for table reports");
    expect(p.message).toContain("code 42501");
  });

  it("sin ningún error-like: usa solo el texto, sin stack", () => {
    const p = buildErrorPayload(["solo texto"]);
    expect(p.message).toBe("solo texto");
    expect(p.stack).toBeNull();
  });

  it("sin nada útil: nunca deja el mensaje vacío", () => {
    expect(buildErrorPayload([]).message).toBe("Error sin mensaje");
    expect(buildErrorPayload([null, undefined, 42]).message).toBe("Error sin mensaje");
  });

  it("recorta url/userAgent largos y tolera que falten", () => {
    const p = buildErrorPayload(["x"], { url: "u".repeat(900), userAgent: undefined });
    expect(p.url).toHaveLength(500);
    expect(p.userAgent).toBeNull();
  });
});
