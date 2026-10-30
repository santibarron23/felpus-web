import { logError } from "./log";

// ---------------------------------------------------------------------------
// Felpus — lógica de matching (corre 100% en el navegador)
//
// Combina, con pesos que se adaptan según qué tan confiable es cada señal:
//  1) similitud de imagen: embedding real de IA (DINOv2, calculado en
//     /api/embed) si está disponible, o histograma de color como respaldo.
//  2) similitud "estructurada": color/tamaño (exacto) + edad/peso (por
//     cercanía de categoría) — mucho más confiable que comparar la
//     descripción libre, que cada persona redacta distinto.
//  3) similitud de descripción libre: Jaccard sobre las palabras del texto.
//  4) proximidad geográfica: distancia haversine, o coincidencia (parcial)
//     de zona si no hay coordenadas.
//
// Si hay embeddings de IA de los dos lados, la imagen pesa más. Si no, pesan
// más los campos estructurados y la ubicación, porque el histograma de color
// solo es una señal débil (le afectan el fondo, la luz, el encuadre).
// ---------------------------------------------------------------------------

export const PUNTOS_PERDIDA = 10;
export const PUNTOS_ENCONTRADA = 15;
export const PUNTOS_REENCUENTRO = 50;
export const PUNTOS_BONO_ORIGINAL = 20;
export const SCORE_MINIMO = 0.15;

// Opciones fijas para que todos los campos descriptivos sean selects
// (mejor calidad de datos para el matching que texto libre).
export const COLOR_OPTIONS = [
  "Negro",
  "Blanco",
  "Marrón",
  "Gris",
  "Dorado / beige",
  "Atigrado",
  "Manchado / bicolor",
  "Otro color",
];

export const SEXO_OPTIONS = ["Macho", "Hembra", "No sé"];

// Etiqueta del campo fecha según el tipo de reporte: "Fecha" a secas no
// aclaraba si era cuándo se perdió o cuándo se encontró.
export function fechaLabel(tipo) {
  if (tipo === "perdida") return "Fecha en que se perdió";
  if (tipo === "encontrada") return "Fecha en que se encontró";
  return "Fecha";
}

// Motivos de denuncia — ids estables (se guardan tal cual en
// report_flags.reason vía la función flag_report, ver schema.sql); el label
// es sólo lo que se muestra en el botón y puede cambiar de redacción sin
// romper denuncias ya guardadas.
export const REPORT_FLAG_REASONS = [
  { id: "falsa", label: "Es falsa o engañosa" },
  { id: "info_incorrecta", label: "Información incorrecta" },
  { id: "inapropiado", label: "Contenido inapropiado" },
  { id: "otro", label: "Otro motivo" },
];

// El panel de admin recibe los ids crudos (report_flags.reason) desde la
// RPC admin_list_flagged_reports — esto los traduce al label legible sin
// duplicar la lista de motivos en otro lugar. Cae al id tal cual si algún
// día aparece un motivo viejo que ya no está en la lista de arriba.
export function reportFlagReasonLabel(id) {
  return REPORT_FLAG_REASONS.find((r) => r.id === id)?.label || id;
}

export const EDAD_OPTIONS = [
  "Cachorro/cría (0-1 año)",
  "Joven (1-3 años)",
  "Adulto (3-8 años)",
  "Mayor (8+ años)",
  "No sé",
];

export const PESO_OPTIONS = ["Menos de 5 kg", "5 a 10 kg", "10 a 20 kg", "20 a 30 kg", "Más de 30 kg", "No sé"];

// Orden real de las 3 categorías (ids guardados en reports.tamano, ver el
// <select> del formulario) — usado para tratar "tamano" igual que edad/peso
// en el matching: una categoría vecina es evidencia parcial, no un fallo
// total (ver ordinalSimilarity).
export const TAMANO_OPTIONS = ["chico", "mediano", "grande"];

// Sugerencias para el <datalist> de raza (no un <select> cerrado: hay
// cientos de razas y mezclas reales, forzar una lista fija excluiría a la
// mayoría de las mascotas mestizas). RAZA_ESPECIALES va SIEMPRE primero,
// antes que cualquier raza real — son las tres respuestas más comunes
// (mestizo, no sabe, ninguna de la lista) y no deberían quedar escondidas
// abajo de una lista larga de razas puras. Reemplaza al viejo "Mestizo/a
// (común europeo)" del gato — la frase "común europeo" no es un término que
// use la gente en Argentina; "Sin raza / Mestizo" es más directo y además
// unifica el criterio con perro (antes cada especie tenía su propia
// redacción de "mestizo").
export const RAZA_ESPECIALES = ["Sin raza / Mestizo", "No sé / Desconocida", "Otra raza"];
// Export aparte del valor exacto de "no sé" — lo usa el botón rápido "No sé
// la raza" del formulario (ver FelpusMatcher.jsx) para no repetir el string
// literal en dos archivos.
export const RAZA_NO_SE = RAZA_ESPECIALES[1];

