// Búsqueda del Asistente Felpus (SOLO SERVIDOR, 2026-11-04): corre el
// puntaje de coincidencias (matchingScore.js) y los filtros de búsqueda
// sobre los reportes. Separado de chatbot.js porque chatbot.js también lo
// usa el navegador (borrador del formulario) y el puntaje no tiene que
// llegar al JS público.
import { findMatches, matchBreakdown, colorSimilarity } from "./matchingScore";
import { normalizeText } from "./matching";
import {
  MAX_RESULTS_SHOWN,
  colorLabel,
  detectRegion,
  draftToMatchable,
  inRegion,
  normalizeSearchInput,
  probabilidad,
  reportCard,
  rowToMatchable,
} from "./chatbot";

// Corre el matching real (findMatches/matchBreakdown, el mismo motor de la
// app) y arma lo que ve Claude (compacto, sin texto libre de terceros) y lo
// que dibuja la UI (tarjetas).
export function runMatching(draft, rows) {
  const probe = draftToMatchable(draft);
  // Con coordenadas no hace falta: scoreMatch ya descarta lo que está lejos.
  const region = probe.lat != null ? null : detectRegion(probe.zona, probe.provincia);
  const candidates = (rows || [])
    .filter((r) => r && r.id)
    .map(rowToMatchable)
    .filter((r) => inRegion(r, region));
  const found = findMatches(probe, candidates, { limit: MAX_RESULTS_SHOWN });
  return {
    cards: found.map((m) => ({ ...reportCard(m.report), probabilidad: probabilidad(m.score) })),
    forModel: {
      reportes_revisados: candidates.length,
      coincidencias: found.map((m) => {
        const items = matchBreakdown(probe, m.report).filter((it) => it.key !== "imagen");
        return {
          nombre: m.report.nombre || null,
          color: colorLabel(m.report),
          zona: m.report.zona || null,
          fecha: m.report.fecha || null,
          probabilidad: probabilidad(m.score),
          coincide_en: items.filter((it) => it.coincide).map((it) => it.label),
          difiere_en: items.filter((it) => !it.coincide).map((it) => it.label),
        };
      }),
    },
  };
}

const ZONA_STOPWORDS = new Set(["por", "en", "de", "del", "la", "el", "los", "las", "barrio", "zona", "b", "bo", "salta", "capital"]);
function zonaTokens(s) {
  return normalizeText(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !ZONA_STOPWORDS.has(w));
}

// Filtros de la búsqueda conversacional sobre reportes reales. Color con la
// misma compatibilidad del matching ("Marrón" encuentra "Dorado / beige"),
// zona por palabras ("por San Lorenzo" encuentra "Villa San Lorenzo, Salta").
export function filterReports(rows, filters, now = Date.now()) {
  const f = normalizeSearchInput(filters);
  const zt = zonaTokens(f.zona);
  const region = detectRegion(f.zona);
  const raza = normalizeText(f.raza).trim();
  const desde = f.dias > 0 ? now - f.dias * 86400000 : null;
  const out = [];
  for (const row of rows || []) {
    if (!row || !row.id) continue;
    const r = rowToMatchable(row);
    if (r.resuelto) continue;
    if (f.tipo !== "todos" && r.tipo !== f.tipo) continue;
    if (f.especie && r.especie !== f.especie) continue;
    if (f.tamano && r.tamano && r.tamano !== f.tamano) continue;
    if (f.sexo && r.sexo && r.sexo !== "No sé" && r.sexo !== f.sexo) continue;
    if (f.color) {
      const sim = colorSimilarity({ color: f.color, colorOtro: "" }, r);
      if (sim != null && sim < 0.5) continue;
    }
    if (raza) {
      const rr = normalizeText(r.raza);
      const enDesc = normalizeText(r.descripcion).includes(raza);
      if (!(rr && (rr.includes(raza) || raza.includes(rr))) && !enDesc) continue;
    }
    if (!inRegion(r, region)) continue;
    if (zt.length) {
      const lugar = new Set(zonaTokens(`${r.zona} ${r.ciudad} ${r.provincia}`));
      if (!zt.every((t) => lugar.has(t))) continue;
    }
    if (desde != null) {
      const ref = r.fecha ? new Date(r.fecha).getTime() : r.creadoEn;
      if (!(ref >= desde)) continue;
    }
    out.push(r);
  }
  out.sort((a, b) => b.creadoEn - a.creadoEn);
  return {
    total: out.length,
    cards: out.slice(0, MAX_RESULTS_SHOWN).map(reportCard),
    forModel: {
      total: out.length,
      mostrados: Math.min(out.length, MAX_RESULTS_SHOWN),
      resultados: out.slice(0, MAX_RESULTS_SHOWN).map((r) => ({
        tipo: r.tipo,
        especie: r.especie,
        nombre: r.nombre || null,
        color: colorLabel(r),
        raza: r.raza || null,
        tamano: r.tamano || null,
        zona: r.zona || null,
        fecha: r.fecha || null,
      })),
    },
  };
}

