import { describe, it, expect } from "vitest";
import {
  normalizeText,
  normalizeNickname,
  tokenize,
  jaccard,
  haversineKm,
  histIntersection,
  cosineSimilarity,
  imageSimilarity,
  scoreMatch,
  matchBreakdown,
  findMatches,
  scoreLabel,
  getTier,
  getTierProgress,
  isRecent,
  getBadges,
  timeAgo,
  formatFechaAR,
  buildShareText,
  sanitizePhoneForWhatsapp,
  composeDescripcionBase,
  composeChipSentence,
  composeClauses,
  composeAccesorioSentence,
  composeReaccionSentence,
  composeMarcaSentence,
  buildDetallesEstructurados,
  getRazaOptions,
  RAZA_ESPECIALES,
  RAZA_OPTIONS_PERRO,
  RAZA_OPTIONS_GATO,
  RAZA_NO_SE,
  SCORE_MINIMO,
  computeAdminBreakdowns,
} from "./matching";

// Reporte base reutilizable — cada test sobreescribe solo lo que le importa,
// así el caso de prueba deja claro qué campo es el que se está variando.
function makeReport(overrides = {}) {
  return {
    id: "r1",
    tipo: "perdida",
    especie: "perro",
    nombre: "Rocky",
    color: "Negro",
    colorOtro: "",
    tamano: "mediano",
    sexo: "Macho",
    edad: "Adulto (3-8 años)",
    peso: "10 a 20 kg",
    zona: "Palermo",
    lat: -34.588,
    lng: -58.43,
    descripcion: "Perro negro con collar azul, muy sociable",
    creadoEn: Date.now(),
    ...overrides,
  };
}

describe("normalizeText / tokenize / jaccard", () => {
  it("saca acentos, pasa a minúscula y limpia puntuación", () => {
    // Cada carácter que no sea a-z/0-9/espacio se reemplaza por UN espacio
    // (no se colapsan espacios múltiples) — de ahí los 3 espacios seguidos
    // entre "marron" y "muy": uno por la coma, el espacio original, y uno
    // por el "¡". tokenize() es quien sí colapsa espacios después.
    expect(normalizeText("Perrito Marrón, ¡muy Sociable!")).toBe("perrito marron   muy sociable ");
  });

  it("normalizeNickname arma un slug con guiones", () => {
    expect(normalizeNickname("María José")).toBe("maria-jose");
  });

  it("tokenize descarta stopwords y palabras muy cortas", () => {
    // "de", "la" son stopwords; "un" y "el" también — no deberían quedar.
    expect(tokenize("El perro de la vecina es muy bueno")).toEqual(["perro", "vecina", "bueno"]);
  });

  it("jaccard da 1 cuando los sets de tokens son idénticos", () => {
    const tokens = tokenize("perro negro collar azul");
    expect(jaccard(tokens, tokens)).toBe(1);
  });

  it("jaccard da 0 cuando no comparten ningún token", () => {
    expect(jaccard(tokenize("gato blanco"), tokenize("perro negro"))).toBe(0);
  });

  it("jaccard da 0 (no NaN) cuando ambos textos están vacíos", () => {
    expect(jaccard([], [])).toBe(0);
  });
});

describe("haversineKm", () => {
  it("da 0 para el mismo punto", () => {
    expect(haversineKm(-34.6, -58.4, -34.6, -58.4)).toBe(0);
  });

  it("aproxima bien una distancia conocida (CABA ~ La Plata, ~50km)", () => {
    const d = haversineKm(-34.6037, -58.3816, -34.9214, -57.9544);
    expect(d).toBeGreaterThan(45);
    expect(d).toBeLessThan(60);
  });
});

