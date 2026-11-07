import { describe, it, expect } from "vitest";
import { textoAlertaPrueba } from "./alertaPruebaTexto";

describe("textoAlertaPrueba", () => {
  it("dice que falta la clave de Resend aunque el push haya salido", () => {
    const t = textoAlertaPrueba({ enviada: true, canales: ["push"], email: "sin RESEND_API_KEY" });
    expect(t).toMatch(/falta RESEND_API_KEY/);
    expect(t).toMatch(/Notificación: enviada/);
  });

  it("muestra el motivo que dio Resend", () => {
    const t = textoAlertaPrueba({ enviada: false, canales: [], email: "Resend 403: The felpus.com domain is not verified" });
    expect(t).toMatch(/domain is not verified/);
    expect(t).toMatch(/Notificación: no salió/);
  });

  it("email enviado avisa de mirar Spam", () => {
    expect(textoAlertaPrueba({ enviada: true, canales: ["email", "push"], email: "enviado" })).toMatch(/Spam/);
  });

  it("silencio y respuestas raras", () => {
    expect(textoAlertaPrueba({ enviada: false, motivo: "silencio" })).toMatch(/30 minutos/);
    expect(textoAlertaPrueba(null)).toMatch(/Probá de nuevo/);
  });
});
