// Lado del navegador de "Importar de Facebook": achicar la captura antes de
// mandarla, recortar la foto de la mascota y llamar a /api/import-post.
// Lo puro (validación, mapeo al formulario) está en postImport.js.

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No pudimos leer esa imagen. Probá con otra."));
    img.src = src;
  });
}

async function withImage(source, fn) {
  const isFile = typeof source !== "string";
  const url = isFile ? URL.createObjectURL(source) : source;
  try {
    return fn(await loadImage(url));
  } finally {
    if (isFile) URL.revokeObjectURL(url);
  }
}

// Captura -> JPEG de a lo sumo maxDim px de lado (el texto sigue legible y
// el pedido queda bien abajo del límite de la ruta).
export function shrinkForUpload(file, maxDim = 1600) {
  return withImage(file, (img) => {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  });
}

function canvasToFile(canvas, name) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(new File([blob], name, { type: "image/jpeg" })) : reject(new Error("blob"))), "image/jpeg", 0.92);
  });
}

// Imagen (File o data URL) -> File listo para el procesamiento de fotos de
// siempre (processPhotoFile). Con box ({top,left,bottom,right} en 0..1)
// recorta la foto de la mascota de la captura.
export function toPhotoFile(source, box = null) {
  return withImage(source, (img) => {
    const sx = box ? Math.round(box.left * img.width) : 0;
    const sy = box ? Math.round(box.top * img.height) : 0;
    const sw = box ? Math.round((box.right - box.left) * img.width) : img.width;
    const sh = box ? Math.round((box.bottom - box.top) * img.height) : img.height;
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvasToFile(canvas, "publicacion.jpg");
  });
}

// { url } o { image } -> { ok: true, draft, box, photo, source } o
// { ok: false, code, error }.
export async function importPost(payload) {
  try {
    const res = await fetch("/api/import-post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, code: body.code || "error", error: body.error || "No pudimos leer la publicación." };
    return { ok: true, ...body };
  } catch {
    return { ok: false, code: "network", error: "Sin conexión. Probá de nuevo." };
  }
}