describe("histIntersection / cosineSimilarity", () => {
  it("histIntersection de dos histogramas idénticos suma 1 (normalizados)", () => {
    expect(histIntersection([0.5, 0.5], [0.5, 0.5])).toBe(1);
  });

  it("histIntersection da 0 si no se superponen", () => {
    expect(histIntersection([1, 0], [0, 1])).toBe(0);
  });

  it("histIntersection devuelve 0 si los histogramas no existen o difieren en longitud", () => {
    expect(histIntersection(null, [1])).toBe(0);
    expect(histIntersection([1], [1, 2])).toBe(0);
  });

  it("cosineSimilarity da 1 para vectores idénticos (tras remapear a [0,1])", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("cosineSimilarity da null si los vectores no son válidos", () => {
    expect(cosineSimilarity(null, [1, 2])).toBeNull();
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBeNull();
    expect(cosineSimilarity([0, 0], [0, 0])).toBeNull(); // norma 0
  });
});

describe("imageSimilarity", () => {
  it("usa el embedding cuando ambos reportes lo tienen", () => {
    const a = { embedding: [1, 0], hist: [1, 0] };
    const b = { embedding: [1, 0], hist: [0, 1] }; // hist NO coincide, embedding sí
    expect(imageSimilarity(a, b)).toBeCloseTo(1);
  });

  it("cae al histograma si falta el embedding de un lado", () => {
    const a = { embedding: null, hist: [0.5, 0.5] };
    const b = { embedding: null, hist: [0.5, 0.5] };
    expect(imageSimilarity(a, b)).toBe(1);
  });

  it("con varias fotos, se queda con la mejor combinación", () => {
    const a = { fotos: [{ hist: [1, 0] }, { hist: [0, 1] }] };
    const b = { fotos: [{ hist: [0, 1] }] };
    // la segunda foto de "a" matchea perfecto con la única de "b"
    expect(imageSimilarity(a, b)).toBe(1);
  });
});

describe("scoreMatch", () => {
  it("da 0 si las especies no coinciden, sin importar lo demás", () => {
    const a = makeReport({ especie: "perro" });
    const b = makeReport({ especie: "gato" }); // idéntico en todo lo demás
    expect(scoreMatch(a, b).score).toBe(0);
  });

  it("da un score alto para dos reportes prácticamente idénticos y cercanos", () => {
    const a = makeReport();
    const b = makeReport({ id: "r2", tipo: "encontrada", lat: -34.589, lng: -58.431 });
    const result = scoreMatch(a, b);
    expect(result.score).toBeGreaterThan(0.5);
  });

  it("penaliza la distancia: mismo reporte pero a mucha distancia da menos score", () => {
    const a = makeReport();
    const cerca = scoreMatch(a, makeReport({ id: "r2", lat: -34.589, lng: -58.431 })).score;
    // Córdoba capital, a ~650km de Palermo
    const lejos = scoreMatch(a, makeReport({ id: "r3", lat: -31.4201, lng: -64.1888 })).score;
    expect(cerca).toBeGreaterThan(lejos);
  });

  it("sin lat/lng, usa la zona como aproximación (misma zona > zona distinta)", () => {
    const a = makeReport({ lat: null, lng: null, zona: "Palermo" });
    const mismaZona = scoreMatch(a, makeReport({ id: "r2", lat: null, lng: null, zona: "Palermo" })).score;
    const otraZona = scoreMatch(a, makeReport({ id: "r3", lat: null, lng: null, zona: "Recoleta" })).score;
    expect(mismaZona).toBeGreaterThan(otraZona);
  });

  it("da más peso a la imagen cuando ambos lados tienen embedding de IA", () => {
    const conIA = makeReport({ embedding: [1, 0, 0] });
    const sinIA = makeReport({ embedding: null, hist: [0.5, 0.5] });
    // mismo par de reportes salvo por tener o no embedding real
    const candidatoConIA = makeReport({ id: "r2", embedding: [0, 1, 0], color: "Blanco", descripcion: "otra cosa" });
    const candidatoSinIA = makeReport({ id: "r3", embedding: null, hist: [0.5, 0.5], color: "Blanco", descripcion: "otra cosa" });
    // con embedding disponible pero sin ninguna similitud de imagen (vectores
    // ortogonales) y datos estructurados que no matchean, el score con IA
    // debería ser menor o igual que sin IA (donde el histograma sí coincide)
    const scoreConIA = scoreMatch(conIA, candidatoConIA).score;
    const scoreSinIA = scoreMatch(sinIA, candidatoSinIA).score;
    expect(scoreSinIA).toBeGreaterThan(scoreConIA);
  });

  it("el score siempre queda entre 0 y 1", () => {
    const a = makeReport();
    const b = makeReport({ id: "r2" });
    const { score } = scoreMatch(a, b);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("misma raza real sube el score respecto a razas distintas", () => {
    const base = makeReport({ raza: "Labrador" });
    const mismaRaza = scoreMatch(base, makeReport({ id: "r2", raza: "Labrador" })).score;
    const otraRaza = scoreMatch(base, makeReport({ id: "r3", raza: "Chihuahua" })).score;
    expect(mismaRaza).toBeGreaterThan(otraRaza);
  });

  it("coincidir en 'Mestizo/a' no aporta score extra (no es una señal real)", () => {
    const base = makeReport({ raza: "" });
    const sinRaza = scoreMatch(base, makeReport({ id: "r2", raza: "" })).score;
    const dosMestizos = scoreMatch(makeReport({ raza: "Mestizo/a" }), makeReport({ id: "r3", raza: "Mestizo/a" })).score;
    expect(dosMestizos).toBe(sinRaza);
  });

  it("'Sin raza / Mestizo', 'No sé / Desconocida' y 'Otra raza' tampoco aportan score (mismo criterio que 'Mestizo/a')", () => {
    const base = makeReport({ raza: "" });
    const sinRaza = scoreMatch(base, makeReport({ id: "r2", raza: "" })).score;
    for (const valor of RAZA_ESPECIALES) {
      const conEspecial = scoreMatch(makeReport({ raza: valor }), makeReport({ id: "r3", raza: valor })).score;
      expect(conEspecial).toBe(sinRaza);
    }
  });

  it("en gato, la raza pesa menos que en perro", () => {
    const perroConRaza = scoreMatch(makeReport({ especie: "perro", raza: "Labrador" }), makeReport({ id: "r2", especie: "perro", raza: "Chihuahua" })).score;
    const perroSinRaza = scoreMatch(makeReport({ especie: "perro", raza: "" }), makeReport({ id: "r3", especie: "perro", raza: "" })).score;
    const gatoConRaza = scoreMatch(makeReport({ especie: "gato", raza: "Siamés" }), makeReport({ id: "r4", especie: "gato", raza: "Persa" })).score;
    const gatoSinRaza = scoreMatch(makeReport({ especie: "gato", raza: "" }), makeReport({ id: "r5", especie: "gato", raza: "" })).score;
    // Misma diferencia (razas distintas vs. sin dato) pero debería pesar
    // notoriamente menos en gato que en perro.
    const impactoPerro = perroSinRaza - perroConRaza;
    const impactoGato = gatoSinRaza - gatoConRaza;
    expect(impactoGato).toBeLessThan(impactoPerro);
  });

  it("coincidir en detalles estructurados (accesorio/comportamiento/marca) sube el score", () => {
    const detallesA = { accesorios: ["collar"], comportamientos: ["miedoso"], marca_distintiva: ["mancha"], ubicacion_marca: "pecho" };
    const base = makeReport({ detalles: detallesA });
    const coincide = scoreMatch(base, makeReport({ id: "r2", detalles: detallesA })).score;
    const noCoincide = scoreMatch(
      base,
      makeReport({ id: "r3", detalles: { accesorios: ["panuelo"], comportamientos: ["se_acerca"], marca_distintiva: ["cojea"] } })
    ).score;
    expect(coincide).toBeGreaterThan(noCoincide);
  });

  it("'no_se'/'nada'/'otro' en detalles no aportan señal (ni a favor ni en contra)", () => {
    const sinDetalles = scoreMatch(makeReport({ detalles: {} }), makeReport({ id: "r2", detalles: {} })).score;
    const soloRuido = scoreMatch(
      makeReport({ detalles: { accesorios: ["nada"], comportamientos: ["no_se"] } }),
      makeReport({ id: "r3", detalles: { accesorios: ["nada"], comportamientos: ["no_se"] } })
    ).score;
    expect(soloRuido).toBe(sinDetalles);
  });

  it("'Otro color' sin texto de ninguno de los dos lados no aporta señal (no es un match perfecto por default)", () => {
    // Antes del fix, dos reportes con color:"Otro color" y colorOtro:"" vacío
    // puntuaban como coincidencia PERFECTA de color solo por ausencia de dato
    // — mismo bug de fondo que "Mestizo/a" en raza, ya cubierto arriba.
    const a = makeReport({ color: "Otro color", colorOtro: "" });
    const b = makeReport({ id: "r2", color: "Otro color", colorOtro: "" });
    const sinColorOtro = scoreMatch(a, b).score;

    const sinColorDato = scoreMatch(makeReport({ color: "" }), makeReport({ id: "r3", color: "" })).score;
    expect(sinColorOtro).toBe(sinColorDato);
  });

  it("'Otro color' con el mismo texto escrito de ambos lados sí sube el score", () => {
    // El sexo distinto evita que ambos escenarios empaten en un score
    // "perfecto" de 1.0 por los demás campos — así se puede ver el efecto
    // real de sumar (o no) la señal de color.
    const conTextoIgual = scoreMatch(
      makeReport({ sexo: "Macho", color: "Otro color", colorOtro: "Tricolor" }),
      makeReport({ id: "r2", sexo: "Hembra", color: "Otro color", colorOtro: "Tricolor" })
    ).score;
    const sinTexto = scoreMatch(
      makeReport({ sexo: "Macho", color: "Otro color", colorOtro: "" }),
      makeReport({ id: "r3", sexo: "Hembra", color: "Otro color", colorOtro: "" })
    ).score;
    expect(conTextoIgual).toBeGreaterThan(sinTexto);
  });

  // Auditoría integral (2026-08-09) — hallazgo P1: "fecha" (cuándo se
  // perdió/encontró de verdad, distinto de creadoEn) se pedía en el
  // formulario pero nunca se usaba en el scoring. Estos tests fijan que
  // ahora sí aporta señal, siempre gradual (nunca descarta un match por
  // fecha sola — una mascota puede aparecer semanas después).
  describe("fecha", () => {
    it("fechas cercanas dan más score que fechas muy separadas", () => {
      const a = makeReport({ fecha: "2026-08-01" });
      const cercana = scoreMatch(a, makeReport({ id: "r2", fecha: "2026-08-02" })).score;
      const lejana = scoreMatch(a, makeReport({ id: "r3", fecha: "2026-05-01" })).score;
      expect(cercana).toBeGreaterThan(lejana);
    });

    it("sin fecha de alguno de los dos lados, es neutro (ni ayuda ni penaliza)", () => {
      // Mismo par de reportes salvo por tener o no "fecha" — el resto de
      // los campos coincide, así que cualquier diferencia de score viene
      // pura y exclusivamente de fechaSimilarity.
      const conFechaIgual = scoreMatch(
        makeReport({ fecha: "2026-08-01" }),
        makeReport({ id: "r2", fecha: "2026-08-01" })
      ).score;
      const sinFechaNinguno = scoreMatch(makeReport({ fecha: undefined }), makeReport({ id: "r2", fecha: undefined })).score;
      const fechaMuyLejana = scoreMatch(
        makeReport({ fecha: "2026-08-01" }),
        makeReport({ id: "r2", fecha: "2020-01-01" })
      ).score;
      // Neutro cae ESTRICTAMENTE entre "coinciden perfecto" y "muy lejanas"
      // — nunca es tratado como si coincidieran (optimista de más) ni como
      // si estuvieran en las antípodas del calendario (pesimista de más).
      expect(sinFechaNinguno).toBeLessThan(conFechaIgual);
      expect(sinFechaNinguno).toBeGreaterThan(fechaMuyLejana);
    });

    it("una fecha muy lejana NUNCA lleva el score a 0 por sí sola (nunca es un corte binario)", () => {
      const a = makeReport({ fecha: "2026-08-01" });
      const b = makeReport({ id: "r2", fecha: "2020-01-01" }); // ~6 años de diferencia
      expect(scoreMatch(a, b).score).toBeGreaterThan(0);
    });

    it("locationReferenceKm usa la fecha real del evento, no creadoEn — una mascota perdida hace días tolera más distancia", () => {
      // Mismo par de coordenadas (~600m de diferencia) en los dos casos —
      // la única diferencia es CUÁNDO dicen que pasó el evento. Si el radio
      // de tolerancia todavía mirara creadoEn (ambos "ahora"), el score de
      // ubicación sería idéntico en los dos casos; si mira "fecha", el caso
      // con más días transcurridos debería tolerar la distancia mejor.
      const perdidaHaceRato = makeReport({
        fecha: "2026-07-20", // ~20 días antes de la fecha del "encontrada"
        creadoEn: Date.now(),
        lat: -34.588,
        lng: -58.43,
      });
      const encontradaHoy = makeReport({
        id: "r2",
        tipo: "encontrada",
        fecha: "2026-08-09",
        creadoEn: Date.now(),
        lat: -34.593,
        lng: -58.436,
      });
      const perdidaRecien = makeReport({
        id: "r3",
        fecha: "2026-08-08", // 1 día antes
        creadoEn: Date.now(),
        lat: -34.588,
        lng: -58.43,
      });
      const scoreConMasDias = scoreMatch(perdidaHaceRato, encontradaHoy).locScore;
      const scoreConPocosDias = scoreMatch(perdidaRecien, encontradaHoy).locScore;
      expect(scoreConMasDias).toBeGreaterThan(scoreConPocosDias);
    });
  });

  // Auditoría integral (2026-08-09): "tamano" comparaba exacto, distinto al
  // trato ya dado a edad/peso (categoría vecina = evidencia parcial, no 0).
  describe("tamano", () => {
    it("categoría vecina (chico/mediano o mediano/grande) da más score que la opuesta (chico/grande)", () => {
      const chico = makeReport({ tamano: "chico" });
      const vecino = scoreMatch(chico, makeReport({ id: "r2", tamano: "mediano" })).score;
      const opuesto = scoreMatch(chico, makeReport({ id: "r3", tamano: "grande" })).score;
      expect(vecino).toBeGreaterThan(opuesto);
    });

    it("mismo tamano sigue dando el score más alto de los tres casos", () => {
      const chico = makeReport({ tamano: "chico" });
      const igual = scoreMatch(chico, makeReport({ id: "r2", tamano: "chico" })).score;
      const vecino = scoreMatch(chico, makeReport({ id: "r3", tamano: "mediano" })).score;
      expect(igual).toBeGreaterThan(vecino);
    });
  });
});

describe("matchBreakdown", () => {
  it("con dos reportes casi idénticos, todo coincide", () => {
    const a = makeReport();
    const b = makeReport({ id: "r2", lat: -34.5881, lng: -58.4301 }); // ~10m, sigue "cerca"
    const items = matchBreakdown(a, b);
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey.color.coincide).toBe(true);
    expect(byKey.tamano.coincide).toBe(true);
    expect(byKey.sexo.coincide).toBe(true);
    expect(byKey.zona.coincide).toBe(true);
    expect(byKey.distancia.coincide).toBe(true);
  });

  it("marca color/tamaño/sexo como diferencia cuando de verdad difieren, con detail legible", () => {
    const a = makeReport({ color: "Negro", tamano: "chico", sexo: "Macho" });
    const b = makeReport({ id: "r2", color: "Blanco", tamano: "grande", sexo: "Hembra" });
    const items = matchBreakdown(a, b);
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey.color).toEqual({ key: "color", label: "Color", coincide: false, detail: "Negro / Blanco" });
    expect(byKey.tamano.coincide).toBe(false);
    expect(byKey.sexo.coincide).toBe(false);
  });

  it("omite el ítem 'color' si ambos eligieron 'Otro color' pero ninguno escribió el detalle", () => {
    const a = makeReport({ color: "Otro color", colorOtro: "" });
    const b = makeReport({ id: "r2", color: "Otro color", colorOtro: "" });
    const keys = matchBreakdown(a, b).map((i) => i.key);
    expect(keys).not.toContain("color");
  });

  it("omite un campo si alguno de los dos reportes no lo completó (no es 'diferencia', es 'sin dato')", () => {
    const a = makeReport({ sexo: "" });
    const b = makeReport({ id: "r2" });
    const keys = matchBreakdown(a, b).map((i) => i.key);
    expect(keys).not.toContain("sexo");
  });

  it("'No sé' en sexo no cuenta como diferencia (mismo criterio que scoreMatch)", () => {
    const a = makeReport({ sexo: "No sé" });
    const b = makeReport({ id: "r2", sexo: "Macho" });
    const keys = matchBreakdown(a, b).map((i) => i.key);
    expect(keys).not.toContain("sexo");
  });

  it("zona y distancia son dos ítems separados: misma zona por nombre, pero lejos en el mapa", () => {
    const a = makeReport({ zona: "Palermo", lat: -34.58, lng: -58.43 });
    const b = makeReport({ id: "r2", zona: "Palermo", lat: -34.65, lng: -58.5 }); // ~10km
    const items = matchBreakdown(a, b);
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey.zona.coincide).toBe(true);
    expect(byKey.distancia.coincide).toBe(false);
    expect(byKey.distancia.detail).toMatch(/km de distancia/);
  });

  it("sin lat/lng de ningún lado, no hay ítem de 'distancia' (solo zona)", () => {
    const a = makeReport({ lat: null, lng: null });
    const b = makeReport({ id: "r2", lat: null, lng: null });
    const keys = matchBreakdown(a, b).map((i) => i.key);
    expect(keys).toContain("zona");
    expect(keys).not.toContain("distancia");
  });

  it("la foto siempre aparece con un detail cualitativo, coincida o no", () => {
    const parecida = matchBreakdown(
      { ...makeReport(), embedding: [1, 0] },
      { ...makeReport({ id: "r2" }), embedding: [1, 0] }
    );
    const distinta = matchBreakdown(
      { ...makeReport(), embedding: [1, 0] },
      { ...makeReport({ id: "r2" }), embedding: [-1, 0] } // vectores opuestos: coseno -1 -> remapeado a 0
    );
    const foto1 = parecida.find((i) => i.key === "imagen");
    const foto2 = distinta.find((i) => i.key === "imagen");
    expect(foto1.coincide).toBe(true);
    expect(foto1.detail).toBe("Muy parecida");
    expect(foto2.coincide).toBe(false);
    expect(foto2.detail).toBeTruthy();
  });

  it("raza: se omite si cualquiera de los dos es 'mestizo/no sé/otra raza' (sin señal real)", () => {
    const a = makeReport({ raza: "Labrador" });
    const b = makeReport({ id: "r2", raza: "No sé / Desconocida" });
    expect(matchBreakdown(a, b).map((i) => i.key)).not.toContain("raza");
  });

  it("detalles: coincide si hay overlap real de chips (accesorio/reacción/marca)", () => {
    const a = makeReport({ detalles: { accesorios: ["collar"] } });
    const b = makeReport({ id: "r2", detalles: { accesorios: ["collar"] } });
    const c = makeReport({ id: "r3", detalles: { accesorios: ["pañuelo"] } });
    expect(matchBreakdown(a, b).find((i) => i.key === "detalles").coincide).toBe(true);
    expect(matchBreakdown(a, c).find((i) => i.key === "detalles").coincide).toBe(false);
  });
});

