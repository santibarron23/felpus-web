"use client";

// Modal que aparece una sola vez después de publicar un reporte
// (PLAN-alertas.md, Fase 4): ofrece avisar al instante. El permiso del
// navegador se pide recién al tocar "Sí, avisame". En iPhone sin la app
// instalada no se puede pedir: se muestran los pasos para instalarla.
import { useEffect, useRef } from "react";
import { Bell, X } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { IosInstallSteps } from "./InstallBanner";

export default function AlertOptInModal({ tipo, iosNeedsInstall, busy, onAccept, onClose }) {
  const C = useTheme();
  const acceptRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    acceptRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const text =
    tipo === "perdida"
      ? "¿Querés que te avisemos al instante si alguien reporta un animal parecido?"
      : "Te avisamos si aparece el dueño.";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="alert-optin-title"
        className="felpus-fadein w-full max-w-sm rounded-2xl border p-5 space-y-3 shadow-xl"
        style={{ background: C.surface, borderColor: C.border, color: C.text }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: C.brandTintBg, color: C.red }}>
            <Bell className="w-5 h-5" aria-hidden="true" />
          </span>
          <h2 id="alert-optin-title" className="flex-1 text-base font-bold leading-snug">
            {text}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
            style={{ color: C.muted }}
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {iosNeedsInstall ? (
          <>
            <p className="text-sm" style={{ color: C.muted }}>
              En iPhone, los avisos llegan con Felpus instalada en el inicio:
            </p>
            <IosInstallSteps C={C} />
            <button
              ref={acceptRef}
              type="button"
              onClick={onClose}
              className="w-full rounded-xl py-2.5 text-sm font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              style={{ background: C.redSolid }}
            >
              Entendido
            </button>
          </>
        ) : (
          <div className="flex gap-2">
            <button
              ref={acceptRef}
              type="button"
              onClick={onAccept}
              disabled={busy}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              style={{ background: C.redSolid }}
            >
              {busy ? "Activando…" : "Sí, avisame"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              style={{ borderColor: C.border, color: C.text }}
            >
              Ahora no
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
