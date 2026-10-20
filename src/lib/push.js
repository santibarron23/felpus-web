import { supabase } from "./supabaseClient";

// Notificaciones push del navegador: además del email (ver
// api/notify-match), le avisa a la persona en el momento, con el celular
// cerrado, si alguien publica una coincidencia con SU reporte. No pide
// cuenta ni login — se activa por reporte, así que también funciona para
// quien reportó como invitado (ver subscribe_report_push en schema.sql).
export function isPushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Pide permiso, se suscribe con el service worker ya registrado, y guarda
// la suscripción en el reporte puntual. Lanza si el usuario rechaza el
// permiso o si algo falla — el que llama decide cómo avisarlo (toast de
// error, etc.), acá no se silencia nada.
//
// Hallazgo de auditoría de seguridad (2026-08-09): antes esto llamaba
// directo a la RPC subscribe_report_push con la anon key, y esa función
// leía la IP para el rate limit de un header HTTP falsificable — mismo
// patrón que ya se cerró para report-contact/flag-report/create-report
// (ver PENDIENTE_DECISION.md #-14). Además, como el id del reporte no es
// secreto (aparece en la URL pública /r/<id>), cualquiera que lo conociera
// podía pisar la suscripción de otra persona. Ahora pasa por
// /api/subscribe-push (server-side, IP real de Vercel), y pushToken es el
// capability token que autoriza la llamada para reportes de invitado —
// ver createReport en store.js, que lo entrega una sola vez al publicar.
export async function subscribeReportPush(reportId, pushToken) {
  if (!isPushSupported()) {
    throw new Error("Este navegador no soporta notificaciones push.");
  }
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    throw new Error("Las notificaciones push no están configuradas todavía.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("No diste permiso para las notificaciones.");
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  const res = await fetch("/api/subscribe-push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ reportId, subscription: subscription.toJSON(), pushToken }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || "No pudimos activar las notificaciones. Probá de nuevo.");
  }
  return true;
}

// ---------------------------------------------------------------------------
// Alertas automáticas por CUENTA (zona + coincidencias de todos los reportes
// propios) — ver PLAN-alertas.md. Conviven con el push por reporte de arriba,
// que sigue siendo el camino para invitados.
// ---------------------------------------------------------------------------

// "granted" | "denied" | "default" | "unsupported"
export function pushPermissionState() {
  if (!isPushSupported() || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

// ¿Abierta como app instalada (sin barra del navegador)?
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

// En iPhone, Safari solo permite notificaciones con la app instalada en el
// inicio: ahí, en vez de pedir el permiso, se muestra la guía de instalación.
export function needsIosInstallForPush() {
  return isIos() && !isStandalone();
}

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

async function currentSubscription({ create }) {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) throw new Error("Las notificaciones push no están configuradas todavía.");
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription && create) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }
  return subscription;
}

// Pide permiso (solo cuando la persona toca un botón, nunca al cargar) y
// guarda la suscripción de ESTE dispositivo en su cuenta.
export async function subscribeUserPush() {
  if (!isPushSupported()) throw new Error("Este navegador no soporta notificaciones.");
  const token = await accessToken();
  if (!token) throw new Error("Iniciá sesión con Google para activar las alertas.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("No diste permiso para las notificaciones.");
  const subscription = await currentSubscription({ create: true });
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || "No pudimos activar las alertas. Probá de nuevo.");
  }
  return true;
}

// "Desactivar notificaciones en este dispositivo".
export async function unsubscribeUserPush() {
  if (!isPushSupported()) return false;
  const subscription = await currentSubscription({ create: false }).catch(() => null);
  if (!subscription) return false;
  const token = await accessToken();
  if (token) {
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => {});
  }
  await subscription.unsubscribe().catch(() => {});
  return true;
}

export async function hasDeviceSubscription() {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    return !!(await registration?.pushManager.getSubscription());
  } catch {
    return false;
  }
}

// Llamadas autenticadas a las rutas de alertas.
export async function authedFetch(url, init = {}) {
  const token = await accessToken();
  return fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

// Token de cada reporte publicado como invitado en ESTE dispositivo, para
// poder tocar "Seguir buscando" desde el aviso de inactividad sin sesión.
const REPORT_TOKENS_KEY = "felpus_report_tokens";

export function rememberReportToken(reportId, token) {
  if (!reportId || !token) return;
  try {
    const all = JSON.parse(localStorage.getItem(REPORT_TOKENS_KEY) || "{}");
    all[reportId] = token;
    localStorage.setItem(REPORT_TOKENS_KEY, JSON.stringify(all));
  } catch {
    // sin localStorage: el dueño puede renovar con sesión iniciada
  }
}

export function reportToken(reportId) {
  try {
    return JSON.parse(localStorage.getItem(REPORT_TOKENS_KEY) || "{}")[reportId] || null;
  } catch {
    return null;
  }
}
