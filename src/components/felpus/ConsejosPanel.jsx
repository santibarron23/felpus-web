"use client";

// Consejos después de publicar (2026-10-30, ver consejos.js): los 3
// primeros a la vista, el resto con "Ver todos" (desplegable, sin modal), y
// abajo la pregunta opcional que los personaliza. Responder reordena los
// consejos en el momento; guardar (onAnswer) es cosa de quien lo usa y, si
// falla, los consejos igual quedan personalizados en esta pantalla.
// Se usa en la confirmación de publicación y en Mi Felpus (bare: sin la
// tarjeta de afuera, va dentro de la del reporte). Con `celebrar` (recién se
// confirmó el reencuentro) el título es "¡Qué alegría que volvió a casa!".
import { useId, useState } from "react";
import { ChevronDown, Lightbulb, PartyPopper } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { getConsejos, preguntaPara, tituloConsejos, tituloReencuentro } from "../../lib/consejos";

const VISIBLES = 3;

export default function ConsejosPanel({ report, onAnswer, bare = false, celebrar = false }) {
  const C = useTheme();
  const listId = useId();
  const [verTodos, setVerTodos] = useState(false);
  // Respuesta local: los consejos cambian ya, sin esperar a la base.
  const [respuesta, setRespuesta] = useState(null);

  const conRespuesta = respuesta ? { ...report, detalles: { ...(report.detalles || {}), [respuesta.clave]: respuesta.valor } } : report;
  const consejos = getConsejos(conRespuesta);
  const pregunta = respuesta ? null : preguntaPara(report);
  const visibles = verTodos ? consejos : consejos.slice(0, VISIBLES);
  const ocultos = consejos.length - VISIBLES;

  const titulo = celebrar && report.resuelto ? tituloReencuentro(report) : tituloConsejos(report);

  function responder(clave, valor) {
    setRespuesta({ clave, valor });
    onAnswer?.(clave, valor);
  }

  return (
    <section
      aria-label={titulo}
      className={bare ? "" : "bg-white rounded-2xl border p-4"}
      style={bare ? undefined : { borderColor: C.border }}
    >
      {/* bare: el título ya está en el botón que lo abre (salvo al celebrar). */}
      {(!bare || celebrar) && (
        <h3 className="text-[15px] font-bold flex items-center gap-1.5 mb-2" style={{ color: C.text }}>
          {celebrar ? (
            <PartyPopper className="w-4 h-4 shrink-0" style={{ color: C.greenSolid }} aria-hidden="true" />
          ) : (
            <Lightbulb className="w-4 h-4 shrink-0" style={{ color: C.red }} aria-hidden="true" />
          )}
          {titulo}
        </h3>
      )}
      <ol id={listId} className="space-y-2">
        {visibles.map((c) => (
          <li key={c.id} className="rounded-xl p-3" style={{ background: C.surfaceSubtle }}>
            <p className="text-[14px] font-semibold leading-snug" style={{ color: C.text }}>{c.titulo}</p>
            <p className="text-[13px] leading-snug mt-0.5" style={{ color: C.muted }}>{c.texto}</p>
          </li>
        ))}
      </ol>
      {ocultos > 0 && (
        <button
          type="button"
          onClick={() => setVerTodos((v) => !v)}
          aria-expanded={verTodos}
          aria-controls={listId}
          className="mt-2 w-full min-h-[44px] rounded-xl flex items-center justify-center gap-1.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
          style={{ color: C.text }}
        >
          {verTodos ? "Ver menos" : `Ver todos los consejos (${consejos.length})`}
          <ChevronDown className={`w-4 h-4 transition-transform ${verTodos ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      )}
      {pregunta && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: C.border }}>
          <p className="text-[13px] mb-0.5" style={{ color: C.muted }}>Opcional, para darte mejores consejos:</p>
          <p className="text-[14px] font-semibold mb-2" style={{ color: C.text }}>{pregunta.texto}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {pregunta.opciones.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => responder(pregunta.clave, o.id)}
                className="min-h-[48px] rounded-xl border px-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={{ borderColor: C.border, color: C.text, background: "#fff" }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {respuesta && (
        <p className="mt-2 text-[12px]" role="status" style={{ color: C.muted }}>
          Listo, acomodamos los consejos según tu respuesta.
        </p>
      )}
    </section>
  );
}
