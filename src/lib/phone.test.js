import { describe, it, expect, afterEach, vi } from "vitest";
import {
  DEFAULT_COUNTRY,
  PRIORITY_COUNTRIES,
  getDefaultCountry,
  countryDisplayName,
  flagEmoji,
  getCountryList,
  parseWhatsappPhone,
  splitStoredWhatsapp,
  formatAsYouType,
} from "./phone";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getDefaultCountry", () => {
  it("cae a AR sin navigator (SSR)", () => {
    // El módulo ya chequea typeof navigator === "undefined" — en el entorno
    // de test (node) navigator no existe salvo que se stubee.
    expect(getDefaultCountry()).toBe(DEFAULT_COUNTRY);
  });

  it("detecta el país desde navigator.language", () => {
    vi.stubGlobal("navigator", { language: "pt-BR", languages: ["pt-BR"] });
    expect(getDefaultCountry()).toBe("BR");
  });

  it("prueba navigator.languages en orden hasta encontrar una región", () => {
    vi.stubGlobal("navigator", { language: "es", languages: ["es", "en-US"] });
    expect(getDefaultCountry()).toBe("US");
  });

  it("cae a AR si ningún idioma trae región reconocible", () => {
    vi.stubGlobal("navigator", { language: "es", languages: ["es", "fr"] });
    expect(getDefaultCountry()).toBe(DEFAULT_COUNTRY);
  });
});

describe("countryDisplayName", () => {
  it("devuelve el nombre en español de países conocidos", () => {
    expect(countryDisplayName("AR")).toBe("Argentina");
    expect(countryDisplayName("US")).toMatch(/Estados Unidos/);
  });

  it("no tira con un código vacío", () => {
    expect(countryDisplayName("")).toBe("");
  });
});

describe("flagEmoji", () => {
  it("arma la bandera a partir del código ISO", () => {
    // 🇦🇷 = U+1F1E6 U+1F1F7 (regional indicators A + R)
    expect(flagEmoji("AR")).toBe("🇦🇷");
    expect(flagEmoji("US")).toBe("🇺🇸");
  });

  it("devuelve un placeholder para códigos inválidos", () => {
    expect(flagEmoji("")).toBe("🏳️");
    expect(flagEmoji("X")).toBe("🏳️");
  });
});

describe("getCountryList", () => {
  it("pone los países prioritarios primero, en el orden declarado", async () => {
    const list = await getCountryList();
    expect(list.slice(0, PRIORITY_COUNTRIES.length).map((c) => c.code)).toEqual(PRIORITY_COUNTRIES);
  });

  it("incluye todos los países, sin duplicados, con flag y código de llamada", async () => {
    const list = await getCountryList();
    const codes = list.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(list.length).toBeGreaterThan(200);
    const ar = list.find((c) => c.code === "AR");
    expect(ar).toMatchObject({ code: "AR", name: "Argentina", flag: "🇦🇷", callingCode: "54" });
  });
});

describe("parseWhatsappPhone — Argentina, todos los formatos de entrada de la consigna", () => {
  const casosEquivalentes = [
    "3875885427",
    "03875885427",
    "+543875885427",
    "+5493875885427",
    "387 588 5427",
    "387-588-5427",
  ];

  it.each(casosEquivalentes)("%s normaliza al mismo E.164 con el '9' de WhatsApp", async (raw) => {
    const result = await parseWhatsappPhone(raw, "AR");
    expect(result.isValid).toBe(true);
    expect(result.e164).toBe("+5493875885427");
    expect(result.digits).toBe("5493875885427");
  });
});

describe("parseWhatsappPhone — otros países", () => {
  it("Uruguay", async () => {
    const r = await parseWhatsappPhone("099123456", "UY");
    expect(r.isValid).toBe(true);
    expect(r.e164).toBe("+59899123456");
  });

  it("Chile con + explícito (detecta el país solo)", async () => {
    const r = await parseWhatsappPhone("+56912345678", "ES"); // país del selector ignorado: el + manda
    expect(r.isValid).toBe(true);
    expect(r.e164).toBe("+56912345678");
  });

  it("Brasil", async () => {
    const r = await parseWhatsappPhone("+5511987654321", "BR");
    expect(r.isValid).toBe(true);
    expect(r.e164).toBe("+5511987654321");
  });

  it("Estados Unidos con formato local (paréntesis y guion)", async () => {
    const r = await parseWhatsappPhone("(415) 555-2671", "US");
    expect(r.isValid).toBe(true);
    expect(r.e164).toBe("+14155552671");
  });

  it("España", async () => {
    const r = await parseWhatsappPhone("612345678", "ES");
    expect(r.isValid).toBe(true);
    expect(r.e164).toBe("+34612345678");
  });
});

describe("parseWhatsappPhone — casos inválidos con motivo específico", () => {
  it("vacío -> reason 'empty'", async () => {
    expect(await parseWhatsappPhone("", "AR")).toMatchObject({ isValid: false, reason: "empty" });
    expect(await parseWhatsappPhone("   ", "AR")).toMatchObject({ isValid: false, reason: "empty" });
  });

  it("muy corto -> reason 'too_short', no 'número inválido' genérico", async () => {
    const r = await parseWhatsappPhone("387", "AR");
    expect(r.isValid).toBe(false);
    expect(r.reason).toBe("too_short");
  });

  it("basura no interpretable -> reason 'invalid'", async () => {
    const r = await parseWhatsappPhone("abc", "AR");
    expect(r.isValid).toBe(false);
    expect(r.reason).toBe("invalid");
  });
});

describe("splitStoredWhatsapp", () => {
  it("reconstruye país y número nacional desde dígitos guardados (sin '+')", async () => {
    const { country, national } = await splitStoredWhatsapp("5493875885427");
    expect(country).toBe("AR");
    expect(national.replace(/\D/g, "")).toBe("3875885427");
  });

  it("devuelve vacío para un valor vacío/nulo", async () => {
    expect(await splitStoredWhatsapp("")).toEqual({ country: null, national: "" });
    expect(await splitStoredWhatsapp(null)).toEqual({ country: null, national: "" });
  });
});

describe("formatAsYouType", () => {
  it("devuelve un string formateado sin tirar, conservando los dígitos", async () => {
    const formatted = await formatAsYouType("3875885427", "AR");
    expect(formatted.replace(/\D/g, "")).toBe("3875885427");
  });

  it("con texto vacío devuelve vacío", async () => {
    expect(await formatAsYouType("", "AR")).toBe("");
  });
});
