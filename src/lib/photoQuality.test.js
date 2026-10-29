import { describe, it, expect } from "vitest";
import { meanLuminance, isTooDark, DARK_THRESHOLD, sharpness, isBlurry, BLUR_THRESHOLD } from "./photoQuality";

const pixels = (rgb, count = 4) => new Uint8ClampedArray(Array.from({ length: count }, () => [...rgb, 255]).flat());

describe("meanLuminance", () => {
  it("negro da 0 y blanco da 255", () => {
    expect(meanLuminance(pixels([0, 0, 0]))).toBe(0);
    expect(meanLuminance(pixels([255, 255, 255]))).toBeCloseTo(255);
  });

  it("ignora los píxeles transparentes", () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]);
    expect(meanLuminance(data)).toBeCloseTo(255);
  });

  it("sin píxeles devuelve null", () => {
    expect(meanLuminance(new Uint8ClampedArray([]))).toBeNull();
  });
});

describe("isTooDark", () => {
  it("marca solo las fotos en penumbra", () => {
    expect(isTooDark(meanLuminance(pixels([20, 20, 25])))).toBe(true);
    // Perro negro bien iluminado (fondo claro + pelaje oscuro).
    expect(isTooDark(meanLuminance(new Uint8ClampedArray([30, 30, 30, 255, 200, 190, 180, 255])))).toBe(false);
    expect(isTooDark(DARK_THRESHOLD)).toBe(false);
  });

  it("si no se pudo medir, no avisa", () => {
    expect(isTooDark(null)).toBe(false);
  });
});

// Imagen RGBA de w x h en grises, con el valor de cada píxel según f(x, y).
function img(w, h, f) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = f(x, y);
      d.set([v, v, v, 255], (y * w + x) * 4);
    }
  return d;
}

describe("sharpness", () => {
  const W = 120;
  const H = 90;

  it("una foto con bordes nítidos supera el umbral; una lisa (movida), no", () => {
    const nitida = sharpness(img(W, H, (x, y) => (((x >> 2) + (y >> 2)) % 2 ? 230 : 20)), W, H);
    const lisa = sharpness(img(W, H, (x) => 80 + x / 2), W, H);
    expect(nitida).toBeGreaterThan(BLUR_THRESHOLD);
    expect(lisa).toBeLessThan(BLUR_THRESHOLD);
  });

  it("alcanza con una parte nítida (mascota enfocada, fondo desenfocado)", () => {
    const s = sharpness(img(W, H, (x, y) => (x < W / 4 && y < H / 4 ? ((x + y) % 2 ? 230 : 20) : 120)), W, H);
    expect(s).toBeGreaterThan(BLUR_THRESHOLD);
  });

  it("ignora la esquina de la marca de agua", () => {
    // Donde la pone resizeImageFile: ~84-96 % del ancho y del alto.
    const logo = (x, y) => x >= W * 0.84 && x < W * 0.96 && y >= H * 0.84 && y < H * 0.96;
    const s = sharpness(img(W, H, (x, y) => (logo(x, y) ? ((x + y) % 2 ? 230 : 20) : 120)), W, H);
    expect(s).toBeLessThan(BLUR_THRESHOLD);
  });

  it("una imagen demasiado chica no se mide", () => {
    expect(sharpness(img(8, 8, () => 0), 8, 8)).toBeNull();
  });
});

describe("isBlurry", () => {
  it("avisa solo si es poco nítida y no está oscura (la oscura tiene su aviso)", () => {
    expect(isBlurry(50, 120)).toBe(true);
    expect(isBlurry(50, 20)).toBe(false);
    expect(isBlurry(BLUR_THRESHOLD + 1, 120)).toBe(false);
    expect(isBlurry(null, 120)).toBe(false);
  });
});
