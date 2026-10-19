"use client";

import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { C } from "../../lib/theme";

const COOKIE_NAME = "felpus-theme"; // cookie vieja del modo noche: solo se borra

const ThemeContext = createContext(null);

function readCookieMode() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )felpus-theme=(light|dark)/);
  return match ? match[1] : null;
}

// Modo noche quitado a pedido (2026-10-19): la web queda SIEMPRE en tema
// claro, sin importar la preferencia del sistema ni la elección anterior.
// Se conserva la estructura (contexto, useTheme, useThemeToggle, tokens CD
// en theme.js, clases "dark:") para poder volver a activarlo sin rehacer
// nada: bastaría con restaurar la versión anterior de este archivo y de
// layout.js. `initialMode` se ignora a propósito.
// eslint-disable-next-line no-unused-vars
export function ThemeProvider({ children, initialMode = "light" }) {
  const mode = "light";

  useEffect(() => {
    // Quien ya tenía elegido el oscuro (cookie "felpus-theme=dark") o un
    // data-theme="dark" de antes: se limpia todo.
    document.documentElement.setAttribute("data-theme", "light");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", C.red);
    if (readCookieMode()) {
      try {
        document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
      } catch {
        // no es bloqueante
      }
    }
  }, []);

  const toggle = useCallback(() => {}, []);
  const value = useMemo(() => ({ mode, toggle, C }), [toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Uso típico: const C = useTheme(); — reemplaza el `import { C } from
// "../lib/theme"` estático de antes. Como sigue llamándose `C` en el punto
// de uso, ningún `C.red`/`C.text`/etc. existente tuvo que cambiar: solo
// cambió de dónde viene el objeto.
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) return C; // fuera de un <ThemeProvider> (tests, Storybook) — cae al tema claro
  return ctx.C;
}

// Para el botón de la interfaz que deja elegir tema manualmente.
export function useThemeToggle() {
  const ctx = useContext(ThemeContext);
  if (!ctx) return { mode: "light", toggle: () => {} };
  return { mode: ctx.mode, toggle: ctx.toggle };
}
