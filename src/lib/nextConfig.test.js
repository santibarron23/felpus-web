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
});