describe("findMatches", () => {
  it("descarta candidatos por debajo de SCORE_MINIMO y ordena de mayor a menor", () => {
    const base = makeReport();
    const bueno = makeReport({ id: "bueno", lat: -34.589, lng: -58.431 });
    const malo = makeReport({ id: "malo", especie: "gato" }); // score 0, descartado
    const resultado = findMatches(base, [malo, bueno]);
    expect(resultado.map((m) => m.report.id)).toEqual(["bueno"]);
    expect(resultado[0].score).toBeGreaterThanOrEqual(SCORE_MINIMO);
  });

  it("respeta el límite", () => {
    const base = makeReport();
    const candidatos = [
      makeReport({ id: "a", lat: -34.589, lng: -58.431 }),
      makeReport({ id: "b", lat: -34.589, lng: -58.432 }),
      makeReport({ id: "c", lat: -34.59, lng: -58.433 }),
    ];
    expect(findMatches(base, candidatos, { limit: 2 })).toHaveLength(2);
  });

  it("devuelve todos los candidatos válidos si no se pasa límite", () => {
    const base = makeReport();
    const candidatos = [makeReport({ id: "a", lat: -34.589, lng: -58.431 })];
    expect(findMatches(base, candidatos)).toHaveLength(1);
  });
});

describe("scoreLabel", () => {
  const colors = { green: "green", orangeInk: "orange", muted: "gray" };
  it("clasifica el score en alta/media/baja probabilidad", () => {
    expect(scoreLabel(0.8, colors).text).toBe("Alta probabilidad");
    expect(scoreLabel(0.5, colors).text).toBe("Probabilidad media");
    expect(scoreLabel(0.1, colors).text).toBe("Probabilidad baja");
  });
});

