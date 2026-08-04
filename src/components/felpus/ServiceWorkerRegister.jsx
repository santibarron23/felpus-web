"use client";

import { useEffect } from "react";

// Registra el service worker (public/sw.js) que hace a Felpus instalable
// ("Agregar a la pantalla de inicio") y cachea assets estáticos. Si falla o
// el navegador no lo soporta, la app sigue funcionando exactamente igual —
// no es un requisito para nada de lo que ya existía.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
