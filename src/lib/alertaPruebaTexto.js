// Texto del botón "Mandarme una alerta de prueba" (Admin → Métricas). Dice
// por separado qué pasó con el email y con el push, y si el email no salió,
// por qué (lo devuelve enviarAlertaAdmin en serverAdminAlerts.js).
export function textoAlertaPrueba(data) {
  if (!data || typeof data !== "object") return "No se pudo mandar. Probá de nuevo.";
  if (data.motivo === "silencio") return "Ya mandaste una hace menos de 30 minutos.";
  if (!data.email && !Array.isArray(data.canales)) return "No salió: revisá RESEND_API_KEY y las claves VAPID en Vercel.";
  const canales = Array.isArray(data.canales) ? data.canales : [];
  const email =
    data.email === "enviado"
      ? "Email: enviado (si no lo ves en unos minutos, revisá Spam)."
      : data.email === "sin RESEND_API_KEY"
        ? "Email: no salió porque falta RESEND_API_KEY en Vercel (Production). Sin esa clave no sale ningún email de Felpus."
        : `Email: no salió. Resend respondió: ${data.email || "sin detalle"}.`;
  const push = canales.includes("push")
    ? "Notificación: enviada."
    : "Notificación: no salió (activá las notificaciones en tu celular con esta cuenta).";
  return `${email} ${push}`;
}
