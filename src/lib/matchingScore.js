// Felpus — puntaje de coincidencias (SOLO SERVIDOR, 2026-11-04).
//
// Pesos, umbrales y reglas con que se compara una mascota perdida con una
// encontrada: la lógica más propia de Felpus. Antes corría en el navegador
// y cualquiera podía leerla en el JS público del sitio. Ahora la usan solo
// el servidor (/api/coincidencias, notify-match, alertas, asistente y
// métricas de admin). matchingScore.test.js frena el CI si algún componente
// del navegador la importa.
//
// Ver el resumen de cómo combina las señales al principio de matching.js.
import {
  SCORE_MINIMO,
  normalizeText,
  tokenize,
  jaccard,
  haversineKm,
  cosineSimilarity,
  histogramSimilarity,
  COLOR_OPTIONS,
  EDAD_OPTIONS,
  PESO_OPTIONS,
  TAMANO_OPTIONS,
  razaSinSenal,
} from "./matching";

// Embeddings de imagen (DINOv2 small, ver imageEmbedding.js): el coseno
// crudo se reescala del rango útil [0.2, 0.7] a [0, 1]. Medido con las
// fotos reales de producción (2026-10-21): fotos de la MISMA mascota dan
// coseno 0.34-0.72 (percentiles 10-90, mediana 0.57); mascotas distintas
// de la misma especie, mediana 0.09 y percentil 90 0.32. Con este rango,
// el 80% de los pares de la misma mascota queda en "Algo parecida" o más
// (>= 0.45) contra el 4.6% de los pares de mascotas distintas.
// (Hasta 2026-10 era [0.5, 0.95], calibrado para CLIP — nunca llegó a
// usarse: ningún reporte de producción tenía embedding.)
const EMB_COS_PISO = 0.2;
const EMB_COS_TECHO = 0.7;
function embeddingEvidence(a, b) {
  const sim = cosineSimilarity(a, b);
  if (sim == null) return null;
  const cos = sim * 2 - 1;
  return Math.max(0, Math.min(1, (cos - EMB_COS_PISO) / (EMB_COS_TECHO - EMB_COS_PISO)));
}

// Similitud de imagen: usa el embedding real de IA (DINOv2) cuando ambas
// fotos lo tienen. Si a alguna le falta (por ejemplo, porque /api/embed
// falló, o es un reporte anterior a 2026-10), cae de nuevo al histograma de
// color, que siempre está disponible.
function singlePhotoSimilarity(fa, fb) {
  const embSim = embeddingEvidence(fa.embedding, fb.embedding);
  if (embSim != null) return embSim;
  return histogramSimilarity(fa.hist, fb.hist);
}

// Un reporte puede tener hasta 3 fotos (fotos: [{hist, embedding}, ...]).
// Comparamos todas las combinaciones y nos quedamos con la mejor — alcanza
// con que una sola foto de cada lado coincida (distintos ángulos/poses de la
// misma mascota) para que el matching lo detecte.
//
// Fotos "dudosas" (flyer, captura, ilustración — ver photoCheck.js y
// fotos_dudosas en store.js) no se comparan: un flyer contra otro flyer se
// parece por el diseño, no por la mascota. Si a uno de los dos reportes no
// le queda ninguna foto válida, devuelve null y scoreMatch reparte el peso
// de la imagen entre los demás datos.
export function imageSimilarity(a, b) {
  const validas = (r) => (r.fotos?.length ? r.fotos : [{ hist: r.hist, embedding: r.embedding }]).filter((f) => !f.dudosa);
  const fotosA = validas(a);
  const fotosB = validas(b);
  if (!fotosA.length || !fotosB.length) return null;
  let best = 0;
  for (const fa of fotosA) {
    for (const fb of fotosB) {
      best = Math.max(best, singlePhotoSimilarity(fa, fb));
    }
  }
  return best;
}

// Similitud "ordinal": para campos que son categorías con un orden real
// (edad, peso), una categoría vecina (ej. "Joven" vs "Adulto") es evidencia
// parcial de la misma mascota, no un fallo total — dos personas distintas
// rara vez estiman la edad/peso exacto igual aunque sea el mismo animal.
// "No sé" no aporta señal (ni a favor ni en contra) y se excluye.
function ordinalSimilarity(aVal, bVal, options) {
  if (!aVal || !bVal || aVal === "No sé" || bVal === "No sé") return null;
  const ia = options.indexOf(aVal);
  const ib = options.indexOf(bVal);
  if (ia === -1 || ib === -1) return null;
  const dist = Math.abs(ia - ib);
  if (dist === 0) return 1;
  if (dist === 1) return 0.5;
  return 0;
}

