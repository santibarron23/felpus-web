import { Inter, Baloo_2, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { GoogleAnalytics } from "@next/third-parties/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import ServiceWorkerRegister from "../components/felpus/ServiceWorkerRegister";
import InstallBanner from "../components/felpus/InstallBanner";
import { ThemeProvider } from "../components/felpus/ThemeProvider";
import { C } from "../lib/theme";
import { safeJsonLdString } from "../lib/jsonLd";
import { SITE_URL, SOCIAL_LINKS } from "../lib/site";

// Self-hosteadas por next/font en vez de @import en globals.css (como
// estaban antes, junto con Montserrat) — @import agrega una petición extra
// en cadena bloqueante ANTES de poder pedir el archivo de fuente real
// (HTML → CSS del bundle → CSS de Google Fonts → fonts.gstatic.com), 100%
// evitable: next/font descarga los archivos en build time y los sirve desde
// el propio dominio, sin ese round-trip externo. Cada una expone su familia
// como variable CSS (--font-*) en vez de un nombre fijo, así que
// globals.css/FelpusMatcher.jsx la referencian con var(--font-...).
// Montserrat se queda en el @import de globals.css a propósito: flyer.js la
// usa para dibujar texto en un <canvas> con `ctx.font = "... Montserrat"`, y
// necesita el nombre LITERAL "Montserrat" tal cual está registrado en
// document.fonts — next/font renombra la familia internamente a un nombre
// ofuscado, lo que rompería ese `ctx.font` (no se testeó romper esto a
// propósito: se optó por dejar Montserrat como está, ya que solo carga en el
// momento de generar un flyer, no en el camino crítico de la carga inicial).
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });
const baloo2 = Baloo_2({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-baloo", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-jetbrains-mono", display: "swap" });
const TITLE = "Felpus - Buscador inteligente de mascotas perdidas y encontradas";
const DESCRIPTION =
  "Reportá gratis una mascota perdida o encontrada en toda Argentina. Felpus busca coincidencias automáticamente por foto, descripción y zona.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s — Felpus" },
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  alternates: { canonical: SITE_URL },
  icons: {
    icon: [
      { url: "/assets/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/assets/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/assets/icon-192.png",
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "Felpus",
    locale: "es_AR",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export const viewport = {
  // Array en vez de un solo color: así la barra de navegador/PWA arranca ya
  // en el tono correcto según el sistema, sin esperar a que React hidrate.
  // El ThemeProvider corrige este mismo <meta> en caliente si el usuario
  // elige el tema a mano (ver ThemeProvider.jsx).
  // Siempre el rojo del tema claro: el modo noche se quitó (ver
  // ThemeProvider.jsx).
  themeColor: C.red,
};

// JSON-LD estático (sin datos de usuario) para que buscadores identifiquen
// el sitio como tal — no había ningún structured data en toda la app.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Felpus",
  url: SITE_URL,
  description: DESCRIPTION,
  inLanguage: "es-AR",
  publisher: {
    "@type": "Organization",
    name: "Felpus",
    url: SITE_URL,
    logo: `${SITE_URL}/assets/icon-512.png`,
    // Perfiles oficiales: ayuda a Google a asociar las redes con el sitio.
    sameAs: Object.values(SOCIAL_LINKS).filter(Boolean),
  },
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: ThemeProvider escribe data-theme="light" en
    // <html> después de montar (limpia un "dark" de la época del modo noche)
    // — sin esto React avisaría de un atributo que el servidor no generó.
    <html lang="es" suppressHydrationWarning className={`${inter.variable} ${baloo2.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Único dominio externo de fuentes que queda (Montserrat, ver
            comentario arriba) — preconectar ahorra el round-trip de
            DNS+TLS antes del @import de globals.css. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        {/* safeJsonLdString, no JSON.stringify directo: este jsonLd es 100%
            estático hoy (sin datos de usuario), pero ver r/[id]/page.js —
            el mismo patrón CON datos de usuario ahí era una inyección real
            explotable con solo abrir un link público. Usar acá también la
            versión segura evita que un cambio futuro que agregue algo
            dinámico a este objeto reabra el mismo riesgo sin que se note. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLdString(jsonLd) }}
        />
        <ThemeProvider>
          <ServiceWorkerRegister />
          <InstallBanner />
          {children}
        </ThemeProvider>
        {/* Vercel Web Analytics (2026-08-10, a pedido del usuario para poder
            ver de dónde viene el tráfico de un lanzamiento real): gratis en
            el plan Hobby, sin cookies, no pide consentimiento. En producción
            en Vercel, este componente sirve su propio script y manda las
            vistas de página vía rutas del mismo dominio (/_vercel/insights/*
            — no un dominio externo), así que no necesita agregar nada al
            CSP de acá arriba. En local (npm run dev) queda inerte a
            propósito (así lo documenta la librería) — no hay nada que
            verificar en el navegador local, solo en producción. Todavía
            falta un paso manual fuera del código: activarlo en el dashboard
            de Vercel (Project → Analytics → Enable). */}
        <Analytics />
        {/* Google Analytics 4 (2026-08-10, a pedido del usuario — además de
            Vercel Analytics de arriba, GA4 da desglose de campañas/UTM y
            vistas en tiempo real). gaId condicional: si algún día se corre
            sin NEXT_PUBLIC_GA_MEASUREMENT_ID configurada (ej. un fork, un
            entorno de staging sin esa env var todavía), el componente
            simplemente no se monta en vez de mandar "G-undefined" a
            Google. Mismo criterio que ya usa GoogleMapsScript/PlacesScript
            con su propia apiKey. */}
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
        )}
      </body>
    </html>
  );
}
