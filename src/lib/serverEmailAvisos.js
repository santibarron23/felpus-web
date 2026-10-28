// Avisos por email — parte de servidor (ver emailAvisos.js para el qué y el
// cuándo): links firmados, envío con Resend, acceso a la base y el paso
// diario de "¿Hubo novedades?". Solo se importa desde rutas de servidor.
import { createHmac, timingSafeEqual } from "node:crypto";
import { argentinaDayStartIso } from "./alerts";
import {
  seguimientoDue,
  seguimientoEmail,
  cupoRestante,
  EMAIL_FROM_DEFAULT,
  EMAIL_REPLY_TO_DEFAULT,
} from "./emailAvisos";

const REPORT_ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const LINK_DIAS = 60;
export const ACCIONES = ["volvio", "sigo", "no_busco", "baja"];

// Clave de los links: derivada de la service_role (ya es secreta y ya está
// en Vercel), así no hace falta otra variable de entorno. Si se rota la
// service_role, los links viejos dejan de andar — aceptable.
export function linkSecret(env = process.env) {
  const base = env.EMAIL_LINK_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
  return base ? createHmac("sha256", base).update("felpus-avisos-email-v1").digest() : null;
}

function firma(secret, data) {
  return createHmac("sha256", secret).update(data).digest("base64url").slice(0, 22);
}

// "<reportId>.<vence en base36>.<firma>": el link sirve solo para ese
// reporte y vence en LINK_DIAS días. Quien lo tiene es quien recibió el
// mail (el email que dejó al publicar).
export function firmarAviso(reportId, secret, now = Date.now()) {
  if (!secret || !REPORT_ID_RE.test(String(reportId || ""))) return null;
  const vence = Math.floor(now / 1000 + LINK_DIAS * 86400).toString(36);
  const data = `${reportId}.${vence}`;
  return `${data}.${firma(secret, data)}`;
}

export function verificarAviso(token, secret, now = Date.now()) {
  if (!secret || typeof token !== "string" || token.length > 200) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [reportId, vence, sig] = partes;
  if (!REPORT_ID_RE.test(reportId) || !/^[0-9a-z]{1,10}$/.test(vence)) return null;
  const esperada = Buffer.from(firma(secret, `${reportId}.${vence}`));
  const recibida = Buffer.from(sig);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  if (parseInt(vence, 36) * 1000 < now) return null;
  return reportId;
}

export function avisoUrls(siteUrl, token) {
  const t = encodeURIComponent(token);
  return {
    // Los botones abren una página que pide confirmar (algunos correos
    // "visitan" los links para revisarlos: un GET nunca cambia nada).
    accionUrl: `${siteUrl}/aviso?t=${t}`,
    bajaUrl: `${siteUrl}/aviso?t=${t}&accion=baja`,
    // Baja en un clic desde el botón del propio cliente de correo (RFC 8058).
    unsubscribePostUrl: `${siteUrl}/api/aviso?t=${t}&accion=baja`,
  };
}

// Resend. Sin clave → null (avisos por email apagados).
export function makeEmailSender(env = process.env, fetchImpl = fetch) {
  const key = env.RESEND_API_KEY;
  if (!key) return null;
  const from = env.EMAIL_FROM || EMAIL_FROM_DEFAULT;
  const replyTo = env.EMAIL_REPLY_TO || EMAIL_REPLY_TO_DEFAULT;
  return async function send({ to, subject, html, text, unsubscribeUrl }) {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: replyTo,
        subject,
        html,
        text,
        ...(unsubscribeUrl
          ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
          : {}),
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
    return true;
  };
}