// Cuando ambos reportes eligieron "Otro color", compara el detalle escrito
// a mano (colorOtro) en vez de darlos por iguales solo porque cayeron en la
// misma categoría genérica. Si a alguno le falta el texto, no hay señal real
// que comparar — devuelve null (se excluye del promedio, mismo patrón que
// "No sé" en sexo/edad/peso) en vez de 1, que antes lo trataba como
// coincidencia perfecta solo por ausencia de dato.
function colorOtroSimilarity(colorOtroA, colorOtroB) {
  const ca = normalizeText(colorOtroA).trim();
  const cb = normalizeText(colorOtroB).trim();
  if (!ca || !cb) return null;
  if (ca === cb || ca.includes(cb) || cb.includes(ca)) return 1;
  return jaccard(tokenize(colorOtroA), tokenize(colorOtroB));
}

// ---------------------------------------------------------------------------
// Compatibilidad de colores (2026-10). Antes el color era "igual o nada":
// "Marrón" vs "Dorado / beige" (dos personas describiendo al mismo perro
// caramelo) contaba igual de mal que "Negro" vs "Blanco". Ahora cada par de
// categorías tiene un grado de compatibilidad, y "Otro color" + el texto que
// escribió la persona ("negra con fuego", "naranja") se traduce a las
// categorías que nombra. También cubre colores guardados como texto libre
// (los reportes de ejemplo tienen "negro", "gris atigrado", etc.).
// ---------------------------------------------------------------------------
const COLOR_PALABRAS = [
  ["Negro", ["negro", "negra", "azabache"]],
  ["Blanco", ["blanco", "blanca"]],
  ["Marrón", ["marron", "chocolate", "cafe", "fuego", "higado", "atabacado", "tostado"]],
  ["Gris", ["gris", "plateado", "plateada", "azulado"]],
  ["Dorado / beige", ["dorado", "dorada", "beige", "crema", "naranja", "anaranjado", "anaranjada", "amarillo", "rubio", "rubia", "caramelo", "canela", "colorado", "colorada", "rojizo", "rojiza", "miel", "arena"]],
  ["Atigrado", ["atigrado", "atigrada", "rayado", "rayada", "tabby", "barcino", "barcina"]],
  ["Manchado / bicolor", ["manchado", "manchada", "bicolor", "tricolor", "carey", "overo", "overa", "moteado", "moteada"]],
];

// Pares compatibles (simétrico). Lo que no figura acá, entre dos colores
// distintos, es 0 (incompatible: "Negro" vs "Blanco").
const COLOR_COMPAT = {
  "Marrón|Dorado / beige": 0.6,
  "Negro|Gris": 0.4,
  "Blanco|Gris": 0.4,
  "Blanco|Dorado / beige": 0.4,
  "Negro|Marrón": 0.25,
  "Gris|Atigrado": 0.5,
  "Marrón|Atigrado": 0.5,
  "Dorado / beige|Atigrado": 0.4,
  "Atigrado|Manchado / bicolor": 0.3,
  // Un animal bicolor puede describirse por su color dominante.
  "Negro|Manchado / bicolor": 0.4,
  "Blanco|Manchado / bicolor": 0.4,
  "Marrón|Manchado / bicolor": 0.4,
  "Dorado / beige|Manchado / bicolor": 0.4,
  "Gris|Manchado / bicolor": 0.4,
};
function colorPairCompat(x, y) {
  if (x === y) return 1;
  return COLOR_COMPAT[`${x}|${y}`] ?? COLOR_COMPAT[`${y}|${x}`] ?? 0;
}

// Devuelve las categorías canónicas que nombra un reporte, o null si no hay
// dato utilizable. Más de un color nombrado ("negra con fuego") se trata
// además como bicolor.
function colorCategorias(report) {
  const color = (report.color || "").trim();
  if (!color) return null;
  const texto = color === "Otro color" ? report.colorOtro : COLOR_OPTIONS.includes(color) ? null : color;
  if (texto == null) return [color];
  const palabras = normalizeText(texto).split(/\s+/);
  const cats = COLOR_PALABRAS.filter(([, ps]) => ps.some((p) => palabras.includes(p))).map(([c]) => c);
  if (cats.length === 0) return null;
  if (cats.length > 1 && !cats.includes("Manchado / bicolor")) cats.push("Manchado / bicolor");
  return cats;
}

