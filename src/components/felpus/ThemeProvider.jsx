"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { C, CD } from "../../lib/theme";

const COOKIE_NAME = "felpus-theme"; // "light" | "dark" — ausente = seguir al sistema

const ThemeContext = createContext(null);

function readCookieMode() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )felpus-theme=(light|dark)/);
  return match ? match[1] : null;
}

function writeCookieMode(mode) {
  try {
    // 1 año, mismo alcance que el sitio entero. SameSite=Lax (no Strict): la
    // cookie tiene que seguir mandándose en la navegación normal de primer
    // nivel (ej. si alguien llega desde un link externo a /r/<id>).
    document.cookie = `${COOKIE_NAME}=${mode}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // document.cookie puede fallar en navegación privada muy restrictiva —
    // el toggle sigue funcionando para esta sesión, solo no se recuerda.
  }
}

// `initialMode` viene del layout raíz (Server Component), que ya leyó la
// cookie `felpus-theme` ANTES de renderizar — así el primer render de
// servidor y el primer render de cliente (hidratación) parten exactamente
// del mismo valor. Antes esto se resolvía leyendo `document` en un
// useState inicial: como el servidor nunca tiene `document`, esa versión
// SIEMPRE asumía tema claro en el render de servidor, y cualquier
// `style={{color: C.x}}` (a diferencia de las clases `dark:`, resueltas por
// CSS y no por este valor) quedaba desincronizado entre servidor y cliente
// — un mismatch de hidratación en potencia en cualquier elemento que use
// ese patrón, no solo un puñado de casos puntuales (ver PENDIENTE_DECISION.md).
export function ThemeProvider({ children, initialMode = "light" }) {
  const [mode, setMode] = useState(initialMode === "dark" ? "dark" : "light");

  // Si el usuario nunca eligió manualmente (no hay cookie), seguir los
  // cambios de preferencia del sistema en vivo — por ejemplo si el celular
  // pasa a modo oscuro automáticamente al atardecer.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => {
      if (readCookieMode()) return; // hay preferencia manual, no pisarla
      setMode(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Una única función es la que escribe data-theme/theme-color en el DOM
  // (a propósito: tenerla separada de la reconciliación de abajo, en dos
  // efectos con distintas dependencias, causaba una condición de carrera
  // real — se detectó en pruebas de browser. En el primer commit, ambos
  // efectos corren con el `mode` de ESTE render (el heredado del servidor);
  // si el efecto de reconciliación pedía cambiar de estado, ese cambio
  // todavía no se había aplicado cuando el otro efecto volvía a escribir el
  // `mode` viejo en el DOM — pisando, por ejemplo, el "dark" que ya había
  // dejado listo THEME_INIT_SCRIPT para la primera visita con el sistema en
  // oscuro).
  const applyMode = useCallback((m) => {
    document.documentElement.setAttribute("data-theme", m);
    // El <meta name="theme-color"> (color de la barra del navegador/PWA) ya
    // tiene un valor por defecto que sigue prefers-color-scheme sin JS (ver
    // viewport.themeColor en layout.js) — esto lo corrige cuando el usuario
    // elige el tema a mano, para que la barra del navegador no quede
    // desincronizada del resto de la app.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", m === "dark" ? CD.red : C.red);
  }, []);

  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      // Corrige el único caso que el servidor no puede conocer: la primera
      // visita de alguien sin cookie todavía, cuyo sistema prefiere oscuro.
      // THEME_INIT_SCRIPT (layout.js) ya dejó el <html data-theme="..."> (y
      // las clases "dark:" que dependen de él) en el valor correcto ANTES
      // de que React hidrate — acá solo alineamos el estado de React con
      // eso, sin volver a tocar el DOM (que ya está bien), para que los
      // `style={{...C}}` también queden correctos. Corre después del
      // montaje —no durante la hidratación— así que esto es un re-render
      // cliente normal, no genera ninguna advertencia de mismatch.
      const domMode = document.documentElement.getAttribute("data-theme");
      if ((domMode === "dark" || domMode === "light") && domMode !== mode) {
        setMode(domMode);
        return;
      }
    }
    applyMode(mode);
  }, [mode, applyMode]);

  const toggle = useCallback(() => {
    setMode((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      writeCookieMode(next);
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
