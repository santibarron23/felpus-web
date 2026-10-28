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
  "zona", "lat", "lng", "fecha", "descripcion", "foto_url", "hist", "embedding", "foto_urls",
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