// Similitud de color en [0,1], o null si no hay señal (falta el color de
// algún lado, o "Otro color" sin texto reconocible).
export function colorSimilarity(a, b) {
  if (a.color === "Otro color" && b.color === "Otro color") {
    const directo = colorOtroSimilarity(a.colorOtro, b.colorOtro);
    if (directo === 1) return 1;
  }
  const ca = colorCategorias(a);
  const cb = colorCategorias(b);
  if (!ca || !cb) return null;
  let best = 0;
  for (const x of ca) for (const y of cb) best = Math.max(best, colorPairCompat(x, y));
  return best;
}

// La raza es texto libre con autocompletado (no un <select> cerrado — ver
// getRazaOptions), así que se compara como texto: igual o una contiene a la
// otra ("Pitbull" vs "Pitbull/American Staffordshire") cuenta como
// coincidencia. Mestizo/no sé/otra raza quedan afuera a propósito (ver
// razaSinSenal): que dos reportes coincidan en "no sé la raza" no dice casi
// nada sobre si son la misma mascota, muy distinto a que coincidan en "es un
// Golden Retriever". Devuelve null (se excluye del promedio, mismo patrón
// que "No sé" en sexo/edad/peso) en vez de 0, que sí penalizaría.
function razaSimilarity(razaA, razaB) {
  const ra = normalizeText(razaA).trim();
  const rb = normalizeText(razaB).trim();
  if (razaSinSenal(ra) || razaSinSenal(rb)) return null;
  if (ra === rb || ra.includes(rb) || rb.includes(ra)) return 1;
  return 0;
}

// Bono de matching a partir del objeto "detalles" estructurado (accesorio/
// reacción/marca distintiva — ver buildDetallesEstructurados). Deliberadamente
// modesto: son datos nuevos y opcionales, con catálogos todavía chicos, a
// diferencia de color/tamaño que son campos "cerrados" desde el principio.
// "no_se"/"nada"/"otro" se excluyen de la comparación: no aportan señal real
// (mismo criterio que "No sé" en sexo/edad/peso, o "mestizo/a" en raza).
const DETALLE_IDS_SIN_SENAL = new Set(["no_se", "nada", "otro"]);
function detalleIdsSignal(ids) {
  return (ids || []).filter((id) => !DETALLE_IDS_SIN_SENAL.has(id));
}
function detallesSimilarity(a, b) {
  const da = a?.detalles || {};
  const db = b?.detalles || {};
  const parts = [];

  const accA = detalleIdsSignal(da.accesorios);
  const accB = detalleIdsSignal(db.accesorios);
  if (accA.length && accB.length) parts.push({ weight: 0.3, value: jaccard(accA, accB) });

  const comA = detalleIdsSignal(da.comportamientos);
  const comB = detalleIdsSignal(db.comportamientos);
  if (comA.length && comB.length) parts.push({ weight: 0.3, value: jaccard(comA, comB) });

  const marA = detalleIdsSignal(da.marca_distintiva);
  const marB = detalleIdsSignal(db.marca_distintiva);
  if (marA.length && marB.length) {
    let value = jaccard(marA, marB);
    // Bono extra si además coincide la ubicación de la mancha — mismo
    // criterio que colorOtroSimilarity: un detalle puntual que coincide es
    // una señal más fuerte que la categoría genérica sola.
    if (marA.includes("mancha") && marB.includes("mancha") && da.ubicacion_marca && da.ubicacion_marca === db.ubicacion_marca) {
      value = Math.min(1, value + 0.25);
    }
    parts.push({ weight: 0.4, value });
  }

  if (parts.length === 0) return null;
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  return parts.reduce((s, p) => s + p.weight * p.value, 0) / totalWeight;
}

