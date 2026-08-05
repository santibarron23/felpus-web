import { logError } from "./log";

// ---------------------------------------------------------------------------
// Felpus — lógica de matching (corre 100% en el navegador)
//
// Combina, con pesos que se adaptan según qué tan confiable es cada señal:
//  1) similitud de imagen: embedding real de IA (CLIP, vía Hugging Face) si
//     está configurado, o histograma de color de 64 bins como respaldo.
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

export const EDAD_OPTIONS = [
  "Cachorro/cría (0-1 año)",
  "Joven (1-3 años)",
  "Adulto (3-8 años)",
  "Mayor (8+ años)",
  "No sé",
];

export const PESO_OPTIONS = ["Menos de 5 kg", "5 a 10 kg", "10 a 20 kg", "20 a 30 kg", "Más de 30 kg", "No sé"];

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
  // CLIP embeddings normalizados suelen dar coseno en [-1,1]; lo llevamos a [0,1]
  return Math.max(0, Math.min(1, (cos + 1) / 2));
}

// Similitud de imagen: usa el embedding real de IA (CLIP) cuando ambas fotos
// lo tienen. Si a alguna le falta (por ejemplo, porque no se configuró
// Hugging Face, o es un reporte de ejemplo), cae de nuevo al histograma de
// color, que siempre está disponible.
function singlePhotoSimilarity(fa, fb) {
  const embSim = cosineSimilarity(fa.embedding, fb.embedding);
  if (embSim != null) return embSim;
  return histIntersection(fa.hist, fb.hist);
}

// Un reporte puede tener hasta 3 fotos (fotos: [{hist, embedding}, ...]).
// Comparamos todas las combinaciones y nos quedamos con la mejor — alcanza
// con que una sola foto de cada lado coincida (distintos ángulos/poses de la
// misma mascota) para que el matching lo detecte.
export function imageSimilarity(a, b) {
  const fotosA = a.fotos?.length ? a.fotos : [{ hist: a.hist, embedding: a.embedding }];
  const fotosB = b.fotos?.length ? b.fotos : [{ hist: b.hist, embedding: b.embedding }];
  let best = 0;
  for (const fa of fotosA) {
    for (const fb of fotosB) {
      best = Math.max(best, singlePhotoSimilarity(fa, fb));
    }
  }
  return best;
}

