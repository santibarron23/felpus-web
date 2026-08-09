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
