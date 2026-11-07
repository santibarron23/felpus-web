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
export const NO_EXISTE_MS = 60_000;

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
  // Ids que se buscaron y no existen (o están ocultos), por un minuto.
  // Revisión 2026-11-07: un pedido con 10 ids inventados hacía 10 consultas
  // a Supabase (con el cupo de 40 pedidos por minuto, 400 consultas por
  // minuto desde una sola IP). Los ids de avisos nuevos son aleatorios, así
  // que nadie pregunta antes por uno que se va a publicar: guardar el "no
  // existe" un rato no esconde un aviso real.
  const noExisten = new Map();
  function noExisteVigente(id) {
    const at = noExisten.get(id);
    if (at == null) return false;
    if (now() - at < NO_EXISTE_MS) return true;
    noExisten.delete(id);
    return false;
  }
  // Un aviso recién publicado puede no estar todavía en la caché: los que
  // faltan se piden aparte, todos juntos en UNA consulta.
  // ids: ya validados por la ruta (solo letras, números y guiones).
  async function varios(ids) {
    const lista = await todos();
    const porId = new Map(lista.map((r) => [r.id, r]));
    const faltan = [...new Set(ids)].filter((id) => !porId.has(id) && !noExisteVigente(id));
    if (faltan.length) {
      const frescos = await leerReportes(env, `&id=in.(${faltan.map(encodeURIComponent).join(",")})&limit=${faltan.length}`);
      for (const r of frescos) porId.set(r.id, r);
      if (noExisten.size > 5000) noExisten.clear();
      for (const id of faltan) if (!porId.has(id)) noExisten.set(id, now());
    }
    return { reportes: ids.map((id) => porId.get(id) || null), lista };
  }
  async function uno(id) {
    const { reportes, lista } = await varios([id]);
    return { reporte: reportes[0], lista };
  }
  return { todos, uno, varios };
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
