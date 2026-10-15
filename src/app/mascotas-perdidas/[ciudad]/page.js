import { notFound } from "next/navigation";
import CityLanding from "../../../components/felpus/CityLanding";
import { CITIES, getCity, cityOrFilter, cityFaqs } from "../../../lib/cities";
import { safeJsonLdString } from "../../../lib/jsonLd";
import { SITE_URL } from "../../../lib/site";

// Solo las ciudades de lib/cities.js — cualquier otro slug es 404 en vez de
// generar páginas casi vacías e indexables para cualquier texto en la URL.
export const dynamicParams = false;
// La lista de reportes se regenera cada 10 minutos (ISR).
export const revalidate = 600;
export function generateStaticParams() {
  return Object.keys(CITIES).map((ciudad) => ({ ciudad }));
}

// Mismas columnas públicas que r/[id]/page.js (nunca "*": ver el comentario
// de REPORT_OG_COLUMNS ahí — pedir columnas sin grant tira 401 entero).
const COLUMNS = "id,tipo,especie,nombre,zona,descripcion,foto_url,resuelto,creado_en";

async function fetchCityReports(city) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const params = new URLSearchParams({
      select: COLUMNS,
      or: cityOrFilter(city),
      oculto: "not.is.true",
      // Los reportes de ejemplo (seed-*) no tienen contacto: en una página
      // pensada para tráfico nuevo desde Google serían un callejón sin salida.
      id: "not.like.seed-*",
      order: "creado_en.desc",
      limit: "300",
    });
    const res = await fetch(`${url}/rest/v1/reports?${params.toString()}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch (e) {
    return [];
  }
}

function pageUrl(city) {
  return `${SITE_URL}/mascotas-perdidas/${city.slug}`;
}

export async function generateMetadata({ params }) {
  const { ciudad } = await params;
  const city = getCity(ciudad);
  if (!city) return {};
  const title = `Mascotas perdidas y encontradas en ${city.name} — perros y gatos`;
  const description = `¿Perdiste o encontraste un perro o gato en ${city.name}? Publicalo gratis en Felpus y encontrá coincidencias automáticas por foto y zona en todos los barrios de ${city.name}.`;
  return {
    title,
    description,
    alternates: { canonical: pageUrl(city) },
    robots: { index: true, follow: true },
    openGraph: {
      title: `${title} — Felpus`,
      description,
      url: pageUrl(city),
      siteName: "Felpus",
      locale: "es_AR",
      type: "website",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title: `${title} — Felpus`, description, images: ["/og-image.png"] },
  };
}

export default async function CityPage({ params }) {
  const { ciudad } = await params;
  const city = getCity(ciudad);
  if (!city) notFound();

  const rows = await fetchCityReports(city);
  const activos = rows.filter((r) => !r.resuelto);
  const perdidas = activos.filter((r) => r.tipo === "perdida");
  const encontradas = activos.filter((r) => r.tipo === "encontrada");
  const reencuentros = rows.length - activos.length;
  const faqs = cityFaqs(city);
  const url = pageUrl(city);

  // safeJsonLdString: el ItemList lleva nombre/zona de reportes (texto libre
  // de usuarios) — ver lib/jsonLd.js.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": url,
        url,
        name: `Mascotas perdidas y encontradas en ${city.name}`,
        inLanguage: "es-AR",
        isPartOf: { "@type": "WebSite", name: "Felpus", url: SITE_URL },
        about: {
          "@type": "Place",
          name: `${city.name}, Argentina`,
          geo: { "@type": "GeoCoordinates", latitude: city.geo.lat, longitude: city.geo.lng },
        },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: activos.length,
          itemListElement: activos.slice(0, 50).map((r, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${SITE_URL}/r/${r.id}`,
            name: `${r.tipo === "perdida" ? "Perdida" : "Encontrada"}: ${r.nombre || r.especie} en ${r.zona}`,
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Felpus", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: `Mascotas perdidas en ${city.name}`, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLdString(jsonLd) }} />
      <CityLanding city={city} perdidas={perdidas} encontradas={encontradas} reencuentros={reencuentros} faqs={faqs} />
    </>
  );
}
