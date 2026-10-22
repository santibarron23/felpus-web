"use client";

// Comparación completa de una coincidencia (2026-10-22, a pedido del
// usuario): las dos fotos lado a lado, una fila por criterio con su
// resultado real (✓ coincide / ✗ no) y el % en un anillo sobre fondo
// oscuro. Se abre desde "Ver comparación" en la tarjeta de coincidencia;
// en las listas se siguen usando los chips compactos (MatchBreakdownChips).
// Es pura presentación: matchBreakdown y el score ya vienen calculados.
import Image from "next/image";
import { Check, X } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { formatFechaAR, matchBreakdown, reportPhotoAlt, scoreLabel } from "../../lib/matching";
import { petTitle } from "../../lib/petTitle";
import { zonaConCiudad } from "../../lib/zona";

const DAY_MS = 24 * 60 * 60 * 1000;

// Algunos valores vienen en minúscula del formulario ("mediano").
const capitalize = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

// Fecha: no está en matchBreakdown (ahí solo van los campos descriptivos),
// pero el score sí la usa (fechaSim). Se muestra la diferencia en días y se
// marca como coincidencia con el mismo criterio del score (fechaSim ≥ 0.5).
export function fechaRow(a, b, fechaSim) {
  if (!a?.fecha || !b?.fecha) return null;
  const da = new Date(`${a.fecha}T00:00:00`);
  const db = new Date(`${b.fecha}T00:00:00`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  const days = Math.round(Math.abs(db - da) / DAY_MS);
  const detail = days === 0 ? "Mismo día" : days === 1 ? "1 día de diferencia" : `${days} días de diferencia`;
  return { key: "fecha", label: "Fecha", coincide: (fechaSim ?? 0) >= 0.5, detail };
}

function ReportSide({ report }) {
  const C = useTheme();
  const perdida = report.tipo === "perdida";
  return (
    <div className="rounded-2xl border overflow-hidden min-w-0" style={{ borderColor: C.border, background: C.surface }}>
      <div className="relative w-full aspect-square" style={{ background: C.surfaceMuted }}>
        <Image src={report.foto} alt={reportPhotoAlt(report)} fill sizes="(max-width: 640px) 45vw, 200px" className="object-cover" />
      </div>
      <div className="px-2.5 py-2">
        <p className="text-[11px] font-bold flex items-center gap-1.5" style={{ color: perdida ? C.redDark : C.orangeInk }}>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: perdida ? C.redSolid : C.orangeInkSolid }} aria-hidden="true" />
          {perdida ? "Perdida" : "Encontrada"}
        </p>
        <p className="text-[13px] font-semibold truncate" style={{ color: C.text }}>{petTitle(report)}</p>
        <p className="text-[11px] truncate" style={{ color: C.muted }}>{zonaConCiudad(report)}</p>
        {report.fecha && (
          <p className="text-[11px]" style={{ color: C.muted }}>{formatFechaAR(report.fecha)}</p>
        )}
      </div>
    </div>
  );
}

export default function MatchScorecard({ source, match }) {
  const C = useTheme();
  const rows = matchBreakdown(source, match.report);
  const fecha = fechaRow(source, match.report, match.fechaSim);
  if (fecha) rows.push(fecha);
  const pct = Math.round(match.score * 100);
  const label = scoreLabel(match.score, C);
  const circumference = 2 * Math.PI * 26;
  // Sobre el fondo oscuro fijo (emphasisBg) el color de texto de scoreLabel
  // pierde contraste: el anillo usa los colores sólidos de la marca.
  const ringColor = match.score >= 0.7 ? C.redSolid : match.score >= 0.4 ? C.toastAccent : "rgba(255,255,255,0.6)";
  const hint =
    match.score >= 0.7
      ? "Puede ser la misma mascota. Mirá bien las fotos."
      : match.score >= 0.4
        ? "Algunas cosas coinciden. Compará las fotos antes de contactar."
        : "Coinciden pocas cosas, pero vale la pena mirar las fotos.";

  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <ReportSide report={source} />
        <ReportSide report={match.report} />
      </div>

      {rows.length > 0 && (
        <ul className="rounded-2xl border px-3" style={{ borderColor: C.border, background: C.surface }}>
          {rows.map((r, i) => (
            <li
              key={r.key}
              className="flex items-center gap-2 py-2.5"
              style={i < rows.length - 1 ? { borderBottom: `1px solid ${C.border}` } : undefined}
            >
              <span className="text-[13px] font-semibold flex-1" style={{ color: C.text }}>{r.label}</span>
              <span className="text-[12px] text-right min-w-0 truncate" style={{ color: C.muted }}>
                {capitalize(r.detail || r.value || (r.coincide ? "Coincide" : "No coincide"))}
              </span>
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                style={r.coincide ? { background: C.successBg, color: C.successText } : { background: C.dangerBg, color: C.dangerText }}
                aria-label={r.coincide ? "Coincide" : "No coincide"}
                role="img"
              >
                {r.coincide ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <X className="w-3.5 h-3.5" aria-hidden="true" />}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-2xl p-3.5 flex items-center gap-3.5" style={{ background: C.emphasisBg }}>
        <div className="relative shrink-0 w-16 h-16">
          <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90" aria-hidden="true">
            <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="6" />
            <circle
              cx="32"
              cy="32"
              r="26"
              fill="none"
              stroke={ringColor}
              strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - match.score)}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center felpus-mono text-[15px] font-bold text-white">{pct}%</span>
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-white">{label.text}</p>
          <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.75)" }}>
            {hint}
          </p>
        </div>
      </div>
    </div>
  );
}
