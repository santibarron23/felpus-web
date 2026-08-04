"use client";

// Red de seguridad para cualquier error que escape de un componente durante
// el render (no las promesas rechazadas en handlers, esas ya se manejan una
// por una con logError/setLoadError/etc.) — sin este archivo, un error así
// tiraba a la persona a la pantalla de crash genérica de Next.js (blanca,
// en inglés, sin marca, con un botón que no explica qué hacer). Next.js App
// Router monta esto automáticamente envolviendo cada segmento de ruta.
import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import Mascot from "../components/Mascot";
import { C } from "../lib/theme";
import { logError } from "../lib/log";

export default function Error({ error, reset }) {
  useEffect(() => {
    logError("Error no capturado en un segmento de la app", error);
  }, [error]);

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: C.cream, color: C.text, fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <Mascot mood="waiting" size={96} />
      <div>
        <h1 className="felpus-display text-xl mb-1">Algo se rompió de nuestro lado</h1>
        <p className="text-sm max-w-sm" style={{ color: C.muted }}>
          No es nada que hayas hecho vos — probá de nuevo. Si sigue pasando, recargá la página.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--felpus-focus)]"
        style={{ background: C.redSolid }}
      >
        <RefreshCw className="w-4 h-4" /> Intentar de nuevo
      </button>
    </div>
  );
}
