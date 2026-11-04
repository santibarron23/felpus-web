// Métricas de impacto del panel de admin, calculadas en el servidor
// (2026-11-04): usan el puntaje de coincidencias (matchingScore.js), que ya
// no viaja al navegador. Mismos reportes que veía el panel
// (adminListAllReports: todos, ocultos incluidos, con coordenadas
// aproximadas), leídos con la service key.
import { REPORT_LIST_ALL_COLUMNS, REPORT_LIST_BASE_FIELDS } from "./reportColumns";
import { rowToReport } from "./reportFromRow";
import { computeImpactMetrics } from "./impactMetrics";
import { findMatches } from "./matchingScore";

export async function leerTodosLosReportes({ supabaseUrl, serviceKey, fetchImpl = (...a) => fetch(...a) }) {
  const pedir = (columnas) =>
    fetchImpl(`${supabaseUrl}/rest/v1/reports?select=${columnas.join(",")}&order=creado_en.desc`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
  let res = await pedir(REPORT_LIST_ALL_COLUMNS);
  if (res.status === 400) res = await pedir(REPORT_LIST_BASE_FIELDS);
  if (!res.ok) throw new Error(`Supabase respondió ${res.status}`);
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).map((row) => ({ ...rowToReport(row), oculto: row.oculto === true }));
}

export function metricasDeImpacto(reports, opts = {}) {
  return computeImpactMetrics(reports, { ...opts, matcher: findMatches });
}