// Compara los campos estructurados (color, tamaño, edad, peso) en vez de
// meterlos en la misma bolsa de palabras que la descripción libre. Dos
// reportes de la misma mascota casi siempre coinciden en estos campos (son
// selects, no texto libre), pero la descripción la escribe cada persona con
// sus propias palabras — si se compara todo junto, una descripción distinta
// "diluye" una coincidencia de color/tamaño que en realidad es una señal
// fuerte. Solo se promedian los campos que ambos reportes completaron.
function structuredFieldSimilarity(a, b) {
  const parts = [];

  // Grado de compatibilidad (ver colorSimilarity), no "igual o nada". Sin
  // señal (ej. "Otro color" sin texto) se excluye del promedio.
  const colorSim = colorSimilarity(a, b);
  if (colorSim != null) parts.push({ weight: 0.35, value: colorSim });
  // En perro, peso alto (a la par de color): cuando ambos lados la
  // completan con una raza real, es de las señales más fuertes que hay. En
  // gato pesa mucho menos a propósito — mucha más gente no sabe la raza de
  // su gato que la de su perro, y sobre todo: la raza distingue mucho menos
  // entre gatos (la enorme mayoría son "mestizo/a", sin raza definida) que
  // entre perros. Ahí pesan más color/patrón (ya cubierto en "color", que
  // incluye opciones como "Atigrado"), tamaño, marca distintiva (ver
  // detallesSimilarity) y la imagen — señales que si dos gatos coinciden en
  // varias, sí dicen algo real.
  const razaSim = razaSimilarity(a.raza, b.raza);
  if (razaSim != null) {
    const razaWeight = a.especie === "gato" ? 0.1 : 0.3;
    parts.push({ weight: razaWeight, value: razaSim });
  }
  // "Detalles para reconocerlo" (accesorio/reacción/marca distintiva) — ver
  // detallesSimilarity más abajo. Peso moderado: son datos nuevos y
  // opcionales, con catálogos todavía chicos, así que no deberían pesar más
  // que color o raza.
  const detallesSim = detallesSimilarity(a, b);
  if (detallesSim != null) parts.push({ weight: 0.2, value: detallesSim });
  // El sexo es un dato biológico estable (a diferencia del peso, que varía
  // con el tiempo) — casi tan confiable como el color para descartar o
  // confirmar. "No sé" no aporta señal y queda afuera del promedio.
  if (a.sexo && b.sexo && a.sexo !== "No sé" && b.sexo !== "No sé") {
    parts.push({ weight: 0.2, value: a.sexo === b.sexo ? 1 : 0 });
  }
  // Auditoría integral (2026-08-09): comparaba exacto, a diferencia de
  // edad/peso — inconsistente para el mismo tipo de dato (una categoría
  // ordinal de 3 valores donde dos personas distintas fácilmente discrepan
  // en una, ej. un perro "mediano" que para quien lo encontró es "grande").
  const tamanoSim = ordinalSimilarity(a.tamano, b.tamano, TAMANO_OPTIONS);
  if (tamanoSim != null) parts.push({ weight: 0.15, value: tamanoSim });
  const edadSim = ordinalSimilarity(a.edad, b.edad, EDAD_OPTIONS);
  if (edadSim != null) parts.push({ weight: 0.15, value: edadSim });
  const pesoSim = ordinalSimilarity(a.peso, b.peso, PESO_OPTIONS);
  if (pesoSim != null) parts.push({ weight: 0.15, value: pesoSim });

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  // Ningún campo comparable: sin señal, no "todo distinto" — un valor
  // neutro-bajo en vez de 0.
  const sim = totalWeight === 0 ? STRUCTURED_SIN_DATOS : parts.reduce((sum, p) => sum + p.weight * p.value, 0) / totalWeight;
  // Nombre: si quien encontró a la mascota leyó la chapita (o la llamó y
  // respondió a ese nombre) y coincide con el del dueño, es de las señales
  // más fuertes que hay — bono que cubre la mitad de lo que le falta al
  // resto para llegar a 1. Un nombre distinto NO resta: quien la encontró
  // suele ponerle uno inventado ("Negrito").
  const nombreA = normalizeText(a.nombre).trim();
  const nombreB = normalizeText(b.nombre).trim();
  if (nombreA.length >= 2 && nombreA === nombreB) return sim + (1 - sim) * 0.5;
  return sim;
}
const STRUCTURED_SIN_DATOS = 0.35;

// La descripción libre arranca con una frase armada sola a partir de los
// selects (composeDescripcionBase: "Es un perro, de tamaño mediano, color
// negro, macho.") — esas palabras ya se comparan como campos estructurados,
// así que en la descripción solo inflaban el parecido entre cualquier par de
// perros. Se descartan acá para que cuente lo que la persona escribió de
// verdad (señas, collar, nombre de la calle...).
const DESC_PALABRAS_DE_RELLENO = new Set([
  "perro", "perra", "perrito", "perrita", "gato", "gata", "gatito", "gatita", "mascota",
  "tamano", "color", "chico", "chica", "mediano", "mediana", "grande", "macho", "hembra",
  "cachorro", "cria", "joven", "adulto", "adulta", "mayor", "anos", "raza", "sin", "mestizo",
  "tenia", "tiene", "particular", "desconocidos",
]);
function descripcionTokens(s) {
  return tokenize(s).filter((w) => !DESC_PALABRAS_DE_RELLENO.has(w));
}

