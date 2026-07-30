import "./globals.css";

const SITE_URL = "https://felpus-web.vercel.app";
const TITLE = "Felpus - Buscador inteligente de mascotas perdidas y encontradas";
const DESCRIPTION =
  "Reportá una mascota perdida o encontrada con foto y descripción. Felpus busca coincidencias automáticamente por imagen, texto y zona.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  icons: {
    icon: "/assets/icon_c.png",
    apple: "/assets/icon_c.png",
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
  themeColor: "#D31C22",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