// Alfabético (Intl.Collator en es, no localeCompare a mano — así "Bichón"
// ordena bajo B y no después de "Boxer" por el acento).
export const RAZA_OPTIONS_PERRO = [
  "Akita",
  "Australian Shepherd",
  "Beagle",
  "Bichón Frisé",
  "Border Collie",
  "Boston Terrier",
  "Boxer",
  "Bulldog Francés",
  "Bulldog Inglés",
  "Cane Corso",
  "Caniche/Poodle",
  "Chihuahua",
  "Chow Chow",
  "Cocker Spaniel",
  "Dálmata",
  "Doberman",
  "Dogo Argentino",
  "Fox Terrier",
  "Galgo",
  "Golden Retriever",
  "Husky Siberiano",
  "Jack Russell Terrier",
  "Labrador",
  "Maltés",
  "Pastor Alemán",
  "Pinscher Miniatura",
  "Pitbull/American Staffordshire",
  "Pointer",
  "Pug",
  "Rottweiler",
  "Salchicha/Dachshund",
  "Samoyedo",
  "San Bernardo",
  "Schnauzer",
  "Shih Tzu",
  "Weimaraner",
  "Yorkshire Terrier",
];
export const RAZA_OPTIONS_GATO = [
  "Angora",
  "Bengalí",
  "Esfinge/Sphynx",
  "Maine Coon",
  "Persa",
  "Ragdoll",
  "Siamés",
];

// Combina RAZA_ESPECIALES + la lista de razas de la especie, en ese orden
// — lo que alimenta el <datalist> del formulario (ver FelpusMatcher.jsx).
// Especie "otro" (ni perro ni gato) no tiene lista de razas real.
export function getRazaOptions(especie) {
  const breeds = especie === "perro" ? RAZA_OPTIONS_PERRO : especie === "gato" ? RAZA_OPTIONS_GATO : [];
  return [...RAZA_ESPECIALES, ...breeds];
}

// "Sin señal real" para el matching: mestizo (cualquiera de las dos
// redacciones, vieja y nueva), no saber la raza, o "otra raza" sin
// especificar cuál — ninguna de estas dice nada sobre qué raza es, así que
// deben tratarse igual que un campo vacío (null en razaSimilarity, se
// excluyen del promedio; no se agregan a la frase de composeDescripcionBase).
function razaSinSenal(razaNormalizada) {
  if (!razaNormalizada) return true;
  return (
    razaNormalizada.includes("mestizo") ||
    razaNormalizada.includes("no se") ||
    razaNormalizada.includes("desconocid") ||
    razaNormalizada.includes("otra raza")
  );
}

// ---------------------------------------------------------------------------
// "Detalles para reconocerlo": accesorio, reacción con desconocidos y marca
// distintiva. Cada opción usa un id estable (snake_case) — es lo que se
// guarda tal cual en el objeto "detalles" del reporte (ver
// buildDetallesEstructurados) y en el matching (ver detallesSimilarity); el
// label es sólo lo que se muestra en el chip y puede cambiar de redacción
// sin romper reportes ya guardados.
// ---------------------------------------------------------------------------
export const ACCESORIO_OPTIONS = [
  { id: "collar", label: "Collar" },
  { id: "arnes", label: "Arnés" },
  { id: "chapita", label: "Chapita identificatoria" },
  { id: "panuelo", label: "Pañuelo" },
  { id: "nada", label: "Nada" },
];

// A diferencia del "¿Cómo se comporta?" genérico de antes, esto pregunta
// puntualmente por la reacción con desconocidos: lo único de esto que de
// verdad es accionable para quien encuentra a la mascota (¿conviene
// acercarse? ¿hay riesgo de que se escape?). "no_se" es mutuamente
// excluyente con el resto (ver toggleReaccionChip en FelpusMatcher.jsx),
// igual que "nada" en accesorios — por eso no aporta clause.
export const REACCION_OPTIONS = [
  { id: "se_acerca", label: "Se acerca", clause: "Se acerca a los desconocidos" },
  { id: "se_deja_agarrar", label: "Se deja agarrar", clause: "Se deja agarrar sin problema" },
  { id: "miedoso", label: "Es miedoso/a", clause: "Es miedoso/a con los desconocidos" },
  { id: "puede_escapar", label: "Puede escapar", clause: "Puede escaparse o alejarse corriendo" },
  { id: "ladra_gruñe", label: "Ladra o gruñe", clause: "Ladra o gruñe si se le acercan" },
  { id: "no_se", label: "No sé", clause: "" },
];

// "Mancha particular" es la única que abre una pregunta más (ubicación y,
// opcionalmente, color — ver MANCHA_UBICACION_OPTIONS/MANCHA_COLOR_OPTIONS y
// composeMarcaSentence). "otro" no compone ninguna frase — cualquier clause
// prearmada para "otro" sería tan genérica que no sumaría nada; en cambio
// enfoca el campo de texto libre de abajo (ver FelpusMatcher.jsx).
export const MARCA_OPTIONS = [
  { id: "mancha", label: "Mancha particular", clause: "" },
  { id: "cicatriz", label: "Cicatriz", clause: "Tiene una cicatriz visible" },
  { id: "falta_miembro", label: "Le falta una oreja o una pata", clause: "Le falta una oreja o una pata" },
  { id: "cojea", label: "Cojea", clause: "Cojea" },
  { id: "ojos_distintos", label: "Ojos de distinto color", clause: "Tiene los ojos de distinto color" },
  { id: "peludo", label: "Muy peludo/a", clause: "Es muy peludo/a" },
  { id: "otro", label: "Otro", clause: "" },
];

