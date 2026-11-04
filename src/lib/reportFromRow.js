// Fila de la tabla reports -> objeto de reporte que usa toda la app
// (Explorar, mapa, fichas y coincidencias). Puro y sin Supabase: lo usan el
// navegador (store.js) y el servidor (/api/coincidencias), así los dos
// arman los reportes exactamente igual.
import { marcarDudosas } from "./matching";

export function rowToReport(row) {
  const fotosBase =
    Array.isArray(row.foto_urls) && row.foto_urls.length
      ? row.foto_urls.map((url, i) => ({ url, hist: row.hists?.[i] ?? null, embedding: row.embeddings?.[i] ?? null }))
      : [{ url: row.foto_url, hist: row.hist, embedding: row.embedding || null }];
  const fotos = marcarDudosas(fotosBase, row.detalles);
  return {
    id: row.id,
    tipo: row.tipo,
    especie: row.especie,
    raza: row.raza || "",
    // "Detalles para reconocerlo" (accesorio/reacción con desconocidos/marca
    // distintiva) — ver buildDetallesEstructurados en matching.js. Objeto
    // vacío por defecto para reportes viejos que no lo tienen.
    detalles: row.detalles || {},
    nombre: row.nombre || "",
    color: row.color,
    colorOtro: row.color_otro || "",
    tamano: row.tamano,
    sexo: row.sexo || "",
    edad: row.edad || "",
    peso: row.peso || "",
    zona: row.zona,
    // Estructuradas a partir de Google Places (ver ZonaAutocomplete.jsx) —
    // vacías para reportes viejos o publicados con zona tipeada a mano.
    ciudad: row.ciudad || "",
    provincia: row.provincia || "",
    // El listado público trae lat_aprox/lng_aprox (ver reportColumns.js);
    // el panel de admin y los reportes viejos sin migración, lat/lng.
    lat: row.lat_aprox ?? row.lat,
    lng: row.lng_aprox ?? row.lng,
    coordAprox: row.lat_aprox != null,
    fecha: row.fecha,
    descripcion: row.descripcion,
    contactoWhatsapp: row.contacto_whatsapp || "",
    contactoEmail: row.contacto_email || "",
    foto: fotos[0].url,
    fotos,
    hist: fotos[0].hist,
    embedding: fotos[0].embedding,
    nickname: row.nickname,
    userId: row.user_id || null,
    resuelto: row.resuelto,
    inactivo: row.inactivo === true,
    resueltoPor: row.resuelto_por,
    resueltoPorUserId: row.resuelto_por_user_id || null,
    resueltoEn: row.resuelto_en ? new Date(row.resuelto_en).getTime() : null,
    creadoEn: new Date(row.creado_en).getTime(),
  };
}
