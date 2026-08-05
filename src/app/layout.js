import { cookies } from "next/headers";
import "./globals.css";
import ServiceWorkerRegister from "../components/felpus/ServiceWorkerRegister";
import { ThemeProvider } from "../components/felpus/ThemeProvider";
import { C, CD } from "../lib/theme";
import { safeJsonLdString } from "../lib/jsonLd";

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

// Corre de forma síncrona, ANTES de que React hidrate, y escribe
// `data-theme` en <html> de forma puramente imperativa (nunca como prop de
// React — ver por qué abajo) para que las clases "dark:" (CSS, ligadas a
// ese atributo) pinten el tono correcto desde el primer frame, sin
// parpadeo. `%INITIAL_MODE%` viene ya resuelto por RootLayout (Server
// Component) a partir de la cookie "felpus-theme" — por eso, a diferencia
// de la versión anterior, este script YA NO necesita adivinar nada para
// quien vuelve a visitar: solo cubre el único caso que el servidor no
// puede conocer, la primera visita de alguien sin cookie todavía, donde
// hace falta `prefers-color-scheme` (inaccesible en el servidor) para no
// arrancar siempre en claro.
//
// Importante: `data-theme` NUNCA se pasa como prop de JSX a <html> (ver
// RootLayout más abajo) — si lo fuera, React "adoptaría" ese atributo, y al
// hidratar lo pisaría de vuelta al valor que renderizó el servidor,
// peleándose con este mismo script en el caso de primera visita (se probó
// en browser: pasaba exactamente eso). Dejarlo 100% imperativo, fuera del
// control de React, es lo que evita ese conflicto.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var initialMode = "%INITIAL_MODE%";
    document.documentElement.setAttribute("data-theme", initialMode);
    if (!/(?:^|; )felpus-theme=(light|dark)/.test(document.cookie)) {
      var mode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      if (mode !== initialMode) document.documentElement.setAttribute("data-theme", mode);
      document.cookie = "felpus-theme=" + mode + "; path=/; max-age=31536000; SameSite=Lax";
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  // Server Component: leer la cookie acá es lo que le permite al HTML
  // generado por el servidor arrancar ya con el `mode` de React correcto
  // (pasado como prop a ThemeProvider más abajo) — así cualquier
  // `style={{color: C.x}}` calculado por useTheme() en el árbol entero
  // coincide entre servidor y cliente desde el primer render, algo que
  // antes NUNCA pasaba (el servidor siempre asumía tema claro; ver
  // PENDIENTE_DECISION.md, hallazgo del mismatch de hidratación sistémico).
  // El <html data-theme="..."> que ven las clases "dark:" sigue siendo
  // responsabilidad exclusiva de THEME_INIT_SCRIPT (ver comentario ahí).
  // cookies() vuelve dinámico este layout (no se puede pre-generar en
  // build) — costo aceptado: la app ya es interactiva de punta a punta
  // (Supabase en runtime), no había ganancia real de estático acá.
  const stored = cookies().get("felpus-theme")?.value;
  const initialMode = stored === "dark" ? "dark" : "light";

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
            color — ver comentario de THEME_INIT_SCRIPT arriba. El
            "%INITIAL_MODE%" se reemplaza acá (no con una plantilla de JS
            con `${}`) para no volver dinámico el resto del literal —
            initialMode ya viene validado a "light" | "dark" arriba, nunca
            texto libre, así que no hay riesgo de inyección. */}
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT.replace("%INITIAL_MODE%", initialMode) }}
        />
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
        <ThemeProvider initialMode={initialMode}>
          <ServiceWorkerRegister />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
