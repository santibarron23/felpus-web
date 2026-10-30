"use client";

// "¿Dónde está ahora?" en el formulario de encontrada (2026-10-30, ver
// resguardo.js). Opcional: se puede publicar sin tocarla. "No la tengo, solo
// la vi" no queda elegida: abre la hoja de avistamiento (onSoloLaVi).
import { useTheme } from "./ThemeProvider";
import { LUGAR_MAX, RESGUARDO_OPCIONES } from "../../lib/resguardo";

export default function ResguardoPregunta({ value, lugar, onChange, onLugarChange, onSoloLaVi }) {
  const C = useTheme();
  return (
    <fieldset className="bg-white rounded-2xl border p-3.5" style={{ borderColor: C.border }}>
      <legend className="sr-only">¿Dónde está ahora?</legend>
      <p className="text-sm font-bold" aria-hidden="true" style={{ color: C.text }}>
        ¿Dónde está ahora? <span className="font-normal" style={{ color: C.muted }}>(opcional)</span>
      </p>
      <div className="grid gap-2 mt-2">
        {RESGUARDO_OPCIONES.map((o) => {
          const activo = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={o.id === "solo_la_vi" ? undefined : activo}
              onClick={() => (o.id === "solo_la_vi" ? onSoloLaVi() : onChange(activo ? null : o.id))}
              className="min-h-[48px] rounded-xl border px-3 text-left text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              style={activo ? { borderColor: C.orangeInkSolid, background: C.surfaceSubtle, color: C.text, boxShadow: `inset 0 0 0 1px ${C.orangeInkSolid}` } : { borderColor: C.border, color: C.text }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {value === "terceros" && (
        <div className="mt-3">
          <label htmlFor="form-lugar" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>
            Nombre del lugar <span className="font-normal" style={{ color: C.muted }}>(opcional)</span>
          </label>
          <input
            id="form-lugar"
            type="text"
            value={lugar}
            maxLength={LUGAR_MAX}
            onChange={(e) => onLugarChange(e.target.value)}
            placeholder="Ej: Veterinaria San Roque"
            className="felpus-input w-full border rounded-lg px-3 py-2.5 text-sm bg-white"
            style={{ borderColor: C.border, color: C.text }}
          />
          <p className="text-[12px] mt-1" style={{ color: C.muted }}>Se muestra en el aviso. No pongas una dirección particular.</p>
        </div>
      )}
    </fieldset>
  );
}
