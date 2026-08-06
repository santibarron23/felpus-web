import { describe, it, expect, afterEach, vi } from "vitest";
import {
  capitalize,
  tokenizeWords,
  stripPunct,
  tokensFromSentence,
  tokensFromParts,
  especieLabel,
  normalizeForMatch,
  classifySentenceIcon,
  splitSentences,
  reportPublicUrl,
  composeZonaDisplay,
} from "./flyer";

describe("capitalize", () => {
  it("pone en mayúscula la primera letra", () => {
    expect(capitalize("mediano")).toBe("Mediano");
  });

  it("no rompe con cadena vacía o undefined", () => {
    expect(capitalize("")).toBe("");
    expect(capitalize(undefined)).toBe("");
  });
});

describe("tokenizeWords", () => {
  it("separa por espacios, sin importar cuántos seguidos", () => {
    expect(tokenizeWords("Perro  negro   grande")).toEqual(["Perro", "negro", "grande"]);
  });

  it("devuelve array vacío con texto vacío o undefined", () => {
    expect(tokenizeWords("")).toEqual([]);
    expect(tokenizeWords(undefined)).toEqual([]);
  });
});

describe("stripPunct", () => {
  it("saca puntuación de apertura y cierre, no la del medio", () => {
    expect(stripPunct("¿dócil?")).toBe("dócil");
    expect(stripPunct("(collar,")).toBe("collar");
    expect(stripPunct("co-dueño")).toBe("co-dueño");
  });
});

describe("tokensFromSentence", () => {
  it("marca en negrita las palabras clave (HIGHLIGHT_WORDS), el resto no", () => {
    const tokens = tokensFromSentence("Es un perro negro muy dócil");
    expect(tokens).toEqual([
      { text: "Es", bold: false },
      { text: "un", bold: false },
      { text: "perro", bold: false },
      { text: "negro", bold: true },
      { text: "muy", bold: false },
      { text: "dócil", bold: true },
    ]);
  });

  it("reconoce la palabra clave aunque tenga puntuación pegada", () => {
    const tokens = tokensFromSentence("Tiene collar, se ve.");
    expect(tokens.find((t) => t.text === "collar,")?.bold).toBe(true);
  });
});

describe("tokensFromParts", () => {
  it("solo la parte del medio queda en negrita", () => {
    const tokens = tokensFromParts("Zona:", "Palermo", "cerca de la plaza");
    expect(tokens).toEqual([
      { text: "Zona:", bold: false },
      { text: "Palermo", bold: true },
      { text: "cerca", bold: false },
      { text: "de", bold: false },
      { text: "la", bold: false },
      { text: "plaza", bold: false },
    ]);
  });

  it("funciona sin sufijo", () => {
    expect(tokensFromParts("Nombre:", "Rocky")).toEqual([
      { text: "Nombre:", bold: false },
      { text: "Rocky", bold: true },
    ]);
  });
});

describe("especieLabel", () => {
  it("traduce especie a etiqueta capitalizada", () => {
    expect(especieLabel("perro")).toBe("Perro");
    expect(especieLabel("gato")).toBe("Gato");
  });

  it("cualquier otra cosa cae en 'Mascota'", () => {
    expect(especieLabel("otro")).toBe("Mascota");
    expect(especieLabel(undefined)).toBe("Mascota");
  });
});

describe("normalizeForMatch", () => {
  it("pasa a minúscula y saca acentos", () => {
    expect(normalizeForMatch("Dócil, Cariñoso")).toBe("docil, carinoso");
  });
});

describe("classifySentenceIcon", () => {
  it("detecta ícono de ubicación por palabras clave de zona", () => {
    expect(classifySentenceIcon("Se perdió cerca de la plaza")).toBe("pin");
  });

  it("detecta ícono de cara por rasgos físicos", () => {
    expect(classifySentenceIcon("Tiene una franja blanca en la cara")).toBe("face");
  });

  it("detecta ícono de corazón por temperamento", () => {
    expect(classifySentenceIcon("Es muy dócil y cariñoso")).toBe("heart");
  });

  it("cae en el globo de chat genérico si no matchea ninguna categoría", () => {
    expect(classifySentenceIcon("Pesa diez kilos")).toBe("chat");
  });

  it("no distingue mayúsculas ni acentos", () => {
    expect(classifySentenceIcon("SE ESCAPÓ POR EL BALCÓN")).toBe("pin");
  });
});

