"use client";

// Sección Colaboradores (2026-10-27): tarjeta "Invitá y ganá huellitas" y
// el historial de movimientos (de dónde salió cada huellita), agrupado por
// día. Los datos vienen de get_my_points_history / get_my_referrals (ver la
// migración 20261027_02); si todavía no se corrió, no se muestra nada.
import { useState } from "react";
import { Check, Copy, Share2, UserPlus } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { PUNTOS_REFERIDO, eventLabel, groupByDay, pointsToday } from "../../lib/pointsHistory";

export function InviteCard({ link, referrals, onCopied }) {
  const C = useTheme();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el link queda visible para copiarlo a mano.
    }
  }

  async function share() {
    if (!navigator.share) return copy();
    try {
      await navigator.share({
        title: "Felpus",
        text: "Sumate a Felpus: entre todos ayudamos a que las mascotas perdidas vuelvan a casa.",
        url: link,
      });
    } catch {
      // La persona cerró el menú de compartir: no es un error.
    }
  }

  return (
    <div className="rounded-3xl border p-4" style={{ borderColor: C.border, background: C.surface }}>
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: `${C.red}1A` }}>
          <UserPlus className="w-5 h-5" style={{ color: C.red }} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-snug" style={{ color: C.text }}>
            Invitá y ganá {PUNTOS_REFERIDO} huellitas
          </h3>
          <p className="text-[13px] leading-snug mt-0.5" style={{ color: C.muted }}>
            Compartí tu link. Sumás {PUNTOS_REFERIDO} huellitas cuando la persona que invitaste inicia sesión y publica su primer reporte.
          </p>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={share}
          className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-xl text-sm font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
          style={{ background: C.redSolid }}
        >
          <Share2 className="w-4 h-4" aria-hidden="true" /> Compartir link
        </button>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Link copiado" : "Copiar link"}
          className="w-12 min-h-[44px] flex items-center justify-center rounded-xl border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
          style={{ borderColor: copied ? C.greenSolid : C.border, color: copied ? C.greenSolid : C.text }}
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      {referrals && referrals.invitados > 0 && (
        <p className="text-[12px] font-semibold mt-2.5" style={{ color: C.muted }}>
          {referrals.invitados === 1 ? "1 persona se sumó" : `${referrals.invitados} personas se sumaron`} con tu link ·{" "}
          {referrals.premiados === 1 ? "1 ya publicó" : `${referrals.premiados} ya publicaron`}
        </p>
      )}
    </div>
  );
}

const PREVIEW_COUNT = 5;

export function PointsHistory({ history, myPoints }) {
  const C = useTheme();
  const [showAll, setShowAll] = useState(false);
  if (!history) return null;
  const { events, total } = history;
  const hoy = pointsToday(events);
  const visible = showAll ? events : events.slice(0, PREVIEW_COUNT);
  const groups = groupByDay(visible);
  // Huellitas de antes de que existiera el registro de movimientos.
  const anteriores = Math.max(0, (myPoints || 0) - total);

  return (
    <section aria-labelledby="movimientos-title" className="pt-1">
      <div className="flex items-center justify-between gap-2 px-1 mb-1.5">
        <h3 id="movimientos-title" className="text-lg font-bold" style={{ color: C.text }}>
          Tus movimientos
        </h3>
        {hoy > 0 && (
          <span className="text-[12px] font-bold rounded-full px-2.5 py-1" style={{ background: `${C.green}1A`, color: C.green }}>
            +{hoy} hoy
          </span>
        )}
      </div>

      {events.length === 0 ? (
        <p className="text-sm px-1" style={{ color: C.muted }}>
          Todavía no hay movimientos. Publicá un reporte o confirmá un reencuentro para sumar huellitas.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.key}>
              <p className="text-[13px] font-semibold first-letter:uppercase px-1 mb-1.5" style={{ color: C.muted }}>
                {g.label}
              </p>
              <ul className="rounded-2xl border divide-y" style={{ borderColor: C.border, background: C.surface }}>
                {g.items.map((ev, i) => (
                  <li key={`${ev.created_at}-${i}`} className="flex items-center gap-3 px-3.5 py-2.5" style={{ borderColor: C.border }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug" style={{ color: C.text }}>
                        {eventLabel(ev)}
                      </p>
                      {ev.detalle && (
                        <p className="text-[12px] truncate" style={{ color: C.muted }}>
                          {ev.detalle}
                        </p>
                      )}
                    </div>
                    <span className="felpus-mono text-sm font-bold rounded-full px-2.5 py-1 shrink-0" style={{ background: `${C.green}1A`, color: C.green }}>
                      +{ev.points}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {events.length > PREVIEW_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full min-h-[44px] text-sm font-bold mt-1"
          style={{ color: C.red }}
        >
          {showAll ? "Ver menos" : "Ver todos los movimientos"}
        </button>
      )}
      {anteriores > 0 && (showAll || events.length <= PREVIEW_COUNT) && (
        <p className="text-[12px] px-1 mt-2" style={{ color: C.muted }}>
          + {anteriores} huellitas sumadas antes de que existiera este historial.
        </p>
      )}
    </section>
  );
}
