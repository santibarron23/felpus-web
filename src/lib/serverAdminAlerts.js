// Alertas al administrador cuando algo de la plataforma deja de andar
// (2026-10-29, a pedido): por email (Resend, el mismo de los avisos) y por
// push a los dispositivos donde el admin activó notificaciones en Felpus.
//
// Qué dispara una alerta:
//  - /api/health falla (el listado no carga, datos privados legibles o
//    permisos de la base desactualizados) — lo llama salud.yml.
//  - Falla del servidor al publicar un reporte (/api/create-report).
//  - Errores del navegador (/api/log-error), con criterio para no avisar de
//    más (calibrado con los 441 errores reales del 02/10 al 29/10):
//      * críticos: el listado de reportes no carga por un error de la base
//        (permisos, columna inexistente…). Así empezó la caída del 20/10
//        (sitio en 0 mascotas, 89 errores). Avisa con el primero.
//      * pico: el MISMO error desde PICO_NAVEGADORES navegadores distintos en
//        PICO_VENTANA_MIN minutos. Una sola persona reintentando no cuenta.
//      * ruido conocido, nunca avisa: el script de Google bloqueado (lo
//        más común: bloqueadores), alguien que no da permiso de
//        notificaciones, límites de uso ("Demasiadas consultas", corazón).
// Cada tipo de alerta se manda como mucho una vez cada SILENCIO_MIN minutos
// (tabla admin_alertas, migración 20261029_02; sin ella, en memoria).
import { isAllowedPushEndpoint } from "./alerts";
import { makeEmailSender } from "./serverEmailAvisos";
import { makePusher } from "./alertsServer";
import { ADMIN_EMAIL } from "./adminEdit";

export const SILENCIO_MIN = 30;
export const PICO_VENTANA_MIN = 15;
export const PICO_NAVEGADORES = 3;

const RUIDO = [
  /Google Identity Services/i,
  /notificaciones push/i,
  /Demasiadas consultas/i,
  /corazón/i,
  /gm_authFailure/i,
  /^Error sin mensaje$/,
  // Reloj del celular adelantado: el token de sesión "parece del futuro".
  // Es del dispositivo, no de la plataforma (2 casos en octubre).
  /JWT issued at future/i,
];

const CRITICO = /No se pudieron cargar los reportes/i;
const ERROR_DE_BASE = /permission denied|42501|42703|does not exist|PGRST|JWT|500|503/i;

// Mensaje sin números ni ids, para agrupar el mismo error.
export function firmaMensaje(message) {
  return String(message || "")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "#")
    .replace(/\d+/g, "#")
    .slice(0, 80);
}

export function esRuido(message) {
  return RUIDO.some((re) => re.test(String(message || "")));
}

export function esCritico(message) {
  const m = String(message || "");
  return CRITICO.test(m) && ERROR_DE_BASE.test(m);
}

// ¿Este error (recién guardado) amerita alerta? recientes: errores de los
// últimos PICO_VENTANA_MIN minutos ({ message, user_agent }), incluido este.
// Devuelve { firma, titulo, detalle } o null.
export function evaluarError(error, recientes) {
  const msg = String(error?.message || "");
  if (esRuido(msg)) return null;
  const firma = firmaMensaje(msg);
  if (esCritico(msg)) {
    return {
      firma: `critico:${firma}`,
      titulo: "El listado de reportes no carga",
      detalle: `Un visitante no pudo cargar los reportes por un error de la base: "${msg.slice(0, 300)}". Revisá /api/health y los permisos de Supabase.`,
    };
  }
  const mismos = (recientes || []).filter((e) => firmaMensaje(e.message) === firma);
  const navegadores = new Set(mismos.map((e) => e.user_agent || "?")).size;
  if (navegadores >= PICO_NAVEGADORES) {
    return {
      firma: `pico:${firma}`,
      titulo: "Muchas personas con el mismo error",
      detalle: `${navegadores} navegadores distintos tuvieron este error en los últimos ${PICO_VENTANA_MIN} minutos (${mismos.length} veces): "${msg.slice(0, 300)}".`,
    };
  }
  return null;
}

// Silencio en memoria si todavía no existe la tabla admin_alertas.
const enMemoria = new Map();