export const MANCHA_UBICACION_OPTIONS = [
  { id: "cara", label: "Cara", prep: "en la cara" },
  { id: "pecho", label: "Pecho", prep: "en el pecho" },
  { id: "lomo", label: "Lomo", prep: "en el lomo" },
  { id: "panza", label: "Panza", prep: "en la panza" },
  { id: "patas", label: "Patas", prep: "en las patas" },
  { id: "otro", label: "Otro", prep: "" },
];

export const MANCHA_COLOR_OPTIONS = ["Blanca", "Negra", "Marrón", "Dorada", "Gris", "Otro color"];

const STOPWORDS = new Set([
  "de", "la", "el", "en", "un", "una", "con", "sin", "por", "que", "es",
  "su", "al", "y", "del", "las", "los", "se", "lo", "muy", "esta", "este",
  "para", "the", "and", "a",
]);

export function normalizeText(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
}

export function normalizeNickname(s) {
  return normalizeText(s).trim().replace(/\s+/g, "-");
}

export function tokenize(s) {
  return normalizeText(s)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export function jaccard(aTokens, bTokens) {
  const A = new Set(aTokens);
  const B = new Set(bTokens);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  A.forEach((x) => {
    if (B.has(x)) inter++;
  });
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 0 : inter / union;
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function histIntersection(h1, h2) {
  if (!h1 || !h2 || h1.length !== h2.length) return 0;
  let s = 0;
  for (let i = 0; i < h1.length; i++) s += Math.min(h1[i], h2[i]);
  return s;
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return null;
  const cos = dot / (Math.sqrt(na) * Math.sqrt(nb));
  // El coseno de dos embeddings está en [-1,1]; lo llevamos a [0,1]
  return Math.max(0, Math.min(1, (cos + 1) / 2));
}

// ---------------------------------------------------------------------------
// Histograma de color: dos versiones conviviendo en el mismo array.
//
// v1 (64 bins): RGB 4x4x4 de la foto entera — lo que tienen guardado todos
// los reportes viejos. Le afecta mucho el fondo (pasto, piso, sillón) y la
// marca de agua de Felpus, que está en TODAS las fotos.
//
// v2 (28 bins, 2026-10): tono/saturación/brillo (HSV) — 12 tonos x 2 niveles
// de brillo + 4 grises (negro/gris oscuro/gris claro/blanco) — ponderado
// hacia el centro de la foto (donde casi siempre está la mascota) y sin la
// esquina de la marca de agua. Medido con las fotos reales de producción
// (pares de fotos de la MISMA mascota dentro de un reporte vs. fotos de
// mascotas distintas): separa bastante mejor que v1 (AUC 0.73 vs 0.62).
//
// computeHistogram guarda [...v1, ...v2] (92 números) en el mismo campo
// "hist" de siempre — no hace falta migrar la base. Al comparar: si las dos
// fotos tienen v2, se usa v2; si alguna es vieja (solo 64), se comparan los
// 64 primeros (v1) de las dos, que siguen siendo compatibles.
// ---------------------------------------------------------------------------
export const HIST_V1_BINS = 64;
const HIST_V2_TONOS = 12;
export const HIST_V2_BINS = HIST_V2_TONOS * 2 + 4;

export function histogramSimilarity(h1, h2) {
  if (!Array.isArray(h1) || !Array.isArray(h2)) return 0;
  const full = HIST_V1_BINS + HIST_V2_BINS;
  if (h1.length >= full && h2.length >= full) {
    return histIntersection(h1.slice(HIST_V1_BINS, full), h2.slice(HIST_V1_BINS, full));
  }
  if (h1.length >= HIST_V1_BINS && h2.length >= HIST_V1_BINS && h1.length !== h2.length) {
    return histIntersection(h1.slice(0, HIST_V1_BINS), h2.slice(0, HIST_V1_BINS));
  }
  return histIntersection(h1, h2);
}

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

// Índices de fotos marcadas como flyer/captura/ilustración al publicar
// (detalles.fotos_dudosas, ver photoCheck.js): siguen visibles, pero no se
// usan para comparar fotos (ver imageSimilarity).
export function marcarDudosas(fotos, detalles) {
  const dudosas = Array.isArray(detalles?.fotos_dudosas) ? detalles.fotos_dudosas : [];
  return dudosas.length ? fotos.map((f, i) => (dudosas.includes(i) ? { ...f, dudosa: true } : f)) : fotos;
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

// v1: RGB 4x4x4 sobre píxeles RGBA (ver comentario de HIST_V1_BINS).
export function histogramV1FromPixels(data) {
  const bins = new Array(HIST_V1_BINS).fill(0);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 10) continue;
    const rq = Math.min(3, Math.floor(data[i] / 64));
    const gq = Math.min(3, Math.floor(data[i + 1] / 64));
    const bq = Math.min(3, Math.floor(data[i + 2] / 64));
    bins[rq * 16 + gq * 4 + bq]++;
    total++;
  }
  if (total === 0) total = 1;
  return bins.map((v) => v / total);
}

// v2: HSV ponderado al centro, sin la esquina de la marca de agua (ver
// comentario de HIST_V1_BINS). size = lado de la imagen cuadrada en píxeles.
const HIST_V2_SIGMA = 0.35;
const HIST_V2_MARCA_AGUA_DESDE = 0.78;
export function histogramV2FromPixels(data, size) {
  const bins = new Array(HIST_V2_BINS).fill(0);
  let total = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (data[i + 3] < 10) continue;
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      if (u > HIST_V2_MARCA_AGUA_DESDE && v > HIST_V2_MARCA_AGUA_DESDE) continue;
      const w = Math.exp(-((u - 0.5) ** 2 + (v - 0.5) ** 2) / (2 * HIST_V2_SIGMA ** 2));
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const max = Math.max(r, g, b);
      const croma = max - Math.min(r, g, b);
      const sat = max === 0 ? 0 : croma / max;
      let bin;
      if (sat < 0.2 || max < 0.15) {
        // Sin color real (negro/gris/blanco): 4 bins por brillo.
        bin = HIST_V2_TONOS * 2 + Math.min(3, Math.floor(max * 4));
      } else {
        let h;
        if (max === r) h = ((g - b) / croma) % 6;
        else if (max === g) h = (b - r) / croma + 2;
        else h = (r - g) / croma + 4;
        h = (h * 60 + 360) % 360;
        const tono = Math.floor(h / (360 / HIST_V2_TONOS)) % HIST_V2_TONOS;
        bin = tono * 2 + (max < 0.55 ? 0 : 1);
      }
      bins[bin] += w;
      total += w;
    }
  }
  if (total === 0) total = 1;
  return bins.map((v) => v / total);
}

