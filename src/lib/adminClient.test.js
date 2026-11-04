import { describe, expect, it } from "vitest";
import { ADMIN_EMAIL_SHA256, esEmailAdmin, sha256Hex } from "./adminClient";
import { ADMIN_EMAIL } from "./adminEdit";

describe("esEmailAdmin", () => {
  it("la huella corresponde al mismo ADMIN_EMAIL que usan el servidor y la base", async () => {
    expect(await sha256Hex(ADMIN_EMAIL)).toBe(ADMIN_EMAIL_SHA256);
  });
  it("reconoce el email del admin (sin importar mayúsculas ni espacios)", async () => {
    expect(await esEmailAdmin(ADMIN_EMAIL)).toBe(true);
    expect(await esEmailAdmin(`  ${ADMIN_EMAIL.toUpperCase()} `)).toBe(true);
  });
  it("cualquier otro email, vacío o sin sesión no es admin", async () => {
    expect(await esEmailAdmin("otra@example.com")).toBe(false);
    expect(await esEmailAdmin("")).toBe(false);
    expect(await esEmailAdmin(undefined)).toBe(false);
  });
});
