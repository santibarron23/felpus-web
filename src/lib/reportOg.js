// Lectura pública de un reporte para las meta etiquetas y las imágenes al
// compartir (/r/<id>, su opengraph-image y /r/<id>/historia). Fetch directo
// contra la REST API de Supabase con la clave pública: el cliente de
// supabaseClient.js está armado para el navegador.
//
// Columnas explícitas, NO "select=*": la clave pública solo puede leer
// algunas columnas de "reports" (ver schema.sql) y con "*" Postgres rechaza
// el SELECT entero — eso rompió las vistas previas el 2026-08-10.
const REPORT_OG_COLUMNS =
  "id,tipo,especie,nombre,color,color_otro,tamano,sexo,raza,zona,ciudad,fecha,descripcion,foto_url,resuelto,oculto,creado_en";

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

export async function fetchReportForShare(id) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !ID_RE.test(String(id || ""))) return null;
  try {
    const res = await fetch(`${url}/rest/v1/reports?id=eq.${encodeURIComponent(id)}&select=${REPORT_OG_COLUMNS}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    const report = rows?.[0] || null;
    // Un reporte oculto por denuncias o por el admin no se muestra al
    // compartir (ni foto ni texto): queda como si no existiera.
    return report && !report.oculto ? report : null;
  } catch {
    return null;
  }
}