export function computeHistogram(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        const bins = new Array(64).fill(0);
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
        resolve(bins.map((v) => v / total));
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

export function resizeImageFile(file) {
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

          // Marca de agua: logo de Felpus en la esquina inferior derecha.
          // Si por algún motivo no carga, seguimos sin marca de agua en vez
          // de bloquear la subida de la foto.
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

// Pide el embedding visual real (IA) a nuestra propia API route, que a su
// vez llama a Hugging Face. Si no está configurado o falla, devuelve null
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
// misma categoría genérica.
function colorOtroSimilarity(colorOtroA, colorOtroB) {
  const ca = normalizeText(colorOtroA).trim();
  const cb = normalizeText(colorOtroB).trim();
  if (!ca || !cb) return 1;
  if (ca === cb || ca.includes(cb) || cb.includes(ca)) return 1;
  return jaccard(tokenize(colorOtroA), tokenize(colorOtroB));
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

  if (a.color && b.color) {
    const colorMatch =
      a.color !== b.color ? 0 : a.color === "Otro color" ? colorOtroSimilarity(a.colorOtro, b.colorOtro) : 1;
    parts.push({ weight: 0.35, value: colorMatch });
  }
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
  if (a.tamano && b.tamano) {
    parts.push({ weight: 0.15, value: a.tamano === b.tamano ? 1 : 0 });
  }
  const edadSim = ordinalSimilarity(a.edad, b.edad, EDAD_OPTIONS);
  if (edadSim != null) parts.push({ weight: 0.15, value: edadSim });
  const pesoSim = ordinalSimilarity(a.peso, b.peso, PESO_OPTIONS);
  if (pesoSim != null) parts.push({ weight: 0.15, value: pesoSim });

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  if (totalWeight === 0) return 0;
  return parts.reduce((sum, p) => sum + p.weight * p.value, 0) / totalWeight;
}

// Si ambos reportes tienen al menos una foto con embedding real de IA
// (Hugging Face/CLIP), la imagen es una señal confiable. Si no, sólo
// tenemos el histograma de color de respaldo — mucho más débil (lo afectan
// el fondo, la luz, el encuadre) — así que conviene pesarlo menos.
function hasAiEmbedding(report) {
  const fotos = report.fotos?.length ? report.fotos : [{ embedding: report.embedding }];
  return fotos.some((f) => Array.isArray(f.embedding) && f.embedding.length > 0);
}

// Radio de referencia para el score de distancia, dinámico según cuántos
// días pasaron desde el más viejo de los dos reportes — una mascota perdida
// hace una semana pudo haberse alejado mucho más que una perdida hace una
// hora, así que toleramos más distancia sin penalizar tanto el score.
// Tope en 14 días para no diluir la señal de ubicación indefinidamente.
const RADIO_BASE_KM = 8;
const RADIO_EXTRA_KM_POR_DIA = 2;
const RADIO_DIAS_TOPE = 14;

function locationReferenceKm(a, b) {
  const now = Date.now();
  const masViejo = Math.min(a.creadoEn ?? now, b.creadoEn ?? now);
  const diasTranscurridos = Math.max(0, (now - masViejo) / (24 * 3600 * 1000));
  const diasEfectivos = Math.min(diasTranscurridos, RADIO_DIAS_TOPE);
  return RADIO_BASE_KM + diasEfectivos * RADIO_EXTRA_KM_POR_DIA;
}

export function scoreMatch(a, b) {
  const imgSim = imageSimilarity(a, b);
  const structuredSim = structuredFieldSimilarity(a, b);
  const descSim = jaccard(tokenize(a.descripcion), tokenize(b.descripcion));
  // Los campos estructurados (selects) valen mucho más que la redacción
  // libre de la descripción, que varía de persona a persona aunque sea la
  // misma mascota.
  const textSim = 0.75 * structuredSim + 0.25 * descSim;

  let locScore, distanceLabel;
  if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
    const d = haversineKm(a.lat, a.lng, b.lat, b.lng);
    locScore = Math.exp(-d / locationReferenceKm(a, b));
    distanceLabel = d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
  } else {
    const zonaA = normalizeText(a.zona);
    const zonaB = normalizeText(b.zona);
    const sameZone = !!zonaA && !!zonaB && (zonaA === zonaB || zonaA.includes(zonaB) || zonaB.includes(zonaA));
    locScore = sameZone ? 0.85 : 0.25;
    distanceLabel = sameZone ? "misma zona" : "zona distinta";
  }

  // Especies distintas (ej. perro vs gato) nunca son la misma mascota — el
  // score queda en 0% sin importar cuánto se parezcan el color o la zona.
  const speciesFactor = a.especie === b.especie ? 1 : 0;

  // Pesos adaptativos: con IA visual real, la imagen es la señal más fuerte;
  // sin ella (histograma de color nomás), pesan más los campos
  // estructurados y la ubicación.
  const weights =
    hasAiEmbedding(a) && hasAiEmbedding(b)
      ? { img: 0.5, text: 0.3, loc: 0.2 }
      : { img: 0.2, text: 0.5, loc: 0.3 };

  const combined = speciesFactor * (weights.img * imgSim + weights.text * textSim + weights.loc * locScore);
  return {
    score: Math.max(0, Math.min(1, combined)),
    imgSim,
    textSim,
    locScore,
    distanceLabel,
  };
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
  if (score >= 0.7) return { text: "Alta probabilidad", color: colors.green };
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
// vale la pena incentivar (publicar, confirmar reencuentros, ser querido
// por la comunidad, sostenerlo en el tiempo).
export const BADGES = [
  { id: "primera-huella", icon: "🌟", label: "Primera huella", check: (c) => (c.reportes || 0) >= 1 },
  { id: "guia-de-barrio", icon: "🧭", label: "Guía de barrio", check: (c) => (c.reportes || 0) >= 5 },
  { id: "heroe-reencuentro", icon: "🎉", label: "Héroe del reencuentro", check: (c) => (c.reencuentros || 0) >= 1 },
  { id: "querido-comunidad", icon: "💞", label: "Querido por la comunidad", check: (c) => (c.hearts || 0) >= 5 },
  { id: "leyenda-felpus", icon: "👑", label: "Leyenda Felpus", check: (c) => (c.points || 0) >= 100 },
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
export function composeDescripcionBase(form) {
  if (!form) return "";
  const especieLabel = form.especie === "perro" ? "un perro" : form.especie === "gato" ? "un gato" : "una mascota";
  const colorTxt = form.color === "Otro color" ? form.colorOtro : form.color;
  // Mestizo/no sé/otra raza no se suman a la frase — decir "es un perro no
  // sé la raza" no aporta nada que "es un perro" no dijera ya (mismo
  // criterio que en razaSimilarity, más arriba: no distinguen).
  const razaTxt = form.raza && !razaSinSenal(normalizeText(form.raza)) ? form.raza.trim() : "";
  const parts = [`Es ${especieLabel}${razaTxt ? ` ${razaTxt}` : ""}`];
  if (form.tamano) parts.push(`de tamaño ${form.tamano}`);
  if (colorTxt) parts.push(`color ${colorTxt.toLowerCase()}`);
  if (form.edad && form.edad !== "No sé") parts.push(form.edad.replace(/\s*\([^)]*\)/, "").toLowerCase());
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

export function composeReaccionSentence(ids) {
  if (!ids || ids.length === 0) return "";
  const clauses = ids
    .filter((id) => id !== "no_se")
    .map((id) => REACCION_OPTIONS.find((o) => o.id === id)?.clause)
    .filter(Boolean);
  return composeClauses(clauses);
}

// La mancha es la única marca con datos propios (ubicación + color
// opcional) — el resto son clauses fijas que ya vienen armadas en
// MARCA_OPTIONS. "otro" nunca aporta clause (ver comentario junto a
// MARCA_OPTIONS).
export function composeMarcaSentence(ids, { manchaUbicacion, manchaColor } = {}) {
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
      const clause = MARCA_OPTIONS.find((o) => o.id === id)?.clause;
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
  const tipoTxt = report.tipo === "perdida" ? "PERDIDA" : "ENCONTRADA";
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
  const tipoTxt = report.tipo === "perdida" ? "Perdida" : "Encontrada";
  const especieTxt = report.especie === "gato" ? "gato" : report.especie === "perro" ? "perro" : "mascota";
  const colorTxt = report.color === "Otro color" && report.colorOtro ? report.colorOtro : report.color;
  const nombreTxt = report.nombre ? `${report.nombre}, ` : "";
  return `${tipoTxt}: ${nombreTxt}${especieTxt}${colorTxt ? ` ${colorTxt.toLowerCase()}` : ""}`;
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
    lat: null,
    lng: null,
    fecha: new Date().toISOString().slice(0, 10),
    descripcion: "",
    contactoWhatsapp: "",
    contactoEmail: "",
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
