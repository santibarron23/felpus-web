// Scripts que meten otras apps dentro de la página (2026-11-07). El navegador
// interno de Instagram y Facebook en Android inyecta su propio script
// (iabjs://navigation_performance_logger_android) que mide la carga y, al
// salir de la página, le avisa a la app por un puente con Java. Si la app ya
// cerró ese puente, tira "Error invoking postMessage: Java object is gone".
// Es un error de ese script, no de Felpus, y la persona no ve nada: eran 336
// filas de error_logs del 02/11 al 07/11 (todas Android, 309 Instagram y 27
// Facebook, muchas desde anuncios) y dispararon la alerta de "Muchas personas
// con el mismo error".
//
// Criterio estrecho: solo cuenta como inyectado si TODOS los archivos del
// stack son iabjs://. Si en el medio aparece código de Felpus (https://…),
// se sigue registrando, por si algo nuestro lo provocó.
const URL_EN_STACK = /\b[a-z][a-z0-9+.-]*:\/\/[^\s)]+/gi;
const INYECTADO = /^iabjs:\/\//i;

export function esDeScriptInyectado({ stack, filename } = {}) {
  if (filename && INYECTADO.test(String(filename))) return true;
  const urls = String(stack || "").match(URL_EN_STACK) || [];
  return urls.length > 0 && urls.every((u) => INYECTADO.test(u));
}
