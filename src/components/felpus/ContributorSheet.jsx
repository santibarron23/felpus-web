"use client";

// Ficha de un colaborador (2026-10-26): se abre al tocar a alguien en el
// ranking. Muestra quién es y qué aportó, y si acepta apoyos, el botón
// "Apoyar" (abre SupportModal con su alias). Si además cargó un link de
// cobro, el botón principal es "Colaborar con Mercado Pago / Cafecito" (2026-10-27).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Flame, Heart, HeartHandshake, Loader2, MapPin, PartyPopper, X } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useFocusTrap } from "./useFocusTrap";
import { Avatar } from "./Ranking";
import { getBadges, getTier } from "../../lib/matching";
import { formatUbicacion } from "../../lib/profile";
import { fetchSupportAlias } from "../../lib/store";
import { PayLinkButton } from "./SupportModal";

export default function ContributorSheet({ contributor: u, rank, isMe, avatarUrl, onSupport, onClose }) {
  const C = useTheme();
  const panelRef = useRef(null);
  useFocusTrap(true, panelRef, onClose);
  const tier = getTier(u.points || 0, C);
  const badges = getBadges(u);
  const ubicacion = formatUbicacion(u, { conPais: true });
  // Alias y link de cobro: se piden al abrir la ficha (solo si acepta
  // apoyos) y se le pasan a SupportModal para no pedirlos dos veces.
  const wantsSupport = !isMe && !!u.acepta_apoyos;
  const [support, setSupport] = useState({ loading: wantsSupport, data: null });

  useEffect(() => {
    if (!wantsSupport) return;
    let cancelled = false;
    fetchSupportAlias(u.id)
      .then((data) => !cancelled && setSupport({ loading: false, data }))
      .catch(() => !cancelled && setSupport({ loading: false, data: null }));
    return () => {
      cancelled = true;
    };
  }, [wantsSupport, u.id]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const stats = [
    { icon: Camera, value: u.reportes || 0, label: (u.reportes || 0) === 1 ? "reporte" : "reportes" },
    { icon: PartyPopper, value: u.reencuentros || 0, label: (u.reencuentros || 0) === 1 ? "reencuentro" : "reencuentros" },
    { icon: Flame, value: u.streak_days || 0, label: "días de racha" },
    { icon: Heart, value: u.hearts || 0, label: (u.hearts || 0) === 1 ? "corazón" : "corazones" },
  ];

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[65] flex items-end sm:items-center justify-center felpus-sheet-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contributor-title"
        className="felpus-sheet-panel w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90dvh] overflow-y-auto"
        style={{ background: C.surface, paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <Avatar url={avatarUrl} name={u.nickname} size={72} rounded="rounded-2xl" bg={tier.bg} />
          <div className="flex-1 min-w-0">
            <h2 id="contributor-title" className="font-bold text-lg leading-tight break-words" style={{ color: C.text }}>
              {u.nickname} {isMe && <span style={{ color: C.red }}>(vos)</span>}
            </h2>
            <p className="text-sm font-semibold" style={{ color: tier.text }}>{tier.label}</p>
            <p className="text-[13px]" style={{ color: C.muted }}>
              {rank ? `#${rank} · ` : ""}
              {u.points || 0} {(u.points || 0) === 1 ? "huellita" : "huellitas"}
            </p>
            {ubicacion && (
              <p className="text-[12px] flex items-center gap-1 mt-0.5" style={{ color: C.muted }}>
                <MapPin className="w-3 h-3" aria-hidden="true" /> {ubicacion}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-9 h-9 -mr-1 rounded-full flex items-center justify-center shrink-0" style={{ color: C.text }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <ul className="grid grid-cols-2 gap-2">
          {stats.map((s) => (
            <li key={s.label} className="rounded-2xl border px-3 py-2.5 flex items-center gap-2" style={{ borderColor: C.border, background: C.surfaceSubtle }}>
              <s.icon className="w-4 h-4 shrink-0" style={{ color: C.muted }} aria-hidden="true" />
              <span className="text-sm" style={{ color: C.text }}>
                <span className="font-bold">{s.value}</span> {s.label}
              </span>
            </li>
          ))}
        </ul>

        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <span key={b.id} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold" style={{ borderColor: C.border, color: C.text }}>
                <span aria-hidden="true">{b.icon}</span> {b.label}
              </span>
            ))}
          </div>
        )}

        {isMe ? (
          <p className="text-[13px] rounded-xl border p-3" style={{ borderColor: C.border, color: C.muted }}>
            {u.acepta_apoyos
              ? "Tenés los apoyos activados: la gente te ve con el botón “Apoyar”."
              : "Si querés recibir apoyos de la comunidad, activalos en Mi Felpus → Editar perfil."}
          </p>
        ) : u.acepta_apoyos ? (
          <div className="space-y-1.5">
            {support.loading ? (
              <p className="flex items-center justify-center gap-2 text-sm py-3.5" style={{ color: C.muted }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
              </p>
            ) : support.data?.link ? (
              <>
                <PayLinkButton link={support.data.link} />
                <button
                  type="button"
                  onClick={() => onSupport(u, support.data)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold border"
                  style={{ borderColor: C.border, color: C.text }}
                >
                  <HeartHandshake className="w-4 h-4" aria-hidden="true" />
                  {support.data.alias ? "Ver alias y más opciones" : "Más opciones"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onSupport(u, support.data || undefined)}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-base font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={{ background: C.redSolid }}
              >
                <HeartHandshake className="w-5 h-5" aria-hidden="true" /> Apoyar a {u.nickname}
              </button>
            )}
            <p className="text-[12px] text-center" style={{ color: C.muted }}>
              Un regalo voluntario de persona a persona. Felpus no cobra nada. Nunca pagues para recuperar a tu mascota.
            </p>
          </div>
        ) : (
          <p className="text-[13px] text-center" style={{ color: C.muted }}>
            {u.nickname} todavía no recibe apoyos.
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}
