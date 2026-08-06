"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTheme } from "./ThemeProvider";

// Layout compartido por /privacidad y /terminos — mismo lenguaje visual que
// el resto de Felpus (header con logo + botón "volver", tarjeta felpus-display,
// paleta vía useTheme()) para que estas dos páginas no se sientan como un
// documento legal genérico pegado aparte, sino parte de la misma app. Es
// "use client" (igual que RedirectClient.jsx en r/[id]) porque usa
// useTheme(), que depende de contexto de React — el page.js de cada ruta
// sigue siendo Server Component y es el que resuelve metadata/SEO.
export default function LegalPage({ title, updated, otherHref, otherLabel, children }) {
  const C = useTheme();
  return (
    <div className="min-h-screen" style={{ background: C.cream }}>
      {/* Mismo patrón de header que FelpusMatcher.jsx (bg-white/dark chrome,
          borde inferior) para que la transición desde "/" no se sienta como
          entrar a otro sitio. */}
      <header className="bg-white dark:bg-[var(--felpus-dark-muted-surface)] border-b" style={{ borderColor: C.border }}>
        <div className="max-w-2xl mx-auto px-4 pt-5 pb-4 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40 rounded-lg"
          >
            {/* Dos <img>, igual que el header principal: el src nunca cambia
                según el tema (evita mismatch de hidratación), es el CSS
                "dark:" el que decide cuál se ve — ver comentario homólogo en
                FelpusMatcher.jsx. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/logo_full_red.png" alt="Felpus" className="h-8 w-auto object-contain dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/logo_full_white.png" alt="Felpus" className="hidden h-8 w-auto object-contain dark:block" />
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-semibold shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40 rounded-lg px-1 py-0.5"
            style={{ color: C.muted }}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Volver a Felpus
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div
          className="rounded-2xl border p-5 sm:p-7 space-y-7 bg-white dark:bg-[var(--felpus-dark-card)]"
          style={{ borderColor: C.border }}
        >
          <div>
            <h1 className="felpus-display text-2xl sm:text-[28px] leading-tight" style={{ color: C.text }}>
              {title}
            </h1>
            <p className="text-xs mt-1.5" style={{ color: C.muted }}>
              Última actualización: {updated}
            </p>
          </div>

          <div className="space-y-6">{children}</div>
        </div>

        {otherHref && (
          <div
            className="mt-4 rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3 text-xs bg-white dark:bg-[var(--felpus-dark-card)]"
            style={{ borderColor: C.border, color: C.muted }}
          >
            <span>¿Buscás {otherLabel}?</span>
            <Link href={otherHref} className="font-semibold underline underline-offset-2" style={{ color: C.red }}>
              Ir a {otherLabel} →
            </Link>
          </div>
        )}
      </main>

      <footer className="max-w-2xl mx-auto px-4 pb-10 pt-2">
        <p className="text-[11px] text-center" style={{ color: C.muted }}>
          Felpus ·{" "}
          <a href="mailto:contacto.felpus@gmail.com" className="underline underline-offset-2">
            contacto.felpus@gmail.com
          </a>
        </p>
      </footer>
    </div>
  );
}

// Cada artículo numerado ("1. Introducción", "2. Información que..."), con
// el mismo tratamiento tipográfico en las dos páginas — evita que cada
// page.js reinvente su propio h2/espaciado y que las dos leyes visualmente
// diverjan con el tiempo.
export function LegalSection({ n, title, children }) {
  const C = useTheme();
  return (
    <section>
      <h2 className="felpus-display text-base sm:text-lg mb-2 flex items-baseline gap-2" style={{ color: C.text }}>
        <span style={{ color: C.red }}>{n}.</span> {title}
      </h2>
      <div className="text-[13.5px] sm:text-sm leading-relaxed space-y-3" style={{ color: C.text }}>
        {children}
      </div>
    </section>
  );
}
