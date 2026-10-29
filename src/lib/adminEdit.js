// Edición de publicaciones por el administrador (2026-10-21, a pedido):
// corregir datos y cambiar el orden de las fotos. Funciones puras: las usa
// /api/admin/report (que verifica que quien llama sea el admin) y sus tests.
import { COLOR_OPTIONS, EDAD_OPTIONS, PESO_OPTIONS, SEXO_OPTIONS, TAMANO_OPTIONS } from "./matching";

// Mismo admin que ya controla schema.sql (auth.email() en las funciones
// admin_*) y el panel de FelpusMatcher.
export const ADMIN_EMAIL = "santiagobarronlf@gmail.com";

const TEXT_LIMITS = { nombre: 60, zona: 100, ciudad: 80, raza: 60, color_otro: 60, descripcion: 1000 };
const CHOICES = {
  tipo: ["perdida", "encontrada"],
  especie: ["perro", "gato", "otro"],
  color: COLOR_OPTIONS,
  tamano: TAMANO_OPTIONS,
  sexo: ["", ...SEXO_OPTIONS],
  edad: ["", ...EDAD_OPTIONS],
  peso: ["", ...PESO_OPTIONS],
};

// Solo pasan los campos conocidos y con valores válidos; cualquier otro
// (user_id, resuelto, contacto, push_token...) se ignora. Devuelve
// { patch } o { error }.
export function buildAdminPatch(input, { allowTipo = true } = {}) {
  const patch = {};
  if (!input || typeof input !== "object") return { error: "Datos inválidos." };
  for (const [key, max] of Object.entries(TEXT_LIMITS)) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "string") return { error: `Campo inválido: ${key}.` };
    const value = input[key].trim();
    if (value.length > max) return { error: `"${key}" puede tener hasta ${max} caracteres.` };
    if (key === "zona" && !value) return { error: "La zona no puede quedar vacía." };
    patch[key] = value || (key === "zona" ? value : null);
  }
  for (const [key, options] of Object.entries(CHOICES)) {
    if (input[key] === undefined) continue;
    if (key === "tipo" && !allowTipo) return { error: "No se puede cambiar si es perdida o encontrada." };
    if (!options.includes(input[key])) return { error: `Valor inválido para ${key}.` };
    patch[key] = input[key] === "" ? null : input[key];
  }
  if (input.fecha !== undefined) {
    if (typeof input.fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return { error: "Fecha inválida." };
    patch.fecha = input.fecha;
  }
  return { patch };
}

// Rearma las fotos de una fila de reports (2026-10-29): reordenar, sacar o
// reemplazar por una recortada. `fotos` es la lista nueva en orden:
//  - { url } de una foto que ya tenía la fila (conserva su histograma y su
//    embedding), o
//  - { url, hist, embedding } de una foto nueva, que tiene que estar en el
//    bucket de Felpus con el prefijo de ESTE reporte (`nuevaPrefijo`); sin
//    prefijo no se aceptan fotos nuevas.
// Mueve juntos URL, histograma, embedding y la marca de foto dudosa
// (detalles.fotos_dudosas va por posición: antes, reordenar la dejaba en la
// foto equivocada). La primera es la principal. Devuelve { patch, quitadas }
// (URLs que ya no usa la fila, para borrarlas del bucket) o { error }.
export const MAX_FOTOS_REPORTE = 3;

function vectorValido(v, max) {
  return v == null || (Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "number" && Number.isFinite(x)));
}

export function rebuildPhotos(row, fotos, { nuevaPrefijo = null } = {}) {
  const urls = Array.isArray(row?.foto_urls) && row.foto_urls.length ? row.foto_urls : row?.foto_url ? [row.foto_url] : [];
  if (!Array.isArray(fotos) || fotos.length < 1) return { error: "La publicación tiene que quedar con al menos una foto." };
  if (fotos.length > MAX_FOTOS_REPORTE) return { error: `Como mucho ${MAX_FOTOS_REPORTE} fotos.` };
  const porFoto = (arr, i) => (Array.isArray(arr) && arr.length === urls.length ? arr[i] : i === 0 ? undefined : null);
  const dudosas = new Set(
    (Array.isArray(row?.detalles?.fotos_dudosas) ? row.detalles.fotos_dudosas : []).map((i) => urls[i]).filter(Boolean)
  );
  const vistas = new Set();
  const salida = [];
  for (const f of fotos) {
    const url = typeof f?.url === "string" ? f.url : "";
    if (!url || vistas.has(url)) return { error: "Las fotos no coinciden con la publicación." };
    vistas.add(url);
    const i = urls.indexOf(url);
    if (i >= 0) {
      const hist = porFoto(row.hists, i) ?? (i === 0 ? row.hist ?? null : null);
      const embedding = porFoto(row.embeddings, i) ?? (i === 0 ? row.embedding ?? null : null);
      salida.push({ url, hist, embedding, dudosa: dudosas.has(url) });
    } else {
      if (!nuevaPrefijo || !url.startsWith(nuevaPrefijo) || !/^[A-Za-z0-9-]+\.(jpg|jpeg|png|webp)$/.test(url.slice(nuevaPrefijo.lastIndexOf("/") + 1))) {
        return { error: "Las fotos no coinciden con la publicación." };
      }
      if (!vectorValido(f.hist, 256) || !vectorValido(f.embedding, 4096)) return { error: "Datos de la foto inválidos." };
      salida.push({ url, hist: f.hist ?? null, embedding: f.embedding ?? null, dudosa: false });
    }
  }
  const mismas = salida.length === urls.length && salida.every((f, i) => f.url === urls[i]);
  if (mismas) return { patch: {}, quitadas: [] };
  const patch = {
    foto_urls: salida.map((f) => f.url),
    foto_url: salida[0].url,
    hists: salida.map((f) => f.hist),
    hist: salida[0].hist,
    embeddings: salida.map((f) => f.embedding),
    embedding: salida[0].embedding,
  };
  const nuevasDudosas = salida.map((f, i) => (f.dudosa ? i : -1)).filter((i) => i >= 0);
  const antes = Array.isArray(row?.detalles?.fotos_dudosas) ? row.detalles.fotos_dudosas : [];
  if (antes.length || nuevasDudosas.length) {
    const { fotos_dudosas: _fuera, ...resto } = row.detalles || {};
    patch.detalles = nuevasDudosas.length ? { ...resto, fotos_dudosas: nuevasDudosas } : resto;
  }
  return { patch, quitadas: urls.filter((u) => !vistas.has(u)) };
}

// Reordenar: las mismas fotos en otro orden (no agrega ni saca). Lo usan el
// admin y la edición del dueño.
export function reorderPhotos(row, order) {
  const urls = Array.isArray(row?.foto_urls) && row.foto_urls.length ? row.foto_urls : row?.foto_url ? [row.foto_url] : [];
  if (!Array.isArray(order) || order.length !== urls.length) return { error: "El orden tiene que incluir todas las fotos." };
  if (order.some((u) => !urls.includes(u)) || new Set(order).size !== urls.length) return { error: "Las fotos no coinciden con la publicación." };
  if (urls.length < 2) return { patch: {} };
  const r = rebuildPhotos(row, order.map((url) => ({ url })));
  return r.error ? r : { patch: r.patch };
}

// Edición por quien publicó (2026-10-29): los mismos campos que el admin,
// menos el tipo (pasar una "perdida" a "encontrada" cambia con quién se
// compara y las alertas que ya salieron; para eso, un aviso nuevo).
export function buildOwnerPatch(input) {
  return buildAdminPatch(input, { allowTipo: false });
}
