/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,jsx}",
    "./src/components/**/*.{js,jsx}",
  ],
  // La mayoría de los colores de Felpus vienen de theme.js vía inline
  // style={{}} (ver ThemeProvider.jsx), pero un puñado de fondos/textos
  // siguen siendo clases Tailwind fijas (bg-white, text-white) porque son
  // campos de color autocontenidos (botones, avatares) — para esos, "dark:"
  // usa el mismo atributo data-theme que ya controla todo lo demás, en vez
  // de depender de prefers-color-scheme directamente (así el toggle manual
  // del header también los alcanza).
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {},
  },
  plugins: [],
};
