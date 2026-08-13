import RedirectClient from "./RedirectClient";
import { safeJsonLdString } from "../../../lib/jsonLd";
import { SITE_URL } from "../../../lib/site";

// Fetch server-side directo contra la REST API de Supabase (no el cliente
// de src/lib/supabaseClient.js — ese está armado para persistir sesión en
// el navegador, algo que no aplica ni hace falta acá). Es una sola lectura
// pública, ya permitida por la policy "reports_select_all".
// Columnas explícitas, NO "select=*": desde que se endureció el acceso de
// la anon key a "reports" (revoke select on reports from anon,
// authenticated; grant select (columna, columna, ...) — ver schema.sql),
// pedir "*" incluye columnas que esa key ya no tiene permiso de leer
// (contacto_whatsapp/contacto_email, nunca estuvieron en la lista) y
// Postgres rechaza el SELECT completo con un 401, no solo esas columnas.
// Bug real encontrado en vivo (2026-08-10): esto rompía la meta etiqueta
// Open Graph de CADA reporte compartido — al fallar el fetch, la página
// caía al fallback genérico y Facebook/WhatsApp mostraban el banner de la
// marca en vez de la foto real de la mascota. Esta lista trae solo lo que
// generateMetadata()/el JSON-LD de abajo realmente usan.
const REPORT_OG_COLUMNS = "id,tipo,especie,nombre,zona,descripcion,foto_url,resuelto,creado_en";

async function fetchReport(id) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/reports?id=eq.${encodeURIComponent(id)}&select=${REPORT_OG_COLUMNS}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.[0] || null;
  } catch (e) {
    return null;
  }
}

// Cada mascota compartida tiene que mostrar SU foto real al pegar el link
// en WhatsApp/Facebook/X, no el banner genérico de la marca — esos
// servicios arman la vista previa leyendo estas meta etiquetas del lado
// del servidor, sin ejecutar el JS de la SPA, así que la única forma de
// lograrlo es con una ruta propia por reporte.
export async function generateMetadata({ params }) {
  // Desde Next 15, `params` es una Promise (antes era un objeto plano).
  const { id } = await params;
  const report = await fetchReport(id);
  if (!report) {
    // El reporte no existe (borrado, id inválido): la página igual responde
    // 200 (RedirectClient decide el destino en el cliente), así que sin
    // noindex explícito Google terminaba indexando contenido genérico
    // repetido para cada id inválido.
    return {
      title: "Felpus - Buscador inteligente de mascotas perdidas y encontradas",
      description: "Reportá una mascota perdida o encontrada con foto y descripción.",
      robots: { index: false, follow: false },
    };
  }
  const tipoTxt = report.tipo === "perdida" ? "Perdida" : "Encontrada";
  const nombre =
    report.nombre || (report.especie === "gato" ? "un gato" : report.especie === "perro" ? "un perro" : "una mascota");
  const title = `${tipoTxt}: ${nombre} en ${report.zona} — Felpus`;
  const description = report.descripcion
    ? report.descripcion.slice(0, 200)
    : "Ayudanos a reencontrar esta mascota con su familia.";
  const image = report.foto_url;
  const canonical = `${SITE_URL}/r/${id}`;

  return {
    title,
    description,
    // La página redirige del lado del cliente a /?r=<id> (RedirectClient),
    // así que sin canonical explícito un crawler que ejecuta JS podía
    // terminar indexando esa URL en vez de esta, que es la que se comparte.
    alternates: { canonical },
    robots: report.resuelto ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "Felpus",
      locale: "es_AR",
      type: "website",
      images: image ? [{ url: image, width: 800, height: 800, alt: title }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ReportPage({ params }) {
  // Desde Next 15, `params` es una Promise (antes era un objeto plano).
  const { id } = await params;
  const report = await fetchReport(id);
  const jsonLd = report
    ? {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: `${report.tipo === "perdida" ? "Perdida" : "Encontrada"}: ${report.nombre || report.especie} en ${report.zona}`,
        description: report.descripcion || undefined,
        url: `${SITE_URL}/r/${id}`,
        image: report.foto_url || undefined,
        datePublished: report.creado_en || undefined,
      }
    : null;

  return (
    <>
      {jsonLd && (
        // safeJsonLdString, no JSON.stringify directo: name/description acá
        // vienen de texto libre del reporte (nombre/zona/descripción), y
        // esto es SSR público — ver el comentario de safeJsonLdString en
        // lib/jsonLd.js para el porqué (hallazgo real de auditoría: era
        // explotable con solo abrir el link /r/<id> que se comparte).
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLdString(jsonLd) }} />
      )}
      <RedirectClient id={id} />
    </>
  );
}
