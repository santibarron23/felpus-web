import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config.mjs";

// Protección de código (2026-11-04): ver el comentario en next.config.mjs.
describe("next.config", () => {
  it("no publica mapas de código del navegador", () => {
    expect(nextConfig.productionBrowserSourceMaps).toBe(false);
  });
  it("no manda el header X-Powered-By", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
  // OCR de /api/photo-check (2026-11-07): ver el comentario en next.config.mjs.
  // Cada archivo del motor de Tesseract que tesseract.js puede cargar en Node
  // tiene que entrar en la función.
  it("incluye todas las variantes del motor de Tesseract en /api/photo-check", async () => {
    const { readdirSync } = await import("node:fs");
    const { posix } = await import("node:path");
    const patterns = nextConfig.outputFileTracingIncludes["/api/photo-check"];
    const isIncluded = (file) => patterns.some((p) => posix.matchesGlob(file, p));
    const motor = readdirSync("node_modules/tesseract.js-core").filter(
      (f) => /^tesseract-core.*\.(js|wasm)$/.test(f) && !f.endsWith(".wasm.js"),
    );
    expect(motor).toContain("tesseract-core-relaxedsimd.wasm");
    for (const f of motor) expect(isIncluded(`node_modules/tesseract.js-core/${f}`), f).toBe(true);
  });
});
