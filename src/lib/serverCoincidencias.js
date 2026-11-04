// Coincidencias calculadas en el servidor (2026-11-04). Antes el navegador
// bajaba los vectores de todas las fotos y corría el puntaje
// (matchingScore.js) en el teléfono: el algoritmo quedaba a la vista en el
// JS público y cada visita bajaba ~0,5 MB de vectores de Supabase.
//
// Ahora /api/coincidencias recibe el id de un aviso y devuelve sus
// coincidencias ya puntuadas, con el desglose de qué coincide y qué no.
//
// Mismos datos que veía el navegador: los avisos públicos (clave anon, sin
// ocultos) con las coordenadas APROXIMADAS (lat_aprox). Nunca las exactas:
// la distancia que se muestra ("a 1,2 km") permitiría triangular la casa de
// alguien publicando avisos falsos en puntos conocidos.
import { REPORT_LIST_ALL_COLUMNS, REPORT_LIST_BASE_FIELDS } from "./reportColumns";
import { rowToReport } from "./reportFromRow";
import { candidatosParaComparar } from "./matching";
import { findMatches, matchBreakdown } from "./matchingScore";

// Los avisos cambian poco: con 3 minutos de caché por instancia, una ráfaga
// de pedidos no vuelve a bajar todo el listado de Supabase cada vez.
export const CACHE_MS = 3 * 60_000;
export const LIMITE_MAX = 50;

async function pedirFilas({ supabaseUrl, anonKey, fetchImpl }, query) {
  const res = await fetchImpl(`${supabaseUrl}/rest/v1/reports?${query}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  return res;
}

function consulta(columnas, filtro = "") {
  return `select=${columnas.join(",")}${filtro}&order=creado_en.desc`;
}

// Filas -> reportes, sin los ocultos (igual que fetchReports en store.js).
async function leerReportes(env, filtro = "") {
  let res = await pedirFilas(env, consulta(REPORT_LIST_ALL_COLUMNS, filtro));
  // Columnas opcionales sin migrar o sin permiso: con las básicas.
  if (res.status === 400 || res.status === 401) res = await pedirFilas(env, consulta(REPORT_LIST_BASE_FIELDS, filtro));
  if (!res.ok) throw new Error(`Supabase respondió ${res.status}`);
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).filter((r) => r.oculto !== true).map((r) => ({ ...rowToReport(r), oculto: false }));
}

export function makeReportesFuente({ supabaseUrl, anonKey, fetchImpl = (...a) => fetch(...a), now = () => Date.now() }) {
  const env = { supabaseUrl, anonKey, fetchImpl };
  let cache = null; // { at, promise }
  async function todos() {
    if (cache && now() - cache.at < CACHE_MS) return cache.promise;
    const promise = leerReportes(env);
    cache = { at: now(), promise };
    promise.catch(() => {
      if (cache?.promise === promise) cache = null;
    });
    return promise;
  }
  // Un aviso recién publicado puede no estar todavía en la caché.
  async function uno(id) {
    const lista = await todos();
    const enCache = lista.find((r) => r.id === id);
    if (enCache) return { reporte: enCache, lista };
    const [fresco] = await leerReportes(env, `&id=eq.${encodeURIComponent(id)}&limit=1`);
    return { reporte: fresco || null, lista };
  }
  return { todos, uno };
}

// Lo que necesita la pantalla de cada coincidencia: sin los vectores de las
// fotos (no se mandan al navegador).
export function reporteLiviano(r) {
  const fotos = (r.fotos || []).map((f) => ({ url: f.url, hist: null, embedding: null, ...(f.dudosa ? { dudosa: true } : {}) }));
  return { ...r, fotos, hist: null, embedding: null };
}

export function coincidenciasDe(reporte, lista, { limit = 6 } = {}) {
  const candidatos = candidatosParaComparar(reporte, lista);
  const encontrados = findMatches(reporte, candidatos, { limit });
  return {
    hayCandidatos: candidatos.length > 0,
    coincidencias: encontrados.map((m) => ({
      id: m.report.id,
      score: m.score,
      imgSim: m.imgSim,
      textSim: m.textSim,
      locScore: m.locScore,
      fechaSim: m.fechaSim,
      distanceLabel: m.distanceLabel,
      breakdown: matchBreakdown(reporte, m.report),
      report: reporteLiviano(m.report),
    })),
  };
}
