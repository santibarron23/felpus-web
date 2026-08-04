// Service worker mínimo — solo existe para que el navegador considere a
// Felpus "instalable" (Chrome/Android exige uno con un handler de fetch) y
// para que las imágenes/assets estáticos carguen más rápido en visitas
// repetidas. A propósito NO cachea la lista de reportes ni ninguna llamada
// a Supabase: mostrar mascotas perdidas/encontradas desactualizadas como si
// fueran el estado actual sería directamente engañoso para este tipo de
// app, así que esos pedidos siempre van a la red.
const CACHE_NAME = "felpus-static-v1";
const CACHEABLE_PATH_PREFIXES = ["/assets/", "/_next/static/"];
// Buzón temporal para el share target (ver manifest.js) — nunca se lee ni
// se escribe desde ningún otro lado, así que no comparte namespace con
// CACHE_NAME (ese sí participa de la limpieza en "activate"; este otro se
// vacía solo, entrada por entrada, apenas FelpusMatcher la consume).
const SHARE_TARGET_CACHE_NAME = "felpus-share-target-v1";

function isCacheable(url) {
  return CACHEABLE_PATH_PREFIXES.some((p) => url.pathname.startsWith(p));
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// El navegador manda el POST del share target directo al service worker,
// nunca al servidor de Next.js — por eso esto vive acá y no en una ruta de
// la app. Un File no se puede pasar por query string, así que se guarda en
// Cache Storage (la única forma de handoff entre el SW y la página que no
// implica subir la foto a ningún lado todavía) y se redirige a la app, que
// la recupera de ahí — ver el useEffect de "shareTarget" en FelpusMatcher.jsx.
async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const photo = formData.get("photo");
    const text = formData.get("text") || formData.get("title") || "";
    const cache = await caches.open(SHARE_TARGET_CACHE_NAME);
    if (photo && typeof photo === "object" && photo.size > 0) {
      await cache.put("/__share-target-photo", new Response(photo, { headers: { "Content-Type": photo.type || "image/jpeg" } }));
    }
    if (text) await cache.put("/__share-target-text", new Response(text));
  } catch (e) {
    // Si algo falla (formato inesperado, cuota de storage, etc.), igual
    // mandamos a la persona a la app en vez de dejarla en una pantalla de
    // error — simplemente no va a encontrar ninguna foto precargada.
  }
  return Response.redirect("/?shareTarget=1", 303);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(handleShareTarget(req));
    return;
  }

  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // En desarrollo (`next dev`) los archivos de /_next/static/ NO llevan hash
  // de contenido en el nombre — el mismo "app/page.js" cambia de contenido
  // en cada edición. Cachearlo cache-first ahí adentro deja a quien está
  // programando viendo una versión vieja de la app para siempre, aunque
  // recargue la página. En producción (Vercel) sí llevan hash único por
  // build, así que ahí cachear es seguro — esto solo se desactiva en local.
  const isLocalDev = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

  // Assets estáticos (hasheados por Next.js, o imágenes propias que casi
  // nunca cambian de nombre): cache-first, se guardan la primera vez.
  if (!isLocalDev && isCacheable(url)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  // Navegación (abrir la app): siempre a la red primero, para no mostrar
  // nunca una versión vieja de la página. Si falla por estar offline, un
  // aviso simple en vez de la pantalla de error genérica del navegador.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(
            `<!doctype html><html lang="es"><meta charset="utf-8"><title>Sin conexión — Felpus</title>
            <body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#F6EFE4;color:#3A2A1C;text-align:center;padding:24px;">
            <div><h1 style="margin:0 0 8px;">Sin conexión</h1><p>No pudimos conectar con Felpus. Revisá tu internet e intentá de nuevo.</p></div>
            </body></html>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          )
      )
    );
  }
});

// Notificación de "posible coincidencia" — la manda el servidor
// (api/notify-match, con web-push y las claves VAPID) cuando otro reporte
// matchea con el tuyo. El payload es JSON plano: { title, body, url }.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "🐾 Posible coincidencia en Felpus";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Alguien publicó una mascota que se parece a la tuya.",
      icon: "/assets/icon-192.png",
      badge: "/assets/icon-192.png",
      data: { url: data.url || "/" },
      tag: data.tag || "felpus-match",
    })
  );
});

// Tocar la notificación enfoca una pestaña de Felpus ya abierta si existe
// (en vez de abrir una nueva encima) y la navega al reporte en cuestión.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
