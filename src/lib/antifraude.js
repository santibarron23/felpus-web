// Reglas antifraude del panel de admin (2026-10-26). Función pura sobre las
// señales que devuelve admin_user_signals (migración 20261026_02): no
// banea a nadie sola, solo ordena y explica para que el admin decida.

export const BAN_REASONS = [
  "Publicó reportes falsos",
  "Pidió plata a cambio de una mascota",
  "Se hizo pasar por otra persona",
  "Spam o publicaciones repetidas",
  "Otro incumplimiento de las reglas",
];

// Puntaje de riesgo: cada señal suma con su peso, y se listan las razones
// en texto para el panel. "alto" desde 6 puntos, "medio" desde 1.
export function userRisk(u) {
  const reasons = [];
  let score = 0;
  const add = (cond, pts, text) => {
    if (cond) {
      score += pts;
      reasons.push(text);
    }
  };
  const den = u?.denuncias_recibidas || 0;
  const ocultos = u?.reportes_ocultos || 0;
  const alias = u?.denuncias_alias || 0;
  const hoy = u?.reportes_24h || 0;
  add(den > 0, Math.min(den, 5) * 2, `${den} ${den === 1 ? "denuncia" : "denuncias"} a sus reportes`);
  add(ocultos > 0, ocultos * 3, `${ocultos} ${ocultos === 1 ? "reporte oculto" : "reportes ocultos"}`);
  add(alias > 0, alias * 3, `${alias} ${alias === 1 ? "denuncia" : "denuncias"} a su alias de apoyos`);
  add(hoy >= 4, 3, `${hoy} reportes en las últimas 24 h`);
  return { score, level: score >= 6 ? "alto" : score > 0 ? "medio" : "bajo", reasons };
}
