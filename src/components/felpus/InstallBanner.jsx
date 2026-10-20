"use client";

// Banner para instalar Felpus como app (PWA, ver PLAN-alertas.md Fase 1):
// - Android y escritorio: captura `beforeinstallprompt` y muestra "Instalar
//   Felpus" (el navegador muestra su propio diálogo de instalación).
// - iPhone/iPad en Safari sin instalar: muestra cómo agregarla al inicio (es
//   además lo que habilita las notificaciones en iPhone).
// Se puede cerrar y no vuelve por 7 días (localStorage). No aparece si la
// app ya está instalada. Espera unos segundos para no tapar la primera vista.
import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, Share, X } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { isIos, isStandalone } from "../../lib/push";

const DISMISS_KEY = "felpus_install_dismissed_until";
const DISMISS_MS = 7 * 24 * 3600 * 1000;
const SHOW_DELAY_MS = 8000;

export function installDismissed(now = Date.now()) {
  try {
    return Number(localStorage.getItem(DISMISS_KEY) || 0) > now;
  } catch {
    return false;
  }
}

export function dismissInstall(now = Date.now()) {
  try {
    localStorage.setItem(DISMISS_KEY, String(now + DISMISS_MS));
  } catch {
    // sin localStorage: se cierra igual en esta visita
  }
}

function isIosSafari() {
  if (typeof navigator === "undefined" || !isIos()) return false;
  // Chrome/Firefox en iPhone no pueden instalar PWAs: solo Safari.
  return !/crios|fxios|edgios/i.test(navigator.userAgent);
}

// Pasos de instalación en iPhone (también se usan en el modal de alertas y
// en /configuracion/alertas).
export function IosInstallSteps({ C }) {
  return (
    <ol className="text-[12px] leading-relaxed list-decimal pl-4 space-y-0.5" style={{ color: C.text }}>
      <li>
        Tocá <Share className="inline w-3.5 h-3.5 -mt-0.5" aria-hidden="true" /> <strong>Compartir</strong> (abajo en Safari).
      </li>
      <li>
        Elegí <strong>Agregar a inicio</strong>.
      </li>
      <li>Abrí Felpus desde el ícono nuevo.</li>
    </ol>
  );
}

export default function InstallBanner() {
  const C = useTheme();
  const [mode, setMode] = useState(null); // null | "prompt" | "ios"
  const [deferred, setDeferred] = useState(null);

  useEffect(() => {
    if (isStandalone() || installDismissed()) return undefined;
    let timer = null;
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
      timer = setTimeout(() => setMode("prompt"), SHOW_DELAY_MS);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    if (isIosSafari()) timer = setTimeout(() => setMode("ios"), SHOW_DELAY_MS);
    const onInstalled = () => setMode(null);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!mode) return null;

  const close = () => {
    dismissInstall();
    setMode(null);
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      // el usuario cerró el diálogo
    }
    setDeferred(null);
    close();
  };

  return (
    <aside
      role="region"
      aria-label="Instalar Felpus"
      className="felpus-fadein fixed left-4 right-20 sm:right-auto sm:max-w-sm z-30 rounded-2xl border shadow-lg p-3"
      style={{ background: C.surface, borderColor: C.border, bottom: "calc(96px + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="flex items-start gap-2.5">
        <Image src="/assets/icon-192.png" alt="" width={36} height={36} className="w-9 h-9 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold" style={{ color: C.text }}>
            Tené Felpus a mano
          </p>
          {mode === "prompt" ? (
            <p className="text-[12px]" style={{ color: C.muted }}>
              Instalala como app y recibí avisos al instante.
            </p>
          ) : (
            <IosInstallSteps C={C} />
          )}
          {mode === "prompt" && (
            <button
              type="button"
              onClick={install}
              className="mt-2 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              style={{ background: C.redSolid }}
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" /> Instalar Felpus
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          className="p-1 rounded-full shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
          style={{ color: C.muted }}
          aria-label="Cerrar (no mostrar por 7 días)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
