const isDev = process.env.NODE_ENV === "development";

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
  "img-src 'self' data: blob: https://*.supabase.co https://maps.gstatic.com https://maps.googleapis.com https://*.googleusercontent.com",
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
  `connect-src 'self' data: https://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com https://places.googleapis.com https://accounts.google.com https://www.google-analytics.com https://www.googletagmanager.com${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
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
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=()" },
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
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      // Avatar de Google (googleAvatar en useAuth.js) — mismo host que ya
      // está permitido en el CSP img-src de acá arriba, ahora también
      // habilitado para next/image.
      {
        protocol: "https",
        hostname: "**.googleusercontent.com",
      },
    ],
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
