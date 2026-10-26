// Constantes de los apoyos que usan tanto el navegador como el servidor.

// Motivos de "Reportar abuso" (los botones de la ventana Apoyar).
export const SUPPORT_FLAG_REASONS = ["Me pidió plata a cambio de una mascota", "Se hace pasar por otra persona", "Publica reportes falsos", "Otro"];

// Formatos válidos de alias: CBU/CVU (22 dígitos) o alias (6 a 20 letras,
// números, puntos o guiones). Mismo criterio que el check de la base
// (contributors_alias_pago_formato).
export function normalizeAlias(value) {
  const v = String(value || "").trim().replace(/\s+/g, "");
  if (!v) return { ok: true, alias: null };
  if (/^[0-9]{22}$/.test(v) || /^[A-Za-z0-9.-]{6,20}$/.test(v)) return { ok: true, alias: v };
  return { ok: false, error: "El alias tiene que ser un CBU/CVU de 22 números o un alias de 6 a 20 letras, números, puntos o guiones." };
}