describe("getTier / getTierProgress", () => {
  const colors = {
    tierBronze: "bronze", tierBronzeText: "bronzeText",
    tierSilver: "silver", tierSilverText: "silverText",
    tierGold: "gold", tierGoldText: "goldText",
    tierLegendary: "legendary", tierLegendaryText: "legendaryText",
  };

  it("asigna el nivel correcto según los umbrales de puntos", () => {
    expect(getTier(0, colors).label).toBe("Vecino atento");
    expect(getTier(20, colors).label).toBe("Guardián de barrio");
    expect(getTier(50, colors).label).toBe("Rescatista");
    expect(getTier(100, colors).label).toBe("Leyenda Felpus");
    expect(getTier(9999, colors).label).toBe("Leyenda Felpus");
  });

  it("separa bg (siempre igual) de text (varía por tema)", () => {
    const tier = getTier(50, colors);
    expect(tier.bg).toBe("gold");
    expect(tier.text).toBe("goldText");
  });

  it("getTierProgress calcula el % correcto dentro de un nivel", () => {
    // Entre 20 (Guardián) y 50 (Rescatista): con 35 puntos, a mitad de camino.
    const progress = getTierProgress(35);
    expect(progress.currentLabel).toBe("Guardián de barrio");
    expect(progress.nextLabel).toBe("Rescatista");
    expect(progress.progressPct).toBe(50);
    expect(progress.pointsToNext).toBe(15);
  });

  it("getTierProgress en el nivel máximo no tiene próximo nivel", () => {
    const progress = getTierProgress(500);
    expect(progress.nextLabel).toBeNull();
    expect(progress.progressPct).toBe(100);
  });
});

