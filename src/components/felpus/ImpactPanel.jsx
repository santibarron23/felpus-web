"use client";

// Panel "Impacto" del admin (2026-10-29): si Felpus ayuda a que las mascotas
// vuelvan a casa. Los números salen de computeImpactMetrics (impactMetrics.js)
// sobre los reportes que ya carga el panel; nada de esto se guarda aparte.
import { useState } from "react";
import { useTheme } from "./ThemeProvider";
import { COINCIDENCIA_ALTA, SIN_NOVEDADES_DIAS } from "../../lib/impactMetrics";

function dias(v) {
  if (v == null) return "–";
  if (v < 1) return "menos de 1 día";
  const n = Math.round(v);
  return `${n} ${n === 1 ? "día" : "días"}`;
}

function Tile({ label, value, sub }) {
  const C = useTheme();
  return (
    <div className="rounded-xl p-3 border" style={{ borderColor: C.border, background: C.surface }}>
      <p className="text-[12px] font-bold leading-tight" style={{ color: C.muted }}>
        {label}
      </p>
      <p className="felpus-mono text-2xl font-bold mt-0.5" style={{ color: C.text }}>
        {value ?? "–"}
      </p>
      {sub && (
        <p className="text-[12px] leading-snug mt-0.5" style={{ color: C.muted }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// Reencuentros por mes: una sola serie (sin leyenda: el título la nombra),
// barras finas con el extremo redondeado sobre la línea de base. El valor de
// cada mes aparece al pasar o tocar la barra; el del último mes queda
// visible. Para lectores de pantalla, la misma información en una tabla.
function ReencuentrosPorMes({ porMes }) {
  const C = useTheme();
  const [activo, setActivo] = useState(porMes.length - 1);
  const max = Math.max(1, ...porMes.map((m) => m.n));
  const H = 96;
  return (
    <div className="rounded-xl p-3 border col-span-2" style={{ borderColor: C.border, background: C.surface }}>
      <p className="text-[12px] font-bold" style={{ color: C.muted }}>
        Reencuentros por mes
      </p>
      <p className="text-[13px] mt-0.5 min-h-[20px]" style={{ color: C.text }} aria-hidden="true">
        <span className="font-bold">{porMes[activo]?.label}:</span> {porMes[activo]?.n}{" "}
        {porMes[activo]?.n === 1 ? "reencuentro" : "reencuentros"}
      </p>
      <div className="flex items-end gap-2 mt-2" style={{ height: H }} aria-hidden="true">
        {porMes.map((m, i) => (
          <button
            key={m.clave}
            type="button"
            tabIndex={-1}
            onMouseEnter={() => setActivo(i)}
            onFocus={() => setActivo(i)}
            onClick={() => setActivo(i)}
            className="flex-1 h-full flex items-end justify-center"
            title={`${m.label}: ${m.n}`}
          >
            <span
              className="w-full max-w-[28px] rounded-t"
              style={{
                height: m.n ? Math.max(4, (m.n / max) * H) : 2,
                background: m.n ? C.greenSolid : C.border,
                opacity: i === activo ? 1 : 0.75,
              }}
            />
          </button>
        ))}
      </div>
      <div className="flex gap-2 mt-1 border-t pt-1" style={{ borderColor: C.border }} aria-hidden="true">
        {porMes.map((m) => (
          <span key={m.clave} className="flex-1 text-center text-[12px]" style={{ color: C.muted }}>
            {m.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Reencuentros por mes</caption>
        <tbody>
          {porMes.map((m) => (
            <tr key={m.clave}>
              <th scope="row">{m.label}</th>
              <td>{m.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ImpactPanel({ metrics }) {
  const C = useTheme();
  if (!metrics) return null;
  const { avisos, reencuentros, tasaPerdidas, diasHastaReencuentro, coincidencias, sinNovedades } = metrics;
  return (
    <div className="space-y-2">
      <p className="text-[13px] leading-snug" style={{ color: C.muted }}>
        ¿Felpus ayuda a que vuelvan a casa? Sobre {avisos.total} avisos visibles ({avisos.perdidas} perdidas,{" "}
        {avisos.encontradas} encontradas, {avisos.avistamientos} avistamientos).
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Reencuentros" value={reencuentros.total} sub={`${reencuentros.ultimos30} en los últimos 30 días`} />
        <Tile
          label="Perdidas que volvieron"
          value={tasaPerdidas.pct == null ? "–" : `${tasaPerdidas.pct} %`}
          sub={`${tasaPerdidas.volvieron} de ${tasaPerdidas.base} publicadas hace más de ${SIN_NOVEDADES_DIAS} días`}
        />
        <Tile
          label="Tiempo hasta el reencuentro"
          value={dias(diasHastaReencuentro.mediana)}
          sub={diasHastaReencuentro.n ? `la mitad vuelve antes; 3 de cada 4, antes de ${dias(diasHastaReencuentro.p75)}` : "todavía sin datos"}
        />
        {/* La alta va de titular: con el mínimo de la app (SCORE_MINIMO,
            0,15) casi todos los avisos tienen "alguna" coincidencia (96 % el
            2026-10-29), así que ese número solo no dice mucho. */}
        <Tile
          label={`Avisos activos con coincidencia alta (≥ ${Math.round(COINCIDENCIA_ALTA * 100)} %)`}
          value={coincidencias.pctAlta == null ? "–" : `${coincidencias.pctAlta} %`}
          sub={`${coincidencias.conAlta} de ${coincidencias.activos}; con alguna posible: ${coincidencias.conAlguna}`}
        />
        <Tile
          label={`Sin novedades (+${SIN_NOVEDADES_DIAS} días)`}
          value={sinNovedades.n}
          sub={sinNovedades.pct == null ? null : `${sinNovedades.pct} % de los avisos activos`}
        />
        <Tile
          label="Quién se reencontró"
          value={`${reencuentros.perdidasQueVolvieron} / ${reencuentros.encontradasDevueltas}`}
          sub="perdidas que volvieron / encontradas devueltas a su familia"
        />
        <ReencuentrosPorMes porMes={reencuentros.porMes} />
      </div>
      <p className="text-[12px] leading-snug" style={{ color: C.muted }}>
        Los contactos y si un reencuentro vino de una coincidencia de Felpus se miden en Google Analytics (eventos
        &ldquo;contacto_iniciado&rdquo; y &ldquo;reencuentro_confirmado&rdquo;), desde el 29/10/2026.
      </p>
    </div>
  );
}
