"use client";

// Pantalla "Colaboradores" (2026-10-22, rediseño a pedido del usuario con
// referencia de la app Pasito): tarjeta propia con foto y "#N de todo
// Felpus", dos tarjetas de color (racha y puntos) y el ranking general en
// una sola lista con divisores. El ranking sigue siendo general (sin
// filtros por provincia/ciudad); la ubicación del perfil solo se muestra.
import Image from "next/image";
import { Crown, Flame, Heart, HeartHandshake, PartyPopper, Camera } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { getBadges, getTier, getTierProgress } from "../../lib/matching";
import { formatUbicacion } from "../../lib/profile";

// Fondos de las dos tarjetas de color. Más vivos que el resto de la app a
// propósito (como en la referencia): son lo primero que se mira. El texto
// encima es C.text (marrón), con contraste AA sobre los dos.
const STREAK_TILE_BG = "#FFE3A8";
const POINTS_TILE_BG = "#FFD6CF";

// Foto de perfil o, si no hay, la inicial sobre un color. unoptimized: las
// fotos de perfil ya se suben recortadas a 256 px (ver cropAvatarDataUrl) y
// así no gastan la cuota del optimizador de Vercel.
export function Avatar({ url, name, size = 40, bg, rounded = "rounded-xl", className = "" }) {
  const C = useTheme();
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={`relative overflow-hidden shrink-0 flex items-center justify-center font-bold text-white ${rounded} ${className}`}
      style={{ width: size, height: size, background: bg || C.orangeInkSolid, fontSize: Math.round(size * 0.42) }}
    >
      {url ? (
        <Image src={url} alt="" unoptimized fill sizes={`${size}px`} className="object-cover" referrerPolicy="no-referrer" />
      ) : (
        initial
      )}
    </span>
  );
}

export function RankingMeCard({ me, name, avatarUrl, ubicacion }) {
  const C = useTheme();
  return (
    <div className="rounded-3xl border p-4 flex items-center gap-3.5" style={{ borderColor: C.border, background: C.surface }}>
      <Avatar url={avatarUrl} name={name} size={56} rounded="rounded-2xl" />
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold truncate" style={{ color: C.text }}>{name}</p>
        <p className="text-sm" style={{ color: C.muted }}>
          {me?.rank ? `#${me.rank.toLocaleString("es-AR")} de todo Felpus` : "Todavía sin huellitas"}
        </p>
        {ubicacion && <p className="text-[12px] truncate" style={{ color: C.muted }}>{ubicacion}</p>}
      </div>
    </div>
  );
}