describe("isRecent", () => {
  it("es true para algo creado hace 1 hora", () => {
    expect(isRecent({ creadoEn: Date.now() - 3600 * 1000 })).toBe(true);
  });

  it("es false para algo creado hace 2 días", () => {
    expect(isRecent({ creadoEn: Date.now() - 2 * 24 * 3600 * 1000 })).toBe(false);
  });
});

describe("getBadges", () => {
  it("devuelve solo las insignias que corresponden", () => {
    const ids = getBadges({ reportes: 1, reencuentros: 0, hearts: 0, points: 0 }).map((b) => b.id);
    expect(ids).toEqual(["primera-huella"]);
  });

  it("devuelve [] si no hay contribuyente", () => {
    expect(getBadges(null)).toEqual([]);
  });
});

describe("timeAgo", () => {
  it("distingue singular de plural", () => {
    expect(timeAgo(Date.now() - 60 * 60 * 1000)).toBe("hace 1 hora");
    expect(timeAgo(Date.now() - 2 * 60 * 60 * 1000)).toBe("hace 2 horas");
  });

  it("devuelve cadena vacía si no hay timestamp", () => {
    expect(timeAgo(null)).toBe("");
  });
});

describe("formatFechaAR", () => {
  it("convierte AAAA-MM-DD a DD/MM/AAAA", () => {
    expect(formatFechaAR("2026-07-20")).toBe("20/07/2026");
  });

  it("devuelve la entrada sin tocar si no tiene 3 partes separadas por guion", () => {
    expect(formatFechaAR("no-fecha")).toBe("no-fecha");
    expect(formatFechaAR("")).toBe("");
  });
});

