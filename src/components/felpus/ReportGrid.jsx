"use client";

// Vista "Grilla" de Explorar (2026-10-22, a pedido del usuario): fotos
// cuadradas de 3 en fondo, ordenadas de la más cercana a la más lejana,
// con la distancia y un punto de color (perdida/encontrada) sobre la foto.
// Sirve para recorrer rápido "qué mascotas hay cerca" mirando caras, sin
// leer tarjetas. Tocar una foto abre el mismo detalle que la lista.
import Image from "next/image";
import { useTheme } from "./ThemeProvider";
import { reportPhotoAlt } from "../../lib/matching";
import { petTitle } from "../../lib/petTitle";

export function formatDistancia(km) {
  if (km == null || !Number.isFinite(km)) return null;
  // Redondeo a 100 m; 950 m o más ya se muestra como "1,0 km" (no "1000 m").
  if (km < 0.95) return `${Math.max(100, Math.round((km * 1000) / 100) * 100)} m`;
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(km)} km`;
}

export default function ReportGrid({ reports, onOpen }) {
  const C = useTheme();
  if (!reports.length) return null;
  return (
    <ul className="grid grid-cols-3 gap-1 sm:gap-1.5 rounded-2xl overflow-hidden">
      {reports.map((r) => {
        const dist = formatDistancia(r._dist);
        const perdida = r.tipo === "perdida";
        const color = r.resuelto ? C.greenSolid : perdida ? C.redSolid : C.mapFound;
        const estado = r.resuelto ? "Reencontrada" : perdida ? "Perdida" : "Encontrada";
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onOpen(r)}
              aria-label={`${petTitle(r)}, ${estado}${dist ? `, a ${dist}` : ""}`}
              className="relative block w-full aspect-square overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--felpus-focus)]"
              style={{ background: C.surfaceMuted }}
            >
              {/* sizes="128px": en pantallas 2x/3x pide las mismas variantes (256/384 px) que la lista
                  (ver ReportCard), así la grilla no suma transformaciones
                  nuevas al optimizador de Vercel (cuota mensual). */}
              <Image src={r.foto} alt={reportPhotoAlt(r)} fill sizes="128px" loading="lazy" className="object-cover" />
              <span
                className="absolute inset-x-0 bottom-0 h-1/2"
                style={{ background: "linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0))" }}
                aria-hidden="true"
              />
              <span className="absolute left-1.5 right-1.5 bottom-1.5 flex items-center gap-1.5 text-white text-[12px] font-bold leading-tight text-left">
                <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/80" style={{ background: color }} aria-hidden="true" />
                <span className="truncate">{dist || estado}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
