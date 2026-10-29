import { describe, it, expect } from "vitest";
import { moverRect, redimensionarRect, rectConTecla, rectEnPixeles, esCompleto, MIN_LADO, RECTO_COMPLETO } from "./crop";

const r = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };

describe("crop", () => {
  it("mover no se sale de la imagen", () => {
    expect(moverRect(r, 0.1, 0.1)).toEqual({ x: 0.30000000000000004, y: 0.30000000000000004, w: 0.5, h: 0.5 });
    expect(moverRect(r, 1, 1)).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    expect(moverRect(r, -1, -1)).toEqual({ x: 0, y: 0, w: 0.5, h: 0.5 });
  });

  it("redimensionar deja fija la esquina opuesta y respeta el mínimo", () => {
    const a = redimensionarRect(r, "se", 0.1, 0.1);
    expect(a.x).toBe(0.2);
    expect(a.w).toBeCloseTo(0.6);
    const b = redimensionarRect(r, "nw", 0.9, 0.9);
    expect(b.w).toBeCloseTo(MIN_LADO);
    expect(b.x + b.w).toBeCloseTo(0.7);
    const c = redimensionarRect(r, "ne", 1, -1);
    expect(c.y).toBe(0);
    expect(c.x + c.w).toBe(1);
  });

  it("teclado: flechas mueven y con Shift redimensionan", () => {
    expect(rectConTecla(r, "ArrowRight", false).x).toBeCloseTo(0.22);
    expect(rectConTecla(r, "ArrowDown", true).h).toBeCloseTo(0.52);
    expect(rectConTecla(r, "Enter", false)).toBeNull();
  });

  it("píxeles: redondea y no se sale", () => {
    expect(rectEnPixeles(r, 1000, 750)).toEqual({ sx: 200, sy: 150, sw: 500, sh: 375 });
    expect(rectEnPixeles({ x: 0.99, y: 0, w: 0.5, h: 1 }, 100, 100)).toEqual({ sx: 99, sy: 0, sw: 1, sh: 100 });
  });

  it("detecta la foto completa", () => {
    expect(esCompleto(RECTO_COMPLETO)).toBe(true);
    expect(esCompleto(r)).toBe(false);
  });
});