describe("buildShareText", () => {
  it("arma el texto con el tipo en mayúsculas y el nombre si existe", () => {
    const texto = buildShareText(makeReport({ tipo: "perdida", nombre: "Rocky" }));
    expect(texto).toContain("PERDIDA");
    expect(texto).toContain("Rocky —");
  });

  it("omite el guion del nombre si el reporte no tiene nombre", () => {
    const texto = buildShareText(makeReport({ nombre: "" }));
    expect(texto).not.toContain(" — ");
  });

  it("suma la raza entre paréntesis cuando no es 'Mestizo/a'", () => {
    expect(buildShareText(makeReport({ raza: "Labrador" }))).toContain("perro (Labrador)");
  });

  it("no muestra la raza si es 'Mestizo/a' o está vacía", () => {
    expect(buildShareText(makeReport({ raza: "Mestizo/a" }))).not.toContain("(");
    expect(buildShareText(makeReport({ raza: "" }))).not.toContain("(");
  });

  it("tampoco muestra la raza para 'Sin raza / Mestizo', 'No sé / Desconocida' u 'Otra raza'", () => {
    for (const valor of RAZA_ESPECIALES) {
      expect(buildShareText(makeReport({ raza: valor }))).not.toContain("(");
    }
  });
});

describe("composeDescripcionBase", () => {
  it("arma una frase con lo que ya se completó en el formulario", () => {
    const texto = composeDescripcionBase({
      especie: "perro",
      tamano: "mediano",
      color: "Negro",
      colorOtro: "",
      edad: "Adulto (3-8 años)",
      sexo: "Macho",
    });
    expect(texto).toBe("Es un perro, de tamaño mediano, color negro, adulto, macho.");
  });

  it("suma la raza justo después de la especie, si se completó", () => {
    const texto = composeDescripcionBase({ especie: "perro", raza: "Labrador", tamano: "mediano", color: "", colorOtro: "", edad: "", sexo: "" });
    expect(texto).toBe("Es un perro Labrador, de tamaño mediano.");
  });

  it("no suma 'Mestizo/a' a la frase (no aporta nada nuevo)", () => {
    const texto = composeDescripcionBase({ especie: "gato", raza: "Mestizo/a", tamano: "chico", color: "", colorOtro: "", edad: "", sexo: "" });
    expect(texto).toBe("Es un gato, de tamaño chico.");
  });

  it("tampoco suma 'Sin raza / Mestizo', 'No sé / Desconocida' ni 'Otra raza'", () => {
    for (const valor of RAZA_ESPECIALES) {
      const texto = composeDescripcionBase({ especie: "gato", raza: valor, tamano: "chico", color: "", colorOtro: "", edad: "", sexo: "" });
      expect(texto).toBe("Es un gato, de tamaño chico.");
    }
  });

  it("usa colorOtro cuando el color es 'Otro color'", () => {
    const texto = composeDescripcionBase({
      especie: "gato",
      tamano: "chico",
      color: "Otro color",
      colorOtro: "Tricolor",
      edad: "",
      sexo: "",
    });
    expect(texto).toContain("color tricolor");
  });

  it("omite edad/sexo cuando son 'No sé' o están vacíos", () => {
    const texto = composeDescripcionBase({
      especie: "otro",
      tamano: "grande",
      color: "Blanco",
      colorOtro: "",
      edad: "No sé",
      sexo: "No sé",
    });
    expect(texto).toBe("Es una mascota, de tamaño grande, color blanco.");
  });

  it("devuelve cadena vacía sin formulario", () => {
    expect(composeDescripcionBase(null)).toBe("");
  });
});

describe("composeChipSentence", () => {
  it("une un solo chip sin conector", () => {
    expect(composeChipSentence("Tenía", ["Collar"])).toBe("Tenía collar.");
  });

  it("separa el último ítem con 'y' cuando hay varios", () => {
    expect(composeChipSentence("Tenía", ["Collar", "Chapita con nombre"])).toBe(
      "Tenía collar y chapita con nombre."
    );
  });

  it("con 3 o más, todos menos el último van con coma", () => {
    expect(composeChipSentence("Es", ["Sociable", "Curioso", "Juguetón"])).toBe(
      "Es sociable, curioso y juguetón."
    );
  });

  it("devuelve cadena vacía si no hay chips seleccionados", () => {
    expect(composeChipSentence("Tenía", [])).toBe("");
    expect(composeChipSentence("Tenía", null)).toBe("");
  });
});

