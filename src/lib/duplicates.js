// Posibles reportes duplicados (2026-10-27). Antes de publicar, el
// formulario compara lo que se está cargando contra los reportes activos
// del MISMO tipo con el mismo motor de coincidencias (scoreMatch en
// matching.js: foto, ubicación, fecha, rasgos y contradicciones). Perdida
// contra encontrada no es un duplicado: eso es una coincidencia, y se
// muestra después de publicar como siempre.
//
// Es solo un aviso: nunca bloquea, fusiona ni borra nada. Quien publica
// puede ver el reporte existente, aportar datos o publicar igual.
import { scoreMatch, cosineSimilarity } from "./matching";

// Bastante más alto que SCORE_MINIMO (0.15): un aviso de "ya está
// publicado" que se equivoca molesta más que uno que no aparece.
export const DUPLICADO_SCORE_MIN = 0.6;
// Misma foto (o casi): coseno crudo entre embeddings DINOv2. imgSim de
// scoreMatch no sirve para esto: está escalado y llega a 1 con dos fotos
// distintas de la misma mascota.
export const IDENTICO_COS_MIN = 0.95;

function mismaFoto(a, b) {
  const fotos = (r) => (r.fotos?.length ? r.fotos : [{ embedding: r.embedding }]).filter((f) => !f.dudosa);
  for (const fa of fotos(a)) {
    for (const fb of fotos(b)) {
      const sim = cosineSimilarity(fa.embedding, fb.embedding); // (cos + 1) / 2
      if (sim != null && sim * 2 - 1 >= IDENTICO_COS_MIN) return true;
    }
  }
  return false;
}

const normNick = (s) => (s || "").trim().toLowerCase();

// Dueño del reporte: la cuenta, o (sin sesión) el mismo apodo.
function esPropio(report, { userId, nickname }) {
  if (userId && report.userId) return report.userId === userId;
  return !userId && !report.userId && !!normNick(nickname) && normNick(report.nickname) === normNick(nickname);
}

// kind:
//  - "identico": la misma persona ya publicó esto (misma foto o casi).
//  - "propio": la misma persona tiene un reporte muy parecido.
//  - "duplicado": otra persona ya publicó esta mascota como perdida.
//  - "avistamiento": otra persona ya la reportó como encontrada/vista; un
//    reporte nuevo suma (otro lugar, otro día), no sobra.
export function findDuplicates(draft, reports, { userId = null, nickname = "", limit = 1, minScore = DUPLICADO_SCORE_MIN } = {}) {
  if (!draft?.tipo || !draft?.especie || !Array.isArray(reports)) return [];
  const out = [];
  for (const r of reports) {
    if (!r || r.tipo !== draft.tipo || r.resuelto || r.id === draft.id) continue;
    const m = scoreMatch(draft, r);
    if (m.descartado || m.score < minScore) continue;
    const propio = esPropio(r, { userId, nickname });
    const kind = propio
      ? mismaFoto(draft, r)
        ? "identico"
        : "propio"
      : draft.tipo === "encontrada"
        ? "avistamiento"
        : "duplicado";
    out.push({ report: r, kind, score: m.score, propio });
  }
  // Primero los propios (lo más probable es un doble envío), después por score.
  out.sort((a, b) => Number(b.propio) - Number(a.propio) || b.score - a.score);
  return out.slice(0, limit);
}

export function duplicateMessage(kind) {
  switch (kind) {
    case "identico":
      return { title: "Ya publicaste este reporte", body: "Parece el mismo. Si es otra mascota, podés publicar igual." };
    case "propio":
      return { title: "Tenés un reporte muy parecido", body: "Si es la misma mascota, podés revisar el que ya publicaste." };
    case "avistamiento":
      return {
        title: "Alguien ya reportó una mascota parecida",
        body: "Si es la misma, tu reporte suma como un nuevo avistamiento: publicalo igual.",
      };
    default:
      return {
        title: "Puede que ya esté publicada",
        body: "Mirá si es la misma mascota: podés avisarle a quien la publicó o publicar igual.",
      };
  }
}