// Si ambos reportes tienen al menos una foto con embedding real de IA
// (DINOv2), la imagen es una señal confiable. Si no, sólo
// tenemos el histograma de color de respaldo — mucho más débil (lo afectan
// el fondo, la luz, el encuadre) — así que conviene pesarlo menos.
function hasAiEmbedding(report) {
  const fotos = report.fotos?.length ? report.fotos : [{ embedding: report.embedding }];
  return fotos.some((f) => Array.isArray(f.embedding) && f.embedding.length > 0);
}

// Radio de referencia para el score de distancia, dinámico según cuántos
// días pasaron desde el evento real — una mascota perdida hace una semana
// pudo haberse alejado mucho más que una perdida hace una hora, así que
// toleramos más distancia sin penalizar tanto el score. Tope en 14 días
// para no diluir la señal de ubicación indefinidamente.
const DIA_MS = 24 * 3600 * 1000;

// Una fecha cargada muy lejos de cuándo se publicó el reporte es casi
// seguro un error de tipeo (visto en producción: un reporte publicado en
// 2026-08 con fecha "2024-02-10"). Se ignora — mejor sin dato que un dato
// que dispara un filtro de cronología equivocado.
const FECHA_MAX_DIAS_ANTES_DE_PUBLICAR = 180;
const FECHA_MAX_DIAS_DESPUES_DE_PUBLICAR = 2;
function fechaConfiableMs(r) {
  if (!r.fecha) return null;
  const ms = new Date(r.fecha).getTime();
  if (Number.isNaN(ms)) return null;
  if (r.creadoEn) {
    const diasAntes = (r.creadoEn - ms) / DIA_MS;
    if (diasAntes > FECHA_MAX_DIAS_ANTES_DE_PUBLICAR || diasAntes < -FECHA_MAX_DIAS_DESPUES_DE_PUBLICAR) return null;
  }
  return ms;
}

const RADIO_BASE_KM = 8;
const RADIO_EXTRA_KM_POR_DIA = 2;
const RADIO_DIAS_TOPE = 14;

// Auditoría integral (2026-08-09): usaba creadoEn (cuándo se CARGÓ el
// reporte al sistema) en vez de "fecha" (cuándo pasó de verdad el
// evento) — dos cosas distintas: alguien puede buscar a su mascota varios
// días antes de animarse a publicar. Con creadoEn, ese caso calculaba un
// radio de tolerancia mucho más chico del que corresponde de verdad,
// penalizando un match real (la mascota tuvo esos días de más para
// alejarse) por el reloj equivocado. Usa "fecha" cuando ambos lados la
// tienen; si falta en alguno, cae a creadoEn (mejor aproximación
// disponible) — nunca deja el radio sin definir.
function locationReferenceKm(a, b) {
  const now = Date.now();
  const aRef = fechaConfiableMs(a) ?? a.creadoEn ?? now;
  const bRef = fechaConfiableMs(b) ?? b.creadoEn ?? now;
  const masViejo = Math.min(aRef, bRef);
  const diasTranscurridos = Math.max(0, (now - masViejo) / (24 * 3600 * 1000));
  const diasEfectivos = Math.min(diasTranscurridos, RADIO_DIAS_TOPE);
  return RADIO_BASE_KM + diasEfectivos * RADIO_EXTRA_KM_POR_DIA;
}

// Auditoría integral (2026-08-09) — hallazgo real: el formulario le pide a
// la persona la fecha en que la mascota se perdió/encontró, pero el
// algoritmo nunca la usaba para nada más que corregir locationReferenceKm
// de arriba. Dos reportes con fechas muy cercanas es evidencia real (es
// más probable que sean el mismo evento); muy lejanas, menos — gradual,
// mismo criterio de decaimiento que ya usa locScore. Si falta la fecha (o
// no es confiable, ver fechaConfiableMs) en cualquiera de los dos lados,
// 0.5 neutro — ni ayuda ni penaliza, no hay señal real que comparar. El
// único corte duro por fecha es la cronología imposible (ver
// cronologiaFactor más abajo).
const FECHA_VENTANA_DIAS = 21;
function fechaSimilarity(a, b) {
  const fa = fechaConfiableMs(a);
  const fb = fechaConfiableMs(b);
  if (fa == null || fb == null) return 0.5;
  return Math.exp(-Math.abs(fa - fb) / DIA_MS / FECHA_VENTANA_DIAS);
}