describe("composeClauses", () => {
  it("une varias oraciones ya armadas, agregando el punto si falta", () => {
    expect(composeClauses(["Es sociable", "Se deja agarrar sin problema"])).toBe(
      "Es sociable. Se deja agarrar sin problema."
    );
  });

  it("no duplica el punto si la oración ya termina en uno", () => {
    expect(composeClauses(["Responde a su nombre."])).toBe("Responde a su nombre.");
  });

  it("devuelve cadena vacía sin oraciones", () => {
    expect(composeClauses([])).toBe("");
    expect(composeClauses(null)).toBe("");
  });
});

describe("getRazaOptions", () => {
  it("empieza siempre con RAZA_ESPECIALES, en ese orden", () => {
    expect(getRazaOptions("perro").slice(0, 3)).toEqual(RAZA_ESPECIALES);
    expect(getRazaOptions("gato").slice(0, 3)).toEqual(RAZA_ESPECIALES);
  });

  it("perro trae las razas de perro después de las especiales, gato las de gato", () => {
    expect(getRazaOptions("perro").slice(3)).toEqual(RAZA_OPTIONS_PERRO);
    expect(getRazaOptions("gato").slice(3)).toEqual(RAZA_OPTIONS_GATO);
  });

  it("las razas están ordenadas alfabéticamente", () => {
    const collator = new Intl.Collator("es", { sensitivity: "base" });
    const ordenadasPerro = [...RAZA_OPTIONS_PERRO].sort(collator.compare);
    expect(RAZA_OPTIONS_PERRO).toEqual(ordenadasPerro);
    const ordenadasGato = [...RAZA_OPTIONS_GATO].sort(collator.compare);
    expect(RAZA_OPTIONS_GATO).toEqual(ordenadasGato);
  });

  it("una especie que no es perro ni gato no trae razas, solo las especiales", () => {
    expect(getRazaOptions("otro")).toEqual(RAZA_ESPECIALES);
    expect(getRazaOptions(undefined)).toEqual(RAZA_ESPECIALES);
  });

  it("RAZA_NO_SE es exactamente el segundo valor de RAZA_ESPECIALES", () => {
    expect(RAZA_NO_SE).toBe(RAZA_ESPECIALES[1]);
    expect(RAZA_NO_SE).toBe("No sé / Desconocida");
  });
});

describe("composeAccesorioSentence", () => {
  it("arma la frase a partir de los ids seleccionados", () => {
    expect(composeAccesorioSentence(["collar"])).toBe("Tenía collar.");
    expect(composeAccesorioSentence(["collar", "chapita"])).toBe("Tenía collar y chapita identificatoria.");
  });

  it("'nada' da una frase propia y excluye cualquier otro accesorio", () => {
    expect(composeAccesorioSentence(["nada"])).toBe("No tenía nada puesto.");
    expect(composeAccesorioSentence(["collar", "nada"])).toBe("No tenía nada puesto.");
  });

  it("devuelve cadena vacía sin selección", () => {
    expect(composeAccesorioSentence([])).toBe("");
    expect(composeAccesorioSentence(null)).toBe("");
  });
});

describe("composeReaccionSentence", () => {
  it("arma una oración por cada reacción seleccionada", () => {
    expect(composeReaccionSentence(["se_acerca"])).toBe("Se acerca a los desconocidos.");
    expect(composeReaccionSentence(["miedoso", "puede_escapar"])).toBe(
      "Es miedoso/a con los desconocidos. Puede escaparse o alejarse corriendo."
    );
  });

  it("'no_se' no aporta ninguna oración (mismo criterio que 'Mestizo/a' en raza)", () => {
    expect(composeReaccionSentence(["no_se"])).toBe("");
    expect(composeReaccionSentence(["no_se", "se_acerca"])).toBe("Se acerca a los desconocidos.");
  });

  it("devuelve cadena vacía sin selección", () => {
    expect(composeReaccionSentence([])).toBe("");
    expect(composeReaccionSentence(null)).toBe("");
  });
});

describe("composeMarcaSentence", () => {
  it("arma una oración por cada marca fija seleccionada", () => {
    expect(composeMarcaSentence(["cicatriz"])).toBe("Tiene una cicatriz visible.");
    expect(composeMarcaSentence(["cojea", "peludo"])).toBe("Cojea. Es muy peludo/a.");
  });

  it("'mancha' sin ubicación ni color da una frase genérica", () => {
    expect(composeMarcaSentence(["mancha"])).toBe("Tiene una mancha particular.");
  });

  it("'mancha' con ubicación agrega la preposición correcta", () => {
    expect(composeMarcaSentence(["mancha"], { manchaUbicacion: "pecho" })).toBe("Tiene una mancha particular en el pecho.");
    expect(composeMarcaSentence(["mancha"], { manchaUbicacion: "cara" })).toBe("Tiene una mancha particular en la cara.");
    expect(composeMarcaSentence(["mancha"], { manchaUbicacion: "patas" })).toBe("Tiene una mancha particular en las patas.");
  });

  it("'mancha' con ubicación y color arma la frase completa", () => {
    expect(composeMarcaSentence(["mancha"], { manchaUbicacion: "pecho", manchaColor: "Blanca" })).toBe(
      "Tiene una mancha blanca particular en el pecho."
    );
  });

  it("'otro' no aporta ninguna oración propia", () => {
    expect(composeMarcaSentence(["otro"])).toBe("");
    expect(composeMarcaSentence(["cojea", "otro"])).toBe("Cojea.");
  });

  it("devuelve cadena vacía sin selección", () => {
    expect(composeMarcaSentence([])).toBe("");
    expect(composeMarcaSentence(null)).toBe("");
  });
});

