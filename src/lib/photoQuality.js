// ¿La foto quedó demasiado oscura? (2026-10-29). Fotos sacadas de noche o
// adentro sin luz casi no sirven para reconocer a la mascota ni para el
// matching por color. Solo avisa: nunca bloquea publicar.
//
// Se mide el brillo promedio (luminancia de Rec. 601, 0-255) sobre la foto
// reducida a 32x32. Un perro negro en un buen ambiente da ~60-90; por eso
// el corte es bajo: solo marca fotos donde casi todo está en penumbra.
// No se avisa de fotos borrosas: sin fotos reales para calibrar, avisaría
// de más (ver DIAGNOSTICO_UX_2026-10-29.md).
export const DARK_THRESHOLD = 40;

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

export function isTooDark(luminance) {
  return typeof luminance === "number" && luminance < DARK_THRESHOLD;
}

// Navegador: brillo de una foto (data URL). null si no se pudo medir.
export async function photoLuminance(dataUrl) {
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = dataUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 32, 32);
    return meanLuminance(ctx.getImageData(0, 0, 32, 32).data);
  } catch {
    return null;
  }
}