// ---------------------------------------------------------------------------
// Filtros duros y penalizaciones por contradicción (2026-10).
//
// La combinación lineal de señales tiene un problema de fondo: una señal
// buena (misma zona) "compensa" una contradicción clara (perro negro vs.
// perro dorado), y el par termina en 60%. Medido con los reportes reales
// de producción: candidatos a 1.276 km pasaban el mínimo, y pares con
// colores opuestos daban 51-68%. Ahora:
//  - filtros duros (score 0, no se muestra): especie distinta, demasiado
//    lejos para que la mascota haya llegado por su cuenta, provincias
//    distintas (sin coordenadas), o una mascota "encontrada" bastante
//    ANTES de que la otra se perdiera.
//  - penalizaciones (multiplican el score): colores incompatibles, tamaño
//    opuesto (chico/grande), sexo distinto, edad muy distinta, raza real
//    distinta. Nunca llegan a 0: quien encuentra una mascota puede
//    equivocarse en el sexo o el tamaño.
// ---------------------------------------------------------------------------
const DISTANCIA_MAX_BASE_KM = 40;
const DISTANCIA_MAX_KM_POR_DIA = 4;
const DISTANCIA_MAX_DIAS_TOPE = 30;
function distanciaMaximaKm(a, b) {
  const refs = [a, b].map((r) => fechaConfiableMs(r) ?? r.creadoEn ?? Date.now());
  const dias = Math.max(0, (Math.max(...refs) - Math.min(...refs)) / DIA_MS);
  return DISTANCIA_MAX_BASE_KM + Math.min(dias, DISTANCIA_MAX_DIAS_TOPE) * DISTANCIA_MAX_KM_POR_DIA;
}

// Una mascota no puede haber sido encontrada antes de perderse. Con margen,
// porque la fecha del formulario viene precargada con el día de hoy y
// mucha gente publica días después sin corregirla: hasta 3 días de
// "encontrada antes" no cambia nada, de 3 a 14 días penaliza, y más de 14
// días descarta el par.
const CRONOLOGIA_TOLERANCIA_DIAS = 3;
const CRONOLOGIA_CORTE_DIAS = 14;
function cronologiaFactor(a, b) {
  const perdida = a.tipo === "perdida" ? a : b.tipo === "perdida" ? b : null;
  const encontrada = a.tipo === "encontrada" ? a : b.tipo === "encontrada" ? b : null;
  if (!perdida || !encontrada) return 1;
  const fp = fechaConfiableMs(perdida);
  const fe = fechaConfiableMs(encontrada);
  if (fp == null || fe == null) return 1;
  const diasEncontradaAntes = (fp - fe) / DIA_MS;
  if (diasEncontradaAntes > CRONOLOGIA_CORTE_DIAS) return 0;
  if (diasEncontradaAntes > CRONOLOGIA_TOLERANCIA_DIAS) return 0.6;
  return 1;
}

const PENALIDAD_COLOR_INCOMPATIBLE = 0.5;
const PENALIDAD_COLOR_LEJANO = 0.7;
const PENALIDAD_TAMANO_OPUESTO = 0.6;
const PENALIDAD_SEXO_DISTINTO = 0.75;
const PENALIDAD_EDAD_MUY_DISTINTA = 0.8;
const PENALIDAD_RAZA_DISTINTA = 0.85;
function contradiccionesFactor(a, b) {
  let factor = 1;
  const colorSim = colorSimilarity(a, b);
  if (colorSim === 0) factor *= PENALIDAD_COLOR_INCOMPATIBLE;
  else if (colorSim != null && colorSim < 0.5) factor *= PENALIDAD_COLOR_LEJANO;
  if (ordinalSimilarity(a.tamano, b.tamano, TAMANO_OPTIONS) === 0) factor *= PENALIDAD_TAMANO_OPUESTO;
  if (a.sexo && b.sexo && a.sexo !== "No sé" && b.sexo !== "No sé" && a.sexo !== b.sexo) {
    factor *= PENALIDAD_SEXO_DISTINTO;
  }
  if (ordinalSimilarity(a.edad, b.edad, EDAD_OPTIONS) === 0) factor *= PENALIDAD_EDAD_MUY_DISTINTA;
  if (a.especie === "perro" && razaSimilarity(a.raza, b.raza) === 0) factor *= PENALIDAD_RAZA_DISTINTA;
  return factor;
}

// descartado: por qué un par quedó afuera ("especie" | "distancia" |
// "cronologia"), o null si se puntuó normalmente.
function sinMatch(descartado, distanceLabel = "") {
  return { score: 0, imgSim: 0, textSim: 0, locScore: 0, fechaSim: 0, distanceLabel, descartado };
}

