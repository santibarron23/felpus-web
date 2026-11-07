import { describe, expect, it, vi } from "vitest";
import { esCuentaSinLimite } from "./cuentasSinLimite";
import { pedidoSinLimite } from "./serverCuentasSinLimite";

const ENV = { supabaseUrl: "https://s.supabase.co", serviceKey: "service" };
function req(auth) {
  return new Request("https://felpus.com/api/x", { method: "POST", headers: auth ? { Authorization: auth } : {} });
}

describe("cuentas sin cupos", () => {
  it("solo contacto.felpus@gmail.com (sin importar mayúsculas)", () => {
    expect(esCuentaSinLimite("contacto.felpus@gmail.com")).toBe(true);
    expect(esCuentaSinLimite("Contacto.Felpus@Gmail.com")).toBe(true);
    expect(esCuentaSinLimite("santiagobarronlf@gmail.com")).toBe(false);
    expect(esCuentaSinLimite("contacto.felpus@gmail.com.ar")).toBe(false);
    expect(esCuentaSinLimite(null)).toBe(false);
  });

  it("el servidor decide con el email verificado de la sesión", async () => {
    const obtenerUsuario = vi.fn(async () => ({ id: "u1", email: "contacto.felpus@gmail.com" }));
    expect(await pedidoSinLimite(req("Bearer tok"), ENV, { obtenerUsuario })).toBe(true);
    obtenerUsuario.mockResolvedValueOnce({ id: "u2", email: "otra@gmail.com" });
    expect(await pedidoSinLimite(req("Bearer tok"), ENV, { obtenerUsuario })).toBe(false);
    obtenerUsuario.mockResolvedValueOnce(null); // token inválido
    expect(await pedidoSinLimite(req("Bearer tok"), ENV, { obtenerUsuario })).toBe(false);
  });

  it("sin sesión no consulta a Supabase", async () => {
    const obtenerUsuario = vi.fn();
    expect(await pedidoSinLimite(req(null), ENV, { obtenerUsuario })).toBe(false);
    expect(obtenerUsuario).not.toHaveBeenCalled();
  });
});
