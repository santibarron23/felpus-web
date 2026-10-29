// Métricas de impacto del panel de admin (2026-10-29): ¿Felpus ayuda a que
// las mascotas vuelvan a casa? No visitas, sino reencuentros, cuánto tardan,
// cuántos avisos tienen alguna coincidencia y cuántos quedan sin novedades.
//
// Se calcula en el navegador sobre adminListAllReports (todos los reportes,
// con fechas y vectores de las fotos): no hace falta ninguna función nueva
// en la base. Lo que la base no registra no se inventa: los contactos se
// miden con el evento "contacto_iniciado" de GA4, y si un reencuentro vino
// de una coincidencia de Felpus, con "reencuentro_confirmado"
// (con_coincidencia) desde el 2026-10-29.
import { findMatches } from "./matching";
import { isSighting } from "./sighting";

const DIA_MS = 86_400_000;
export const SIN_NOVEDADES_DIAS = 30;
export const COINCIDENCIA_ALTA = 0.7;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function percentil(valores, p) {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const i = (v.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return v[lo] + (v[hi] - v[lo]) * (i - lo);
}

const pct = (n, total) => (total ? Math.round((n / total) * 100) : null);

// Últimos `meses` meses calendario (el actual incluido), del más viejo al
// más nuevo: [{ clave: "2026-10", label: "oct", n }].
function porMes(fechas, now, meses) {
  const hoy = new Date(now);
  const out = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    out.push({ clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: MESES[d.getMonth()], n: 0 });
  }
  const idx = new Map(out.map((m, i) => [m.clave, i]));
  for (const t of fechas) {
    const d = new Date(t);
    const i = idx.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    if (i != null) out[i].n++;
  }
  return out;
}

export function computeImpactMetrics(reports, { now = Date.now(), meses = 6, matcher = findMatches } = {}) {
  const visibles = (reports || []).filter((r) => r && !r.oculto && Number.isFinite(r.creadoEn));
  const perdidas = visibles.filter((r) => r.tipo === "perdida");
  const avistamientos = visibles.filter((r) => isSighting(r));
  const encontradas = visibles.filter((r) => r.tipo === "encontrada" && !isSighting(r));
  const resueltos = visibles.filter((r) => r.resuelto);
  const fechasReencuentro = resueltos.map((r) => r.resueltoEn).filter(Number.isFinite);

  // Días desde que se publicó hasta que se confirmó el reencuentro.
  const dias = resueltos
    .filter((r) => Number.isFinite(r.resueltoEn) && r.resueltoEn >= r.creadoEn)
    .map((r) => (r.resueltoEn - r.creadoEn) / DIA_MS);

  // Tasa de perdidas que volvieron, solo entre las publicadas hace más de
  // SIN_NOVEDADES_DIAS (las recientes todavía no tuvieron tiempo).
  const perdidasMaduras = perdidas.filter((r) => now - r.creadoEn >= SIN_NOVEDADES_DIAS * DIA_MS);

  // Avisos activos con alguna posible coincidencia del tipo opuesto (mismo
  // criterio que la pantalla de resultado: SCORE_MINIMO de matching.js).
  const activos = visibles.filter((r) => !r.resuelto);
  let conCoincidencia = 0;
  let conAlta = 0;
  for (const r of activos) {
    const opuesto = r.tipo === "perdida" ? "encontrada" : "perdida";
    const candidatos = activos.filter((c) => c.id !== r.id && c.tipo === opuesto);
    const mejor = matcher(r, candidatos, { limit: 1 })[0];
    if (mejor) conCoincidencia++;
    if (mejor && mejor.score >= COINCIDENCIA_ALTA) conAlta++;
  }

  const sinNovedades = activos.filter((r) => now - r.creadoEn >= SIN_NOVEDADES_DIAS * DIA_MS);

  return {
    avisos: { total: visibles.length, perdidas: perdidas.length, encontradas: encontradas.length, avistamientos: avistamientos.length },
    reencuentros: {
      total: resueltos.length,
      ultimos30: fechasReencuentro.filter((t) => now - t <= 30 * DIA_MS).length,
      porMes: porMes(fechasReencuentro, now, meses),
      perdidasQueVolvieron: perdidas.filter((r) => r.resuelto).length,
      encontradasDevueltas: encontradas.filter((r) => r.resuelto).length,
    },
    tasaPerdidas: {
      base: perdidasMaduras.length,
      volvieron: perdidasMaduras.filter((r) => r.resuelto).length,
      pct: pct(perdidasMaduras.filter((r) => r.resuelto).length, perdidasMaduras.length),
    },
    diasHastaReencuentro: {
      n: dias.length,
      mediana: percentil(dias, 0.5),
      p75: percentil(dias, 0.75),
    },
    coincidencias: {
      activos: activos.length,
      conAlguna: conCoincidencia,
      pctAlguna: pct(conCoincidencia, activos.length),
      conAlta,
      pctAlta: pct(conAlta, activos.length),
    },
    sinNovedades: { n: sinNovedades.length, pct: pct(sinNovedades.length, activos.length) },
  };
}
