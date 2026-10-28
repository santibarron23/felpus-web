import RedirectClient from "./RedirectClient";
import { safeJsonLdString } from "../../../lib/jsonLd";
import { SITE_URL } from "../../../lib/site";
import { petTitle } from "../../../lib/petTitle";
import { fetchReportForShare as fetchReport } from "../../../lib/reportOg";
import { shareCardData } from "../../../lib/shareCard";

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
  const card = shareCardData(report);
  // "Se busca: Toby en Centro", "Encontrada: Gata blanca en…", "¡Volvió a
  // casa!: Luna en…" (concuerda con el sexo, ver shareCard.js).
  const tipoTxt =
    card.estado === "reencontrada" ? "¡Volvió a casa!" : card.badge.charAt(0) + card.badge.slice(1).toLowerCase();
  const nombre = petTitle(report);
  const title = `${tipoTxt}: ${nombre} en ${report.zona} — Felpus`;
  // Descripción de la vista previa: cuándo + la descripción del reporte,
  // así se entiende de un vistazo sin abrir el link.
  const description =
    [card.cuando, report.descripcion ? report.descripcion.replace(/\s+/g, " ").trim() : "Ayudanos a reencontrar esta mascota con su familia."]
      .filter(Boolean)
      .join(". ")
      .slice(0, 200);
  const canonical = `${SITE_URL}/r/${id}`;

  return {
    // absolute: el título ya termina en "— Felpus"; sin esto el template del
    // layout ("%s — Felpus") lo duplicaba en la pestaña ("— Felpus — Felpus").
    title: { absolute: title },
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
      // La imagen la pone opengraph-image.js (cartel con foto + resumen,
      // 1200x630); X la toma de og:image.
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
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
        name: `${report.tipo === "perdida" ? "Perdida" : report.detalles?.avistamiento === true ? "Vista suelta" : "Encontrada"}: ${petTitle(report)} en ${report.zona}`,
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
