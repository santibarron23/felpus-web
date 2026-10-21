import { describe, expect, it } from "vitest";
import { normalizeEmbedding } from "./imageEmbedding";

describe("normalizeEmbedding", () => {
  it("deja el vector con norma 1 y 4 decimales", () => {
    const v = normalizeEmbedding(new Float32Array([3, 4]));
    expect(v).toEqual([0.6, 0.8]);
    expect(Array.isArray(v)).toBe(true);
  });

  it("no cambia el coseno entre dos vectores (más allá del redondeo)", () => {
    const a = [0.12, -3.4, 5.6, 0.001];
    const b = [0.5, -2.9, 6.1, -0.3];
    const cos = (x, y) =>
      x.reduce((s, xi, i) => s + xi * y[i], 0) / Math.sqrt(x.reduce((s, xi) => s + xi * xi, 0) * y.reduce((s, yi) => s + yi * yi, 0));
    expect(cos(normalizeEmbedding(a), normalizeEmbedding(b))).toBeCloseTo(cos(a, b), 3);
  });

  it("devuelve null para un vector nulo o con NaN", () => {
    expect(normalizeEmbedding([0, 0, 0])).toBeNull();
    expect(normalizeEmbedding([NaN, 1])).toBeNull();
  });
});
