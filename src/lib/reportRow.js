// Auditoría de seguridad (2026-10-23): /api/create-report insertaba con la
// service_role key el objeto `row` TAL CUAL lo mandaba el navegador (solo
// pisaba user_id, resuelto y el contacto). Cualquiera podía agregar columnas
// que el formulario nunca manda: push_token (el token de capacidad del
// reporte), creado_en en el futuro (quedar primero en el listado para
// siempre), inactivo/actividad_en, resuelto_por_user_id, oculto, o
// fotos/embeddings apuntando a cualquier lado. Ahora el servidor arma la
// fila con una lista cerrada de columnas — exactamente las que arma
// createReport() en store.js — y valida las que alimentan la UI y el
// matching.

// Columnas que el formulario manda. Todo lo demás se descarta en silencio
// (no es un error del usuario: lo agregó alguien a mano).
export const REPORT_INSERT_COLUMNS = [
  "id",
  "tipo",
  "especie",
  "raza",
  "detalles",
  "nombre",
  "color",
  "color_otro",
  "tamano",
  "sexo",
  "edad",
  "peso",
  "zona",
  "ciudad",
  "provincia",
  "lat",
  "lng",
  "fecha",
  "descripcion",
  "contacto_whatsapp",
  "contacto_email",
  "foto_url",
  "hist",
  "embedding",
  "foto_urls",
  "hists",
  "embeddings",
  "nickname",
  // Avisos por email (migración 20261028_01): false = no quiere mails.
  "avisos_email",
];

export const REPORT_ID_RE = /^[A-Za-z0-9-]{6,64}$/;
const MAX_FOTOS = 3;
const MAX_VECTOR = 4096;

function isNumberArray(v) {
  return Array.isArray(v) && v.length <= MAX_VECTOR && v.every((n) => typeof n === "number" && Number.isFinite(n));
}

// photosPrefix: URL pública del bucket propio, p. ej.
// https://<proyecto>.supabase.co/storage/v1/object/public/felpus-photos/
// Sin él (servidor mal configurado) no se valida el origen de las fotos.
export function sanitizeReportRow(input, { photosPrefix } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Falta el reporte a publicar." };

  const row = {};
  for (const col of REPORT_INSERT_COLUMNS) {
    if (input[col] !== undefined) row[col] = input[col];
  }

  if (typeof row.id !== "string" || !REPORT_ID_RE.test(row.id)) return { error: "Identificador de reporte inválido." };
  if (row.tipo !== "perdida" && row.tipo !== "encontrada") return { error: "Tipo de reporte inválido." };

  for (const coord of ["lat", "lng"]) {
    if (row[coord] == null) continue;
    const n = Number(row[coord]);
    const max = coord === "lat" ? 90 : 180;
    if (!Number.isFinite(n) || Math.abs(n) > max) return { error: "Ubicación inválida." };
    row[coord] = n;
  }

  const fotoUrls = row.foto_urls ?? (row.foto_url ? [row.foto_url] : []);
  if (!Array.isArray(fotoUrls) || fotoUrls.length === 0 || fotoUrls.length > MAX_FOTOS) {
    return { error: "El reporte necesita entre 1 y 3 fotos." };
  }
  const allUrls = [row.foto_url, ...fotoUrls].filter((u) => u != null);
  if (allUrls.some((u) => typeof u !== "string" || (photosPrefix && !u.startsWith(photosPrefix)))) {
    return { error: "Las fotos tienen que subirse desde Felpus." };
  }

  if (row.hist != null && !isNumberArray(row.hist)) return { error: "Datos de la foto inválidos." };
  if (row.embedding != null && !isNumberArray(row.embedding)) return { error: "Datos de la foto inválidos." };
  for (const key of ["hists", "embeddings"]) {
    if (row[key] == null) continue;
    if (!Array.isArray(row[key]) || row[key].length > MAX_FOTOS || !row[key].every((v) => v == null || isNumberArray(v))) {
      return { error: "Datos de la foto inválidos." };
    }
  }

  if (row.detalles != null && (typeof row.detalles !== "object" || Array.isArray(row.detalles))) {
    return { error: "Detalles inválidos." };
  }

  if (row.avisos_email !== undefined) row.avisos_email = row.avisos_email !== false;

  return { row };
}
