import RedirectClient from "./RedirectClient";

const SITE_URL = "https://felpus-web.vercel.app";

// Fetch server-side directo contra la REST API de Supabase (no el cliente
// de src/lib/supabaseClient.js — ese está armado para persistir sesión en
// el navegador, algo que no aplica ni hace falta acá). Es una sola lectura
// pública, ya permitida por la policy "reports_select_all".
async function fetchReport(id) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/reports?id=eq.${encodeURIComponent(id)}&select=*`, {
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
  const report = await fetchReport(params.id);
  if (!report) {
    return {
      title: "Felpus - Buscador inteligente de mascotas perdidas y encontradas",
      description: "Reportá una mascota perdida o encontrada con foto y descripción.",
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

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/r/${params.id}`,
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
  return <RedirectClient id={params.id} />;
}