export function scoreMatch(a, b) {
  // Especies distintas (ej. perro vs gato) nunca son la misma mascota —
  // cortar acá evita calcular similitud de imagen/texto/fecha para un par
  // que ya se sabe que va a dar 0 (findMatches/notify-match no filtran los
  // candidatos por especie antes de llamar a scoreMatch, solo por tipo).
  if (a.especie !== b.especie) return sinMatch("especie");

  let locScore, distanceLabel;
  if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
    const d = haversineKm(a.lat, a.lng, b.lat, b.lng);
    distanceLabel = d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
    if (d > distanciaMaximaKm(a, b)) return sinMatch("distancia", distanceLabel);
    locScore = Math.exp(-d / locationReferenceKm(a, b));
  } else {
    const provA = normalizeText(a.provincia).trim();
    const provB = normalizeText(b.provincia).trim();
    if (provA && provB && provA !== provB) return sinMatch("distancia", "otra provincia");
    const zonaA = normalizeText(a.zona);
    const zonaB = normalizeText(b.zona);
    const sameZone = !!zonaA && !!zonaB && (zonaA === zonaB || zonaA.includes(zonaB) || zonaB.includes(zonaA));
    locScore = sameZone ? 0.85 : 0.25;
    distanceLabel = sameZone ? "misma zona" : "zona distinta";
  }

  const cronologia = cronologiaFactor(a, b);
  if (cronologia === 0) return sinMatch("cronologia", distanceLabel);

  const imgSimRaw = imageSimilarity(a, b);
  const imgSim = imgSimRaw ?? 0;
  const structuredSim = structuredFieldSimilarity(a, b);
  // Los campos estructurados (selects) valen mucho más que la redacción
  // libre de la descripción, que varía de persona a persona aunque sea la
  // misma mascota. La descripción solo entra si los dos lados escribieron
  // algo propio (ver descripcionTokens); si no, no resta.
  const tokA = descripcionTokens(a.descripcion);
  const tokB = descripcionTokens(b.descripcion);
  const textSim =
    tokA.length >= 2 && tokB.length >= 2 ? 0.8 * structuredSim + 0.2 * jaccard(tokA, tokB) : structuredSim;

  const fechaSim = fechaSimilarity(a, b);

  // Pesos adaptativos: con IA visual real, la imagen es la señal más fuerte;
  // sin ella (histograma de color nomás — hoy, todos los reportes de
  // producción), pesan más los campos estructurados y la ubicación. fecha
  // entra con un peso chico y fijo en los dos casos (0.10) — es una señal
  // real pero más débil que las demás, y con el "neutro" de arriba nunca
  // castiga a quien no la cargó.
  // Sin fotos válidas para comparar (ver imageSimilarity), el peso de la
  // imagen se reparte proporcionalmente entre el resto.
  const weights =
    imgSimRaw == null
      ? { img: 0, text: 0.5 / 0.88, loc: 0.28 / 0.88, fecha: 0.1 / 0.88 }
      : hasAiEmbedding(a) && hasAiEmbedding(b)
        ? { img: 0.42, text: 0.3, loc: 0.18, fecha: 0.1 }
        : { img: 0.12, text: 0.5, loc: 0.28, fecha: 0.1 };

  const combined =
    weights.img * imgSim + weights.text * textSim + weights.loc * locScore + weights.fecha * fechaSim;
  const score = combined * cronologia * contradiccionesFactor(a, b);
  return {
    score: Math.max(0, Math.min(1, score)),
    imgSim,
    textSim,
    locScore,
    fechaSim,
    distanceLabel,
    descartado: null,
  };
}

