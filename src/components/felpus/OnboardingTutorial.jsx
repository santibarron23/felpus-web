"use client";

// Guía de 3 pasos para quien usa Felpus por primera vez (2026-10-29). Se
// abre solo cuando la persona la pide: desde la tarjeta "¿Es tu primera
// vez?" de Inicio o desde "Cómo funciona" (Inicio y pie de página). Nunca
// se interpone antes de publicar.
import { useRef, useState } from "react";
import { Search, Camera, Heart, X, ArrowLeft, ArrowRight } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useFocusTrap } from "./useFocusTrap";
import { track } from "../../lib/analytics";

// Tarjeta de bienvenida descartada (o guía terminada): no vuelve a aparecer.
export const WELCOME_DISMISSED_KEY = "felpus_bienvenida_vista";

export function markWelcomeSeen() {
  try {
    localStorage.setItem(WELCOME_DISMISSED_KEY, "1");
  } catch {
    // sin localStorage: la tarjeta puede volver a aparecer, no es grave
  }
}

export function welcomeSeen() {
  try {
    return localStorage.getItem(WELCOME_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export default function OnboardingTutorial({ onClose, onFinish }) {
  const C = useTheme();
  const [step, setStep] = useState(0);
  const panelRef = useRef(null);
  const touchX = useRef(null);
  const steps = [
    { icon: Search, color: C.red, title: "Buscá mascotas", text: "Mirá las mascotas perdidas o encontradas cerca de tu zona." },
    { icon: Camera, color: C.orangeInk, title: "Publicá un aviso", text: "Subí una foto y contanos dónde se perdió o dónde viste al animal." },
    { icon: Heart, color: C.green, title: "Ayudá a reunirlas", text: "Felpus busca posibles coincidencias y te permite compartir el aviso." },
  ];
  const last = step === steps.length - 1;
  const S = steps[step];

  function close() {
    track("tutorial_descartado", { paso_tutorial: step + 1 });
    onClose();
  }
  useFocusTrap(true, panelRef, close);

  function go(next) {
    if (next < 0 || next >= steps.length) return;
    setStep(next);
    track("tutorial_paso", { paso_tutorial: next + 1 });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/50" onClick={close}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        aria-describedby="tutorial-text"
        className="felpus-fadein w-full max-w-sm rounded-3xl p-5 shadow-xl"
        style={{ background: C.surface, color: C.text }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 50) go(step + (dx < 0 ? 1 : -1));
        }}
      >
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold" style={{ color: C.muted }}>
            Paso {step + 1} de {steps.length}
          </p>
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar la guía"
            className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
            style={{ color: C.text }}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="text-center py-4" aria-live="polite">
          <span
            className="mx-auto mb-4 w-28 h-28 rounded-full flex items-center justify-center"
            style={{ background: `${S.color}1A`, color: S.color }}
            aria-hidden="true"
          >
            <S.icon className="w-14 h-14" strokeWidth={1.75} />
          </span>
          <h2 id="tutorial-title" className="felpus-display text-2xl mb-2">
            {S.title}
          </h2>
          <p id="tutorial-text" className="text-base leading-snug max-w-[18rem] mx-auto" style={{ color: C.muted }}>
            {S.text}
          </p>
        </div>

        {/* Puntos de progreso: el "Paso X de 3" de arriba ya lo dice en texto. */}
        <div className="flex justify-center gap-2 mb-4" aria-hidden="true">
          {steps.map((_, i) => (
            <span
              key={i}
              className="h-2 rounded-full transition-all duration-300"
              style={{ width: i === step ? 24 : 8, background: i === step ? C.text : C.border }}
            />
          ))}
        </div>

        <div className="flex gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => go(step - 1)}
              className="min-h-[48px] px-4 rounded-xl border flex items-center justify-center gap-1.5 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              style={{ borderColor: C.border, color: C.text }}
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Anterior
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!last) return go(step + 1);
              track("tutorial_completado");
              onFinish();
            }}
            className="flex-1 min-h-[48px] rounded-xl flex items-center justify-center gap-1.5 text-sm font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--felpus-focus)]"
            style={{ background: C.emphasisBg }}
          >
            {last ? (
              "Comenzar"
            ) : (
              <>
                Siguiente <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
