// ¿La foto quedó demasiado oscura o movida? (2026-10-29). Fotos sacadas de
// noche, adentro sin luz o con la mano moviéndose casi no sirven para
// reconocer a la mascota ni para el matching. Solo avisan: nunca bloquean
// publicar.
//
// Oscura: brillo promedio (luminancia de Rec. 601, 0-255). Un perro negro
// en un buen ambiente da ~60-90; por eso el corte es bajo: solo marca fotos
// donde casi todo está en penumbra.
export const DARK_THRESHOLD = 40;

// Movida: cuánto detalle fino tiene la foto (varianza del Laplaciano sobre
// la foto en grises, achicada a SHARP_SIZE px de lado mayor). Se mide en
// una grilla de 4x4 y vale la parte MÁS nítida: una mascota enfocada con
// el fondo desenfocado no es una foto movida. Se saltea la celda de abajo
// a la derecha, donde va la marca de agua de Felpus (resizeImageFile en
// matching.js), que tiene bordes nítidos en cualquier foto.
//
// Calibrado el 2026-10-29 con las 259 fotos reales de producción (sin los
// flyers ya marcados ni los 10 reportes de demostración en SVG), medidas
// con este mismo código en Chromium (scripts/calibrar-fotos-movidas.mjs) y
// revisadas a ojo de menor a mayor nitidez: las 3 claramente movidas dieron
// 21, 51 y 132; la siguiente, 200 (una foto sacada a una pantalla, blanda
// pero reconocible), y de 291 para arriba todas se ven bien. Con 150 avisa
// en ~1 % de las fotos y deja margen hacia las dudosas: preferimos no
// avisar a avisar de más.
export const SHARP_SIZE = 320;
export const BLUR_THRESHOLD = 150;
const GRID = 4;

// data: RGBA plano (como ImageData.data).
export function meanLuminance(data) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    n++;
  }
  return n ? sum / n : null;
}

// Nitidez de una imagen RGBA de w x h: la varianza del Laplaciano de la
// celda más nítida de la grilla (sin la de la marca de agua). null si la
// imagen es demasiado chica para medir.
export function sharpness(data, w, h) {
  if (w < GRID * 4 || h < GRID * 4) return null;
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; p < gray.length; i += 4, p++) gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  const cw = Math.floor(w / GRID);
  const ch = Math.floor(h / GRID);
  let best = 0;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      if (gx === GRID - 1 && gy === GRID - 1) continue;
      let sum = 0;
      let sum2 = 0;
      let n = 0;
      // Sin el borde de la imagen (el Laplaciano necesita los 4 vecinos).
      for (let y = Math.max(1, gy * ch); y < Math.min(h - 1, (gy + 1) * ch); y++) {
        for (let x = Math.max(1, gx * cw); x < Math.min(w - 1, (gx + 1) * cw); x++) {
          const p = y * w + x;
          const lap = 4 * gray[p] - gray[p - 1] - gray[p + 1] - gray[p - w] - gray[p + w];
          sum += lap;
          sum2 += lap * lap;
          n++;
        }
      }
      if (n) best = Math.max(best, sum2 / n - (sum / n) ** 2);
    }
  }
  return best;
}

export function isTooDark(luminance) {
  return typeof luminance === "number" && luminance < DARK_THRESHOLD;
}

// Una foto oscura ya tiene su propio aviso (y en penumbra casi no hay
// detalle, aunque esté enfocada): no se avisa de las dos cosas.
export function isBlurry(sharp, luminance) {
  return typeof sharp === "number" && sharp < BLUR_THRESHOLD && !isTooDark(luminance);
}

// Navegador: { luminance, sharpness } de una foto (data URL), o null si no
// se pudo medir.
export async function photoAnalysis(dataUrl) {
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = dataUrl;
    });
    const scale = Math.min(1, SHARP_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    return { luminance: meanLuminance(data), sharpness: sharpness(data, w, h) };
  } catch {
    return null;
  }
}
