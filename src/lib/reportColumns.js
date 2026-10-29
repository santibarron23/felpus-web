// Columnas de reports que pide el listado público (Explorar, mapa, matching).
// Sin imports a propósito: lo usan store.js (navegador), /api/health
// (servidor) y el test que verifica que cada una tenga su "grant select" en
// supabase/ (reportGrants.test.js).
//
// Todas las columnas MENOS contacto_whatsapp/contacto_email — el listado
// general no necesita esos datos. Esto ya no es solo una convención del
// cliente: reports tiene el SELECT revocado para anon/authenticated y
// habilitado POR COLUMNA (ver schema.sql), así que ni pidiéndolas acá ni con
// un SELECT directo a la API se puede traer el contacto en bloque — el único
// camino es fetchReportContact, que pasa por una función rate-limitada.
//
// Consecuencia importante: una columna nueva que se agregue acá SIN su
// "grant select (...) on reports to anon, authenticated" en una migración
// hace que Supabase rechace la consulta entera (42501) y el sitio muestre 0
// mascotas (pasó el 2026-10-20 con "inactivo"). reportGrants.test.js lo
// frena en el CI antes de mergear.
export const REPORT_LIST_BASE_FIELDS = [
  "id", "tipo", "especie", "nombre", "color", "color_otro", "tamano", "sexo", "edad", "peso",
  "zona", "lat_aprox", "lng_aprox", "fecha", "descripcion", "foto_url", "hist", "embedding", "foto_urls",
  "hists", "embeddings", "nickname", "resuelto", "resuelto_por", "resuelto_por_user_id",
  "resuelto_en", "creado_en", "user_id",
];

// Columnas agregadas en migraciones posteriores a la primera versión de
// schema.sql que todavía pueden no existir (o no tener permiso) en un
// despliegue que no corrió la última migración: fetchReports reintenta sin
// ellas en vez de dejar la app sin poder cargar reportes.
// "inactivo" llega con la migración de alertas (20261020_01 y _03).
export const REPORT_LIST_OPTIONAL_COLUMNS = ["raza", "detalles", "oculto", "ciudad", "provincia", "inactivo"];

export const REPORT_LIST_ALL_COLUMNS = [...REPORT_LIST_BASE_FIELDS, ...REPORT_LIST_OPTIONAL_COLUMNS];

// Carga en dos pasos (2026-10-28): estas columnas (histograma y embedding de
// cada foto) son el ~85 % del peso del listado (~1 MB de 1,2 MB) y solo las
// usa el matching. El listado se pide primero sin ellas (Explorar y el mapa
// aparecen enseguida) y después, en segundo plano, solo id + vectores (ver
// fetchReports({ light }) y fetchReportVectors en store.js).
export const REPORT_VECTOR_FIELDS = ["hist", "embedding", "hists", "embeddings"];

// Coordenadas (2026-10-29): el listado público pide lat_aprox/lng_aprox
// (calculadas por la base sobre una grilla de ~450 m, migración
// 20261029_01) y NO lat/lng exactos, que dejan de ser legibles con la clave
// pública: el punto que marca quien publica puede ser su casa, y el
// corrimiento que se hacía solo en pantalla (approxLocation.js) se podía
// deshacer porque el código es público.
// Mientras la migración no se haya corrido, lat_aprox no existe: el
// listado reintenta con las exactas, igual que antes (ver
// missingCoordAprox y fetchReports en store.js, y /api/health).
export const REPORT_COORD_APROX = ["lat_aprox", "lng_aprox"];
export const REPORT_COORD_LEGACY = ["lat", "lng"];

export function missingCoordAprox(error) {
  if (!error) return false;
  const text = `${error.message || ""} ${error.code || ""} ${error.details || ""} ${error.hint || ""}`;
  return /\b(lat|lng)_aprox\b/i.test(text) && (text.includes("42703") || /does not exist/i.test(text));
}

// Mismas columnas con lat/lng exactos en lugar de los aproximados.
export function withLegacyCoords(columns) {
  return columns.map((c) => (c === "lat_aprox" ? "lat" : c === "lng_aprox" ? "lng" : c));
}
