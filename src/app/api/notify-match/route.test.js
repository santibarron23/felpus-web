import { describe, expect, it, vi } from "vitest";
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

// Un reencuentro ya confirmado no dispara avisos de coincidencia.
describe("POST /api/notify-match con un reporte resuelto", () => {
  it("no notifica ni consulta la base", async () => {
    const { POST } = await import("./route");
    process.env.NOTIFY_WEBHOOK_SECRET = "s3cr3t";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const res = await POST(
        new Request("http://localhost/api/notify-match", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-webhook-secret": "s3cr3t" },
          body: JSON.stringify({ record: { id: "r1", tipo: "encontrada", especie: "perro", resuelto: true } }),
        })
      );
      expect(await res.json()).toEqual({ notified: 0 });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
