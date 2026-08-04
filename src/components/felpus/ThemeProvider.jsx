"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { C, CD } from "../../lib/theme";

const STORAGE_KEY = "felpus-theme"; // "light" | "dark" — ausente = seguir al sistema

const ThemeContext = createContext(null);

// El modo real ya quedó escrito en <html data-theme="..."> por el script
// inline de layout.js ANTES de que React hidrate (ver ese archivo) — así se
// evita el parpadeo típico de "carga en claro y After un instante salta a
// oscuro". Acá solo leemos ese atributo para que el primer render de React
// coincida exactamente con lo que el usuario ya está viendo.
function readInitialMode() {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(readInitialMode);

  // Si el usuario nunca eligió manualmente (no hay nada en localStorage),
  // seguir los cambios de preferencia del sistema en vivo — por ejemplo si
  // el celular pasa a modo oscuro automáticamente al atardecer.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => {
      if (localStorage.getItem(STORAGE_KEY)) return; // hay preferencia manual, no pisarla
      setMode(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    // El <meta name="theme-color"> (color de la barra del navegador/PWA) ya
    // tiene un valor por defecto que sigue prefers-color-scheme sin JS (ver
    // viewport.themeColor en layout.js) — esto lo corrige cuando el usuario
    // elige el tema a mano, para que la barra del navegador no quede
    // desincronizada del resto de la app.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", mode === "dark" ? CD.red : C.red);
  }, [mode]);

  const toggle = useCallback(() => {
    setMode((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // localStorage puede fallar en navegación privada — el toggle
        // sigue funcionando para esta sesión, solo no se recuerda.
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ mode, toggle, C: mode === "dark" ? CD : C }), [mode, toggle]);

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
