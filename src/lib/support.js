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

// Link de cobro (2026-10-27): solo Mercado Pago (link de pago / mpago.la) o
// Cafecito, así nadie carga un link de phishing. Mismo criterio que el check
// de la base (contributors_link_cobro_formato). Se guarda limpio:
// https://host/camino, sin "?" ni "#".
const LINK_COBRO_HOSTS = {
  "link.mercadopago.com.ar": "Mercado Pago",
  "mpago.la": "Mercado Pago",
  "mpago.li": "Mercado Pago",
  "cafecito.app": "Cafecito",
};
const LINK_COBRO_ERROR = "El link de cobro tiene que ser de Mercado Pago (link.mercadopago.com.ar o mpago.la) o de Cafecito (cafecito.app).";

export function normalizeLinkCobro(value) {
  let v = String(value || "").trim();
  if (!v) return { ok: true, link: null };
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  let url;
  try {
    url = new URL(v);
  } catch {
    return { ok: false, error: LINK_COBRO_ERROR };
  }
  const host = url.hostname.toLowerCase().replace(/^www\.(?=cafecito\.app$)/, "");
  const path = url.pathname.replace(/\/+$/, "");
  if (!LINK_COBRO_HOSTS[host] || url.username || url.password || url.port || !/^\/[A-Za-z0-9._~/-]{1,150}$/.test(path)) {
    return { ok: false, error: LINK_COBRO_ERROR };
  }
  return { ok: true, link: `https://${host}${path}` };
}

// "Mercado Pago" o "Cafecito" (para el botón "Pagar con …").
export function linkCobroLabel(link) {
  try {
    return LINK_COBRO_HOSTS[new URL(link).hostname] || "";
  } catch {
    return "";
  }
}
