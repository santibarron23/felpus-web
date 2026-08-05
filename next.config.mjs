const isDev = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  // Google Maps inyecta sus propios <script> dinámicamente; los fonts de
  // Google se cargan por <link>/@import, no necesitan estar acá.
  // 'unsafe-eval' solo en desarrollo: el hot-reload de Next.js (webpack) lo
  // necesita para funcionar; el build de producción no usa eval().
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval' " : ""}https://maps.googleapis.com`,
  // La app usa mucho style={{...}} inline (atributos style="..."), así que
  // style-src necesita 'unsafe-inline' — si no, se rompe todo el diseño.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
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
  `connect-src 'self' data: https://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com https://places.googleapis.com${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
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
