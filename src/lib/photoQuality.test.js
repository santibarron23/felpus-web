import { describe, it, expect } from "vitest";
import { meanLuminance, isTooDark, DARK_THRESHOLD } from "./photoQuality";

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
