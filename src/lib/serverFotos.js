// Fotos en Storage desde el servidor (2026-11-07, hallazgo M1 de
// REVISION_SEGURIDAD_2026-11-07.md).
//
// Antes el navegador subía cada foto directo a Supabase con la clave pública,
// gracias a la policy felpus_photos_public_insert: cualquiera podía subir
// archivos sin límite de cantidad (unos 500 de 2 MB llenan el 1 GB del plan
// gratis y las fotos reales dejan de subir). Ahora:
//   - /api/fotos/subir controla el cupo (felpus_limite, tipo "foto") y
//     entrega un permiso de subida firmado para UN archivo con nombre elegido
//     acá, y
//   - /api/fotos/borrar borra con la service key después de comprobar que el
//     aviso (o la foto de perfil) es de quien lo pide.
// Lo segundo hace falta porque un archivo subido con permiso firmado no
// queda a nombre de la cuenta (storage.objects.owner vacío), así que la
// policy felpus_photos_owner_delete ya no alcanzaría para borrarlo.
// Con las dos rutas andando, la migración 20261107_02 cierra la subida
// directa.

export const BUCKET = "felpus-photos";
export const EXT_PERMITIDAS = new Set(["jpg", "png", "webp"]);

// Prefijos que arma el cliente (store.js): `${report.id}`, `${report.id}-0`,
// `${report.id}-r` (admin) o `avatars/<userId>/avatar`.
const PREFIJO_AVISO = /^[A-Za-z0-9-]{1,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// -> el prefijo si es válido para quien lo pide, o null.
export function prefijoPermitido(prefijo, userId) {
  if (typeof prefijo !== "string") return null;
  if (PREFIJO_AVISO.test(prefijo)) return prefijo;
  const m = /^avatars\/([^/]+)\/avatar$/.exec(prefijo);
  if (m && userId && m[1] === userId && UUID.test(userId)) return prefijo;
  return null;
}

// URL pública -> path dentro del bucket (o null si no es de este bucket).
export function pathDesdeUrl(url) {
  if (typeof url !== "string") return null;
  const marca = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marca);
  if (i === -1) return null;
  let path;
  try {
    path = decodeURIComponent(url.slice(i + marca.length).split(/[?#]/)[0]);
  } catch {
    return null;
  }
  if (!path || path.includes("..") || path.startsWith("/")) return null;
  return path;
}

// Fotos de un aviso: `${reportId}-…` en la raíz del bucket. Los ids de aviso
// son `${Date.now()}-${6 caracteres}`, así que ningún id es prefijo de otro
// seguido de "-".
export function esFotoDelAviso(path, reportId) {
  return typeof path === "string" && path.startsWith(`${reportId}-`) && !path.includes("/");
}

export function esAvatarDe(path, userId) {
  return typeof path === "string" && !!userId && path.startsWith(`avatars/${userId}/`) && path.split("/").length === 3;
}

function headersServicio(serviceKey) {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
}

// Permiso firmado de Supabase para subir un archivo (vale 2 horas, un solo
// archivo, sin pisar uno existente). -> { path, token }
export async function firmarSubida(path, { supabaseUrl, serviceKey, fetchImpl = fetch }) {
  const res = await fetchImpl(`${supabaseUrl}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: headersServicio(serviceKey),
    body: "{}",
  });
  if (!res.ok) throw new Error(`Storage ${res.status} al firmar la subida`);
  const data = await res.json();
  const token = new URL(String(data?.url || ""), "https://x.invalid").searchParams.get("token");
  if (!token) throw new Error("Storage no devolvió el permiso de subida");
  return { path, token };
}

export async function borrarArchivos(paths, { supabaseUrl, serviceKey, fetchImpl = fetch }) {
  if (!paths.length) return;
  const res = await fetchImpl(`${supabaseUrl}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: headersServicio(serviceKey),
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!res.ok) throw new Error(`Storage ${res.status} al borrar`);
}
