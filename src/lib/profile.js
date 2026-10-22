// Perfil: foto y ubicación (país/provincia/ciudad), 2026-10-22. Se guardan
// en contributors (ver supabase/migrations/20261022_01_perfil_foto_ubicacion.sql).

export const PAIS_DEFAULT = "Argentina";

export const PAISES = [
  "Argentina",
  "Bolivia",
  "Brasil",
  "Chile",
  "Colombia",
  "Ecuador",
  "España",
  "México",
  "Paraguay",
  "Perú",
  "Uruguay",
  "Venezuela",
  "Otro",
];

export const PROVINCIAS_AR = [
  "Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Ciudad Autónoma de Buenos Aires",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];

// Mismos topes que el check de la base (contributors_ubicacion_len).
export const UBICACION_MAX = { pais: 60, provincia: 80, ciudad: 80 };

// "Salta, Salta" no aporta: si ciudad y provincia son iguales se muestra una
// sola vez. El país solo se suma si no es Argentina (casi toda la comunidad
// es de acá) o si se pide explícito (perfil propio).
export function formatUbicacion(p, { conPais = false } = {}) {
  if (!p) return "";
  const ciudad = (p.ciudad || "").trim();
  const provincia = (p.provincia || "").trim();
  const pais = (p.pais || "").trim();
  const parts = [ciudad];
  if (provincia && provincia.toLowerCase() !== ciudad.toLowerCase()) parts.push(provincia);
  if (pais && (conPais || pais !== PAIS_DEFAULT)) parts.push(pais);
  return parts.filter(Boolean).join(", ");
}

// Limpia lo que se va a guardar: recorta espacios y largos, y vacío → null.
export function cleanUbicacion({ pais, provincia, ciudad } = {}) {
  const clean = (v, max) => {
    const t = (v || "").trim().slice(0, max);
    return t || null;
  };
  const out = {
    pais: clean(pais, UBICACION_MAX.pais),
    provincia: clean(provincia, UBICACION_MAX.provincia),
    ciudad: clean(ciudad, UBICACION_MAX.ciudad),
  };
  // El selector arranca en Argentina: si la persona no completó nada más,
  // no eligió país de verdad, y no se guarda.
  if (out.pais === PAIS_DEFAULT && !out.provincia && !out.ciudad) out.pais = null;
  return out;
}

// Foto de perfil: recorte cuadrado centrado de 256 px en JPEG. Chica a
// propósito: se muestra a 40-64 px, y así se puede servir sin pasar por el
// optimizador de imágenes de Vercel (que tiene cuota mensual, ver
// docs/IMAGENES.md).
export const AVATAR_SIZE = 256;

export function cropAvatarDataUrl(file, size = AVATAR_SIZE) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith("image/")) {
      reject(new Error("Elegí una imagen."));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        canvas.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No pudimos leer esa imagen. Probá con otra."));
    };
    img.src = url;
  });
}