// Acceso a la base (REST con service_role). Si la migración 20261028_01
// todavía no se corrió, las consultas con las columnas nuevas fallan y el
// que llama saltea los mails (nunca rompe otra cosa).
export function makeEmailDb({ supabaseUrl, serviceKey, fetchImpl = fetch }) {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  const rest = async (path, init = {}) => {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    if (!res.ok) throw new Error(`Supabase ${res.status} en ${path.split("?")[0]}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
  const patch = (id, body, extra = "") =>
    rest(`reports?id=eq.${encodeURIComponent(id)}${extra}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
  const COLS_BASE = "id,tipo,especie,nombre,color,color_otro,tamano,sexo,zona,ciudad,provincia,contacto_email,resuelto,inactivo,oculto,actividad_en,creado_en,nickname";
  const COLS = `${COLS_BASE},avisos_email,seguimiento_email_en,ultimo_email_match_en`;
  return {
    async countEmailsSince(iso) {
      const p = new URLSearchParams({ kind: "in.(email_match,email_seguimiento)", created_at: `gte.${iso}`, select: "id" });
      return ((await rest(`notifications_log?${p}`)) || []).length;
    },
    async logEmail({ reportId, kind, day }) {
      await rest("notifications_log", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates" },
        body: JSON.stringify({ recipient: `email:${day}`, report_id: reportId, kind, status: "enviada" }),
      });
    },
    seguimientoCandidates: async () =>
      (await rest(`reports?resuelto=eq.false&inactivo=eq.false&avisos_email=eq.true&contacto_email=not.is.null&select=${COLS}&limit=1000`)) || [],
    async getReport(id) {
      const q = (cols) => rest(`reports?id=eq.${encodeURIComponent(id)}&select=${cols}&limit=1`);
      let rows;
      try {
        rows = await q(COLS);
      } catch {
        // Sin la migración 20261028_01: la página /aviso igual abre. Sin
        // avisos_email no hay cómo respetar la baja, así que para mandar
        // mails se trata como "no quiere" (ver matchEmailAllowed).
        rows = (await q(COLS_BASE))?.map((r) => ({ ...r, avisos_email: false }));
      }
      return Array.isArray(rows) ? rows[0] || null : null;
    },
    markSeguimiento: (id, iso) => patch(id, { seguimiento_email_en: iso }),
    markMatchEmail: (id, iso) => patch(id, { ultimo_email_match_en: iso }),
    // Respuestas desde la página /aviso. Las que cambian el estado solo
    // aplican a reportes todavía activos (un link viejo no reabre nada).
    async aplicarAccion(id, accion, nowIso, quien) {
      if (accion === "baja") return patch(id, { avisos_email: false });
      if (accion === "sigo") return patch(id, { actividad_en: nowIso, inactivo: false, aviso_inactividad_en: null }, "&resuelto=eq.false");
      if (accion === "no_busco") return patch(id, { inactivo: true }, "&resuelto=eq.false");
      if (accion === "volvio") {
        // Igual que resolveReports en store.js: al cerrarse, el contacto se
        // borra de la base.
        return patch(
          id,
          { resuelto: true, resuelto_en: nowIso, resuelto_por: quien || "Quien lo publicó", resuelto_por_user_id: null, contacto_whatsapp: null, contacto_email: null },
          "&resuelto=eq.false"
        );
      }
      return null;
    },
  };
}

// Paso diario (lo llama /api/alerts/flush): "¿Hubo novedades?" a los
// reportes que cumplen 30 días, sin pasar el tope diario.
export async function enviarSeguimientos({ db, send, secret, siteUrl, now = new Date(), log = () => {} }) {
  const summary = { enviados: 0, pendientes: 0, errores: 0 };
  if (!db || !send || !secret) return { ...summary, apagado: true };
  const dayStart = argentinaDayStartIso(now);
  let cupo = cupoRestante(await db.countEmailsSince(dayStart));
  const day = dayStart.slice(0, 10);
  const due = (await db.seguimientoCandidates()).filter((r) => seguimientoDue(r, now.getTime()));
  for (const r of due) {
    if (cupo <= 0) {
      summary.pendientes++;
      continue;
    }
    const token = firmarAviso(r.id, secret, now.getTime());
    if (!token) continue;
    const urls = avisoUrls(siteUrl, token);
    try {
      const mail = seguimientoEmail({ report: r, accionUrl: urls.accionUrl, bajaUrl: urls.bajaUrl, now: now.getTime() });
      await send({ to: r.contacto_email, ...mail, unsubscribeUrl: urls.unsubscribePostUrl });
      await db.markSeguimiento(r.id, now.toISOString());
      await db.logEmail({ reportId: r.id, kind: "email_seguimiento", day });
      summary.enviados++;
      cupo--;
    } catch (e) {
      summary.errores++;
      log("email_seguimiento_error", { message: String(e?.message || e) });
    }
  }
  return summary;
}
