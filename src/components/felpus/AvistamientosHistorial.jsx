"use client";

// Historial de avistamientos de una perdida (2026-10-30, ver avistamientosDe
// en sighting.js). Lo ve solo el dueño: en la ficha de su perdida y en Mi
// Felpus. Son datos que aportó la comunidad, sin confirmar.
// - "No es mi mascota" lo saca de SU historial (onDescartar).
// - "Denunciar" usa la denuncia de siempre (flag_report), motivo
//   "Información incorrecta".
import { useState } from "react";
import Image from "next/image";
import { Eye, Flag, MapPin, Navigation, X } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { avistamientoCuando, direccionLabel } from "../../lib/sighting";
import { zonaConCiudad } from "../../lib/zona";

export default function AvistamientosHistorial({ avistamientos, onOpen, onDescartar, onDenunciar }) {
  const C = useTheme();
  // id → "descartando" | "denunciando" | "denunciado"
  const [estado, setEstado] = useState({});

  if (!avistamientos?.length) return null;

  async function accion(id, fn, durante, despues) {
    setEstado((e) => ({ ...e, [id]: durante }));
    try {
      await fn();
      setEstado((e) => ({ ...e, [id]: despues }));
    } catch {
      setEstado((e) => ({ ...e, [id]: undefined }));
    }
  }

  return (
    <section aria-label="Avistamientos" className="rounded-xl p-3" style={{ background: C.surfaceSubtle }}>
      <h3 className="text-[15px] font-bold flex items-center gap-1.5" style={{ color: C.text }}>
        <Eye className="w-4 h-4 shrink-0" style={{ color: C.sightingSolid }} aria-hidden="true" />
        Avistamientos ({avistamientos.length})
      </h3>
      <p className="text-[12px] mt-0.5" style={{ color: C.muted }}>
        Aportados por la comunidad, sin confirmar. Confirmá hora y lugar antes de ir.
      </p>
      <ol className="mt-2 space-y-2">
        {avistamientos.map((a) => {
          const dir = direccionLabel(a.detalles?.direccion);
          const st = estado[a.id];
          return (
            <li key={a.id} className="bg-white rounded-xl border p-2.5" style={{ borderColor: C.border }}>
              <button
                type="button"
                onClick={() => onOpen(a)}
                className="w-full flex gap-2.5 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              >
                {!a.detalles?.sin_foto && a.foto && (
                  <Image src={a.foto} alt="Foto del avistamiento" width={56} height={56} loading="lazy" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold" style={{ color: C.text }}>
                    Vista el {avistamientoCuando(a) || a.fecha}
                  </span>
                  <span className="block text-[12px] flex items-center gap-1" style={{ color: C.muted }}>
                    <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" /> {zonaConCiudad(a)}
                  </span>
                  {dir && (
                    <span className="block text-[12px] flex items-center gap-1" style={{ color: C.muted }}>
                      <Navigation className="w-3 h-3 shrink-0" aria-hidden="true" /> Iba hacia el {dir.toLowerCase()}
                    </span>
                  )}
                  {a.detalles?.comentario && (
                    <span className="block text-[12px] mt-0.5 break-words" style={{ color: C.text }}>
                      &ldquo;{a.detalles.comentario}&rdquo;
                    </span>
                  )}
                </span>
              </button>
              <div className="flex flex-wrap gap-x-3 mt-1">
                <button
                  type="button"
                  disabled={!!st}
                  onClick={() => accion(a.id, () => onDescartar(a), "descartando", "descartado")}
                  className="min-h-[44px] text-[12px] font-semibold flex items-center gap-1 disabled:opacity-60"
                  style={{ color: C.muted }}
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" /> {st === "descartando" ? "Sacando…" : "No es mi mascota"}
                </button>
                <button
                  type="button"
                  disabled={!!st}
                  onClick={() => accion(a.id, () => onDenunciar(a), "denunciando", "denunciado")}
                  className="min-h-[44px] text-[12px] font-semibold flex items-center gap-1 disabled:opacity-60"
                  style={{ color: C.redDark }}
                >
                  <Flag className="w-3.5 h-3.5" aria-hidden="true" />
                  {st === "denunciando" ? "Enviando…" : st === "denunciado" ? "Denunciado" : "Denunciar"}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