describe("buildDetallesEstructurados", () => {
  it("arma el objeto con lo seleccionado, omitiendo campos vacíos", () => {
    expect(
      buildDetallesEstructurados({
        accesorios: ["collar"],
        comportamientos: ["miedoso", "puede_escapar"],
        marcaDistintiva: ["mancha"],
        ubicacionMarca: "pecho",
        colorMarca: "Blanca",
      })
    ).toEqual({
      accesorios: ["collar"],
      comportamientos: ["miedoso", "puede_escapar"],
      marca_distintiva: ["mancha"],
      ubicacion_marca: "pecho",
      color_marca: "Blanca",
    });
  });

  it("devuelve un objeto vacío sin ninguna selección", () => {
    expect(buildDetallesEstructurados()).toEqual({});
    expect(buildDetallesEstructurados({ accesorios: [], comportamientos: [], marcaDistintiva: [], ubicacionMarca: "", colorMarca: "" })).toEqual({});
  });
});

describe("sanitizePhoneForWhatsapp", () => {
  it("deja solo dígitos", () => {
    expect(sanitizePhoneForWhatsapp("+54 (11) 1234-5678")).toBe("541112345678");
  });

  it("devuelve cadena vacía para entradas vacías/nulas", () => {
    expect(sanitizePhoneForWhatsapp("")).toBe("");
    expect(sanitizePhoneForWhatsapp(null)).toBe("");
  });
});

describe("computeAdminBreakdowns", () => {
  function findLabel(breakdown, label) {
    return breakdown.find((e) => e.label === label);
  }

  it("con lista vacía, todos los desgloses quedan vacíos y total en 0", () => {
    const result = computeAdminBreakdowns([]);
    expect(result.total).toBe(0);
    expect(result.porEspecie).toEqual([]);
    expect(result.porRazaPerdida).toEqual([]);
  });

  it("no rompe si le pasan undefined/null en vez de un array", () => {
    expect(computeAdminBreakdowns(undefined).total).toBe(0);
    expect(computeAdminBreakdowns(null).total).toBe(0);
  });

  it("porEspecie/porTamano/porSexo/porEdad: cuentan y calculan % sobre el total general", () => {
    const reports = [
      makeReport({ id: "1", especie: "perro", tamano: "mediano", sexo: "Macho", edad: "Adulto (3-8 años)" }),
      makeReport({ id: "2", especie: "perro", tamano: "chico", sexo: "Hembra", edad: "Adulto (3-8 años)" }),
      makeReport({ id: "3", especie: "gato", tamano: "chico", sexo: "Hembra", edad: "Cachorro/cría (0-1 año)" }),
      makeReport({ id: "4", especie: "gato", tamano: "chico", sexo: "Hembra", edad: "Cachorro/cría (0-1 año)" }),
    ];
    const result = computeAdminBreakdowns(reports);
    expect(result.total).toBe(4);
    expect(findLabel(result.porEspecie, "Perro")).toEqual({ label: "Perro", count: 2, pct: 50 });
    expect(findLabel(result.porEspecie, "Gato")).toEqual({ label: "Gato", count: 2, pct: 50 });
    expect(findLabel(result.porTamano, "Chico")).toEqual({ label: "Chico", count: 3, pct: 75 });
    expect(findLabel(result.porEdad, "Cachorro/cría (0-1 año)").count).toBe(2);
    // Ordenado de mayor a menor cantidad
    expect(result.porTamano[0].label).toBe("Chico");
  });

  it('valores vacíos/undefined caen en "Sin especificar", no desaparecen', () => {
    const reports = [
      makeReport({ id: "1", provincia: "Salta" }),
      makeReport({ id: "2", provincia: "" }),
      makeReport({ id: "3", provincia: undefined }),
    ];
    const result = computeAdminBreakdowns(reports);
    expect(findLabel(result.porProvincia, "Sin especificar")).toEqual({ label: "Sin especificar", count: 2, pct: 66.7 });
    expect(findLabel(result.porProvincia, "Salta").count).toBe(1);
    // La suma de todas las filas sigue dando el total — nada se pierde.
    const sum = result.porProvincia.reduce((s, e) => s + e.count, 0);
    expect(sum).toBe(3);
  });

  it("con más de 6 valores distintos, agrupa el resto en una fila Otras", () => {
    const reports = Array.from({ length: 8 }, (_, i) => makeReport({ id: `r${i}`, ciudad: `Ciudad ${i}` }));
    const result = computeAdminBreakdowns(reports);
    expect(result.porCiudad).toHaveLength(7); // 6 + "Otras"
    const otras = findLabel(result.porCiudad, "Otras");
    expect(otras.count).toBe(2);
    const sum = result.porCiudad.reduce((s, e) => s + e.count, 0);
    expect(sum).toBe(8);
  });

  it("porRazaPerdida/porRazaEncontrada: % calculado sobre el total de ESA categoría, no el general", () => {
    const reports = [
      makeReport({ id: "1", tipo: "perdida", raza: "Labrador" }),
      makeReport({ id: "2", tipo: "perdida", raza: "Labrador" }),
      makeReport({ id: "3", tipo: "perdida", raza: "Mestizo" }),
      makeReport({ id: "4", tipo: "encontrada", raza: "Labrador" }),
    ];
    const result = computeAdminBreakdowns(reports);
    // 2 de 3 perdidas son Labrador -> 66.7%, no 2 de 4 (50%)
    expect(findLabel(result.porRazaPerdida, "Labrador")).toEqual({ label: "Labrador", count: 2, pct: 66.7 });
    // 1 de 1 encontrada es Labrador -> 100%
    expect(findLabel(result.porRazaEncontrada, "Labrador")).toEqual({ label: "Labrador", count: 1, pct: 100 });
  });
});
