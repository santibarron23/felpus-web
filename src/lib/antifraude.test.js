import { describe, it, expect } from "vitest";
import { userRisk } from "./antifraude";
import { normalizeAlias } from "./support";

describe("userRisk", () => {
  it("sin señales: riesgo bajo, sin razones", () => {
    expect(userRisk({})).toEqual({ score: 0, level: "bajo", reasons: [] });
  });
  it("suma denuncias, reportes ocultos, denuncias al alias y ráfagas de reportes", () => {
    const r = userRisk({ denuncias_recibidas: 2, reportes_ocultos: 1, denuncias_alias: 1, reportes_24h: 5 });
    expect(r.score).toBe(4 + 3 + 3 + 3);
    expect(r.level).toBe("alto");
    expect(r.reasons).toHaveLength(4);
  });
  it("una sola denuncia: riesgo medio", () => {
    expect(userRisk({ denuncias_recibidas: 1 }).level).toBe("medio");
  });
});

describe("normalizeAlias", () => {
  it("acepta alias y CBU/CVU, sin espacios", () => {
    expect(normalizeAlias(" mi.alias.mp ")).toEqual({ ok: true, alias: "mi.alias.mp" });
    expect(normalizeAlias("0000003100012345678901")).toEqual({ ok: true, alias: "0000003100012345678901" });
    expect(normalizeAlias("")).toEqual({ ok: true, alias: null });
  });
  it("rechaza formatos raros", () => {
    expect(normalizeAlias("abc").ok).toBe(false);
    expect(normalizeAlias("hola mundo!").ok).toBe(false);
    expect(normalizeAlias("123456789").ok).toBe(true); // 9 dígitos: válido como alias
  });
});
