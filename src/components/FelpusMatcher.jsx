"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  PawPrint,
  Search,
  MapPin,
  Camera,
  Navigation,
  Loader2,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Check,
  Dog,
  Cat,
  HelpCircle,
  ArrowLeft,
  Crown,
  PartyPopper,
  Home,
  Plus,
  Share2,
  X,
  AlertCircle,
  LogIn,
  LogOut,
  Lock,
  Copy,
  Facebook,
  Twitter,
  Heart,
  MessageCircle,
  Mail,
  Bell,
  Printer,
  Flame,
  Trash2,
} from "lucide-react";
import {
  normalizeText,
  computeHistogram,
  resizeImageFile,
  getImageEmbedding,
  scoreMatch,
  scoreLabel,
  getTier,
  getBadges,
  isRecent,
  formatFechaAR,
  timeAgo,
  buildShareText,
  emptyForm,
  MAX_FOTOS,
  haversineKm,
  COLOR_OPTIONS,
  SEXO_OPTIONS,
  sanitizePhoneForWhatsapp,
  EDAD_OPTIONS,
  PESO_OPTIONS,
  PUNTOS_PERDIDA,
  PUNTOS_ENCONTRADA,
  PUNTOS_REENCUENTRO,
  PUNTOS_BONO_ORIGINAL,
  SCORE_MINIMO,
} from "../lib/matching";
import {
  fetchReports,
  createReport,
  resolveReports,
  deleteReport,
  fetchLeaderboard,
  fetchMyRank,
  awardPoints as awardPointsRemote,
  sendHeart,
  bumpStreak,
  seedIfEmpty,
} from "../lib/store";
import { supabase } from "../lib/supabaseClient";
import { playTap, playSuccess } from "../lib/sound";
import { downloadFlyer } from "../lib/flyer";
import { loadGoogleMaps } from "../lib/googleMaps";
import MapPicker from "./MapPicker";
import ReportsMap from "./ReportsMap";
import Mascot from "./Mascot";
import ZonaAutocomplete from "./ZonaAutocomplete";

const LOGO_RED = "/assets/logo_full_red.png";
const MASCOT_HERO = "/assets/mascot_hero.png";
const PAW_MAGNIFIER = "/assets/paw_magnifier.png";
const MAX_FOTO_MB = 15;

// Paleta — tonos de texto verificados contra ratio AA (>=4.5:1 sobre blanco/crema)
const C = {
  red: "#D31C22",
  redDark: "#AB1017",
  orange: "#E4661E",
  orangeInk: "#E36525",
  orangeInkDark: "#8F3C0E",
  green: "#2E7048",
  greenDark: "#235A38",
  ink: "#2B1B12",
  text: "#3A2A1C",
  muted: "#6B5643",
  cream: "#F6EFE4",
  border: "#EFE3D2",
};

function displayColor(report) {
  return report.color === "Otro color" && report.colorOtro ? report.colorOtro : report.color;
}

// El error crudo de Supabase (ej. violación de un CHECK constraint de largo
// máximo) nunca llegaba a mostrarse — todo caía en el mismo "Algo falló,
// probá de nuevo" genérico, así que alguien podía quedar reintentando sin
// entender qué campo corregir. Esto traduce las causas más comunes a un
// mensaje accionable; si no reconoce el error, se queda con el genérico.
function describeSubmitError(err) {
  const msg = String(err?.message || "");
  if (err?.code === "23514" || /violates check constraint/.test(msg)) {
    if (/descripcion_len/.test(msg)) return "La descripción es muy larga — acortala e intentá de nuevo.";
    if (/zona_len/.test(msg)) return "La zona/dirección elegida es muy larga — probá escribirla más corta.";
    if (/nombre_len/.test(msg)) return "El nombre de la mascota es muy largo — acortalo e intentá de nuevo.";
    if (/color_otro_len/.test(msg)) return "La descripción del color es muy larga — acortala e intentá de nuevo.";
    if (/nickname_len/.test(msg)) return "Tu apodo es muy largo — probá uno más corto.";
    if (/contacto_email_len/.test(msg)) return "El email de contacto es muy largo.";
    if (/contacto_whatsapp_len/.test(msg)) return "El WhatsApp de contacto es muy largo.";
    return "Algún campo supera el largo permitido — revisá los textos e intentá de nuevo.";
  }
  if (msg.includes("Failed to fetch") || err?.name === "TypeError") {
    return "No pudimos conectar con el servidor — revisá tu conexión e intentá de nuevo.";
  }
  return "Algo falló al publicar el reporte. Probá de nuevo.";
}

function Badge({ tipo }) {
  const isLost = tipo === "perdida";
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase text-white"
      style={{ background: isLost ? C.red : C.orangeInk }}
    >
      {isLost ? "Perdida" : "Encontrada"}
    </span>
  );
}

function EspecieIcon({ especie, className }) {
  if (especie === "gato") return <Cat className={className} />;
  if (especie === "perro") return <Dog className={className} />;
  return <PawPrint className={className} />;
}

