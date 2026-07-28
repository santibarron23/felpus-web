import "./globals.css";

export const metadata = {
  title: "Felpus — Buscador inteligente de mascotas perdidas y encontradas",
  description:
    "Reportá una mascota perdida o encontrada con foto y descripción. Felpus busca coincidencias automáticamente por imagen, texto y zona.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
