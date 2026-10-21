const isDev = process.env.NODE_ENV === "development";

// Revisión de seguridad (2026-10-11): remotePatterns permitía
// "**.supabase.co" — o sea, CUALQUIER proyecto de Supabase del mundo, no
// solo el de Felpus. Eso convertía /_next/image en un proxy/optimizador de
// imágenes abierto: cualquiera podía hostear una imagen en su propio
// proyecto de Supabase y hacerla procesar por el optimizador de felpus.com
// (consumiendo la cuota de optimización de imágenes del plan de Vercel, y
// exponiendo ese procesamiento a archivos arbitrarios — justo la superficie
// de GHSA-2xp9-vwfh-vxw4, RCE en el optimizador con AVIF, parcheada en
// next 15.5.24). Ahora se restringe al host real del proyecto y al bucket
// de fotos, que es de donde salen el 100% de las fotos (verificado contra
// los reportes reales en producción). Si falta la env var (ej. un build
// sin configurar), cae al patrón amplio anterior en vez de romper el build.
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
  } catch {
    return null;
  }
})();
const supabasePhotosPattern = supabaseHost
  ? { protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/felpus-photos/**" }
  : { protocol: "https", hostname: "**.supabase.co" };

const csp = [
  "default-src 'self'",
  // Google Maps inyecta sus propios <script> dinámicamente; los fonts de
  // Google se cargan por <link>/@import, no necesitan estar acá.
  // accounts.google.com: script de Google Identity Services (login con
  // Google embebido, ver googleAuth.js/useAuth.js) — sin esto acá, el CSP
  // bloqueaba la carga de ese script ANTES de que llegara a intentar nada,
  // y el error cae silencioso al flujo clásico con redirect (por diseño,
  // así no rompe el login) — pero entonces el login nunca deja de rebotar
  // por el dominio de Supabase, que es justo lo que este SDK vino a evitar.
  // 'unsafe-eval' solo en desarrollo: el hot-reload de Next.js (webpack) lo
  // necesita para funcionar; el build de producción no usa eval().
  // googletagmanager.com (2026-08-10, Google Analytics 4 vía
  // @next/third-parties/google, a pedido del usuario): ese paquete carga
  // gtag.js desde ese dominio — sin esto acá se repite el mismo bloqueo
  // silencioso que ya se documentó para accounts.google.com más arriba.
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval' " : ""}https://maps.googleapis.com https://accounts.google.com https://www.googletagmanager.com`,
  // La app usa mucho style={{...}} inline (atributos style="..."), así que
  // style-src necesita 'unsafe-inline' — si no, se rompe todo el diseño.
  // accounts.google.com: hoja de estilos que carga el propio script de
  // Google Identity Services (accounts.google.com/gsi/style) para poder
  // pintar el cartel de "One Tap" — confirmado en vivo: sin esto acá, ESE
  // pedido puntual fallaba (bloqueado por este mismo CSP, no por
  // script-src) y el cartel nunca llegaba a mostrarse, cayendo siempre al
  // flujo clásico con redirect aunque el script ya cargara bien.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
  "font-src 'self' https://fonts.gstatic.com",
  // data:/blob: para las fotos redimensionadas en canvas y los placeholders
  // SVG generados en el cliente; googleusercontent.com para el avatar de Google.
  "img-src 'self' data: blob: https://*.supabase.co https://maps.gstatic.com https://maps.googleapis.com https://*.googleusercontent.com https://*.google-analytics.com https://www.googletagmanager.com",
  // places.googleapis.com es un dominio DISTINTO de maps.googleapis.com: lo
  // usa el autocompletado de zona (PlaceAutocompleteElement, API nueva de
  // Places) para sus pedidos de sugerencias — sin esto en connect-src, el
  // CSP bloquea esos pedidos en silencio (queda como "xhr error" genérico,
  // sin ningún mensaje de CSP explícito en la consola).
  // data: hace falta porque uploadPhoto() (src/lib/store.js) convierte la
  // foto ya redimensionada con fetch(dataUrl) antes de subirla a Storage —
  // sin "data:" acá, el navegador bloquea ESE fetch puntual (no el de
  // Supabase) y toda la publicación se cae con un error genérico de red,
  // sin ningún aviso de CSP visible salvo en la consola.
  // ws://localhost solo en desarrollo: el socket de hot-reload de Next.js.
  // accounts.google.com acá también: Google Identity Services hace sus
  // propios pedidos (fetch/FedCM) contra ese origen para pedir/emitir el ID
  // token, además de la sola carga inicial del script (ver script-src).
  // google-analytics.com/googletagmanager.com (GA4, ver script-src): gtag.js
  // manda los eventos de medición (vistas de página, etc.) a esos dos
  // dominios — sin esto en connect-src, el script carga bien pero cada
  // evento se pierde en silencio, sin ningún aviso salvo en la consola.
  // *.google-analytics.com (2026-10-15): gtag.js manda los eventos a
  // region1.google-analytics.com (subdominio regional), no a www. — con
  // solo "www." el CSP bloqueaba TODOS los page_view (visto en consola), así
  // que GA4 no estaba midiendo nada.
  `connect-src 'self' data: https://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com https://places.googleapis.com https://accounts.google.com https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  "frame-src 'self' https://accounts.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // microphone=(self) (2026-10-20): con microphone=() el navegador bloqueaba
  // el micrófono para el propio sitio y el botón "Dictar" de la descripción
  // fallaba siempre (visto en celulares reales). (self) lo habilita solo para
  // felpus.com — ningún iframe ni tercero puede usarlo.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // lucide-react ya usa imports nombrados (tree-shakeable de por sí), pero
  // esta opción le ahorra a Next tener que inferirlo: acelera el build y
  // asegura que solo los íconos realmente importados entren al bundle.
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Optimización de imágenes (2026-10-21): se consumían ~4.500 de las 5.000
  // transformaciones gratis de Vercel por mes. Causas y números en
  // docs/IMAGENES.md. Resumen de cada opción:
  images: {
    // Solo las fotos de reportes pasan por el optimizador. El avatar de
    // Google ya no (unoptimized en el componente: Google lo sirve chico,
    // =s96-c), y sacar "**.googleusercontent.com" de acá cierra además un
    // agujero: cualquiera podía pedir /_next/image?url=<cualquier archivo
    // de googleusercontent> y gastar la cuota de Felpus.
    remotePatterns: [supabasePhotosPattern],
    // Supabase sirve las fotos con "Cache-Control: max-age=3600", y Next
    // usa ese valor (el default de minimumCacheTTL es 60 s): Vercel guardaba
    // cada foto optimizada solo 1 hora y la volvía a transformar en la
    // siguiente visita. Las fotos nunca cambian (cada subida va a un path
    // nuevo con un UUID, sin upsert, ver uploadPhoto en store.js), así que
    // es seguro guardarlas 30 días. Efecto colateral: si se borra un
    // reporte, su foto optimizada puede seguir sirviéndose desde la caché
    // de Vercel hasta 30 días para quien ya tenga esa URL exacta (el
    // original de Supabase sí se borra al instante).
    minimumCacheTTL: 2592000,
    // Antes cada foto se ofrecía en 16 anchos (16 a 3840 px) y cada
    // celular pedía uno distinto según su pantalla: cada ancho es una
    // transformación aparte. Ahora hay 7, elegidos para lo que de verdad se
    // muestra: miniaturas de 40-150 px (64/128/256/384) y la foto grande
    // del detalle (640/828/1080). Las fotos se guardan con 1000 px como
    // máximo (resizeImageFile), así que pedir más de 1080 no suma nada.
    imageSizes: [64, 128, 256, 384],
    deviceSizes: [640, 828, 1080],
    // Un solo formato y una sola calidad: cada combinación distinta es otra
    // transformación. WebP lo soportan todos los navegadores actuales.
    formats: ["image/webp"],
    qualities: [75],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
