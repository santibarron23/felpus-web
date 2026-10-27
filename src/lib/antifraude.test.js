import { describe, it, expect } from "vitest";
import { userRisk } from "./antifraude";
import { normalizeAlias, normalizeLinkCobro, linkCobroLabel } from "./support";

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

describe("normalizeLinkCobro", () => {
  it("vacío: válido y sin link", () => {
    expect(normalizeLinkCobro("  ")).toEqual({ ok: true, link: null });
  });
  it("acepta Mercado Pago y Cafecito y los deja limpios", () => {
    expect(normalizeLinkCobro("link.mercadopago.com.ar/santi")).toEqual({ ok: true, link: "https://link.mercadopago.com.ar/santi" });
    expect(normalizeLinkCobro("https://mpago.la/2xYz9Ab?utm=x#a").link).toBe("https://mpago.la/2xYz9Ab");
    expect(normalizeLinkCobro("https://www.cafecito.app/santi/").link).toBe("https://cafecito.app/santi");
  });
  it("rechaza otros sitios, trucos de dominio y links sin camino", () => {
    for (const v of [
      "https://mercadopago.com.ar.evil.com/x",
      "https://evil.com/link.mercadopago.com.ar",
      "https://user@mpago.la/x",
      "https://mpago.la:8443/x",
      "https://mpago.la/",
      "javascript:alert(1)",
      "https://cafecito.app/<script>",
    ]) {
      expect(normalizeLinkCobro(v).ok, v).toBe(false);
    }
  });
  it("linkCobroLabel", () => {
    expect(linkCobroLabel("https://mpago.la/abc")).toBe("Mercado Pago");
    expect(linkCobroLabel("https://cafecito.app/santi")).toBe("Cafecito");
    expect(linkCobroLabel("nada")).toBe("");
  });
});