export function RankingStatTiles({ me }) {
  const C = useTheme();
  const points = me?.points || 0;
  const tier = getTier(points, C);
  const progress = getTierProgress(points);
  const streak = me?.streak_days || 0;
  const badges = getBadges(me);
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl p-4 flex flex-col justify-between min-h-[120px]" style={{ background: STREAK_TILE_BG }}>
          <Flame className="w-7 h-7 self-end" fill="currentColor" style={{ color: C.tierGold }} aria-hidden="true" />
          <div>
            <p className="felpus-display text-2xl leading-tight" style={{ color: C.text }}>
              {streak} {streak === 1 ? "día" : "días"}
            </p>
            <p className="text-[13px] font-semibold" style={{ color: C.text }}>De racha</p>
          </div>
        </div>
        <div className="rounded-3xl p-4 flex flex-col justify-between min-h-[120px]" style={{ background: POINTS_TILE_BG }}>
          <Crown className="w-7 h-7 self-end" style={{ color: C.redSolid }} aria-hidden="true" />
          <div>
            <p className="felpus-display text-2xl leading-tight" style={{ color: C.text }}>
              {points} <span className="text-base">{points === 1 ? "huellita" : "huellitas"}</span>
            </p>
            <p className="text-[13px] font-semibold truncate" style={{ color: C.text }}>{tier.label}</p>
            <div className="h-1.5 rounded-full overflow-hidden mt-1.5" style={{ background: "rgba(56,44,37,0.15)" }}>
              <div className="h-full rounded-full" style={{ width: `${progress.progressPct}%`, background: C.redSolid }} />
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold px-1" style={{ color: C.muted }}>
        <span>{progress.nextLabel ? `${progress.pointsToNext} ${progress.pointsToNext === 1 ? "huellita" : "huellitas"} para ${progress.nextLabel}` : "Nivel máximo alcanzado"}</span>
        {!!me?.reportes && (
          <span className="inline-flex items-center gap-1">
            <Camera className="w-3.5 h-3.5" aria-hidden="true" /> {me.reportes} {me.reportes === 1 ? "reporte" : "reportes"}
          </span>
        )}
        {!!me?.reencuentros && (
          <span className="inline-flex items-center gap-1">
            <PartyPopper className="w-3.5 h-3.5" aria-hidden="true" /> {me.reencuentros}{" "}
            {me.reencuentros === 1 ? "reencuentro" : "reencuentros"}
          </span>
        )}
      </div>
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <span
              key={b.id}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold"
              style={{ borderColor: C.border, background: C.surface, color: C.text }}
            >
              <span aria-hidden="true">{b.icon}</span> {b.label}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

export function RankingList({ items, myId, myAvatarUrl, heartedIds, poppingHeartId, onSendHeart, onOpenProfile }) {
  const C = useTheme();
  if (!items?.length) return null;
  return (
    <ol className="rounded-3xl border px-3" style={{ borderColor: C.border, background: C.surface }}>
      {items.map((u, i) => {
        const tier = getTier(u.points || 0, C);
        const isMe = !!myId && u.id === myId;
        const alreadyHearted = heartedIds.includes(u.id);
        const ubicacion = formatUbicacion(u);
        return (
          <li
            key={u.id || u.nickname + i}
            className="flex items-center gap-3 py-3"
            style={i < items.length - 1 ? { borderBottom: `1px solid ${C.border}` } : undefined}
          >
            <span className="w-6 text-center felpus-mono text-sm shrink-0" style={{ color: i < 3 ? C.text : C.muted }}>
              {i + 1}
            </span>
            {/* Toda la parte de la persona (foto + nombre) abre su ficha,
                donde está el botón "Apoyar" si acepta apoyos. */}
            <button
              type="button"
              onClick={() => onOpenProfile?.(u, i + 1)}
              aria-label={`Ver el perfil de ${u.nickname}`}
              className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-xl -my-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
            >
            <Avatar url={u.avatar_url || (isMe ? myAvatarUrl : null)} name={u.nickname} size={40} bg={tier.bg} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] truncate" style={{ color: C.text, fontWeight: isMe ? 700 : 500 }}>
                {u.nickname} {isMe && <span style={{ color: C.red }}>(vos)</span>}
              </p>
              <p className="text-[12px] truncate" style={{ color: C.muted }}>
                {[tier.label, ubicacion].filter(Boolean).join(" · ")}
              </p>
              {/* Apoyos: marca que la persona los recibe; el botón "Apoyar"
                  está en su ficha. El alias no viene acá. */}
              {u.acepta_apoyos && !isMe && (
                <span
                  className="mt-1 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-bold"
                  style={{ borderColor: C.border, color: C.red, background: C.brandTintBg }}
                >
                  <HeartHandshake className="w-3.5 h-3.5" aria-hidden="true" /> Apoyar
                </span>
              )}
            </div>
            </button>
            {!isMe && (
              <button
                type="button"
                onClick={() => onSendHeart(u)}
                disabled={alreadyHearted}
                aria-label={alreadyHearted ? "Ya le mandaste un corazón" : `Mandarle un corazón a ${u.nickname}`}
                className="relative flex items-center gap-1 rounded-full px-1.5 py-1 shrink-0 before:absolute before:-inset-2 before:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              >
                <Heart
                  className={poppingHeartId === u.id ? "w-4 h-4 felpus-heart-pop" : "w-4 h-4"}
                  style={{ color: alreadyHearted ? C.red : C.muted }}
                  fill={alreadyHearted ? C.red : "none"}
                />
                <span className="felpus-mono text-[11px]" style={{ color: C.muted }}>{u.hearts || 0}</span>
              </button>
            )}
            <div className="flex flex-col items-end shrink-0 w-12">
              <span className="text-base font-bold leading-tight" style={{ color: C.redDark }}>{u.points || 0}</span>
              <span className="text-[11px]" style={{ color: C.muted }}>{(u.points || 0) === 1 ? "huellita" : "huellitas"}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
