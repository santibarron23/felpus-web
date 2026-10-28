// Números de Inicio (mascotas en búsqueda, últimos 7 días, reencuentros)
// calculados en el SERVIDOR (2026-10-28). Antes salían recién cuando el
// navegador bajaba el listado completo de reportes — con los embeddings de
// cada foto, ~1,2 MB y 2-3 s —, y mientras tanto se veía "0 mascotas".
// Ahora page.js los pide con una consulta liviana (3 columnas, ~19 KB),
// quedan en el HTML (ISR, revalidate 60 s) y FelpusMatcher los muestra
// hasta que llega el listado.
//
// Mismas definiciones que FelpusMatcher (activeReports, last7dCount,
// resueltas) y que fetchReports (sin los ocultos), para que el número no
// salte cuando llega el listado.
const DIA_MS = 24 * 3600 * 1000;

export function computeHomeStats(rows, now = Date.now()) {
  const visibles = (rows || []).filter((r) => r && r.oculto !== true);
  const desde = now - 7 * DIA_MS;
  return {
    activas: visibles.filter((r) => !r.resuelto).length,
    ultimos7: visibles.filter((r) => new Date(r.creado_en).getTime() >= desde).length,
    reencuentros: visibles.filter((r) => r.resuelto).length,
  };
}

// Con la anon key (lo mismo que ya lee cualquier navegador). Si "oculto"
// todavía no existe o no tiene permiso, se reintenta sin esa columna, igual
// que fetchReports. Cualquier falla → null: la página igual carga y los
// números llegan con el listado, como antes.
export async function fetchHomeStats({ timeoutMs = 2500, fetchImpl = fetch } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  for (const cols of ["resuelto,creado_en,oculto", "resuelto,creado_en"]) {
    try {
      const res = await fetchImpl(`${url}/rest/v1/reports?select=${cols}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(timeoutMs),
        next: { revalidate: 60 },
      });
      if (res.ok) return computeHomeStats(await res.json());
      if (res.status !== 400 && res.status !== 401 && res.status !== 403) return null;
    } catch {
      return null;
    }
  }
  return null;
}
