import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import nextConfig from "../../next.config.mjs";

// Guardas de la optimización de imágenes (docs/IMAGENES.md): cada una de
// estas opciones multiplica o divide las transformaciones que Vercel cobra.
const images = nextConfig.images;
const SRC = path.join(__dirname, "..");

function jsxFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return jsxFiles(p);
    return /\.(jsx|js)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe("configuración de imágenes", () => {
  it("guarda las fotos optimizadas al menos 7 días (antes 1 hora)", () => {
    expect(images.minimumCacheTTL).toBeGreaterThanOrEqual(7 * 24 * 3600);
  });

  it("ofrece pocos anchos (antes 16)", () => {
    expect(images.imageSizes.length + images.deviceSizes.length).toBeLessThanOrEqual(8);
    // Las fotos se guardan con 1000 px como máximo: no tiene sentido más.
    expect(Math.max(...images.deviceSizes)).toBeLessThanOrEqual(1080);
  });

  it("un solo formato y una sola calidad", () => {
    expect(images.formats).toEqual(["image/webp"]);
    expect(images.qualities).toEqual([75]);
  });

  it("solo optimiza fotos de reportes (no avatares de Google ni otros hosts)", () => {
    expect(images.remotePatterns).toHaveLength(1);
    expect(JSON.stringify(images.remotePatterns)).not.toMatch(/googleusercontent/);
  });

  it("los avatares de Google van sin optimizar", () => {
    for (const file of jsxFiles(SRC)) {
      const text = fs.readFileSync(file, "utf8");
      for (const m of text.matchAll(/<Image\b[^>]*src=\{googleAvatar\}[^>]*>/g)) {
        expect(m[0], file).toMatch(/\bunoptimized\b/);
      }
    }
  });

  it("ningún <Image> pide una calidad fuera de la lista", () => {
    for (const file of jsxFiles(SRC)) {
      const text = fs.readFileSync(file, "utf8");
      for (const m of text.matchAll(/quality=\{?"?(\d+)/g)) {
        expect(images.qualities, file).toContain(Number(m[1]));
      }
    }
  });
});
