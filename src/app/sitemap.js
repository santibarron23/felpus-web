import { SITE_URL } from "../lib/site";

// Cada reporte activo tiene su propia URL indexable (/r/[id]) — sin esto el
// sitemap solo listaba el home y buscadores no podían descubrir las
// publicaciones individuales de mascotas.
async function fetchActiveReportIds() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const params = new URLSearchParams({
      resuelto: "eq.false",
      select: "id,creado_en",
      order: "creado_en.desc",
      limit: "5000",
    });
    const res = await fetch(`${url}/rest/v1/reports?${params.toString()}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch (e) {
    return [];
  }
}

export default async function sitemap() {
  const reports = await fetchActiveReportIds();
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/privacidad`,
      lastModified: new Date("2026-08-06"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terminos`,
      lastModified: new Date("2026-08-06"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    ...reports.map((r) => ({
      url: `${SITE_URL}/r/${r.id}`,
      lastModified: r.creado_en ? new Date(r.creado_en) : new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    })),
  ];
}