describe("splitSentences", () => {
  it("separa por punto/signo de exclamación/interrogación seguido de espacio", () => {
    expect(splitSentences("Es un perro. Es dócil. ¿Lo viste?")).toEqual([
      "Es un perro.",
      "Es dócil.",
      "¿Lo viste?",
    ]);
  });

  it("descarta fragmentos vacíos y recorta espacios", () => {
    expect(splitSentences("  Una sola oración.  ")).toEqual(["Una sola oración."]);
  });

  it("devuelve array vacío con texto vacío, null o undefined", () => {
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences(null)).toEqual([]);
    expect(splitSentences(undefined)).toEqual([]);
  });
});

// reportPublicUrl depende de window.location.origin — en el entorno de test
// (vitest.config.mjs usa environment: "node", sin window real) se stubea a
// mano en vez de cambiar todo el proyecto a jsdom solo por esta función.
describe("reportPublicUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("arma la URL canónica /r/<id> (la misma que usa ShareButton) — bug ya corregido antes (ver tarea #8), esto evita que vuelva", () => {
    vi.stubGlobal("window", { location: { origin: "https://felpus-web.vercel.app" } });
    expect(reportPublicUrl({ id: "abc123" })).toBe("https://felpus-web.vercel.app/r/abc123");
  });

  it("codifica el id por si tiene caracteres especiales", () => {
    vi.stubGlobal("window", { location: { origin: "https://felpus-web.vercel.app" } });
    expect(reportPublicUrl({ id: "abc 123/x" })).toBe("https://felpus-web.vercel.app/r/abc%20123%2Fx");
  });

  it("sin window (SSR) devuelve cadena vacía en vez de romper", () => {
    expect(reportPublicUrl({ id: "abc123" })).toBe("");
  });
});

describe("composeZonaDisplay", () => {
  it("con solo zona (reportes viejos o zona tipeada a mano), devuelve exactamente lo mismo que antes", () => {
    expect(composeZonaDisplay({ zona: "Villa San Lorenzo" })).toBe("Villa San Lorenzo");
  });

  it("agrega ciudad y provincia cuando están disponibles", () => {
    expect(composeZonaDisplay({ zona: "Villa San Lorenzo", ciudad: "Salta", provincia: "Salta" })).toBe(
      "Villa San Lorenzo, Salta"
    );
  });

  it("agrega ciudad y provincia cuando son distintas entre sí", () => {
    expect(
      composeZonaDisplay({ zona: "Palermo", ciudad: "Buenos Aires", provincia: "Buenos Aires" })
    ).toBe("Palermo, Buenos Aires");
  });

  it("no duplica cuando ciudad y provincia son iguales entre sí, sólo agrega una vez", () => {
    expect(composeZonaDisplay({ zona: "Centro", ciudad: "Salta", provincia: "Salta" })).toBe("Centro, Salta");
  });

  it("no duplica cuando la zona ya incluye la ciudad/provincia (case-insensitive, con acentos)", () => {
    expect(
      composeZonaDisplay({ zona: "Cerca de Plaza Güemes, Salta", ciudad: "SALTA", provincia: "Salta" })
    ).toBe("Cerca de Plaza Güemes, Salta");
  });

  it("ignora ciudad/provincia vacías (sin pasar por el autocompletado)", () => {
    expect(composeZonaDisplay({ zona: "Palermo", ciudad: "", provincia: "" })).toBe("Palermo");
    expect(composeZonaDisplay({ zona: "Palermo" })).toBe("Palermo");
  });

  it("no rompe sin report", () => {
    expect(composeZonaDisplay(undefined)).toBe("");
    expect(composeZonaDisplay({})).toBe("");
  });
});
