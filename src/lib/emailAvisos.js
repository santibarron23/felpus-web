// Avisos por email (2026-10-28): pocos y solo cuando importan, para quedar
// siempre dentro del plan gratuito de Resend (3.000/mes, 100/día).
//
//  - Coincidencia ALTA (≥ 70 %) con tu reporte: como mucho 1 mail por semana
//    por reporte (lo manda /api/notify-match al publicarse el otro reporte).
//  - A los 30 días sin novedades: "¿Hubo novedades?" con 3 botones (lo manda
//    la tarea diaria de las 8, /api/alerts/flush). "Sigo buscando" renueva el
//    reporte y el próximo llega 30 días después; sin respuesta, a los 60 días
//    pasa a inactivo como siempre (inactivityAction en alerts.js).
//  - Tope de EMAIL_TOPE_DIARIO mails por día entre los dos tipos.
//
// Lógica pura (sin red ni secretos): el envío y los links firmados están en
// serverEmailAvisos.js.
import { nombreReal, petTitle } from "./petTitle";
import { zonaConCiudad } from "./zona";

export const SEGUIMIENTO_DIAS = 30;
export const MATCH_EMAIL_MIN_SCORE = 0.7;
export const MATCH_EMAIL_COOLDOWN_DIAS = 7;
// Debajo de los 100/día del plan gratuito de Resend, con margen.
export const EMAIL_TOPE_DIARIO = 80;
export const EMAIL_FROM_DEFAULT = "Felpus <avisos@felpus.com>";
export const EMAIL_REPLY_TO_DEFAULT = "contacto.felpus@gmail.com";

const DIA_MS = 24 * 3600 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ms = (v) => {
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};

function puedeRecibir(r) {
  return !!r && !r.resuelto && r.inactivo !== true && r.oculto !== true && r.avisos_email !== false && EMAIL_RE.test(r.contacto_email || "");
}

// ¿Le toca el mail de "¿Hubo novedades?"? 30 días desde lo más reciente
// entre: la última actividad (publicar o renovar) y el último seguimiento.
export function seguimientoDue(r, now = Date.now()) {
  if (!puedeRecibir(r)) return false;
  const desde = Math.max(ms(r.actividad_en) ?? ms(r.creado_en) ?? now, ms(r.seguimiento_email_en) ?? 0);
  return now - desde >= SEGUIMIENTO_DIAS * DIA_MS;
}

// ¿Se le puede mandar un mail de coincidencia a este reporte?
export function matchEmailAllowed(r, score, now = Date.now()) {
  if (!puedeRecibir(r) || !(score >= MATCH_EMAIL_MIN_SCORE)) return false;
  const ultimo = ms(r.ultimo_email_match_en);
  return ultimo == null || now - ultimo >= MATCH_EMAIL_COOLDOWN_DIAS * DIA_MS;
}