const HIST_V1_SIZE = 32;
const HIST_V2_SIZE = 48;
export function computeHistogram(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const pixels = (size) => {
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, size, size);
          return ctx.getImageData(0, 0, size, size).data;
        };
        resolve([
          ...histogramV1FromPixels(pixels(HIST_V1_SIZE)),
          ...histogramV2FromPixels(pixels(HIST_V2_SIZE), HIST_V2_SIZE),
        ]);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.crossOrigin = "anonymous";
    img.src = dataUrl;
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Marca de agua: logo de Felpus en la esquina inferior derecha. Si por
// algún motivo no carga, seguimos sin marca de agua en vez de bloquear la
// subida de la foto.
async function drawWatermark(ctx, width, height) {
  try {
    const logo = await loadImageElement("/assets/icon_c.png");
    const logoSize = Math.max(28, Math.round(Math.min(width, height) * 0.16));
    const margin = Math.round(logoSize * 0.3);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(logo, width - logoSize - margin, height - logoSize - margin, logoSize, logoSize);
    ctx.globalAlpha = 1;
  } catch {
    // sin marca de agua, no es bloqueante
  }
}

// Le pone la marca de agua a una foto ya achicada (data URL). Lo usa el
// recorte del formulario (2026-10-29): se recorta la versión sin marca y
// después se marca, así el recorte no corta el logo.
export async function addWatermark(dataUrl) {
  const img = await loadImageElement(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  await drawWatermark(ctx, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

// { watermark: false } devuelve la foto achicada sin marca de agua y con un
// poco más de calidad (es la base para recortar; ver addWatermark).
export function resizeImageFile(file, { watermark = true } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        try {
          // maxDim es para la foto que se guarda y se muestra (no para el
          // matching: el histograma de color siempre reescala a 32x32 por su
          // cuenta, así que esto no afecta la precisión del matching).
          const maxDim = 1000;
          let { width, height } = img;
          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          if (!watermark) return resolve(canvas.toDataURL("image/jpeg", 0.92));
          await drawWatermark(ctx, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Pide el embedding visual real (IA) a nuestra propia API route, que lo
// calcula en el servidor (ver imageEmbedding.js). Si falla, devuelve null
// y el matching sigue funcionando con el histograma de color como respaldo.
export async function getImageEmbedding(dataUrl) {
  try {
    const res = await fetch("/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl: dataUrl }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.embedding) ? data.embedding : null;
  } catch (e) {
    logError("No se pudo obtener el embedding de imagen (se usará solo el color)", e);
    return null;
  }
}

export function makePlaceholderSvg(especie, bg, fg) {
  const shape =
    especie === "gato"
      ? '<path d="M50 90 C20 90 15 60 25 45 C15 40 15 20 25 15 C30 25 35 30 40 30 C45 25 55 25 60 30 C65 30 70 25 75 15 C85 20 85 40 75 45 C85 60 80 90 50 90 Z"/>'
      : '<path d="M50 92 C25 92 15 70 20 55 C10 50 8 35 15 25 C25 20 32 28 35 35 C40 30 60 30 65 35 C68 28 75 20 85 25 C92 35 90 50 80 55 C85 70 75 92 50 92 Z"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bg}"/><g fill="${fg}" opacity="0.92">${shape}</g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
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

// Candidatos contra los que comparar un reporte: los del tipo opuesto, que
// no estén resueltos y que no sean el mismo reporte. Un reencuentro ya
// confirmado nunca vuelve a aparecer como búsqueda activa.
export function candidatosParaComparar(report, reports) {
  const opuesto = report?.tipo === "perdida" ? "encontrada" : "perdida";
  return (reports || []).filter((r) => r.id !== report?.id && r.tipo === opuesto && !r.resuelto);
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

export function scoreLabel(score, colors) {
  // Rojo de "coincidencias" (no verde): una coincidencia es posible, no un
  // reencuentro confirmado — el verde queda reservado para eso (paleta
  // 2026-10-20, ver theme.js).
  if (score >= 0.7) return { text: "Alta probabilidad", color: colors.matchText || colors.red };
  if (score >= 0.4) return { text: "Probabilidad media", color: colors.orangeInk };
  return { text: "Probabilidad baja", color: colors.muted };
}

// Colores de nivel deliberadamente separados de los colores de estado
// (perdida/encontrada/reencontrada) — ver el comentario junto a los tokens
// tierBronze/Silver/Gold/Legendary en theme.js para el porqué.
//
// Devuelve `bg` (para el círculo/pill de avatar con texto blanco encima —
// no cambia entre temas) y `text` (para cuando el color se usa como texto
// plano sobre una tarjeta — sí cambia entre temas). En modo claro son
// literalmente el mismo valor; en modo oscuro divergen porque un tono lo
// bastante oscuro para hacer de fondo detrás de texto blanco es, por
// definición, demasiado oscuro para leerse como texto sobre una tarjeta
// oscura — ver theme.js.
export function getTier(points, colors) {
  const p = points || 0;
  if (p >= 100) return { label: "Leyenda Felpus", paws: 4, bg: colors.tierLegendary, text: colors.tierLegendaryText };
  if (p >= 50) return { label: "Rescatista", paws: 3, bg: colors.tierGold, text: colors.tierGoldText };
  if (p >= 20) return { label: "Guardián de barrio", paws: 2, bg: colors.tierSilver, text: colors.tierSilverText };
  return { label: "Vecino atento", paws: 1, bg: colors.tierBronze, text: colors.tierBronzeText };
}

const TIER_THRESHOLDS = [
  { min: 0, label: "Vecino atento" },
  { min: 20, label: "Guardián de barrio" },
  { min: 50, label: "Rescatista" },
  { min: 100, label: "Leyenda Felpus" },
];

// Progreso hacia el próximo nivel — la app ya tenía niveles por puntos
// (getTier) pero nunca se mostraba cuánto faltaba para subir. Devuelve el
// nivel actual, el próximo (o null si ya es el máximo) y el % de la barra.
export function getTierProgress(points) {
  const p = points || 0;
  let current = TIER_THRESHOLDS[0];
  let next = null;
  for (let i = 0; i < TIER_THRESHOLDS.length; i++) {
    if (p >= TIER_THRESHOLDS[i].min) {
      current = TIER_THRESHOLDS[i];
      next = TIER_THRESHOLDS[i + 1] || null;
    }
  }
  if (!next) return { currentLabel: current.label, nextLabel: null, pointsToNext: 0, progressPct: 100 };
  const span = next.min - current.min;
  const progressPct = Math.min(100, Math.round(((p - current.min) / span) * 100));
  return {
    currentLabel: current.label,
    nextLabel: next.label,
    pointsToNext: next.min - p,
    progressPct,
  };
}

export function isRecent(report) {
  return Date.now() - report.creadoEn < 24 * 3600 * 1000;
}

// Insignias puntuales por comportamiento (además del nivel general por
// puntos) — se derivan de campos que ya existen en "contributors", no
// necesitan columnas nuevas. Cada una responde a un comportamiento que
// vale la pena incentivar (publicar, confirmar reencuentros, sostenerlo en
// el tiempo). `requisito` es el texto de "Cómo se ganan las insignias"
// (sección Colaboradores): si cambia un umbral, cambiarlo también ahí.
// "Rescatista" reemplazó a "Querido por la comunidad" (5 corazones) el
// 2026-10-27, a pedido. Solo contadores que no se reinician (no la racha),
// para que una insignia ganada no desaparezca.
export const BADGES = [
  { id: "primera-huella", icon: "🌟", label: "Primera huella", requisito: "Publicar tu primer reporte", check: (c) => (c.reportes || 0) >= 1 },
  { id: "guia-de-barrio", icon: "🧭", label: "Guía de barrio", requisito: "Publicar 5 reportes", check: (c) => (c.reportes || 0) >= 5 },
  { id: "heroe-reencuentro", icon: "🎉", label: "Héroe del reencuentro", requisito: "Confirmar tu primer reencuentro", check: (c) => (c.reencuentros || 0) >= 1 },
  { id: "rescatista", icon: "🐾", label: "Rescatista", requisito: "Confirmar 3 reencuentros", check: (c) => (c.reencuentros || 0) >= 3 },
  { id: "leyenda-felpus", icon: "👑", label: "Leyenda Felpus", requisito: "Llegar a 100 huellitas", check: (c) => (c.points || 0) >= 100 },
];

export function getBadges(contributor) {
  if (!contributor) return [];
  return BADGES.filter((b) => b.check(contributor));
}

// El input de fecha guarda "AAAA-MM-DD" (formato nativo de <input type="date">).
// Para mostrarla usamos el formato argentino DD/MM/AAAA.
// Tiempo relativo corto en español ("hace 3 días") para mostrar cuánto
// hace que se confirmó un reencuentro, sin depender de una librería externa.
export function timeAgo(ms) {
  if (!ms) return "";
  const diff = Math.max(0, Date.now() - ms);
  const min = Math.floor(diff / 60000);
  if (min < 60) return min <= 1 ? "hace un momento" : `hace ${min} minutos`;
  const hs = Math.floor(min / 60);
  if (hs < 24) return hs === 1 ? "hace 1 hora" : `hace ${hs} horas`;
  const dias = Math.floor(hs / 24);
  if (dias < 7) return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
  const semanas = Math.floor(dias / 7);
  if (semanas < 5) return semanas === 1 ? "hace 1 semana" : `hace ${semanas} semanas`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return meses === 1 ? "hace 1 mes" : `hace ${meses} meses`;
  const anios = Math.floor(dias / 365);
  return anios === 1 ? "hace 1 año" : `hace ${anios} años`;
}

export function formatFechaAR(fecha) {
  if (!fecha) return "";
  const [y, m, d] = fecha.split("-");
  if (!y || !m || !d) return fecha;
  return `${d}/${m}/${y}`;
}

// ---------------------------------------------------------------------------
// Descripción del reporte: rediseño para reducir al mínimo lo que hay que
// escribir a mano. Antes había un solo textarea en blanco que le pedía a
// alguien en medio de una situación estresante que redactara de una: señas
// particulares + collar + comportamiento + ubicación exacta, todo junto, sin
// ninguna ayuda. Ahora se arma en 3 capas, todas puramente funciones de
// datos que ya existen (fácil de testear, sin tocar el DOM):
//   1. composeDescripcionBase: una frase con lo que ya se completó arriba en
//      el formulario (especie/tamaño/color/edad/sexo) — el usuario no
//      vuelve a escribir nada de esto.
//   2. composeChipSentence: transforma selecciones de chips (collar,
//      comportamiento) en una frase corta, sin que la persona tipee nada.
//   3. Lo que la persona SÍ escribe (o dicta por voz) queda acotado a
//      "algo más para identificarla" — señas realmente únicas, lo único que
//      no se puede inferir de otro campo.
// El resultado de las 3 capas se concatena en descripcion, así que a la
// base de datos y al matching no les cambia nada: siguen viendo el mismo
// campo de texto de siempre.
// ---------------------------------------------------------------------------
// Concordancia con el sexo (2026-10-22, a pedido del usuario): las frases
// armadas usan "miedoso/a", "peludo/a", etc. Con sexo conocido se elige la
// forma ("miedosa" si es hembra, "miedoso" si es macho); sin sexo (o "No
// sé") quedan las dos, como antes.
export function genderize(text, sexo) {
  if (!text) return text;
  if (sexo !== "Hembra" && sexo !== "Macho") return text;
  const end = sexo === "Hembra" ? "a" : "o";
  return text.replace(/([A-Za-zÁÉÍÓÚáéíóúÑñ]+)o\/a\b/g, `$1${end}`);
}

export function composeDescripcionBase(form) {
  if (!form) return "";
  const hembra = form.sexo === "Hembra";
  const especieLabel =
    form.especie === "perro" ? (hembra ? "una perra" : "un perro") : form.especie === "gato" ? (hembra ? "una gata" : "un gato") : "una mascota";
  const colorTxt = form.color === "Otro color" ? form.colorOtro : form.color;
  // Mestizo/no sé/otra raza no se suman a la frase — decir "es un perro no
  // sé la raza" no aporta nada que "es un perro" no dijera ya (mismo
  // criterio que en razaSimilarity, más arriba: no distinguen).
  const razaTxt = form.raza && !razaSinSenal(normalizeText(form.raza)) ? form.raza.trim() : "";
  const parts = [`Es ${especieLabel}${razaTxt ? ` ${razaTxt}` : ""}`];
  if (form.tamano) parts.push(`de tamaño ${form.tamano}`);
  if (colorTxt) parts.push(`color ${colorTxt.toLowerCase()}`);
  if (form.edad && form.edad !== "No sé") {
    // "Cachorro/cría" y "Adulto" son las dos edades que cambian con el sexo.
    const edadTxt = form.edad
      .replace(/\s*\([^)]*\)/, "")
      .toLowerCase()
      .replace(/^cachorro\/cría$/, "cachorro/a")
      .replace(/^adulto$/, "adulto/a");
    parts.push(genderize(edadTxt, form.sexo));
  }
  if (form.sexo && form.sexo !== "No sé") parts.push(form.sexo.toLowerCase());
  return parts.join(", ") + ".";
}

// Arma "Tenía collar y chapita con nombre." a partir de ["Collar", "Chapita
// con nombre"] — separa el último ítem con "y" en vez de una coma más,
// nada más que una lista prolija en español.
export function composeChipSentence(prefix, chips) {
  if (!chips || chips.length === 0) return "";
  const items = chips.map((c) => c.toLowerCase());
  const joined =
    items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
  return `${prefix} ${joined}.`;
}

// Distinto de composeChipSentence: ese arma UNA frase compartida con un
// solo molde ("Tenía X, Y y Z") — funciona porque collar/arnés/etc. son
// todos sustantivos que encajan ahí. El comportamiento no: "Sociable" es
// un adjetivo ("Es sociable") pero "Se deja agarrar" ya es una oración
// propia — meterlos en el mismo molde daba frases rotas ("Es se deja
// agarrar"). Acá cada chip trae su propia oración ya armada, y esto solo
// las une con punto y espacio.
export function composeClauses(clauses) {
  if (!clauses || clauses.length === 0) return "";
  return clauses
    .filter(Boolean)
    .map((c) => (c.trim().endsWith(".") ? c.trim() : `${c.trim()}.`))
    .join(" ");
}

// Las 3 preguntas de "Detalles para reconocerlo" (ver ACCESORIO_OPTIONS/
// REACCION_OPTIONS/MARCA_OPTIONS más arriba), cada una como función pura que
// recibe los ids seleccionados y devuelve la frase lista para sumar a
// form.descripcion — mismo patrón que composeDescripcionBase.
export function composeAccesorioSentence(ids) {
  if (!ids || ids.length === 0) return "";
  if (ids.includes("nada")) return "No tenía nada puesto.";
  const labels = ids.map((id) => ACCESORIO_OPTIONS.find((o) => o.id === id)?.label).filter(Boolean);
  return composeChipSentence("Tenía", labels);
}

export function composeReaccionSentence(ids, sexo) {
  if (!ids || ids.length === 0) return "";
  const clauses = ids
    .filter((id) => id !== "no_se")
    .map((id) => genderize(REACCION_OPTIONS.find((o) => o.id === id)?.clause, sexo))
    .filter(Boolean);
  return composeClauses(clauses);
}

// La mancha es la única marca con datos propios (ubicación + color
// opcional) — el resto son clauses fijas que ya vienen armadas en
// MARCA_OPTIONS. "otro" nunca aporta clause (ver comentario junto a
// MARCA_OPTIONS).
export function composeMarcaSentence(ids, { manchaUbicacion, manchaColor, sexo } = {}) {
  if (!ids || ids.length === 0) return "";
  const clauses = [];
  if (ids.includes("mancha")) {
    const colorTxt = manchaColor && manchaColor !== "Otro color" ? ` ${manchaColor.toLowerCase()}` : "";
    const ubicacionOpt = MANCHA_UBICACION_OPTIONS.find((o) => o.id === manchaUbicacion);
    const prep = ubicacionOpt?.prep ? ` ${ubicacionOpt.prep}` : "";
    clauses.push(`Tiene una mancha${colorTxt} particular${prep}`);
  }
  ids
    .filter((id) => id !== "mancha" && id !== "otro")
    .forEach((id) => {
      const clause = genderize(MARCA_OPTIONS.find((o) => o.id === id)?.clause, sexo);
      if (clause) clauses.push(clause);
    });
  return composeClauses(clauses);
}

// Todo lo seleccionado en "Detalles para reconocerlo" queda además en un
// objeto estructurado (no sólo concatenado en form.descripcion) — hoy se usa
// para un bono de matching (ver detallesSimilarity) y deja la puerta abierta
// a pesarlo más el día que el catálogo de opciones crezca. Se omiten los
// campos vacíos para no guardar ruido en la base.
export function buildDetallesEstructurados({ accesorios, comportamientos, marcaDistintiva, ubicacionMarca, colorMarca } = {}) {
  const out = {};
  if (accesorios?.length) out.accesorios = accesorios;
  if (comportamientos?.length) out.comportamientos = comportamientos;
  if (marcaDistintiva?.length) out.marca_distintiva = marcaDistintiva;
  if (ubicacionMarca) out.ubicacion_marca = ubicacionMarca;
  if (colorMarca) out.color_marca = colorMarca;
  return out;
}

export function buildShareText(report) {
  const tipoTxt = report.tipo === "perdida" ? "PERDIDA" : report.detalles?.avistamiento === true ? "VISTA SUELTA" : "ENCONTRADA";
  const nombreTxt = report.nombre ? `${report.nombre} — ` : "";
  const razaTxt = report.raza && !razaSinSenal(normalizeText(report.raza)) ? ` (${report.raza})` : "";
  return `🐾 Mascota ${tipoTxt}: ${nombreTxt}${report.especie}${razaTxt}, color ${report.color}, tamaño ${report.tamano}.\nZona: ${report.zona}.\n${report.descripcion}\n\n¿La reconocés? Ayudemos a reencontrarla. Publicado en Felpus.`;
}

// Alt text de la foto principal de un reporte — antes era solo
// report.especie ("perro"/"gato"), poco útil para alguien que navega con
// lector de pantalla y no puede ver la foto. Esto arma algo descriptivo de
// verdad: tipo (perdida/encontrada) + nombre si tiene + color.
export function reportPhotoAlt(report) {
  if (!report) return "";
  const tipoTxt = report.tipo === "perdida" ? "Perdida" : report.detalles?.avistamiento === true ? "Vista suelta" : "Encontrada";
  const especieTxt = report.especie === "gato" ? "gato" : report.especie === "perro" ? "perro" : "mascota";
  const colorTxt = report.color === "Otro color" && report.colorOtro ? report.colorOtro : report.color;
  const nombreTxt = report.nombre ? `${report.nombre}, ` : "";
  return `${tipoTxt}: ${nombreTxt}${especieTxt}${colorTxt ? ` ${colorTxt.toLowerCase()}` : ""}`;
}

// --- Panel de administrador: desgloses de métricas ---
// Corre 100% en el cliente sobre la lista de reportes que ya se trae
// completa para la pestaña "Reportes" del panel (adminAllReports en
// FelpusMatcher.jsx) — no hace falta ninguna función SQL nueva ni
// migración: es la forma más simple y segura de sumar desgloses (zona,
// raza, edad, etc.) sin tocar el schema ni agregar otro viaje de red.
const ESPECIE_LABELS = { perro: "Perro", gato: "Gato", otro: "Otro" };
const TAMANO_LABELS = { chico: "Chico", mediano: "Mediano", grande: "Grande" };

// Cuenta ocurrencias de lo que devuelva keyFn para cada reporte — vacíos
// (raza sin completar, ciudad sin la migración corrida, etc.) caen todos
// juntos en "emptyLabel" en vez de desaparecer silenciosamente: es preferible
// que el admin VEA cuántos reportes todavía no tienen ese dato, a que el
// desglose sume menos que el total y parezca un error.
function countBy(reports, keyFn, emptyLabel = "Sin especificar") {
  const counts = new Map();
  reports.forEach((r) => {
    const raw = keyFn(r);
    const label = raw && String(raw).trim() ? String(raw).trim() : emptyLabel;
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return counts;
}

// Ordena de mayor a menor cantidad y calcula el porcentaje sobre `total`
// (no necesariamente el total general — porRazaPerdida, por ejemplo, calcula
// el porcentaje sobre el total de PERDIDAS, no de todos los reportes). Si hay
// más entradas que `limit`, las menos frecuentes se agrupan en una fila
// "Otras" al final — sin límite, una ciudad con un solo reporte cada una
// podría generar una lista interminable.
function toSortedBreakdown(counts, total, limit) {
  const entries = Array.from(counts.entries())
    .map(([label, count]) => ({ label, count, pct: total ? Math.round((count / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
  if (!limit || entries.length <= limit) return entries;
  const top = entries.slice(0, limit);
  const restCount = entries.slice(limit).reduce((sum, e) => sum + e.count, 0);
  if (restCount > 0) {
    top.push({ label: "Otras", count: restCount, pct: total ? Math.round((restCount / total) * 1000) / 10 : 0 });
  }
  return top;
}

// Cada desglose es un array de { label, count, pct }, ya ordenado de mayor a
// menor. porRazaPerdida/porRazaEncontrada calculan el porcentaje sobre el
// total de esa categoría (perdidas o encontradas) en vez del total general,
// para responder de verdad "qué % de las PERDIDAS son de tal raza" — sobre
// el total general esos números serían mucho más chicos y menos útiles.
export function computeAdminBreakdowns(reports) {
  const list = Array.isArray(reports) ? reports : [];
  const total = list.length;
  const perdidas = list.filter((r) => r.tipo === "perdida");
  const encontradas = list.filter((r) => r.tipo === "encontrada");

  return {
    total,
    porEspecie: toSortedBreakdown(countBy(list, (r) => ESPECIE_LABELS[r.especie] || r.especie), total),
    porTamano: toSortedBreakdown(countBy(list, (r) => TAMANO_LABELS[r.tamano] || r.tamano), total),
    porSexo: toSortedBreakdown(countBy(list, (r) => r.sexo), total),
    porEdad: toSortedBreakdown(countBy(list, (r) => r.edad), total),
    porProvincia: toSortedBreakdown(countBy(list, (r) => r.provincia), total, 6),
    porCiudad: toSortedBreakdown(countBy(list, (r) => r.ciudad), total, 6),
    porRazaPerdida: toSortedBreakdown(countBy(perdidas, (r) => r.raza), perdidas.length, 6),
    porRazaEncontrada: toSortedBreakdown(countBy(encontradas, (r) => r.raza), encontradas.length, 6),
  };
}

export function emptyForm() {
  return {
    especie: "perro",
    raza: "",
    nombre: "",
    color: "",
    colorOtro: "",
    tamano: "mediano",
    sexo: "",
    edad: "",
    peso: "",
    zona: "",
    // Ciudad/provincia estructuradas — solo se completan cuando la persona
    // elige una sugerencia del autocompletado de Google Places
    // (ZonaAutocomplete.jsx); si tipea la zona a mano, quedan vacías, igual
    // que antes de que existieran estos dos campos.
    ciudad: "",
    provincia: "",
    lat: null,
    lng: null,
    fecha: new Date().toISOString().slice(0, 10),
    descripcion: "",
    contactoWhatsapp: "",
    // País del selector de WhatsApp (ver PhoneInput.jsx) — "AR" a propósito
    // fijo acá (no getDefaultCountry() de phone.js, que lee navigator): este
    // objeto lo usa también el primer render del servidor, donde navigator
    // no existe. El país real por dispositivo se corrige solo, después del
    // montaje, en un efecto de FelpusMatcher — mismo patrón que el resto de
    // la app usa para todo lo que depende del navegador (tema, geolocation).
    contactoWhatsappCountry: "AR",
    contactoEmail: "",
    // Avisos por email (emailAvisos.js): pocos, solo si hay novedades.
    avisosEmail: true,
    // Hasta 3 fotos: [{ dataUrl, hist, embedding }, ...]
    fotos: [],
  };
}

// Limpia un número de teléfono para armar un link de wa.me (solo dígitos,
// sin espacios/guiones/paréntesis/+).
export function sanitizePhoneForWhatsapp(phone) {
  return (phone || "").replace(/\D/g, "");
}

export const MAX_FOTOS = 3;
