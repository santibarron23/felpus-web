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
export function buildAdminPatch(input) {
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
    if (!options.includes(input[key])) return { error: `Valor inválido para ${key}.` };
    patch[key] = input[key] === "" ? null : input[key];
  }
  if (input.fecha !== undefined) {
    if (typeof input.fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return { error: "Fecha inválida." };
    patch.fecha = input.fecha;
  }
  return { patch };
}

// Reordena las fotos de una fila de reports. `order` son las URLs en el
// orden nuevo y tiene que ser exactamente las mismas fotos (no se puede
// agregar ni sacar ninguna por acá). Mueve juntas URL, histograma de color
// y embedding de cada foto, para que el matching siga comparando cada foto
// con sus propios datos; la primera pasa a ser la principal (foto_url, hist,
// embedding), que es la que se ve en las tarjetas.
export function reorderPhotos(row, order) {
  const urls = Array.isArray(row?.foto_urls) && row.foto_urls.length ? row.foto_urls : row?.foto_url ? [row.foto_url] : [];
  if (!Array.isArray(order) || order.length !== urls.length) return { error: "El orden tiene que incluir todas las fotos." };
  const index = order.map((u) => urls.indexOf(u));
  if (index.some((i) => i < 0) || new Set(index).size !== urls.length) return { error: "Las fotos no coinciden con la publicación." };
  if (urls.length < 2) return { patch: {} };
  const pick = (arr) => (Array.isArray(arr) && arr.length === urls.length ? index.map((i) => arr[i]) : arr);
  const hists = pick(row.hists);
  const embeddings = pick(row.embeddings);
  const patch = { foto_urls: order, foto_url: order[0] };
  if (Array.isArray(row.hists) && row.hists.length === urls.length) {
    patch.hists = hists;
    patch.hist = hists[0];
  }
  if (Array.isArray(row.embeddings) && row.embeddings.length === urls.length) {
    patch.embeddings = embeddings;
    patch.embedding = embeddings[0];
  }
  return { patch };
}