// Cuántos se pueden mandar todavía hoy.
export function cupoRestante(enviadosHoy, tope = EMAIL_TOPE_DIARIO) {
  return Math.max(0, tope - (Number(enviadosHoy) || 0));
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function nombreDe(r) {
  return nombreReal(r) || petTitle(r).toLowerCase();
}

function diasDesde(r, now) {
  const t = ms(r.creado_en);
  return t == null ? null : Math.max(1, Math.round((now - t) / DIA_MS));
}

const ESTILO = {
  wrap: "font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#382C25;",
  btn: (bg) => `display:inline-block;background:${bg};color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold;margin:4px 6px 4px 0;`,
  pie: "color:#776C64;font-size:12px;line-height:1.5;margin-top:24px;",
};

// Pie común: por qué le llega y cómo darse de baja.
function pie(bajaUrl) {
  const html = `<p style="${ESTILO.pie}">Te escribimos porque dejaste este email al publicar en Felpus. Te mandamos muy pocos avisos, solo cuando hay novedades.<br><a href="${escapeHtml(bajaUrl)}" style="color:#776C64;">No quiero más avisos</a></p>`;
  const text = `Te escribimos porque dejaste este email al publicar en Felpus.\nNo quiero más avisos: ${bajaUrl}`;
  return { html, text };
}

// "Tu reporte de Luna lleva 30 días. ¿Hubo novedades?"
export function seguimientoEmail({ report, accionUrl, bajaUrl, now = Date.now() }) {
  const nombre = nombreDe(report);
  const dias = diasDesde(report, now);
  const perdida = report.tipo === "perdida";
  const subject = perdida ? `¿Hubo novedades de ${nombre}?` : `¿Pudiste devolver a ${nombre}?`;
  const intro = `Tu reporte de <strong>${escapeHtml(nombre)}</strong> en ${escapeHtml(zonaConCiudad(report))} lleva ${dias ?? "varios"} días publicado en Felpus. ¿Hubo novedades?`;
  const botones = [
    [perdida ? "Volvió a casa 🎉" : "Ya volvió con su familia 🎉", "volvio", "#2F7955"],
    ["Sigo buscando", "sigo", "#382C25"],
    [perdida ? "Ya no busco" : "Ya no está conmigo", "no_busco", "#776C64"],
  ];
  const f = pie(bajaUrl);
  const html = `<div style="${ESTILO.wrap}">
  <h2 style="color:#D71925;margin:0 0 12px;">🐾 ${escapeHtml(subject)}</h2>
  <p style="line-height:1.5;">${intro}</p>
  <p>${botones.map(([label, accion, bg]) => `<a href="${escapeHtml(`${accionUrl}&accion=${accion}`)}" style="${ESTILO.btn(bg)}">${escapeHtml(label)}</a>`).join("")}</p>
  <p style="line-height:1.5;font-size:14px;">"Sigo buscando" mantiene tu reporte activo y con alertas un mes más. Si no respondés, en unos días deja de mandar alertas (lo podés renovar cuando quieras).</p>
  ${f.html}
</div>`;
  const text = [
    `Tu reporte de ${nombre} lleva ${dias ?? "varios"} días publicado en Felpus. ¿Hubo novedades?`,
    "",
    ...botones.map(([label, accion]) => `${label}: ${accionUrl}&accion=${accion}`),
    "",
    f.text,
  ].join("\n");
  return { subject, html, text };
}

// Coincidencia alta con un reporte nuevo.
export function matchEmail({ report, otro, score, verUrl, bajaUrl }) {
  const nombre = nombreDe(report);
  const pct = Math.round(score * 100);
  const subject = report.tipo === "perdida" ? `Puede que hayan encontrado a ${nombre}` : `Puede que estén buscando a ${nombre}`;
  const quien = otro.tipo === "encontrada" ? "una mascota encontrada" : "una mascota perdida";
  const f = pie(bajaUrl);
  const html = `<div style="${ESTILO.wrap}">
  <h2 style="color:#D71925;margin:0 0 12px;">🐾 ${escapeHtml(subject)}</h2>
  <p style="line-height:1.5;">Alguien publicó ${quien} en ${escapeHtml(zonaConCiudad(otro))} que se parece mucho a tu reporte de <strong>${escapeHtml(nombre)}</strong> (${pct}% de coincidencia).</p>
  <p><a href="${escapeHtml(verUrl)}" style="${ESTILO.btn("#D71925")}">Ver la publicación</a></p>
  ${f.html}
</div>`;
  const text = `Alguien publicó ${quien} en ${zonaConCiudad(otro)} que se parece mucho a tu reporte de ${nombre} (${pct}%).\nVer: ${verUrl}\n\n${f.text}`;
  return { subject, html, text };
}

// Lo mismo dentro de la app, para quien vuelve a entrar (haya dejado email o
// no): uno de tus reportes activos cumplió 30 días y no lo descartaste en los
// últimos 30. Con los campos del listado público (creadoEn, en ms).
export const NOVEDADES_KEY_PREFIX = "felpus_novedades_";
export function novedadesDue(report, { dismissedAt = null, now = Date.now() } = {}) {
  if (!report || report.resuelto || report.inactivo || report.oculto) return false;
  if (!Number.isFinite(report.creadoEn) || now - report.creadoEn < SEGUIMIENTO_DIAS * DIA_MS) return false;
  return !(Number.isFinite(dismissedAt) && now - dismissedAt < SEGUIMIENTO_DIAS * DIA_MS);
}
