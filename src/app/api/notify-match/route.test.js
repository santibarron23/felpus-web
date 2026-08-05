import { describe, expect, it } from "vitest";
import { escapeHtml } from "./route";

// Regresión del hallazgo de auditoría: nombre/color/zona son texto libre
// que cualquiera controla al publicar un reporte, y terminan interpolados
// en el HTML del email de "posible coincidencia" que le llega a OTRA
// persona. Sin escapar, alguien podría meter un <a href="..."> (phishing
// disfrazado de Felpus) u otro HTML/CSS en ese correo. Ver sendMatchEmail
// en route.js.
describe("escapeHtml", () => {
  it("escapa las cinco entidades HTML relevantes", () => {
    expect(escapeHtml(`<a href="x">y & 'z'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;y &amp; &#39;z&#39;&lt;/a&gt;"
    );
  });

  it("no ejecuta ni deja pasar un tag <script> sin escapar", () => {
    const out = escapeHtml('<script>alert(1)</script>');
    expect(out).not.toContain("<script>");
    expect(out).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("deja texto normal (sin caracteres especiales) intacto", () => {
    expect(escapeHtml("Palermo")).toBe("Palermo");
    expect(escapeHtml("marrón y blanco")).toBe("marrón y blanco");
  });

  it("maneja null/undefined como string vacío, sin tirar", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});
