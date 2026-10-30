"use client";

// Junto a las posibles coincidencias (2026-10-30, ver consejos.js): aclara
// que es una sugerencia, deja a la vista la advertencia contra estafas y,
// desplegable, cómo comparar antes de confiar.
import { useId, useState } from "react";
import { ChevronDown, ShieldAlert } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { AVISO_SEGURIDAD, getConsejos } from "../../lib/consejos";

export default function CoincidenciaAyuda({ report, className = "" }) {
  const C = useTheme();
  const listId = useId();
  const [abierto, setAbierto] = useState(false);
  const consejos = getConsejos(report, "coincidencia");

  return (
    <div className={`rounded-xl p-3 ${className}`} style={{ background: C.surfaceSubtle }}>
      <p className="text-[13px] leading-snug" style={{ color: C.text }}>
        Felpus las sugiere comparando fotos y datos. <strong>No es una identificación segura</strong>: revisalas con calma.
      </p>
      <p className="text-[13px] leading-snug mt-2 flex gap-1.5" style={{ color: C.text }}>
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" style={{ color: C.redDark }} aria-hidden="true" />
        <span>{AVISO_SEGURIDAD}</span>
      </p>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls={listId}
        className="mt-1 min-h-[44px] flex items-center gap-1 text-[13px] font-semibold underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
        style={{ color: C.text }}
      >
        Cómo comparar antes de confiar
        <ChevronDown className={`w-4 h-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <ul id={listId} hidden={!abierto} className="space-y-1.5">
        {consejos.map((c) => (
          <li key={c.id} className="text-[13px] leading-snug" style={{ color: C.text }}>
            <span className="font-semibold">{c.titulo}.</span> <span style={{ color: C.muted }}>{c.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
