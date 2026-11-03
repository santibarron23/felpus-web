import { describe, it, expect } from "vitest";
import { siguientePosicion, VELOCIDAD_PX_S } from "./useAutoScroll";

describe("siguientePosicion", () => {
  it("avanza lento: VELOCIDAD_PX_S píxeles por segundo", () => {
    expect(siguientePosicion(0, 1000 / 10, 1000)).toBeCloseTo(VELOCIDAD_PX_S / 10);
    expect(siguientePosicion(10, 16, 1000)).toBeCloseTo(10 + (VELOCIDAD_PX_S * 16) / 1000);
  });

  it("al llegar a la copia vuelve atrás exactamente un período (bucle sin salto)", () => {
    expect(siguientePosicion(999, 100, 1000)).toBeCloseTo(999 + VELOCIDAD_PX_S / 10 - 1000);
  });

  it("un salto largo (pestaña en segundo plano) cuenta como 100 ms; sin copia no se mueve", () => {
    expect(siguientePosicion(0, 60_000, 1000)).toBeCloseTo(VELOCIDAD_PX_S / 10);
    expect(siguientePosicion(5, 100, 0)).toBe(5);
  });
});
