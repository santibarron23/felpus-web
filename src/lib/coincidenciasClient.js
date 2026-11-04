// Lado del navegador de /api/coincidencias (ver serverCoincidencias.js): el
// puntaje se calcula en el servidor y acá solo llegan los resultados.
//
// Cada coincidencia trae { id, score, distanceLabel, breakdown, report, ... }.
// Si el navegador ya tiene ese aviso cargado, se usa el suyo (misma
// referencia que Explorar, con sus cambios locales); si no, el que mandó el
// servidor.
export async function pedirCoincidencias(reportIds, { limit = 6, reports = [], fetchImpl = (...a) => fetch(...a) } = {}) {
  const ids = [...new Set((reportIds || []).filter(Boolean))].slice(0, 10);
  if (!ids.length) return {};
  const res = await fetchImpl("/api/coincidencias", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportIds: ids, limit }),
  });
  if (!res.ok) throw new Error(`coincidencias ${res.status}`);
  const data = await res.json();
  const locales = new Map((reports || []).map((r) => [r.id, r]));
  const out = {};
  for (const [id, r] of Object.entries(data?.resultados || {})) {
    out[id] = {
      hayCandidatos: !!r.hayCandidatos,
      coincidencias: (r.coincidencias || []).map((m) => ({ ...m, report: locales.get(m.id) || m.report })),
    };
  }
  return out;
}
