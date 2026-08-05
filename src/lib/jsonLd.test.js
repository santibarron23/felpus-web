import { describe, expect, it } from "vitest";
import { safeJsonLdString } from "./jsonLd";

// Hallazgo de auditoría: JSON.stringify() no escapa "<", así que un valor
// con "</script><script>...</script>" (nombre/zona/descripción de un
// reporte, texto libre que cualquiera controla) cerraba antes de tiempo el
// <script type="application/ld+json"> de r/[id]/page.js — SSR público,
// explotable con solo abrir el link que se comparte por WhatsApp/redes.
describe("safeJsonLdString", () => {
  it("neutraliza un intento de cierre de </script> + script nuevo", () => {
    const malicious = { name: '</script><script>alert(document.cookie)</script>' };
    const out = safeJsonLdString(malicious);
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<script>");
  });

  it("sigue siendo JSON válido y recupera el string original al parsearlo", () => {
    const malicious = { name: 'Perdida: </script><img src=x onerror=alert(1)> en Palermo' };
    const out = safeJsonLdString(malicious);
    expect(JSON.parse(out)).toEqual(malicious);
  });

  it("con datos normales (sin '<'), el resultado es igual al de JSON.stringify", () => {
    const data = { "@type": "WebSite", name: "Felpus", url: "https://felpus-web.vercel.app" };
    expect(safeJsonLdString(data)).toBe(JSON.stringify(data));
  });

  it("escapa todas las apariciones de '<', no solo la primera", () => {
    const data = { a: "<<<" };
    expect(safeJsonLdString(data)).toBe('{"a":"\\u003c\\u003c\\u003c"}');
  });
});