// ---------------------------------------------------------------------------
// Desglose de una coincidencia para mostrarle a la persona QUÉ coincide y
// qué no — no solo el % final. Antes el matching mostraba un aro de color y
// una etiqueta ("Probabilidad alta") sin ninguna explicación: ayudaba a
// mirar, no a decidir. Deliberadamente separado de scoreMatch/
// structuredFieldSimilarity (no los toca, no cambia ningún score real) para
// no arriesgar la lógica de matching ya afinada y testeada — esto es pura
// presentación, calculado aparte con los mismos datos.
//
// Cada ítem: { key, label, coincide: true|false, detail?, value? }. value
// (opcional) es el dato compartido cuando coincide ("Mediano", "Hembra") —
// lo usa la tarjeta de comparación (MatchScorecard) para no mostrar un
// "Coincide" genérico; los chips no lo usan. Se omite un
// campo entero (no aparece en la lista) cuando alguno de los dos reportes no
// lo completó — mismo criterio que usa structuredFieldSimilarity para no
// pesar "sin dato" como si fuera una diferencia real.
export function matchBreakdown(a, b) {
  const items = [];
  const push = (key, label, coincide, detail, value) => {
    if (coincide == null) return;
    items.push({ key, label, coincide, detail: detail || null, value: value || null });
  };

  // Misma compatibilidad de colores que scoreMatch (ver colorSimilarity):
  // "Marrón" vs "Dorado / beige" se muestra como parecido, no como
  // diferencia. Sin señal (ej. "Otro color" sin texto de ningún lado) se
  // omite el ítem entero.
  const colorSim = colorSimilarity(a, b);
  if (colorSim != null) {
    const colorTxt = (r) => (r.color === "Otro color" && r.colorOtro ? r.colorOtro : r.color);
    const detail = colorSim >= 1 ? null : colorSim >= 0.5 ? `Parecido: ${colorTxt(a)} / ${colorTxt(b)}` : `${colorTxt(a)} / ${colorTxt(b)}`;
    push("color", "Color", colorSim >= 0.5, detail, colorTxt(a));
  }

  if (a.tamano && b.tamano) {
    push("tamano", "Tamaño", a.tamano === b.tamano, a.tamano === b.tamano ? null : `${a.tamano} / ${b.tamano}`, a.tamano);
  }

  if (a.sexo && b.sexo && a.sexo !== "No sé" && b.sexo !== "No sé") {
    push("sexo", "Sexo", a.sexo === b.sexo, a.sexo === b.sexo ? null : `${a.sexo} / ${b.sexo}`, a.sexo);
  }

  const razaSim = razaSimilarity(a.raza, b.raza);
  if (razaSim != null) push("raza", "Raza", razaSim >= 1, razaSim >= 1 ? null : `${a.raza} / ${b.raza}`, a.raza);

  const detallesSim = detallesSimilarity(a, b);
  if (detallesSim != null) push("detalles", "Características", detallesSim >= 0.5);

  // Zona (por nombre) y distancia exacta (por lat/lng) se muestran como dos
  // ítems separados, no uno solo — dos reportes pueden estar en el mismo
  // barrio (zona coincide) pero con los pines a varios km reales de
  // distancia (un barrio puede ser grande), y esa distinción es justo el
  // tipo de matiz que ayuda a decidir, no solo un "coincide/no coincide"
  // de golpe.
  if (a.zona && b.zona) {
    const zonaA = normalizeText(a.zona);
    const zonaB = normalizeText(b.zona);
    const sameZone = !!zonaA && !!zonaB && (zonaA === zonaB || zonaA.includes(zonaB) || zonaB.includes(zonaA));
    push("zona", "Zona", sameZone, sameZone ? null : `${a.zona} / ${b.zona}`, a.zona);
  }
  if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
    const d = haversineKm(a.lat, a.lng, b.lat, b.lng);
    const distLabel = d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
    // 2 km como umbral de "cerca": bastante más estricto que RADIO_BASE_KM
    // (8, el radio que usa locScore antes de ensancharse con los días
    // transcurridos) a propósito — acá se muestra la distancia real tal
    // cual, y algo así como "2,3 km" ya es una distancia que vale la pena
    // que la persona vea marcada, no que se la trate como "cerca" sin más.
    push("distancia", "Distancia", d <= 2, `A ${distLabel} de distancia`);
  }

  // Imagen: señal cualitativa (no hay un "sí/no" real posible con un
  // histograma de color, la única señal disponible sin IA configurada) —
  // el detail siempre se muestra, coincida o no, para no reducir una
  // comparación visual real a un simple ✓/✗ sin matices.
  const imgSim = imageSimilarity(a, b);
  if (imgSim != null) {
    const imgLabel = imgSim >= 0.7 ? "Muy parecida" : imgSim >= 0.45 ? "Algo parecida" : "Poco parecida";
    push("imagen", "Foto", imgSim >= 0.45, imgLabel);
  }

  return items;
}

// Patrón repetido en 4 lugares distintos de la app (campanita de
// notificaciones, submit del formulario, "ver coincidencias" de una tarjeta,
// y el webhook de notify-match): puntuar candidatos contra un reporte,
// quedarse con los que superan SCORE_MINIMO y ordenar de mayor a menor.
// La selección de candidatos sigue siendo responsabilidad de quien llama
// (cada caso de uso filtra distinto: por fecha, por id propio, etc.).
export function findMatches(report, candidates, { limit } = {}) {
  const scored = candidates
    .map((c) => ({ report: c, ...scoreMatch(report, c) }))
    .filter((m) => m.score >= SCORE_MINIMO)
    .sort((a, b) => b.score - a.score);
  return limit != null ? scored.slice(0, limit) : scored;
}

