import "./globals.css";
import ServiceWorkerRegister from "../components/felpus/ServiceWorkerRegister";
import { ThemeProvider } from "../components/felpus/ThemeProvider";
import { C, CD } from "../lib/theme";

const SITE_URL = "https://felpus-web.vercel.app";
const TITLE = "Felpus - Buscador inteligente de mascotas perdidas y encontradas";
const DESCRIPTION =
  "Reportá una mascota perdida o encontrada con foto y descripción. Felpus busca coincidencias automáticamente por imagen, texto y zona.";

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: C.red },
    { media: "(prefers-color-scheme: dark)", color: CD.red },
  ],
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
};

// Corre de forma síncrona, ANTES de que React hidrate, para decidir
// claro/oscuro y escribirlo en <html data-theme="..."> — sin esto, la app
// arrancaría siempre en claro (o en lo que decida el primer render de
// React) y "saltaría" a oscuro un instante después si correspondía, un
// parpadeo muy notorio y poco profesional. Es el mismo patrón que usan
// next-themes y la mayoría de los sitios con tema oscuro.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("felpus-theme");
    var mode = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", mode);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: el script de abajo escribe data-theme en
    // <html> antes de que React hidrate, a propósito (ver THEME_INIT_SCRIPT)
    // — sin esto React tira una advertencia de "atributo extra del server"
    // en cada carga, porque el HTML que generó el servidor nunca tuvo ese
    // atributo. No oculta errores reales: sólo aplica al único atributo que
    // sabemos que cambia a propósito antes de hidratar.
    <html lang="es" suppressHydrationWarning>
      <body>
        {/* Primero que nada en <body>, antes de cualquier contenido con
            color — ver comentario de THEME_INIT_SCRIPT arriba. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ThemeProvider>
          <ServiceWorkerRegister />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