// Manda la alerta si no se mandó la misma en los últimos SILENCIO_MIN
// minutos. Nunca tira: una alerta que falla no puede romper lo que la llamó.
export async function enviarAlertaAdmin(alerta, { db, sendEmail, pusher, adminEmail, now = Date.now(), log = () => {} }) {
  if (!alerta) return { enviada: false, motivo: "sin alerta" };
  try {
    let ultima = null;
    let conTabla = true;
    try {
      ultima = await db.ultimaAlerta(alerta.firma);
    } catch {
      conTabla = false;
      ultima = enMemoria.get(alerta.firma) ?? null;
    }
    if (ultima != null && now - ultima < SILENCIO_MIN * 60_000) {
      if (conTabla) await db.sumarRepeticion(alerta.firma).catch(() => {});
      return { enviada: false, motivo: "silencio" };
    }
    if (conTabla) await db.marcarAlerta(alerta.firma, now);
    else enMemoria.set(alerta.firma, now);

    const canales = [];
    if (sendEmail && adminEmail) {
      try {
        await sendEmail({
          to: adminEmail,
          subject: `⚠️ Felpus: ${alerta.titulo}`,
          text: `${alerta.detalle}\n\nPanel: https://felpus.com/?tab=admin\nSalud: https://felpus.com/api/health\n\nNo se repite esta misma alerta por ${SILENCIO_MIN} minutos.`,
          html: `<p><strong>${escapar(alerta.titulo)}</strong></p><p>${escapar(alerta.detalle)}</p><p><a href="https://felpus.com/api/health">Ver /api/health</a></p><p style="color:#756A62;font-size:12px">No se repite esta misma alerta por ${SILENCIO_MIN} minutos.</p>`,
        });
        canales.push("email");
      } catch (e) {
        log("No se pudo mandar la alerta por email", e);
      }
    }
    if (pusher && db.adminPushSubs && adminEmail) {
      try {
        const subs = (await db.adminPushSubs(adminEmail)).filter((s) => isAllowedPushEndpoint(s.endpoint));
        for (const s of subs) {
          await pusher
            .send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, {
              title: `⚠️ Felpus: ${alerta.titulo}`,
              body: alerta.detalle.slice(0, 180),
              url: "/api/health",
              tag: `felpus-admin-${alerta.firma.slice(0, 40)}`,
            })
            .catch((e) => log("Push de alerta falló", e));
        }
        if (subs.length) canales.push("push");
      } catch (e) {
        log("No se pudo mandar la alerta por push", e);
      }
    }
    return { enviada: canales.length > 0, canales };
  } catch (e) {
    log("No se pudo procesar la alerta al admin", e);
    return { enviada: false, motivo: "error" };
  }
}

function escapar(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// Acceso a la base con service_role (REST).
export function makeAlertDb({ supabaseUrl, serviceKey, fetchImpl = fetch }) {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  const rest = async (path, init = {}) => {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  };
  let adminId;
  return {
    async ultimaAlerta(firma) {
      const rows = await rest(`admin_alertas?firma=eq.${encodeURIComponent(firma)}&select=enviada_en`);
      return rows?.[0] ? new Date(rows[0].enviada_en).getTime() : null;
    },
    marcarAlerta: (firma, now) =>
      rest("admin_alertas?on_conflict=firma", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ firma, enviada_en: new Date(now).toISOString(), repeticiones: 0 }),
      }),
    sumarRepeticion: (firma) => rest("rpc/admin_alerta_repetida", { method: "POST", body: JSON.stringify({ p_firma: firma }) }),
    erroresRecientes: (desdeIso) =>
      rest(`error_logs?select=message,user_agent&created_at=gte.${encodeURIComponent(desdeIso)}&limit=500`),
    async adminPushSubs(email) {
      if (adminId === undefined) {
        const res = await fetchImpl(`${supabaseUrl}/auth/v1/admin/users?per_page=1000`, { headers });
        const data = res.ok ? await res.json() : null;
        adminId = (data?.users || []).find((u) => (u.email || "").toLowerCase() === email.toLowerCase())?.id || null;
      }
      if (!adminId) return [];
      return (await rest(`push_subscriptions?user_id=eq.${adminId}&select=endpoint,p256dh,auth`)) || [];
    },
  };
}

// Errores al publicar que son de la persona, no de la plataforma: datos
// que no pasan las restricciones de la base (23514) o el límite de
// reportes por hora del trigger (P0001). Todo lo demás es una falla.
export function esFallaDePublicacion(error) {
  const code = String(error?.code || "");
  return !!error && code !== "23514" && code !== "P0001" && code !== "23505";
}

// Arma todo desde las variables de entorno y manda (para las rutas).
// Sin Supabase configurado no hace nada; sin RESEND_API_KEY o sin claves
// VAPID, usa el canal que haya.
export async function alertarAdmin(alerta, env = process.env) {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!alerta || !supabaseUrl || !serviceKey) return { enviada: false, motivo: "sin configurar" };
  const pusher = await makePusher(env).catch(() => null);
  return enviarAlertaAdmin(alerta, {
    db: makeAlertDb({ supabaseUrl, serviceKey }),
    sendEmail: makeEmailSender(env),
    pusher,
    adminEmail: env.ALERTAS_ADMIN_EMAIL || ADMIN_EMAIL,
    log: (...a) => console.error(...a),
  });
}