function MatchScoreRing({ score, size = 64 }) {
  const pct = Math.round(score * 100);
  const label = scoreLabel(score, C);
  const circumference = 2 * Math.PI * 26;
  const offset = circumference * (1 - score);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
        <circle cx="32" cy="32" r="26" fill="none" stroke={C.border} strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r="26"
          fill="none"
          stroke={label.color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="felpus-mono text-[13px] font-bold" style={{ color: label.color }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

function ReportCard({ report, onOpenDetail, children }) {
  const resuelto = !!report.resuelto;
  return (
    <div
      className="felpus-card-hover bg-white rounded-2xl border overflow-hidden shadow-sm"
      style={{ borderColor: resuelto ? "#CFE3D6" : C.border, opacity: resuelto ? 0.75 : 1 }}
    >
      <button
        type="button"
        onClick={() => onOpenDetail && onOpenDetail(report)}
        className="flex gap-3 p-3 w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D31C22]/50 rounded-t-2xl"
      >
        <div className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={report.foto} alt={report.especie} loading="lazy" decoding="async" className="w-20 h-20 rounded-xl object-cover bg-[#F6EEE1]" />
          {!resuelto && isRecent(report) && (
            <span className="absolute -top-1 -right-1 bg-[#D31C22] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow">
              nuevo
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {resuelto ? (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase text-white"
                style={{ background: C.green }}
              >
                🎉 Reencontrada
              </span>
            ) : (
              <Badge tipo={report.tipo} />
            )}
            <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: C.muted }}>
              <EspecieIcon especie={report.especie} className="w-3.5 h-3.5" />
              {report.especie}
            </span>
          </div>
          <p className="text-sm font-semibold truncate" style={{ color: C.text }}>
            {report.nombre ? report.nombre : displayColor(report)}
            {report.nombre ? <span className="font-normal" style={{ color: C.muted }}> · {displayColor(report)}</span> : null}
          </p>
          <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: C.muted }}>
            <MapPin className="w-3 h-3" /> {report.zona} · {report.tamano}
            {report.edad ? ` · ${report.edad}` : ""}
            {report._dist != null && report._dist !== Infinity && (
              <span className="felpus-mono">· {report._dist.toFixed(1)} km de vos</span>
            )}
          </p>
          <p className="text-xs mt-1 line-clamp-2" style={{ color: C.muted }}>
            {report.descripcion}
          </p>
          {report.nickname && (
            <p className="text-[10px] mt-1" style={{ color: C.muted }}>
              reportado por {report.nickname}
            </p>
          )}
        </div>
      </button>
      {children}
    </div>
  );
}

function DetailModal({ report, onClose, onResolve, confirming, onConfirm, onCancelConfirm, isLoggedIn, isOwner, onDelete }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [generatingFlyer, setGeneratingFlyer] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    setActiveIndex(0);
    setDeleteConfirming(false);
  }, [report?.id]);
  if (!report) return null;
  const fotos = report.fotos?.length ? report.fotos : [{ url: report.foto }];
  const activeFoto = fotos[Math.min(activeIndex, fotos.length - 1)];

  async function handleDownloadFlyer() {
    setGeneratingFlyer(true);
    try {
      await downloadFlyer(report, displayColor(report));
    } catch (e) {
      console.error("No se pudo generar el flyer", e);
    } finally {
      setGeneratingFlyer(false);
    }
  }

  async function handleDeleteClick() {
    setDeleting(true);
    try {
      await onDelete(report);
    } finally {
      setDeleting(false);
    }
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={activeFoto.url} alt={report.especie} className="w-full h-56 object-cover bg-[#F6EEE1]" />
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="absolute top-3 left-3">
            {report.resuelto ? (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase text-white"
                style={{ background: C.green }}
              >
                🎉 Reencontrada
              </span>
            ) : (
              <Badge tipo={report.tipo} />
            )}
          </div>
        </div>
        {fotos.length > 1 && (
          <div className="flex gap-2 px-5 pt-3">
            {fotos.map((f, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveIndex(i)}
                className="w-14 h-14 rounded-lg overflow-hidden border-2 shrink-0"
                style={{ borderColor: i === activeIndex ? C.red : "transparent" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={`foto ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <div className="p-5 space-y-3">
          <div>
            <h3 className="felpus-display text-xl" style={{ color: C.text }}>
              {report.nombre ||
                (report.especie === "gato" ? "Gato sin nombre" : report.especie === "perro" ? "Perro sin nombre" : "Mascota sin nombre")}
            </h3>
            <p className="text-sm" style={{ color: C.muted }}>
              {displayColor(report)} · {report.tamano} · {report.especie}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-[#FBF7F0] rounded-lg p-2.5">
              <p className="text-[10px] uppercase font-bold" style={{ color: C.muted }}>Zona</p>
              <p style={{ color: C.text }}>{report.zona}</p>
            </div>
            <div className="bg-[#FBF7F0] rounded-lg p-2.5">
              <p className="text-[10px] uppercase font-bold" style={{ color: C.muted }}>Fecha</p>
              <p style={{ color: C.text }}>{formatFechaAR(report.fecha)}</p>
            </div>
            {report.sexo && (
              <div className="bg-[#FBF7F0] rounded-lg p-2.5">
                <p className="text-[10px] uppercase font-bold" style={{ color: C.muted }}>Sexo</p>
                <p style={{ color: C.text }}>{report.sexo}</p>
              </div>
            )}
            {report.edad && (
              <div className="bg-[#FBF7F0] rounded-lg p-2.5">
                <p className="text-[10px] uppercase font-bold" style={{ color: C.muted }}>Edad</p>
                <p style={{ color: C.text }}>{report.edad}</p>
              </div>
            )}
            {report.peso && (
              <div className="bg-[#FBF7F0] rounded-lg p-2.5">
                <p className="text-[10px] uppercase font-bold" style={{ color: C.muted }}>Peso</p>
                <p style={{ color: C.text }}>{report.peso}</p>
              </div>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold mb-1" style={{ color: C.muted }}>Descripción</p>
            <p className="text-sm" style={{ color: C.text }}>{report.descripcion}</p>
          </div>
          {report.nickname && <p className="text-xs" style={{ color: C.muted }}>Reportado por {report.nickname}</p>}
          {(report.contactoWhatsapp || report.contactoEmail) && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase font-bold" style={{ color: C.muted }}>Contactar</p>
              <div className="flex gap-2">
                {report.contactoWhatsapp && (
                  <a
                    href={`https://wa.me/${report.contactoWhatsapp}?text=${encodeURIComponent(
                      `Hola! Vi en Felpus tu publicación de ${report.nombre || `un/a ${report.especie}`} en ${report.zona}. Creo que puedo ayudar.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-white"
                    style={{ background: "#25D366" }}
                  >
                    <MessageCircle className="w-4 h-4" /> WhatsApp
                  </a>
                )}
                {report.contactoEmail && (
                  <a
                    href={`mailto:${report.contactoEmail}?subject=${encodeURIComponent("Sobre tu mascota en Felpus")}&body=${encodeURIComponent(
                      `Hola! Vi en Felpus tu publicación de ${report.nombre || `un/a ${report.especie}`} en ${report.zona}. Creo que puedo ayudar.`
                    )}`}
                    className="flex-1 flex items-center justify-center gap-1.5 border rounded-xl py-2.5 text-sm font-bold"
                    style={{ borderColor: C.border, color: C.text }}
                  >
                    <Mail className="w-4 h-4" /> Email
                  </a>
                )}
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <ShareButton
              report={report}
              wrapperClassName="relative flex-1"
              className="w-full flex items-center justify-center gap-1.5 border rounded-xl py-2.5 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D31C22]/50"
              style={{ borderColor: C.border, color: C.text }}
            >
              <Share2 className="w-4 h-4" /> Compartir
            </ShareButton>
            <button
              type="button"
              onClick={handleDownloadFlyer}
              disabled={generatingFlyer}
              className="flex-1 flex items-center justify-center gap-1.5 border rounded-xl py-2.5 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D31C22]/50 disabled:opacity-60"
              style={{ borderColor: C.border, color: C.text }}
            >
              {generatingFlyer ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              Flyer
            </button>
          </div>
          {!report.resuelto && (
            <div className="pt-1">
              {confirming ? (
                <div className="flex items-center gap-2 bg-[#EAF3EC] rounded-xl p-2.5">
                  <span className="text-xs flex-1" style={{ color: C.greenDark }}>¿Confirmás el reencuentro?</span>
                  <button onClick={onConfirm} className="text-xs font-bold text-white rounded-lg px-3 py-1.5" style={{ background: C.green }}>
                    Sí, confirmar
                  </button>
                  <button onClick={onCancelConfirm} className="text-xs font-semibold" style={{ color: C.muted }}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={onResolve}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-white"
                  style={{ background: isLoggedIn && isOwner ? C.green : C.ink }}
                >
                  {!isLoggedIn ? (
                    <>
                      <LogIn className="w-4 h-4" /> Iniciá sesión para confirmar
                    </>
                  ) : !isOwner ? (
                    <>
                      <Lock className="w-4 h-4" /> Solo el autor puede confirmar
                    </>
                  ) : (
                    <>
                      <PartyPopper className="w-4 h-4" /> Marcar como reencontrada
                    </>
                  )}
                </button>
              )}
            </div>
          )}
          {isOwner && (
            <div className="pt-1">
              {deleteConfirming ? (
                <div className="flex items-center gap-2 rounded-xl p-2.5" style={{ background: "#FBEAEA" }}>
                  <span className="text-xs flex-1" style={{ color: C.redDark }}>¿Eliminar esta publicación para siempre?</span>
                  <button
                    type="button"
                    onClick={handleDeleteClick}
                    disabled={deleting}
                    className="text-xs font-bold text-white rounded-lg px-3 py-1.5 disabled:opacity-60"
                    style={{ background: C.red }}
                  >
                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Sí, eliminar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirming(false)}
                    disabled={deleting}
                    className="text-xs font-semibold"
                    style={{ color: C.muted }}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setDeleteConfirming(true)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D31C22]/50 rounded-lg"
                  style={{ color: C.muted }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar publicación
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ShareButton({ report, className, style, children, wrapperClassName = "relative inline-block" }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const btnRef = useRef(null);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/?r=${encodeURIComponent(report.id)}` : "";
  const shareText = buildShareText(report);
  const MENU_WIDTH = 192; // w-48

  function toggleOpen() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        left: Math.min(Math.max(8, rect.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8),
      });
    }
    setOpen((v) => !v);
  }

  function openWindow(url) {
    window.open(url, "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className={wrapperClassName}>
      <button ref={btnRef} type="button" onClick={toggleOpen} className={className} style={style}>
        {children}
      </button>
      {open &&
        menuPos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
            <div
              className="fixed z-[71] bg-white rounded-xl border shadow-lg py-1 text-xs"
              style={{ borderColor: "#F0E7D8", top: menuPos.top, left: menuPos.left, width: MENU_WIDTH }}
            >
            <button
              onClick={() => openWindow(`https://wa.me/?text=${encodeURIComponent(shareText)}`)}
              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[#FBF7F0] font-semibold"
              style={{ color: C.text }}
            >
              <Share2 className="w-3.5 h-3.5" /> WhatsApp
            </button>
            <button
              onClick={() =>
                openWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`)
              }
              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[#FBF7F0] font-semibold"
              style={{ color: C.text }}
            >
              <Facebook className="w-3.5 h-3.5" /> Facebook
            </button>
            <button
              onClick={() =>
                openWindow(
                  `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`
                )
              }
              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[#FBF7F0] font-semibold"
              style={{ color: C.text }}
            >
              <Twitter className="w-3.5 h-3.5" /> X / Twitter
            </button>
            <button
              onClick={copyLink}
              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[#FBF7F0] font-semibold"
              style={{ color: copied ? C.green : C.text }}
            >
              <Copy className="w-3.5 h-3.5" /> {copied ? "¡Copiado!" : "Copiar enlace"}
            </button>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

function ToastStack({ toasts }) {
  return (
    <div className="fixed bottom-20 sm:bottom-6 left-0 right-0 flex flex-col items-center gap-2 px-4 z-50 pointer-events-none">
      {toasts.map((t) => {
        const pointsMatch = t.message.match(/\+\d+ (puntos|pts)/);
        return (
          <div
            key={t.id}
            className="felpus-toast flex items-center gap-2 text-sm font-semibold rounded-xl px-4 py-3 shadow-lg max-w-md text-white"
            style={{ background: t.type === "error" ? C.redDark : C.ink }}
          >
            {t.type === "error" ? <AlertCircle className="w-4 h-4 shrink-0" /> : <PartyPopper className="w-4 h-4 shrink-0" />}
            <span>
              {pointsMatch ? (
                <>
                  {t.message.slice(0, pointsMatch.index)}
                  <span className="felpus-points-pop font-extrabold" style={{ color: C.orange }}>
                    {pointsMatch[0]}
                  </span>
                  {t.message.slice(pointsMatch.index + pointsMatch[0].length)}
                </>
              ) : (
                t.message
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border p-3 flex gap-3 animate-pulse" style={{ borderColor: C.border }}>
      <div className="w-20 h-20 rounded-xl bg-[#F0E7D8] shrink-0" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-4 w-20 rounded-full bg-[#F0E7D8]" />
        <div className="h-3 w-2/3 rounded bg-[#F0E7D8]" />
        <div className="h-3 w-1/2 rounded bg-[#F0E7D8]" />
        <div className="h-3 w-full rounded bg-[#F0E7D8]" />
      </div>
    </div>
  );
}

function SkeletonRankRow() {
  return (
    <div className="flex items-center gap-3 bg-white rounded-xl p-3 border animate-pulse" style={{ borderColor: C.border }}>
      <div className="w-6 h-4 rounded bg-[#F0E7D8] shrink-0" />
      <div className="w-9 h-9 rounded-full bg-[#F0E7D8] shrink-0" />
      <div className="flex-1 space-y-2 py-0.5">
        <div className="h-3.5 w-1/3 rounded bg-[#F0E7D8]" />
        <div className="h-2.5 w-1/2 rounded bg-[#F0E7D8]" />
      </div>
      <div className="h-4 w-8 rounded bg-[#F0E7D8] shrink-0" />
    </div>
  );
}

// Bottom sheet de filtros avanzados de Explorar — desliza desde abajo en vez
// de expandir inline, como en apps mobile premium (Airbnb, Booking). Se
// mantiene el mismo patrón visual que ya usa DetailModal (rounded-t-3xl,
// items-end en mobile / centrado en desktop).
function FilterSheet({
  open,
  onClose,
  filterTamano,
  setFilterTamano,
  filterColor,
  setFilterColor,
  filterFecha,
  setFilterFecha,
  filterRadioKm,
  setFilterRadioKm,
  myLocation,
  locatingMe,
  handleLocateMe,
  hasAdvancedFilters,
  resultCount,
}) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center felpus-sheet-backdrop"
      onClick={onClose}
    >
      <div
        className="felpus-sheet-panel bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-4 pt-4 pb-3 border-b" style={{ borderColor: C.border }}>
          <h3 className="felpus-display text-lg" style={{ color: C.text }}>Filtros avanzados</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar filtros" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F6F1E7" }}>
            <X className="w-4 h-4" style={{ color: C.text }} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            <select
              value={filterTamano}
              onChange={(e) => setFilterTamano(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white"
              style={{ borderColor: C.border, color: C.text }}
            >
              <option value="todos">Cualquier tamaño</option>
              <option value="chico">Chico</option>
              <option value="mediano">Mediano</option>
              <option value="grande">Grande</option>
            </select>
            <select
              value={filterColor}
              onChange={(e) => setFilterColor(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white"
              style={{ borderColor: C.border, color: C.text }}
            >
              <option value="todos">Cualquier color</option>
              {COLOR_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-[11px] font-semibold mb-1.5" style={{ color: C.muted }}>Antigüedad</p>
            <div className="flex gap-1.5 flex-wrap">
              {[
                { id: "todos", label: "Cualquiera" },
                { id: "24h", label: "Últimas 24h" },
                { id: "7d", label: "Última semana" },
                { id: "30d", label: "Último mes" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFilterFecha(opt.id)}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold border"
                  style={
                    filterFecha === opt.id
                      ? { background: C.ink, color: "#fff", borderColor: C.ink }
                      : { color: C.muted, borderColor: C.border, background: "#fff" }
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold mb-1.5" style={{ color: C.muted }}>Radio de distancia</p>
            <select
              value={filterRadioKm ?? "todos"}
              onChange={(e) => {
                const val = e.target.value === "todos" ? null : Number(e.target.value);
                if (val != null && !myLocation) handleLocateMe();
                setFilterRadioKm(val);
              }}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              style={{ borderColor: C.border, color: C.text }}
            >
              <option value="todos">Cualquier distancia</option>
              <option value="2">Hasta 2 km</option>
              <option value="5">Hasta 5 km</option>
              <option value="10">Hasta 10 km</option>
              <option value="25">Hasta 25 km</option>
            </select>
            {filterRadioKm != null && !myLocation && (
              <p className="text-[11px] mt-1" style={{ color: C.muted }}>
                {locatingMe ? "Buscando tu ubicación..." : "Necesitamos tu ubicación para poder filtrar por distancia."}
              </p>
            )}
            <p className="text-[11px] mt-1" style={{ color: C.muted }}>
              Esto solo filtra la lista — el % de coincidencia de cada reporte ya tolera más distancia
              cuanto más tiempo pasó, porque una mascota perdida hace días pudo alejarse más.
            </p>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t p-3 flex items-center gap-2" style={{ borderColor: C.border }}>
          {hasAdvancedFilters && (
            <button
              type="button"
              onClick={() => {
                setFilterTamano("todos");
                setFilterColor("todos");
                setFilterFecha("todos");
                setFilterRadioKm(null);
              }}
              className="text-xs font-bold px-3 py-2.5"
              style={{ color: C.red }}
            >
              Limpiar filtros
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white"
            style={{ background: C.ink }}
          >
            Ver {resultCount} {resultCount === 1 ? "resultado" : "resultados"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function FelpusMatcher() {
  const [activeTab, setActiveTab] = useState("inicio");
  const [reportKind, setReportKind] = useState("perdida");
  const [form, setForm] = useState(emptyForm());
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [matchResult, setMatchResult] = useState(null);
  const [geoStatus, setGeoStatus] = useState("idle");
  const [filterTipo, setFilterTipo] = useState("todos");
  const [filterEspecie, setFilterEspecie] = useState("todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTamano, setFilterTamano] = useState("todos");
  const [filterColor, setFilterColor] = useState("todos");
  const [filterFecha, setFilterFecha] = useState("todos");
  const [filterRadioKm, setFilterRadioKm] = useState(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [exploreView, setExploreView] = useState("lista");
  const [heartedIds, setHeartedIds] = useState([]);
  const [poppingHeartId, setPoppingHeartId] = useState(null);
  const [matchesSeenAt, setMatchesSeenAt] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("felpus_hearted_ids") || "[]");
      if (Array.isArray(saved)) setHeartedIds(saved);
    } catch {
      // localStorage no disponible o corrupto — no es bloqueante
    }
  }, []);
  const [expandedCard, setExpandedCard] = useState(null);
  const [cardMatches, setCardMatches] = useState({});
  const [formError, setFormError] = useState("");
  const [visionStatus, setVisionStatus] = useState("idle"); // idle | analyzing | ai | basic
  const [nickname, setNickname] = useState("");
  const [leaderboard, setLeaderboard] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [showResueltas, setShowResueltas] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [detailReport, setDetailReport] = useState(null);
  const [sortBy, setSortBy] = useState("recientes");
  const [myLocation, setMyLocation] = useState(null);
  const [locatingMe, setLocatingMe] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const fileInputRef = useRef(null);
  const deepLinkHandled = useRef(false);

  const pushToast = useCallback((type, message) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  // Escape cierra el overlay que esté abierto, de más encima a menos: el
  // modal de detalle de un reporte, el panel de notificaciones, y por
  // último el bottom sheet de filtros — accesibilidad básica de teclado
  // que faltaba en todos los overlays de la app.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== "Escape") return;
      if (detailReport) {
        setDetailReport(null);
        setConfirmingId(null);
      } else if (notifOpen) {
        setNotifOpen(false);
      } else if (showAdvancedFilters) {
        setShowAdvancedFilters(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailReport, notifOpen, showAdvancedFilters]);

  // Sesión con Google (opcional). Sin login, se puede seguir aportando
  // como invitado escribiendo un apodo a mano.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Racha de días consecutivos: se actualiza una vez por sesión apenas hay
  // un usuario logueado (bumpStreak es idempotente si "hoy" ya se contó).
  // Es la mecánica de retención más emblemática de apps tipo Duolingo —
  // "no quiero perder mi racha" trae de vuelta todos los días.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    bumpStreak(user.id, user.user_metadata?.full_name || user.user_metadata?.name || user.email)
      .then((res) => {
        if (!res || cancelled) return;
        setMyRank((prev) => (prev ? { ...prev, streak_days: res.streakDays } : prev));
        if (res.isNewToday && res.streakDays > 1) {
          pushToast("success", `🔥 ¡Racha de ${res.streakDays} días seguidos ayudando!`);
        }
      })
      .catch((e) => console.error("No se pudo actualizar la racha diaria", e));
    return () => {
      cancelled = true;
    };
  }, [user, pushToast]);

  // Cuándo fue la última vez que este usuario revisó sus propias
  // coincidencias — se usa para saber qué mostrar como "novedad" en la
  // campanita, sin necesitar un sistema de notificaciones push/email real.
  useEffect(() => {
    if (!user) {
      setMatchesSeenAt(0);
      return;
    }
    try {
      const saved = Number(localStorage.getItem(`felpus_last_seen_matches_${user.id}`)) || 0;
      setMatchesSeenAt(saved);
    } catch {
      // localStorage no disponible — no es bloqueante, simplemente no hay "vistos"
    }
  }, [user]);

  function markMatchesSeen() {
    if (!user) return;
    const now = Date.now();
    setMatchesSeenAt(now);
    try {
      localStorage.setItem(`felpus_last_seen_matches_${user.id}`, String(now));
    } catch {
      // no bloqueante
    }
  }

  // Coincidencias nuevas desde la última visita: para cada reporte propio
  // activo, busca su mejor candidato nuevo (creado después del último
  // "visto") con score suficiente. Antes esto solo contaba un número y
  // mandaba a Explorar a ciegas — ahora la campanita puede mostrar
  // directamente CUÁL reporte tuyo tiene una coincidencia nueva y con qué,
  // para poder ir directo al detalle en vez de tener que buscarlo.
  const newMatchItems = useMemo(() => {
    if (!user) return [];
    const myActive = reports.filter((r) => r.userId === user.id && !r.resuelto);
    if (myActive.length === 0) return [];
    const items = [];
    for (const mine of myActive) {
      const opposite = mine.tipo === "perdida" ? "encontrada" : "perdida";
      const candidates = reports.filter((r) => r.tipo === opposite && !r.resuelto && r.creadoEn > matchesSeenAt);
      const scored = candidates
        .map((c) => ({ candidate: c, score: scoreMatch(mine, c).score }))
        .filter((m) => m.score >= SCORE_MINIMO)
        .sort((a, b) => b.score - a.score);
      if (scored.length > 0) {
        items.push({ mine, best: scored[0].candidate, score: scored[0].score, extraCount: scored.length - 1 });
      }
    }
    return items;
  }, [reports, user, matchesSeenAt]);
  const newMatchesCount = newMatchItems.length;

  // Checklist de campos clave del formulario de reporte, en el mismo orden
  // en que handleSubmit los valida — sirve para la barra de progreso que
  // motiva a completar todo antes de publicar (menos fricción, más feedback
  // inmediato, en línea con la filosofía de gamificación del proyecto).
  const reportChecklist = useMemo(() => {
    const whatsappDigits = sanitizePhoneForWhatsapp(form.contactoWhatsapp);
    const colorOk = form.color.trim() && (form.color !== "Otro color" || form.colorOtro.trim());
    return [
      { id: "apodo", label: "Apodo", done: !!nickname.trim() },
      { id: "fotos", label: "Foto", done: form.fotos.length > 0 },
      { id: "zona", label: "Zona", done: !!form.zona.trim() },
      { id: "color", label: "Color", done: !!colorOk },
      { id: "descripcion", label: "Descripción", done: !!form.descripcion.trim() },
      { id: "sexo", label: "Sexo", done: !!form.sexo },
      { id: "contacto", label: "Contacto", done: !!whatsappDigits || !!form.contactoEmail.trim() },
    ];
  }, [nickname, form.fotos.length, form.zona, form.color, form.colorOtro, form.descripcion, form.sexo, form.contactoWhatsapp, form.contactoEmail]);
  const reportProgressDone = reportChecklist.filter((s) => s.done).length;
  const reportProgressPct = Math.round((reportProgressDone / reportChecklist.length) * 100);

  const googleDisplayName =
    user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || null;
  const googleAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  useEffect(() => {
    if (googleDisplayName) setNickname(googleDisplayName);
  }, [googleDisplayName]);

  async function handleGoogleLogin() {
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
      });
    } catch (e) {
      console.error(e);
      pushToast("error", "No pudimos abrir el inicio de sesión con Google.");
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setNickname("");
  }

  // Cambiar de pestaña siempre vuelve al tope — si no, se entra a una vista
  // nueva ya scrolleada a la mitad porque quedó así en la pestaña anterior.
  const goToTab = useCallback((tabId) => {
    setActiveTab(tabId);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const loadLeaderboard = useCallback(async () => {
    try {
      const items = await fetchLeaderboard();
      setLeaderboard(items);
    } catch (e) {
      console.error("No se pudo cargar el ranking", e);
    }
    // La posición propia se busca aparte porque el leaderboard general solo
    // trae el top 10 — si no estás ahí, igual queremos saber tu puesto real.
    if (user) {
      try {
        const rank = await fetchMyRank(user.id);
        setMyRank(rank);
      } catch (e) {
        console.error("No se pudo cargar tu posición en el ranking", e);
      }
    } else {
      setMyRank(null);
    }
  }, [user]);

  const loadAll = useCallback(async () => {
    setLoadingReports(true);
    try {
      await seedIfEmpty();
      const items = await fetchReports();
      setReports(items);
      await loadLeaderboard();
    } catch (e) {
      console.error("No se pudieron cargar los reportes", e);
      pushToast("error", "No pudimos conectar con la base de datos. Revisá tu configuración de Supabase.");
    } finally {
      setLoadingReports(false);
    }
  }, [loadLeaderboard, pushToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Deep link desde un flyer/QR o un enlace compartido (?r=<id>) — abre esa
  // publicación directamente apenas cargan los reportes. Solo una vez: si el
  // usuario cierra el modal, no debe reabrirse solo en el próximo refresh.
  useEffect(() => {
    if (deepLinkHandled.current || reports.length === 0) return;
    deepLinkHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const rid = params.get("r");
    if (!rid) return;
    const found = reports.find((r) => r.id === rid);
    if (found) {
      setDetailReport(found);
      goToTab("explorar");
    }
  }, [reports, goToTab]);

  // Confirmar un reencuentro requiere sesión con Google (evita que cualquiera
  // se autoasigne puntos con un apodo de texto libre) Y ser quien publicó ese
  // reporte específico (evita que un tercero resuelva el reporte de otra
  // persona). Cada reporte solo lo puede marcar como reencontrado su propio
  // autor.
  function handleConfirmTrigger(ownerReport, toggleId = ownerReport?.id) {
    if (!user) {
      pushToast("error", "Iniciá sesión con Google para confirmar reencuentros y sumar puntos.");
      handleGoogleLogin();
      return;
    }
    if (ownerReport.userId !== user.id) {
      pushToast("error", "Solo quien publicó este reporte puede marcarlo como reencontrado.");
      return;
    }
    setConfirmingId(toggleId);
  }

  // Mandar un corazón es un gesto de "gracias" entre colaboradores — pide
  // login (mismo motivo que los puntos: evita spam anónimo) y queda
  // recordado en este navegador para no poder mandar 10 seguidos a la misma
  // persona.
  async function handleSendHeart(contributor) {
    if (!user) {
      pushToast("error", "Iniciá sesión con Google para mandar corazones.");
      handleGoogleLogin();
      return;
    }
    if (heartedIds.includes(contributor.id)) return;
    try {
      playTap();
      setPoppingHeartId(contributor.id);
      setTimeout(() => setPoppingHeartId((prev) => (prev === contributor.id ? null : prev)), 450);
      const nextHearts = await sendHeart(contributor.id);
      setLeaderboard((prev) => prev.map((u) => (u.id === contributor.id ? { ...u, hearts: nextHearts } : u)));
      const updated = [...heartedIds, contributor.id];
      setHeartedIds(updated);
      localStorage.setItem("felpus_hearted_ids", JSON.stringify(updated));
    } catch (e) {
      console.error(e);
      pushToast("error", "No pudimos enviar el corazón. Probá de nuevo.");
    }
  }

  function confirmButtonContent(report, ownedLabel) {
    if (!user) {
      return (
        <>
          <LogIn className="w-3.5 h-3.5" /> Iniciá sesión para confirmar
        </>
      );
    }
    if (report.userId !== user.id) {
      return (
        <>
          <Lock className="w-3.5 h-3.5" /> Solo el autor puede confirmar
        </>
      );
    }
    return (
      <>
        <PartyPopper className="w-3.5 h-3.5" /> {ownedLabel}
      </>
    );
  }

  async function markResolvedAndReward({ repObjs, bonusFor = [] }) {
    if (!user) {
      pushToast("error", "Iniciá sesión con Google para confirmar reencuentros y sumar puntos.");
      return;
    }
    const ownedRepObjs = repObjs.filter((r) => r.userId === user.id);
    if (ownedRepObjs.length === 0) {
      pushToast("error", "Solo quien publicó este reporte puede marcarlo como reencontrado.");
      setConfirmingId(null);
      return;
    }
    const resolverDisplayName = googleDisplayName || user.email || "Colaborador";
    try {
      const ids = ownedRepObjs.map((r) => r.id);
      await resolveReports(ids, user.id, resolverDisplayName);

      const updatedList = ownedRepObjs.map((r) => ({
        ...r,
        resuelto: true,
        resueltoPor: resolverDisplayName,
        resueltoPorUserId: user.id,
        // resolveReports() ya borró estos dos campos en la base (ver
        // src/lib/store.js) — se reflejan acá también para que el estado en
        // memoria no muestre datos de contacto que ya no existen del lado
        // del servidor.
        contactoWhatsapp: "",
        contactoEmail: "",
      }));
      setReports((prev) => {
        const map = new Map(prev.map((r) => [r.id, r]));
        updatedList.forEach((u) => map.set(u.id, u));
        return Array.from(map.values());
      });
      setMatchResult((prev) => {
        if (!prev) return prev;
        const map = new Map(updatedList.map((u) => [u.id, u]));
        const source = map.get(prev.source.id) || prev.source;
        const results = prev.results.map((r) => (map.has(r.report.id) ? { ...r, report: map.get(r.report.id) } : r));
        return { ...prev, source, results };
      });
      setDetailReport((prev) => {
        if (!prev) return prev;
        const updated = updatedList.find((u) => u.id === prev.id);
        return updated || prev;
      });

      await awardPointsRemote(user.id, resolverDisplayName, PUNTOS_REENCUENTRO, "reencuentro");
      const seenBonusIds = new Set();
      for (const b of bonusFor) {
        if (!b?.userId || b.userId === user.id || seenBonusIds.has(b.userId)) continue;
        seenBonusIds.add(b.userId);
        await awardPointsRemote(b.userId, b.displayName, PUNTOS_BONO_ORIGINAL, "bono-reporte-original");
      }
      await loadLeaderboard();
      setConfirmingId(null);
      playSuccess();
      pushToast("success", `🎉 ¡Gracias ${resolverDisplayName}! +${PUNTOS_REENCUENTRO} puntos por confirmar el reencuentro.`);
    } catch (e) {
      console.error(e);
      pushToast("error", "No pudimos guardar el reencuentro. Probá de nuevo.");
    }
  }

  // Eliminar la propia publicación (fila + fotos de Storage). No toca los
  // puntos ya ganados en contributors — restarlos retroactivamente abriría
  // más preguntas de las que resuelve (¿y si ya se reencontró de verdad y
  // solo borra la publicación para limpiar?).
  async function handleDeleteReport(report) {
    if (!user || report.userId !== user.id) {
      pushToast("error", "Solo quien publicó este reporte puede eliminarlo.");
      return;
    }
    try {
      const fotoUrls = (report.fotos?.length ? report.fotos : [{ url: report.foto }]).map((f) => f.url);
      await deleteReport(report.id, user.id, fotoUrls);
      setReports((prev) => prev.filter((r) => r.id !== report.id));
      setDetailReport(null);
      pushToast("success", "Publicación eliminada.");
    } catch (e) {
      console.error(e);
      pushToast("error", "No pudimos eliminar la publicación. Probá de nuevo.");
    }
  }

  async function handleAddPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || form.fotos.length >= MAX_FOTOS) return;
    if (!file.type.startsWith("image/")) {
      setFormError("Ese archivo no es una imagen.");
      return;
    }
    if (file.size > MAX_FOTO_MB * 1024 * 1024) {
      setFormError(`La foto pesa demasiado — subí una de menos de ${MAX_FOTO_MB}MB.`);
      return;
    }
    const idx = form.fotos.length;
    try {
      const dataUrl = await resizeImageFile(file);
      const hist = await computeHistogram(dataUrl);
      setForm((f) => ({ ...f, fotos: [...f.fotos, { dataUrl, hist, embedding: null }] }));
      setVisionStatus("analyzing");
      const embedding = await getImageEmbedding(dataUrl);
      setForm((f) => {
        const fotos = [...f.fotos];
        if (fotos[idx]) fotos[idx] = { ...fotos[idx], embedding };
        return { ...f, fotos };
      });
      setVisionStatus(embedding ? "ai" : "basic");
    } catch (err) {
      console.error(err);
      setFormError("No pudimos procesar esa imagen. Probá con otra foto.");
      setVisionStatus("idle");
    }
  }

  function handleRemovePhoto(index) {
    setForm((f) => ({ ...f, fotos: f.fotos.filter((_, i) => i !== index) }));
  }

  // Nota: este campo usaba antes google.maps.places.Autocomplete (legacy)
  // para sugerir zonas mientras se escribe. Se sacó por completo — Google
  // dejó de habilitar esa API a proyectos nuevos desde marzo 2025, y cuando
  // no está disponible, la falla de autenticación se lleva puesta toda la
  // sesión de Maps compartida (rompía el mapa de abajo apenas se tipeaba
  // acá, aunque el mapa en sí no tenía ningún problema). El campo sigue
  // funcionando 100% escribiendo a mano, con el botón "Ubicación", o
  // tocando el pin en el mapa. Si algún día se quiere retomar el
  // autocompletado, la reemplazante oficial es
  // google.maps.places.PlaceAutocompleteElement (API nueva, requiere
  // habilitar "Places API (New)" en Google Cloud y un componente propio,
  // no un simple input).

  function handleUseLocation() {
    if (!navigator.geolocation) {
      setGeoStatus("error");
      return;
    }
    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, lat: pos.coords.latitude, lng: pos.coords.longitude }));
        setGeoStatus("done");
      },
      () => setGeoStatus("error"),
      { timeout: 8000 }
    );
  }

  function handleLocateMe() {
    if (!navigator.geolocation) {
      pushToast("error", "Tu navegador no permite acceder a la ubicación.");
      return;
    }
    setLocatingMe(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSortBy("cercania");
        setLocatingMe(false);
      },
      () => {
        setLocatingMe(false);
        pushToast("error", "No pudimos acceder a tu ubicación.");
      },
      { timeout: 8000 }
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    if (!nickname.trim()) {
      setFormError("Escribí tu apodo arriba — así te reconocemos por ayudar.");
      return;
    }
    if (form.fotos.length === 0) {
      setFormError("Subí al menos una foto de la mascota para poder buscar coincidencias.");
      return;
    }
    if (!form.zona.trim() || !form.descripcion.trim() || !form.color.trim()) {
      setFormError("Completá zona, color y descripción — son clave para el matching.");
      return;
    }
    if (!form.sexo) {
      setFormError("Elegí el sexo de la mascota (o \"No sé\" si no lo sabés).");
      return;
    }
    const whatsappDigits = sanitizePhoneForWhatsapp(form.contactoWhatsapp);
    if (!whatsappDigits && !form.contactoEmail.trim()) {
      setFormError("Dejá un WhatsApp o un email de contacto — así pueden avisarte si la reconocen.");
      return;
    }
    if (form.contactoWhatsapp.trim() && whatsappDigits.length < 8) {
      setFormError("Ese WhatsApp no parece completo — incluí el código de país y de área.");
      return;
    }
    if (form.contactoEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactoEmail.trim())) {
      setFormError("Revisá el email de contacto, no parece válido.");
      return;
    }
    if (form.color === "Otro color" && !form.colorOtro.trim()) {
      setFormError("Contanos qué color tiene, ya que elegiste \"Otro color\".");
      return;
    }
    playTap();
    setSubmitting(true);
    try {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const draft = {
        id,
        tipo: reportKind,
        especie: form.especie,
        nombre: form.nombre.trim(),
        color: form.color.trim(),
        colorOtro: form.colorOtro.trim(),
        tamano: form.tamano,
        sexo: form.sexo,
        edad: form.edad,
        peso: form.peso,
        zona: form.zona.trim(),
        lat: form.lat,
        lng: form.lng,
        fecha: form.fecha,
        descripcion: form.descripcion.trim(),
        contactoWhatsapp: whatsappDigits,
        contactoEmail: form.contactoEmail.trim(),
        fotos: form.fotos,
        nickname: nickname.trim(),
        userId: user?.id || null,
        resuelto: false,
        creadoEn: Date.now(),
      };

      const opposite = reportKind === "perdida" ? "encontrada" : "perdida";
      const candidates = reports.filter((r) => r.tipo === opposite && !r.resuelto);

      goToTab("resultado");
      setScanning(true);
      setMatchResult(null);

      const savedReport = await createReport(draft);
      await new Promise((r) => setTimeout(r, 900));

      const scored = candidates
        .map((c) => ({ report: c, ...scoreMatch(savedReport, c) }))
        .filter((m) => m.score >= SCORE_MINIMO)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);

      setMatchResult({ source: savedReport, results: scored, hadCandidates: candidates.length > 0 });
      setReports((prev) => [savedReport, ...prev]);
      playSuccess();
      if (user) {
        await awardPointsRemote(
          user.id,
          googleDisplayName || user.email,
          reportKind === "perdida" ? PUNTOS_PERDIDA : PUNTOS_ENCONTRADA,
          "reporte"
        );
        await loadLeaderboard();
      } else {
        pushToast("success", "Reporte publicado. Iniciá sesión con Google para sumar puntos por tus aportes.");
      }
      setForm(emptyForm());
      setGeoStatus("idle");
      setVisionStatus("idle");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      console.error(err);
      setFormError(describeSubmitError(err));
      goToTab("reportar");
    } finally {
      setScanning(false);
      setSubmitting(false);
    }
  }

  async function toggleCardMatches(report) {
    if (expandedCard === report.id) {
      setExpandedCard(null);
      return;
    }
    setExpandedCard(report.id);
    if (cardMatches[report.id]) return;
    const opposite = report.tipo === "perdida" ? "encontrada" : "perdida";
    const candidates = reports.filter((r) => r.id !== report.id && r.tipo === opposite && !r.resuelto);
    const scored = candidates
      .map((c) => ({ report: c, ...scoreMatch(report, c) }))
      .filter((m) => m.score >= SCORE_MINIMO)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    setCardMatches((prev) => ({ ...prev, [report.id]: scored }));
  }

  const FECHA_LIMITES_MS = { "24h": 24 * 3600 * 1000, "7d": 7 * 24 * 3600 * 1000, "30d": 30 * 24 * 3600 * 1000 };
  const normalizedQuery = normalizeText(searchQuery).trim();
  const hasAdvancedFilters =
    filterTamano !== "todos" || filterColor !== "todos" || filterFecha !== "todos" || filterRadioKm != null;

  const activeReports = reports.filter((r) => !r.resuelto);
  const resueltas = reports.filter((r) => r.resuelto);
  const happyReunions = [...resueltas]
    .sort((a, b) => (b.resueltoEn || b.creadoEn) - (a.resueltoEn || a.creadoEn))
    .slice(0, 10);
  let filteredReports = activeReports.filter((r) => {
    if (filterTipo !== "todos" && r.tipo !== filterTipo) return false;
    if (filterEspecie !== "todos" && r.especie !== filterEspecie) return false;
    if (filterTamano !== "todos" && r.tamano !== filterTamano) return false;
    if (filterColor !== "todos" && r.color !== filterColor) return false;
    if (filterFecha !== "todos" && Date.now() - r.creadoEn > FECHA_LIMITES_MS[filterFecha]) return false;
    if (normalizedQuery) {
      const haystack = normalizeText(
        [r.zona, r.nombre, r.color, r.colorOtro, r.descripcion].filter(Boolean).join(" ")
      );
      if (!haystack.includes(normalizedQuery)) return false;
    }
    return true;
  });

  if (myLocation) {
    filteredReports = filteredReports.map((r) => ({
      ...r,
      _dist: r.lat != null && r.lng != null ? haversineKm(myLocation.lat, myLocation.lng, r.lat, r.lng) : Infinity,
    }));
  }
  if (filterRadioKm != null && myLocation) {
    filteredReports = filteredReports.filter((r) => r._dist <= filterRadioKm);
  }
  if (sortBy === "cercania" && myLocation) {
    filteredReports = [...filteredReports].sort((a, b) => a._dist - b._dist);
  } else {
    filteredReports = [...filteredReports].sort((a, b) => b.creadoEn - a.creadoEn);
  }

  const myTier = getTier(myRank?.points || 0, C);

  const NAV_ITEMS = [
    { id: "inicio", label: "Inicio", icon: Home },
    { id: "explorar", label: "Explorar", icon: Search },
    { id: "reportar", label: "Reportar", icon: Plus, primary: true },
    { id: "ranking", label: "Colaboradores", icon: Crown },
  ];

  return (
    <div className="min-h-screen w-full" style={{ background: C.cream, fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header — fondo claro con el rojo reservado a acentos puntuales, para
          que el beige tenga más protagonismo y el rojo destaque donde importa
          (las llamadas a la acción), no como color de fondo de la barra. */}
      <header className="bg-white border-b" style={{ borderColor: C.border }}>
        <div className="max-w-2xl mx-auto px-4 pt-5 pb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => goToTab("inicio")}
            className="flex items-center gap-2.5 text-left min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D31C22]/40 rounded-lg"
          >
            <div className="min-w-0">
              <h1 className="sr-only">Felpus</h1>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO_RED} alt="Felpus" className="h-9 w-auto object-contain" />
              <p className="hidden sm:block text-[11px] mt-0.5 truncate" style={{ color: C.muted }}>
                Buscador inteligente de mascotas perdidas y encontradas
              </p>
            </div>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            {user && (
              <div className="relative">
                <button
                  onClick={() => {
                    playTap();
                    setNotifOpen((v) => !v);
                  }}
                  aria-label={
                    newMatchesCount > 0
                      ? `${newMatchesCount} coincidencias nuevas desde tu última visita`
                      : "Sin coincidencias nuevas"
                  }
                  className="relative w-8 h-8 rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D31C22]/40"
                  style={{ background: C.cream }}
                >
                  <Bell className="w-4 h-4" style={{ color: C.red }} />
                  {newMatchesCount > 0 && (
                    <span
                      className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                      style={{ background: C.orangeInk }}
                    >
                      {newMatchesCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <>
                    <button
                      type="button"
                      aria-label="Cerrar notificaciones"
                      onClick={() => setNotifOpen(false)}
                      className="fixed inset-0 z-[65] cursor-default"
                    />
                    <div
                      className="absolute right-0 top-full mt-2 w-72 max-h-[70vh] overflow-y-auto bg-white rounded-2xl border shadow-lg z-[66] text-left"
                      style={{ borderColor: C.border }}
                    >
                      <div className="px-3.5 pt-3 pb-2 border-b" style={{ borderColor: C.border }}>
                        <p className="text-sm font-bold" style={{ color: C.text }}>Coincidencias nuevas</p>
                      </div>
                      {newMatchItems.length === 0 ? (
                        <p className="px-3.5 py-4 text-xs" style={{ color: C.muted }}>
                          Todavía no hay coincidencias nuevas para tus reportes. Te avisamos acá apenas aparezca alguna.
                        </p>
                      ) : (
                        <div className="py-1">
                          {newMatchItems.map(({ mine, best, score, extraCount }) => (
                            <button
                              key={mine.id}
                              type="button"
                              onClick={() => {
                                playTap();
                                setNotifOpen(false);
                                markMatchesSeen();
                                setDetailReport(best);
                              }}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-[#FBF7F0] focus:outline-none focus-visible:bg-[#FBF7F0]"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={best.foto} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0 bg-[#F0E7D8]" />
                              <span className="flex-1 min-w-0">
                                <span className="block text-xs font-bold truncate" style={{ color: C.text }}>
                                  Tu {mine.tipo === "perdida" ? "reporte de perdida" : "reporte de encontrada"}
                                  {mine.nombre ? ` (${mine.nombre})` : ""}
                                </span>
                                <span className="block text-[11px] truncate" style={{ color: C.muted }}>
                                  Coincide con {best.nombre || best.especie} · {Math.round(score * 100)}%
                                  {extraCount > 0 ? ` · +${extraCount} más` : ""}
                                </span>
                              </span>
                              <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: C.muted }} />
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          playTap();
                          setNotifOpen(false);
                          goToTab("explorar");
                          markMatchesSeen();
                        }}
                        className="w-full text-center text-xs font-bold py-2.5 border-t"
                        style={{ color: C.red, borderColor: C.border }}
                      >
                        Ver todo en Explorar
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              onClick={() => goToTab("explorar")}
              className="felpus-mono text-[11px] font-bold text-white rounded-full px-3 py-1.5 whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D31C22]/40"
              style={{ background: C.red }}
            >
              {activeReports.length} mascotas
            </button>
          </div>
        </div>
      </header>

      {/* Identificación del contribuyente — tarjeta propia, no un buscador:
          ícono en placa circular + micro-label arriba dejan claro que esto
          identifica a la persona, no busca nada. */}
      <div className="max-w-2xl mx-auto px-4 pt-3 space-y-2">
        <div className="flex items-center gap-2.5 bg-white rounded-xl border px-3 py-2.5 shadow-sm" style={{ borderColor: C.border }}>
          {user ? (
            <>
              {googleAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={googleAvatar} alt="" className="w-8 h-8 rounded-full shrink-0" referrerPolicy="no-referrer" />
              ) : (
                <span
                  className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: C.red }}
                >
                  {(googleDisplayName || "?").charAt(0).toUpperCase()}
                </span>
              )}
              <span className="flex-1 min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>
                  Colaborador
                </span>
                <span className="block text-sm font-semibold truncate" style={{ color: C.text }}>
                  {googleDisplayName}
                </span>
              </span>
            </>
          ) : (
            <>
              <span
                className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center"
                style={{ background: C.cream }}
              >
                <PawPrint className="w-4 h-4" style={{ color: C.red }} fill="currentColor" strokeWidth={1.5} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>
                  Elegí un apodo
                </span>
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={40}
                  placeholder="Para sumar puntos como colaborador"
                  className="block w-full text-sm font-semibold outline-none bg-transparent min-w-0"
                  style={{ color: C.text }}
                />
              </span>
            </>
          )}
          {!!myRank?.streak_days && (
            <span
              className="felpus-mono text-[10px] font-bold shrink-0 px-2 py-1 rounded-full flex items-center gap-0.5"
              style={{ color: C.orangeInkDark, background: "#FBE4DC" }}
              title={`Racha de ${myRank.streak_days} ${myRank.streak_days === 1 ? "día" : "días"} seguidos`}
            >
              <Flame className="w-3 h-3" fill="currentColor" /> {myRank.streak_days}
            </span>
          )}
          {nickname.trim() && (
            <span
              className="felpus-mono text-[10px] font-bold shrink-0 px-2 py-1 rounded-full"
              style={{ color: myTier.color, background: `${myTier.color}1A` }}
            >
              {myRank?.points || 0} pts · {myTier.label}
            </span>
          )}
          {!authLoading && (
            <button
              onClick={user ? handleLogout : handleGoogleLogin}
              className="shrink-0 flex items-center gap-1 text-[11px] font-bold px-2 py-1.5 rounded-lg border"
              style={{ borderColor: C.border, color: C.muted }}
            >
              {user ? <LogOut className="w-3.5 h-3.5" /> : <LogIn className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
        {!user && (
          <p className="text-[10px] px-1" style={{ color: C.muted }}>
            Podés reportar mascotas como invitado con solo un apodo, pero para sumar puntos y confirmar
            reencuentros necesitás{" "}
            <button onClick={handleGoogleLogin} className="font-bold underline" style={{ color: C.text }}>
              iniciar sesión con Google
            </button>
            .
          </p>
        )}
      </div>

      <main className="max-w-2xl mx-auto px-4 py-4 pb-28">
        {/* INICIO */}
        {activeTab === "inicio" && (
          <div key="inicio" className="space-y-5 felpus-fadein">
            <div className="bg-white rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: C.border }}>
              <div className="p-5 text-center">
                <div
                  className="w-28 h-28 rounded-full overflow-hidden mx-auto mb-2 border-4"
                  style={{ borderColor: C.cream }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={MASCOT_HERO}
                    alt="Perro esperando volver a casa"
                    className="w-full h-full object-cover"
                    style={{ objectPosition: "50% 35%" }}
                  />
                </div>
                <h2 className="felpus-display text-xl sm:text-2xl mb-2" style={{ color: C.text }}>
                  Cada mascota merece volver a casa
                </h2>
                <p className="text-sm leading-relaxed max-w-sm mx-auto" style={{ color: C.muted }}>
                  Subí una foto y Felpus la compara automáticamente con toda la comunidad para encontrar
                  coincidencias cerca tuyo.
                </p>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => {
                      playTap();
                      setReportKind("perdida");
                      goToTab("reportar");
                    }}
                    className="flex-1 text-white text-sm font-bold rounded-xl py-3 transition-colors flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#D31C22]"
                    style={{ background: C.red }}
                  >
                    <Heart className="w-5 h-5" fill="currentColor" />
                    Perdí a mi mascota
                  </button>
                  <button
                    onClick={() => {
                      playTap();
                      setReportKind("encontrada");
                      goToTab("reportar");
                    }}
                    className="flex-1 text-white text-sm font-bold rounded-xl py-3 transition-colors flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#E36525]"
                    style={{ background: C.orangeInk }}
                  >
                    <PawPrint className="w-5 h-5" fill="currentColor" strokeWidth={1.5} />
                    Encontré una mascota
                  </button>
                </div>
              </div>
            </div>

            {/* Cómo funciona — tarjetas con más aire y jerarquía visual clara,
                estilo Duolingo: ícono grande en placa de color + un solo
                renglón de texto, conectados por una flecha vertical. */}
            <div className="bg-white rounded-2xl border shadow-sm p-4" style={{ borderColor: C.border }}>
              {[
                { icon: Camera, label: "Subí una foto", color: C.red },
                { icon: Sparkles, label: "Felpus la compara automáticamente", color: C.orangeInk },
                { icon: Heart, label: "Recibís las coincidencias", color: C.green },
              ].map((s, i, arr) => (
                <React.Fragment key={i}>
                  <div
                    className="felpus-step flex items-center gap-3.5 py-1.5 -mx-2 px-2 rounded-xl cursor-default"
                    style={{ "--step-color": s.color, "--step-tint": `${s.color}1A` }}
                  >
                    <span className="felpus-step-badge w-12 h-12 rounded-full flex items-center justify-center shrink-0">
                      <s.icon className="felpus-step-icon w-6 h-6" />
                    </span>
                    <p className="text-sm font-bold" style={{ color: C.text }}>
                      {s.label}
                    </p>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="flex justify-center py-0.5">
                      <ChevronDown className="w-4 h-4" style={{ color: C.border }} />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>

            <button
              onClick={() => goToTab("ranking")}
              className="w-full rounded-2xl p-4 text-white flex items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              style={{ background: C.ink }}
            >
              <Crown className="w-6 h-6 shrink-0" style={{ color: C.orange }} />
              <div className="flex-1">
                <p className="felpus-display text-base leading-none mb-0.5">Mayores colaboradores</p>
                <p className="text-[11px] text-white/75">Puntos por reportar y por confirmar reencuentros — mirá quién ayuda más.</p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/60 shrink-0" />
            </button>

            {/* Reencuentros felices — historias reales de la comunidad (reportes
                que alguien marcó como reencontrados), no reseñas inventadas:
                no tenemos un sistema de calificaciones, así que en vez de
                simular estrellas se muestra el final feliz real de cada caso. */}
            {happyReunions.length > 0 && (
              <div>
                <h2 className="felpus-display text-lg mb-0.5" style={{ color: C.text }}>
                  Reencuentros felices
                </h2>
                <p className="text-xs mb-3" style={{ color: C.muted }}>
                  Historias reales de la comunidad — mascotas que volvieron a casa gracias a Felpus.
                </p>
                <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 snap-x snap-mandatory">
                  {happyReunions.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setDetailReport(r)}
                      className="felpus-card-hover shrink-0 w-44 snap-start text-left rounded-2xl p-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D31C22]/40"
                      style={{ background: "#FBEAE2" }}
                    >
                      <div className="relative w-12 h-12 mb-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.foto} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm" />
                        <span
                          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white border-2 border-white"
                          style={{ background: C.green }}
                        >
                          <Heart className="w-2.5 h-2.5" fill="currentColor" />
                        </span>
                      </div>
                      <p className="text-sm font-bold truncate" style={{ color: C.text }}>
                        {r.nombre || (r.especie === "gato" ? "Gatito/a" : r.especie === "perro" ? "Perrito/a" : "Mascota")}
                      </p>
                      <p className="text-[11px] font-semibold mb-1.5" style={{ color: C.greenDark }}>
                        {r.resueltoEn ? `Reencontrada ${timeAgo(r.resueltoEn)}` : "Reencontrada"}
                      </p>
                      <p className="text-[11px] line-clamp-2" style={{ color: C.muted }}>
                        {r.descripcion}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* REPORTAR */}
        {activeTab === "reportar" && (
          <form key="reportar" onSubmit={handleSubmit} className="space-y-4 felpus-fadein">
            <div className="flex gap-2 bg-white p-1 rounded-xl border" style={{ borderColor: C.border }}>
              {["perdida", "encontrada"].map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setReportKind(k)}
                  className="flex-1 py-2 rounded-lg text-sm font-bold transition-colors"
                  style={reportKind === k ? { background: k === "perdida" ? C.red : C.orangeInk, color: "#fff" } : { color: C.muted }}
                >
                  {k === "perdida" ? "Perdí una mascota" : "Encontré una mascota"}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-2xl p-3.5 border sticky top-2 z-10 shadow-sm" style={{ borderColor: C.border }}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-bold" style={{ color: C.text }}>
                  {reportProgressPct === 100 ? "¡Publicación lista para enviar!" : "Completá tu publicación"}
                </p>
                <p className="felpus-mono text-xs font-bold" style={{ color: reportProgressPct === 100 ? C.green : C.muted }}>
                  {reportProgressDone}/{reportChecklist.length}
                </p>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "#F0E7D8" }}>
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${reportProgressPct}%`,
                    background: reportProgressPct === 100 ? C.green : reportKind === "perdida" ? C.red : C.orangeInk,
                  }}
                />
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {reportChecklist.map((step) => (
                  <span
                    key={step.id}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold transition-colors duration-300"
                    style={
                      step.done
                        ? { background: "#EAF3EC", color: C.greenDark }
                        : { background: "#F6F1E7", color: C.muted }
                    }
                  >
                    {step.done ? <Check className="w-2.5 h-2.5" /> : <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />}
                    {step.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border space-y-4" style={{ borderColor: C.border }}>
              <div>
                <label className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>
                  Fotos <span style={{ color: C.red }}>*</span>{" "}
                  <span className="font-normal" style={{ color: C.muted }}>
                    ({form.fotos.length}/{MAX_FOTOS})
                  </span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAddPhoto}
                  className="hidden"
                  id="foto-input"
                />
                <div className="grid grid-cols-3 gap-2">
                  {form.fotos.map((foto, i) => (
                    <div key={i} className="relative h-24 rounded-xl overflow-hidden border" style={{ borderColor: C.border }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={foto.dataUrl} alt={`foto ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(i)}
                        aria-label="Quitar foto"
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {form.fotos.length < MAX_FOTOS && (
                    <label
                      htmlFor="foto-input"
                      className="flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-xl h-24 cursor-pointer text-[11px] text-center transition-colors"
                      style={{ borderColor: C.border, color: C.muted }}
                    >
                      <Camera className="w-4 h-4" />
                      {form.fotos.length === 0 ? "Subir foto" : "Agregar otra"}
                    </label>
                  )}
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: C.muted }}>
                  Subí distintos ángulos o poses — ayuda a un matching más preciso.
                </p>
                {visionStatus === "analyzing" && (
                  <p className="text-[11px] mt-1.5 flex items-center gap-1.5" style={{ color: C.muted }}>
                    <Loader2 className="w-3 h-3 animate-spin" /> Analizando la foto con IA...
                  </p>
                )}
                {visionStatus === "ai" && (
                  <p className="text-[11px] mt-1.5 flex items-center gap-1.5" style={{ color: C.green }}>
                    <Check className="w-3 h-3" /> Análisis visual con IA activado
                  </p>
                )}
                {visionStatus === "basic" && (
                  <p className="text-[11px] mt-1.5" style={{ color: C.muted }}>
                    Comparación visual básica por color (IA de visión no configurada)
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="form-especie" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>Especie</label>
                  <select
                    id="form-especie"
                    value={form.especie}
                    onChange={(e) => setForm((f) => ({ ...f, especie: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0]"
                    style={{ borderColor: C.border, color: C.text }}
                  >
                    <option value="perro">Perro</option>
                    <option value="gato">Gato</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="form-tamano" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>Tamaño</label>
                  <select
                    id="form-tamano"
                    value={form.tamano}
                    onChange={(e) => setForm((f) => ({ ...f, tamano: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0]"
                    style={{ borderColor: C.border, color: C.text }}
                  >
                    <option value="chico">Chico</option>
                    <option value="mediano">Mediano</option>
                    <option value="grande">Grande</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="form-sexo" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>
                  Sexo <span style={{ color: C.red }}>*</span>
                </label>
                <select
                  id="form-sexo"
                  value={form.sexo}
                  onChange={(e) => setForm((f) => ({ ...f, sexo: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0]"
                  style={{ borderColor: C.border, color: C.text }}
                >
                  <option value="">Elegir sexo...</option>
                  {SEXO_OPTIONS.map((op) => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="form-nombre" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>Nombre (si lo sabés)</label>
                  <input
                    id="form-nombre"
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    maxLength={60}
                    placeholder="Opcional"
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0]"
                    style={{ borderColor: C.border, color: C.text }}
                  />
                </div>
                <div>
                  <label htmlFor="form-color" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>
                    Color <span style={{ color: C.red }}>*</span>
                  </label>
                  <select
                    id="form-color"
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0]"
                    style={{ borderColor: C.border, color: C.text }}
                  >
                    <option value="">Elegir color...</option>
                    {COLOR_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {form.color === "Otro color" && (
                <div>
                  <label htmlFor="form-color-otro" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>Describí el color</label>
                  <input
                    id="form-color-otro"
                    type="text"
                    value={form.colorOtro}
                    onChange={(e) => setForm((f) => ({ ...f, colorOtro: e.target.value }))}
                    maxLength={60}
                    placeholder="Ej: tricolor, manchas naranjas..."
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0]"
                    style={{ borderColor: C.border, color: C.text }}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="form-edad" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>Edad aproximada</label>
                  <select
                    id="form-edad"
                    value={form.edad}
                    onChange={(e) => setForm((f) => ({ ...f, edad: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0]"
                    style={{ borderColor: C.border, color: C.text }}
                  >
                    <option value="">Elegir edad...</option>
                    {EDAD_OPTIONS.map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="form-peso" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>Peso aproximado</label>
                  <select
                    id="form-peso"
                    value={form.peso}
                    onChange={(e) => setForm((f) => ({ ...f, peso: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0]"
                    style={{ borderColor: C.border, color: C.text }}
                  >
                    <option value="">Elegir peso...</option>
                    {PESO_OPTIONS.map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="form-zona" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>
                  Zona / barrio <span style={{ color: C.red }}>*</span>
                </label>
                <div className="flex gap-2">
                  <ZonaAutocomplete
                    id="form-zona"
                    value={form.zona}
                    onManualChange={(zona) => setForm((f) => ({ ...f, zona }))}
                    onSelectPlace={(zona, lat, lng) => {
                      // El widget de Google no respeta el maxLength del input
                      // (ese límite solo aplica al fallback de texto plano) —
                      // sin este recorte, una dirección larga puede superar el
                      // límite de 100 caracteres de la base y tirar abajo la
                      // publicación entera con un error genérico.
                      setForm((f) => ({
                        ...f,
                        zona: zona.slice(0, 100),
                        ...(lat != null && lng != null ? { lat, lng } : {}),
                      }));
                      if (lat != null && lng != null) setGeoStatus("done");
                    }}
                    maxLength={100}
                    placeholder="Ej: Palermo, cerca de Plaza Serrano"
                    className="flex-1 border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0]"
                    style={{ borderColor: C.border, color: C.text }}
                  />
                  <button
                    type="button"
                    onClick={handleUseLocation}
                    className="shrink-0 flex items-center gap-1.5 px-3 rounded-lg border text-xs font-semibold bg-[#FBF7F0]"
                    style={{ borderColor: C.border, color: C.text }}
                  >
                    {geoStatus === "locating" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : geoStatus === "done" ? (
                      <Check className="w-3.5 h-3.5" style={{ color: C.green }} />
                    ) : (
                      <Navigation className="w-3.5 h-3.5" />
                    )}
                    Ubicación
                  </button>
                </div>
                <p className="text-[11px] mt-1" style={{ color: C.muted }}>
                  Cuanto más exacta sea la dirección — escrita o marcada en el mapa — mejor va a ser el match.
                </p>
                {geoStatus === "done" && (
                  <p className="text-[11px] mt-1" style={{ color: C.green }}>Ubicación capturada — mejora mucho la precisión del match.</p>
                )}
                {geoStatus === "error" && (
                  <p className="text-[11px] mt-1" style={{ color: C.muted }}>No pudimos acceder a tu ubicación, se usará solo la zona escrita.</p>
                )}
                <div className="mt-2">
                  <MapPicker
                    lat={form.lat}
                    lng={form.lng}
                    onChange={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="form-fecha" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>Fecha</label>
                <input
                  id="form-fecha"
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0]"
                  style={{ borderColor: C.border, color: C.text }}
                />
              </div>

              <div>
                <label htmlFor="form-descripcion" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>
                  Descripción <span style={{ color: C.red }}>*</span>
                </label>
                <textarea
                  id="form-descripcion"
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  rows={3}
                  maxLength={600}
                  placeholder="Señas particulares, collar, comportamiento, dónde exactamente..."
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0] resize-none"
                  style={{ borderColor: C.border, color: C.text }}
                />
              </div>

              <div>
                <label id="form-contacto-label" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>
                  Contacto <span style={{ color: C.red }}>*</span>
                </label>
                <p className="text-[11px] mb-1.5" style={{ color: C.muted }}>
                  Para que puedan avisarte si la reconocen. Completá al menos uno.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="tel"
                    inputMode="tel"
                    aria-label="WhatsApp de contacto"
                    aria-describedby="form-contacto-label"
                    value={form.contactoWhatsapp}
                    onChange={(e) => setForm((f) => ({ ...f, contactoWhatsapp: e.target.value }))}
                    maxLength={25}
                    placeholder="WhatsApp: +54 9 11 1234-5678"
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0]"
                    style={{ borderColor: C.border, color: C.text }}
                  />
                  <input
                    type="email"
                    aria-label="Email de contacto"
                    aria-describedby="form-contacto-label"
                    value={form.contactoEmail}
                    onChange={(e) => setForm((f) => ({ ...f, contactoEmail: e.target.value }))}
                    maxLength={120}
                    placeholder="Email"
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0]"
                    style={{ borderColor: C.border, color: C.text }}
                  />
                </div>
              </div>

              {formError && (
                <p className="text-xs rounded-lg px-3 py-2" style={{ color: C.redDark, background: "#D31C221A" }}>
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full text-white font-bold text-sm rounded-xl py-3 flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: C.ink }}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Publicar y buscar coincidencias
              </button>
              <p className="text-[10px] text-center -mt-2" style={{ color: C.muted }}>
                +{reportKind === "perdida" ? PUNTOS_PERDIDA : PUNTOS_ENCONTRADA} puntos por este reporte · queda visible para todos.
              </p>
            </div>
          </form>
        )}

        {/* RESULTADO */}
        {activeTab === "resultado" && (
          <div key="resultado" className="space-y-4 felpus-fadein">
            <button onClick={() => goToTab("explorar")} className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.muted }}>
              <ArrowLeft className="w-3.5 h-3.5" /> Volver a explorar
            </button>

            {scanning && (
              <div className="bg-white rounded-2xl border p-8 flex flex-col items-center justify-center gap-3" style={{ borderColor: C.border }}>
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <span className="absolute inset-0 rounded-full felpus-ring" style={{ background: "#D31C2233" }} />
                  <span className="absolute inset-0 rounded-full felpus-ring [animation-delay:0.5s]" style={{ background: "#D31C2233" }} />
                  <div className="relative w-12 h-12 rounded-full bg-white border-2 flex items-center justify-center p-2" style={{ borderColor: C.red }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={PAW_MAGNIFIER} alt="" className="w-full h-full object-contain" />
                  </div>
                </div>
                <p className="felpus-mono text-xs" style={{ color: C.muted }}>comparando imagen, texto y zona...</p>
                <div className="w-full max-w-[220px] h-1.5 rounded-full overflow-hidden" style={{ background: "#F0E7D8" }}>
                  <div className="felpus-progress-fill h-full rounded-full" style={{ background: C.red }} />
                </div>
              </div>
            )}

            {!scanning && matchResult && (
              <>
                <div className="bg-white rounded-2xl border p-4" style={{ borderColor: C.border }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Mascot mood="celebrating" size={40} />
                    <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: C.green }}>
                      <Check className="w-4 h-4" /> Reporte publicado (
                      <span className="felpus-points-pop">
                        +{matchResult.source.tipo === "perdida" ? PUNTOS_PERDIDA : PUNTOS_ENCONTRADA} pts
                      </span>
                      )
                    </p>
                  </div>
                  <ReportCard report={matchResult.source} onOpenDetail={setDetailReport} />
                </div>

                <div>
                  <h3 className="felpus-display text-lg mb-2" style={{ color: C.text }}>
                    {matchResult.results.length > 0 ? "Posibles coincidencias" : "Todavía no hay coincidencias"}
                  </h3>
                  {matchResult.results.length === 0 && (
                    <div className="text-sm bg-white rounded-2xl p-5 text-center border" style={{ color: C.muted, borderColor: C.border }}>
                      <Mascot mood="searching" size={80} className="mx-auto mb-2" />
                      <p>
                        {matchResult.hadCandidates
                          ? `Hay reportes en la zona, pero ninguno supera el ${Math.round(SCORE_MINIMO * 100)}% mínimo de similitud todavía.`
                          : `Ni bien alguien reporte una mascota ${matchResult.source.tipo === "perdida" ? "encontrada" : "perdida"} que se parezca, va a aparecer acá.`}{" "}
                        Revisá la pestaña &ldquo;Explorar&rdquo; más tarde.
                      </p>
                    </div>
                  )}
                  <div className="space-y-3">
                    {matchResult.results.map((m) => (
                      <div
                        key={m.report.id}
                        className={`bg-white rounded-2xl border p-3 ${!m.report.resuelto && m.score >= 0.7 ? "felpus-match-glow" : ""}`}
                        style={{ borderColor: m.report.resuelto ? "#CFE3D6" : C.border, opacity: m.report.resuelto ? 0.75 : 1 }}
                      >
                        <div className="flex items-center gap-3">
                          <MatchScoreRing score={m.score} />
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.report.foto} alt="" className="w-16 h-16 rounded-xl object-cover bg-[#F6EEE1] shrink-0" />
                          <div className="min-w-0 flex-1">
                            {m.report.resuelto ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase text-white" style={{ background: C.green }}>
                                🎉 Reencontrada
                              </span>
                            ) : (
                              <Badge tipo={m.report.tipo} />
                            )}
                            <p className="text-sm font-semibold mt-1 truncate" style={{ color: C.text }}>{displayColor(m.report)} · {m.report.tamano}</p>
                            <p className="text-[11px] flex items-center gap-1" style={{ color: C.muted }}>
                              <MapPin className="w-3 h-3" /> {m.report.zona} · {m.distanceLabel}
                            </p>
                            <p className="text-[10px] font-semibold" style={{ color: scoreLabel(m.score, C).color }}>{scoreLabel(m.score, C).text}</p>
                          </div>
                        </div>
                        {!m.report.resuelto && !matchResult.source.resuelto && (
                          <div className="mt-2 pt-2 border-t" style={{ borderColor: "#F0E7D8" }}>
                            {confirmingId === m.report.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] flex-1" style={{ color: C.muted }}>¿Es ella/él?</span>
                                <button
                                  onClick={() =>
                                    markResolvedAndReward({
                                      repObjs: [matchResult.source, m.report],
                                      bonusFor: [
                                        { userId: matchResult.source.userId, displayName: matchResult.source.nickname },
                                        { userId: m.report.userId, displayName: m.report.nickname },
                                      ],
                                    })
                                  }
                                  className="text-[11px] font-bold text-white rounded-lg px-2.5 py-1"
                                  style={{ background: C.green }}
                                >
                                  Sí, confirmar
                                </button>
                                <button onClick={() => setConfirmingId(null)} className="text-[11px] font-semibold" style={{ color: C.muted }}>
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => handleConfirmTrigger(matchResult.source, m.report.id)} className="text-[11px] font-bold flex items-center gap-1" style={{ color: C.red }}>
                                {confirmButtonContent(matchResult.source, "¡Es ella/él! Confirmar reencuentro")}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* EXPLORAR */}
        {activeTab === "explorar" && (
          <div key="explorar" className="space-y-4 felpus-fadein">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.muted }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por zona, nombre, color o descripción..."
                className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm bg-white"
                style={{ borderColor: C.border, color: C.text }}
              />
            </div>

            <div className="flex gap-2">
              <select
                value={filterTipo}
                onChange={(e) => setFilterTipo(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white"
                style={{ borderColor: C.border, color: C.text }}
              >
                <option value="todos">Perdidas y encontradas</option>
                <option value="perdida">Solo perdidas</option>
                <option value="encontrada">Solo encontradas</option>
              </select>
              <select
                value={filterEspecie}
                onChange={(e) => setFilterEspecie(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white"
                style={{ borderColor: C.border, color: C.text }}
              >
                <option value="todos">Todas las especies</option>
                <option value="perro">Perros</option>
                <option value="gato">Gatos</option>
                <option value="otro">Otros</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSortBy("recientes")}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold border"
                style={sortBy === "recientes" ? { background: C.ink, color: "#fff", borderColor: C.ink } : { color: C.muted, borderColor: C.border, background: "#fff" }}
              >
                Más recientes
              </button>
              <button
                onClick={() => (myLocation ? setSortBy("cercania") : handleLocateMe())}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold border"
                style={sortBy === "cercania" ? { background: C.ink, color: "#fff", borderColor: C.ink } : { color: C.muted, borderColor: C.border, background: "#fff" }}
              >
                {locatingMe ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
                Más cercanas
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExploreView("lista")}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold border"
                style={exploreView === "lista" ? { background: C.ink, color: "#fff", borderColor: C.ink } : { color: C.muted, borderColor: C.border, background: "#fff" }}
              >
                Lista
              </button>
              <button
                type="button"
                onClick={() => setExploreView("mapa")}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold border"
                style={exploreView === "mapa" ? { background: C.ink, color: "#fff", borderColor: C.ink } : { color: C.muted, borderColor: C.border, background: "#fff" }}
              >
                <MapPin className="w-3.5 h-3.5" /> Mapa
              </button>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(true)}
                className="flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: C.text }}
              >
                <ChevronDown className="w-3.5 h-3.5" />
                Filtros avanzados
                {hasAdvancedFilters && (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.red }} />
                )}
              </button>

              <FilterSheet
                open={showAdvancedFilters}
                onClose={() => setShowAdvancedFilters(false)}
                filterTamano={filterTamano}
                setFilterTamano={setFilterTamano}
                filterColor={filterColor}
                setFilterColor={setFilterColor}
                filterFecha={filterFecha}
                setFilterFecha={setFilterFecha}
                filterRadioKm={filterRadioKm}
                setFilterRadioKm={setFilterRadioKm}
                myLocation={myLocation}
                locatingMe={locatingMe}
                handleLocateMe={handleLocateMe}
                hasAdvancedFilters={hasAdvancedFilters}
                resultCount={filteredReports.length}
              />
            </div>

            {!loadingReports && (
              <p className="text-xs" style={{ color: C.muted }}>
                {filteredReports.length} {filteredReports.length === 1 ? "reporte encontrado" : "reportes encontrados"}
              </p>
            )}

            {loadingReports && exploreView === "lista" && (
              <div className="space-y-3">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            )}

            {!loadingReports && exploreView === "lista" && filteredReports.length === 0 && (
              <div className="bg-white rounded-2xl p-6 text-center text-sm border" style={{ color: C.muted, borderColor: C.border }}>
                <Mascot mood="searching" size={88} className="mx-auto mb-2" />
                <p className="font-semibold" style={{ color: C.text }}>Todavía no hay reportes por acá.</p>
                <p className="mt-1">Probá con otros filtros, o sé la primera persona en publicar uno.</p>
              </div>
            )}

            {!loadingReports && exploreView === "mapa" && (
              <div className="space-y-2">
                <ReportsMap reports={filteredReports} onSelectReport={setDetailReport} center={myLocation} />
                {filteredReports.some((r) => r.lat == null || r.lng == null) && (
                  <p className="text-[11px]" style={{ color: C.muted }}>
                    Algunos reportes no tienen ubicación exacta marcada en el mapa y no aparecen acá — probá la
                    vista de lista para verlos todos.
                  </p>
                )}
              </div>
            )}

            {exploreView === "lista" && (
            <div className="space-y-3">
              {filteredReports.map((r) => (
                <ReportCard key={r.id} report={r} onOpenDetail={setDetailReport}>
                  <button
                    onClick={() => toggleCardMatches(r)}
                    className="w-full flex items-center justify-between px-3 py-2.5 border-t text-xs font-semibold"
                    style={{ borderColor: "#F0E7D8", color: C.red }}
                  >
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      {expandedCard === r.id ? "Ocultar coincidencias" : "Ver posibles coincidencias"}
                    </span>
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expandedCard === r.id ? "rotate-90" : ""}`} />
                  </button>
                  {expandedCard === r.id && (
                    <div className="px-3 pb-3 space-y-2">
                      {!cardMatches[r.id] && (
                        <p className="text-xs flex items-center gap-1.5 py-2" style={{ color: C.muted }}>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> calculando...
                        </p>
                      )}
                      {cardMatches[r.id]?.length === 0 && (
                        <p className="text-xs py-2" style={{ color: C.muted }}>
                          Sin coincidencias de al menos {Math.round(SCORE_MINIMO * 100)}% por ahora.
                        </p>
                      )}
                      {cardMatches[r.id]?.map((m) => (
                        <div key={m.report.id} className="bg-[#FBF7F0] rounded-xl p-2">
                          <div className="flex items-center gap-2.5">
                            <div className="scale-75 -m-2">
                              <MatchScoreRing score={m.score} />
                            </div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={m.report.foto} alt="" className="w-10 h-10 rounded-lg object-cover bg-white" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold truncate" style={{ color: C.text }}>{displayColor(m.report)} · {m.report.zona}</p>
                              <p className="text-[10px]" style={{ color: C.muted }}>{m.distanceLabel}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: "#F0E7D8" }}>
                    {confirmingId === r.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] flex-1" style={{ color: C.muted }}>¿Confirmás el reencuentro?</span>
                        <button
                          onClick={() => markResolvedAndReward({ repObjs: [r], bonusFor: [{ userId: r.userId, displayName: r.nickname }] })}
                          className="text-[11px] font-bold text-white rounded-lg px-2.5 py-1"
                          style={{ background: C.green }}
                        >
                          Sí, ya está en casa
                        </button>
                        <button onClick={() => setConfirmingId(null)} className="text-[11px] font-semibold" style={{ color: C.muted }}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <button onClick={() => handleConfirmTrigger(r)} className="text-[11px] font-bold flex items-center gap-1" style={{ color: C.green }}>
                          {confirmButtonContent(r, "Marcar como reencontrada")}
                        </button>
                        <ShareButton
                          report={r}
                          className="text-[11px] font-bold flex items-center gap-1"
                          style={{ color: C.text }}
                        >
                          <Share2 className="w-3.5 h-3.5" /> Compartir
                        </ShareButton>
                      </div>
                    )}
                  </div>
                </ReportCard>
              ))}
            </div>
            )}

            {resueltas.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => setShowResueltas((v) => !v)}
                  className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-semibold"
                  style={{ background: "#EAF3EC", color: C.greenDark }}
                >
                  <span className="flex items-center gap-1.5">
                    <PartyPopper className="w-4 h-4" /> Reencuentros felices ({resueltas.length})
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showResueltas ? "rotate-180" : ""}`} />
                </button>
                {showResueltas && (
                  <div className="space-y-3 mt-3">
                    {resueltas.map((r) => (
                      <ReportCard key={r.id} report={r} onOpenDetail={setDetailReport} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* RANKING */}
        {activeTab === "ranking" && (
          <div key="ranking" className="space-y-3 felpus-fadein">
            <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: C.border }}>
              <h2 className="felpus-display text-xl mb-1 flex items-center gap-2" style={{ color: C.text }}>
                <Crown className="w-5 h-5" style={{ color: C.orange }} /> Mayores colaboradores
              </h2>
              <p className="text-sm" style={{ color: C.muted }}>
                Puntos por reportar mascotas y, sobre todo, por confirmar reencuentros reales.
              </p>
            </div>

            {user ? (
              myRank ? (
                <div className="rounded-2xl p-4 text-white" style={{ background: C.red }}>
                  <div className="flex items-center gap-3">
                    <div className="felpus-mono text-xl font-bold w-10 text-center shrink-0">#{myRank.rank}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white/80">Tu posición</p>
                      <p className="text-sm font-bold truncate">{getTier(myRank.points || 0, C).label}</p>
                    </div>
                    <div className="felpus-mono text-lg font-bold shrink-0">{myRank.points || 0} pts</div>
                  </div>
                  {!!myRank.streak_days && (
                    <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-white/20 text-[13px] font-bold">
                      <Flame className="w-4 h-4" fill="currentColor" style={{ color: "#FFD08A" }} />
                      Racha de {myRank.streak_days} {myRank.streak_days === 1 ? "día" : "días"} seguidos
                    </div>
                  )}
                  {getBadges(myRank).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/20">
                      {getBadges(myRank).map((b) => (
                        <span
                          key={b.id}
                          title={b.label}
                          className="inline-flex items-center gap-1 bg-white/15 rounded-full px-2 py-1 text-[11px] font-semibold"
                        >
                          <span>{b.icon}</span> {b.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm bg-white rounded-2xl p-4 text-center border" style={{ color: C.muted, borderColor: C.border }}>
                  Todavía no sumaste puntos — reportá una mascota o confirmá un reencuentro para aparecer en el ranking.
                </div>
              )
            ) : (
              <div className="text-sm bg-white rounded-2xl p-4 text-center border" style={{ color: C.muted, borderColor: C.border }}>
                <button onClick={handleGoogleLogin} className="font-bold underline" style={{ color: C.red }}>
                  Iniciá sesión con Google
                </button>{" "}
                para ver tu posición y tus puntos.
              </div>
            )}

            {loadingReports && leaderboard.length === 0 && (
              <div className="space-y-2">
                <SkeletonRankRow />
                <SkeletonRankRow />
                <SkeletonRankRow />
              </div>
            )}

            {!loadingReports && leaderboard.length === 0 && (
              <div className="text-sm bg-white rounded-2xl p-6 text-center border" style={{ color: C.muted, borderColor: C.border }}>
                <Mascot mood="happy" size={88} className="mx-auto mb-2" />
                <p className="font-semibold" style={{ color: C.text }}>Todavía nadie sumó puntos.</p>
                <p className="mt-1">¡Sé la primera persona de la lista!</p>
              </div>
            )}

            <div className="space-y-2">
              {leaderboard.map((u, i) => {
                const tier = getTier(u.points || 0, C);
                const isMe = !!user && u.id === user.id;
                const alreadyHearted = heartedIds.includes(u.id);
                return (
                  <div key={u.id || u.nickname + i} className="relative">
                    <div className="flex items-center gap-3 bg-white rounded-xl p-3 border" style={{ borderColor: isMe ? C.red : C.border }}>
                      <div className="w-6 text-center felpus-mono text-sm font-bold" style={{ color: C.muted }}>{i + 1}</div>
                      {i === 0 ? <Crown className="w-5 h-5 shrink-0" style={{ color: C.orange }} /> : <div className="w-5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: C.text }}>
                          {u.nickname} {isMe && <span style={{ color: C.red }}>(vos)</span>}
                        </p>
                        <p className="text-[11px]" style={{ color: tier.color }}>
                          {tier.label} · {"🐾".repeat(tier.paws)}
                          {getBadges(u).length > 0 && (
                            <span className="ml-1">
                              {getBadges(u).map((b) => (
                                <span key={b.id} title={b.label}>{b.icon}</span>
                              ))}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <span className="felpus-mono text-base font-bold" style={{ color: C.red }}>{u.points || 0}</span>
                        <span className="text-[9px] font-semibold -mt-0.5" style={{ color: C.muted }}>pts</span>
                      </div>
                    </div>
                    {!isMe && (
                      <button
                        type="button"
                        onClick={() => handleSendHeart(u)}
                        disabled={alreadyHearted}
                        aria-label={alreadyHearted ? "Ya le mandaste un corazón" : `Mandarle un corazón a ${u.nickname}`}
                        className="absolute -top-2 -right-2 flex items-center gap-1 bg-white border rounded-full px-2 py-1 shadow-sm"
                        style={{ borderColor: C.border }}
                      >
                        <Heart
                          className={poppingHeartId === u.id ? "w-3.5 h-3.5 felpus-heart-pop" : "w-3.5 h-3.5"}
                          style={{ color: alreadyHearted ? C.red : C.muted }}
                          fill={alreadyHearted ? C.red : "none"}
                        />
                        <span className="felpus-mono text-[10px] font-bold" style={{ color: C.muted }}>
                          {u.hearts || 0}
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="bg-[#FBF7F0] rounded-xl p-3.5 border text-[11px] space-y-1.5" style={{ borderColor: C.border, color: C.muted }}>
              <p className="font-bold text-xs mb-1" style={{ color: C.text }}>Cómo se suman puntos</p>
              <p>+{PUNTOS_PERDIDA} pts · publicar una mascota perdida</p>
              <p>+{PUNTOS_ENCONTRADA} pts · publicar una mascota encontrada</p>
              <p>+{PUNTOS_REENCUENTRO} pts · confirmar un reencuentro real</p>
              <p>+{PUNTOS_BONO_ORIGINAL} pts · bono para quien reportó originalmente esa mascota</p>
            </div>
          </div>
        )}
      </main>

      {/* Navegación inferior — más redondeada y con más peso visual propio,
          en vez del Material Design genérico de antes (esquinas superiores
          grandes, sombra flotante, íconos más grandes). */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[28px] flex items-stretch justify-around z-40 px-2"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          boxShadow: "0 -6px 24px -4px rgba(43, 27, 18, 0.14)",
        }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id || (activeTab === "resultado" && item.id === "reportar");
          if (item.primary) {
            return (
              <button
                key={item.id}
                onClick={() => {
                  playTap();
                  setReportKind("perdida");
                  goToTab("reportar");
                }}
                className="flex flex-col items-center justify-center -mt-5 focus:outline-none"
                aria-label="Reportar mascota"
              >
                <span className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg border-4" style={{ background: C.red, borderColor: C.cream }}>
                  <item.icon className="w-7 h-7" />
                </span>
                <span className="text-[10px] font-bold mt-1" style={{ color: isActive ? C.red : C.muted }}>
                  {item.label}
                </span>
              </button>
            );
          }
          return (
            <button
              key={item.id}
              onClick={() => {
                playTap();
                goToTab(item.id);
              }}
              className="flex flex-col items-center justify-center gap-1 py-2.5 px-3 focus:outline-none"
            >
              <span
                className="flex items-center justify-center w-11 h-8 rounded-full transition-all duration-300"
                style={{ background: isActive ? "#FBE4DC" : "transparent", transform: isActive ? "scale(1)" : "scale(0.9)" }}
              >
                <item.icon className="w-6 h-6 transition-colors duration-200" style={{ color: isActive ? C.red : C.muted }} />
              </span>
              <span className="text-[10px] font-bold" style={{ color: isActive ? C.red : C.muted }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <ToastStack toasts={toasts} />

      <DetailModal
        report={detailReport}
        onClose={() => {
          setDetailReport(null);
          setConfirmingId(null);
        }}
        onResolve={() => detailReport && handleConfirmTrigger(detailReport)}
        confirming={confirmingId === detailReport?.id}
        isOwner={!!detailReport && detailReport.userId === user?.id}
        onConfirm={() =>
          markResolvedAndReward({
            repObjs: [detailReport],
            bonusFor: [{ userId: detailReport?.userId, displayName: detailReport?.nickname }],
          })
        }
        onCancelConfirm={() => setConfirmingId(null)}
        isLoggedIn={!!user}
        onDelete={handleDeleteReport}
      />

      <footer className="max-w-2xl mx-auto px-4 pb-24 pt-2 space-y-1.5">
        <p className="text-[11px] font-semibold flex items-center gap-1 justify-center" style={{ color: C.greenDark }}>
          <PartyPopper className="w-3.5 h-3.5" /> {resueltas.length} mascotas reencontradas gracias a la comunidad
        </p>
        <p className="text-[10px] flex items-center gap-1 justify-center" style={{ color: C.muted }}>
          <HelpCircle className="w-3 h-3" /> Prototipo — no reemplaza denunciar ante autoridades o refugios locales.
        </p>
      </footer>
    </div>
  );
}
