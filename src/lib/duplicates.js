// Posibles reportes duplicados (2026-10-27, criterio corregido 2026-10-28).
// Antes de publicar, el formulario compara lo que se está cargando contra los
// reportes activos del MISMO tipo y especie. Perdida contra encontrada no es
// un duplicado: eso es una coincidencia, y se muestra después de publicar.
//
// Es solo un aviso: nunca bloquea, fusiona ni borra nada. Quien publica
// puede ver el reporte existente, aportar datos o publicar igual.
//
// Por qué NO usa scoreMatch (2026-10-28): ese puntaje está hecho para
// perdida↔encontrada y es tolerante a propósito (hasta decenas de km, colores
// parecidos, fotos medianamente parecidas). Con los reportes reales, 131 de
// 158 daban "posible duplicado" sin tener nada que ver. Medido sobre los
// 1.446 pares reales del mismo tipo y especie: con coseno DINOv2 ≥ 0,8 solo
// quedaban duplicados de verdad (la misma foto publicada dos veces); por
// debajo de 0,75, siempre mascotas distintas. Así que el criterio es la foto
// casi igual + cerca.
import { cosineSimilarity, haversineKm, normalizeText } from "./matching";

// Foto casi igual (coseno crudo entre embeddings DINOv2).
export const DUPLICADO_COS_MIN = 0.8;
// La misma foto (o prácticamente): la vuelve a subir la misma persona.
export const IDENTICO_COS_MIN = 0.95;
// Cerca: con punto en el mapa los dos; si no, la misma zona escrita.
export const DUPLICADO_KM_MAX = 10;

function fotosValidas(r) {
  return (r.fotos?.length ? r.fotos : [{ embedding: r.embedding }]).filter(
    (f) => !f.dudosa && Array.isArray(f.embedding) && f.embedding.length
  );
}

// Mejor coseno crudo entre las fotos de los dos, o null si a alguno le falta
// el embedding (sin él no hay forma confiable de decir "es la misma").
export function cosenoFotos(a, b) {
  const fa = fotosValidas(a);
  const fb = fotosValidas(b);
  if (!fa.length || !fb.length) return null;
  let best = null;
  for (const x of fa) {
    for (const y of fb) {
      const sim = cosineSimilarity(x.embedding, y.embedding); // (cos + 1) / 2
      if (sim != null) best = Math.max(best ?? -1, sim * 2 - 1);
    }
  }
  return best;
}

function zonaNorm(r) {
  return normalizeText(r.zona || "").replace(/\s+/g, " ").trim();
}

export function cerca(a, b) {
  if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
    return haversineKm(a.lat, a.lng, b.lat, b.lng) <= DUPLICADO_KM_MAX;
  }
  const za = zonaNorm(a);
  const zb = zonaNorm(b);
  return za.length >= 3 && zb.length >= 3 && (za === zb || za.includes(zb) || zb.includes(za));
}

const normNick = (s) => (s || "").trim().toLowerCase();

// Dueño del reporte: la cuenta, o (sin sesión) el mismo apodo.
function esPropio(report, { userId, nickname }) {
  if (userId && report.userId) return report.userId === userId;
  return !userId && !report.userId && !!normNick(nickname) && normNick(report.nickname) === normNick(nickname);
}

// kind:
//  - "identico": la misma persona ya publicó esto (la misma foto).
//  - "propio": la misma persona tiene un reporte con una foto casi igual.
//  - "duplicado": otra persona ya publicó esta mascota como perdida.
//  - "avistamiento": otra persona ya la reportó como encontrada/vista; un
//    reporte nuevo suma (otro lugar, otro día), no sobra.
export function findDuplicates(draft, reports, { userId = null, nickname = "", limit = 1 } = {}) {
  if (!draft?.tipo || !draft?.especie || !Array.isArray(reports)) return [];
  const out = [];
  for (const r of reports) {
    if (!r || r.tipo !== draft.tipo || r.especie !== draft.especie || r.resuelto || r.id === draft.id) continue;
    const cos = cosenoFotos(draft, r);
    if (cos == null || cos < DUPLICADO_COS_MIN || !cerca(draft, r)) continue;
    const propio = esPropio(r, { userId, nickname });
    const kind = propio
      ? cos >= IDENTICO_COS_MIN
        ? "identico"
        : "propio"
      : draft.tipo === "encontrada"
        ? "avistamiento"
        : "duplicado";
    out.push({ report: r, kind, score: cos, propio });
  }
  // Primero los propios (lo más probable es un doble envío), después por foto.
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
