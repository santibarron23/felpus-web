"use client";

// Componentes de presentación puros de FelpusMatcher — no tienen estado
// propio del flujo principal (auth, reportes, gamificación), solo reciben
// props y los muestran. Vivían embebidos dentro de FelpusMatcher.jsx, que
// llegó a 3179 líneas; sacarlos de ahí achica el archivo principal sin tocar
// la lógica con estado (esa parte queda para una refactorización aparte, de
// mayor riesgo).

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  Cat,
  Dog,
  PawPrint,
  MapPin,
  X,
  MessageCircle,
  Mail,
  Share2,
  Loader2,
  Printer,
  LogIn,
  Lock,
  PartyPopper,
  Trash2,
  Facebook,
  Twitter,
  Instagram,
  Copy,
  AlertCircle,
} from "lucide-react";
import { scoreLabel, isRecent, formatFechaAR, buildShareText, reportPhotoAlt, COLOR_OPTIONS } from "../../lib/matching";
import { downloadFlyer } from "../../lib/flyer";
import { logError } from "../../lib/log";
import { useFocusTrap } from "./useFocusTrap";
import { displayColor } from "../../lib/theme";
import { useTheme } from "./ThemeProvider";

export function Badge({ tipo }) {
  const C = useTheme();
  const isLost = tipo === "perdida";
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase text-white"
      style={{ background: isLost ? C.redSolid : C.orangeInkSolid }}
    >
      {isLost ? "Perdida" : "Encontrada"}
    </span>
  );
}

export function EspecieIcon({ especie, className }) {
  if (especie === "gato") return <Cat className={className} />;
  if (especie === "perro") return <Dog className={className} />;
  return <PawPrint className={className} />;
}

export function MatchScoreRing({ score, size = 64 }) {
  const C = useTheme();
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

export function ReportCard({ report, onOpenDetail, children }) {
  const C = useTheme();
  const resuelto = !!report.resuelto;
  return (
    <div
      className="felpus-card-hover group bg-white dark:bg-[var(--felpus-dark-card)] rounded-2xl border overflow-hidden shadow-sm"
      style={{ borderColor: resuelto ? C.successBorder : C.border, opacity: resuelto ? 0.75 : 1 }}
    >
      <button
        type="button"
        onClick={() => onOpenDetail && onOpenDetail(report)}
        className="flex gap-3 p-3 w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50 rounded-t-2xl"
      >
        <div className="relative shrink-0 w-24 h-24">
          <div className="relative w-full h-full rounded-xl overflow-hidden">
            <Image
              src={report.foto}
              alt={reportPhotoAlt(report)}
              fill
              sizes="96px"
              loading="lazy"
              className="felpus-photo-zoom object-cover bg-[#F0E7D8] dark:bg-[var(--felpus-dark-muted-surface)] transition-transform duration-300 group-hover:scale-110"
            />
          </div>
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
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase"
                style={{ background: C.successBg, color: C.successText }}
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

export function DetailModal({ report, onClose, onResolve, confirming, onConfirm, onCancelConfirm, isLoggedIn, isOwner, onDelete }) {
  const C = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const [generatingFlyer, setGeneratingFlyer] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const modalRef = useRef(null);
  // Si la lightbox de foto está abierta, Escape la cierra a ELLA (no todo
  // el detalle atrás) — misma lógica que ya usan el botón "X" y el click en
  // el fondo de la lightbox. onEscape se lee de un ref adentro del hook, así
  // que cambiar esta función en cada render no reinscribe el listener.
  useFocusTrap(!!report, modalRef, lightboxOpen ? () => setLightboxOpen(false) : onClose);
  useEffect(() => {
    setActiveIndex(0);
    setDeleteConfirming(false);
    setLightboxOpen(false);
  }, [report?.id]);
  if (!report) return null;
  const fotos = report.fotos?.length ? report.fotos : [{ url: report.foto }];
  const activeFoto = fotos[Math.min(activeIndex, fotos.length - 1)];
  // Con lat/lng manda directo al pin exacto; si el reporte no tiene
  // ubicación precisa (no todos la tienen), cae a una búsqueda por nombre
  // de zona — siempre abre algo útil, nunca un link roto.
  const mapsUrl =
    report.lat != null && report.lng != null
      ? `https://www.google.com/maps?q=${report.lat},${report.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(report.zona)}`;

  async function handleDownloadFlyer() {
    setGeneratingFlyer(true);
    try {
      await downloadFlyer(report, displayColor(report));
    } catch (e) {
      logError("No se pudo generar el flyer", e);
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
    <>
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${report.nombre || report.especie}`}
        className="bg-white dark:bg-[var(--felpus-dark-card)] rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-56 overflow-hidden bg-[#F0E7D8] dark:bg-[var(--felpus-dark-muted-surface)]">
          {/* Fondo desenfocado con la misma foto, recortado a propósito —
              rellena el marco sin dejar franjas vacías. Encima, la foto
              real entra completa (object-contain) para no cortarle la
              cabeza o las patas a mascotas en fotos verticales (9:16). */}
          <Image src={activeFoto.url} alt="" aria-hidden="true" fill sizes="(min-width: 640px) 448px, 100vw" className="object-cover blur-2xl scale-125 opacity-50" />
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label="Ver foto en tamaño completo"
            className="absolute inset-0 w-full h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
          >
            <Image src={activeFoto.url} alt={reportPhotoAlt(report)} fill sizes="(min-width: 640px) 448px, 100vw" className="object-contain" />
          </button>
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
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase"
                style={{ background: C.successBg, color: C.successText }}
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
                <Image src={f.url} alt={`Foto ${i + 1} de ${fotos.length}`} width={56} height={56} loading="lazy" className="w-full h-full object-cover" />
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
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="felpus-input bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)] rounded-lg p-2.5 hover:bg-[#F0E7D8] dark:hover:bg-[var(--felpus-dark-muted-surface)] transition-colors focus:outline-none"
            >
              <p className="text-[10px] uppercase font-bold flex items-center gap-1" style={{ color: C.muted }}>
                <MapPin className="w-3 h-3" /> Zona
              </p>
              <p className="underline" style={{ color: C.text }}>{report.zona}</p>
            </a>
            <div className="bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)] rounded-lg p-2.5">
              <p className="text-[10px] uppercase font-bold" style={{ color: C.muted }}>Fecha</p>
              <p style={{ color: C.text }}>{formatFechaAR(report.fecha)}</p>
            </div>
            {report.sexo && (
              <div className="bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)] rounded-lg p-2.5">
                <p className="text-[10px] uppercase font-bold" style={{ color: C.muted }}>Sexo</p>
                <p style={{ color: C.text }}>{report.sexo}</p>
              </div>
            )}
            {report.edad && (
              <div className="bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)] rounded-lg p-2.5">
                <p className="text-[10px] uppercase font-bold" style={{ color: C.muted }}>Edad</p>
                <p style={{ color: C.text }}>{report.edad}</p>
              </div>
            )}
            {report.peso && (
              <div className="bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)] rounded-lg p-2.5">
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
                    // Verde oficial de marca de WhatsApp — a propósito no usa
                    // C.green (5.95:1 vs. blanco): la gente reconoce este botón
                    // por su color exacto, igual que el "F" azul de Facebook.
                    // Es la única excepción de marca de terceros en toda la app.
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
              className="w-full flex items-center justify-center gap-1.5 border rounded-xl py-2.5 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              style={{ borderColor: C.border, color: C.text }}
            >
              <Share2 className="w-4 h-4" /> Compartir
            </ShareButton>
            <button
              type="button"
              onClick={handleDownloadFlyer}
              disabled={generatingFlyer}
              className="flex-1 flex items-center justify-center gap-1.5 border rounded-xl py-2.5 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50 disabled:opacity-60"
              style={{ borderColor: C.border, color: C.text }}
            >
              {generatingFlyer ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              Flyer
            </button>
          </div>
          {!report.resuelto && (
            <div className="pt-1">
              {confirming ? (
                <div className="flex items-center gap-2 bg-[#EAF3EC] dark:bg-[#1C2E22] rounded-xl p-2.5">
                  <span className="text-xs flex-1" style={{ color: C.greenDark }}>¿Confirmás el reencuentro?</span>
                  <button onClick={onConfirm} className="text-xs font-bold text-white rounded-lg px-3 py-1.5" style={{ background: C.greenSolid }}>
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
                  style={{ background: isLoggedIn && isOwner ? C.greenSolid : C.emphasisBg }}
                >
                  {!isLoggedIn ? (
                    <>
                      <LogIn className="w-4 h-4" /> Iniciá sesión para confirmar reencuentro
                    </>
                  ) : !isOwner ? (
                    <>
                      <Lock className="w-4 h-4" /> Solo el autor puede confirmar reencuentro
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
                <div className="flex items-center gap-2 rounded-xl p-2.5" style={{ background: C.dangerBg }}>
                  <span className="text-xs flex-1" style={{ color: C.redDark }}>¿Eliminar esta publicación para siempre?</span>
                  <button
                    type="button"
                    onClick={handleDeleteClick}
                    disabled={deleting}
                    className="text-xs font-bold text-white rounded-lg px-3 py-1.5 disabled:opacity-60"
                    style={{ background: C.redSolid }}
                  >
                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Sí, eliminar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirming(false)}
                    disabled={deleting}
                    className="text-xs font-semibold disabled:opacity-60"
                    style={{ color: C.muted }}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setDeleteConfirming(true)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50 rounded-lg"
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
    {lightboxOpen &&
      createPortal(
        <div
          className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label="Cerrar"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="w-5 h-5" />
          </button>
          {/* Lightbox a pantalla completa: se queda como <img> nativo a
              propósito (eslint-disable abajo) — a diferencia de las otras
              fotos de este archivo, acá no hay un contenedor de tamaño fijo
              del que colgar "fill" (max-w-full max-h-full deja que la foto
              se muestre a su tamaño real dentro del viewport), que es
              justamente el punto de un lightbox: ver la foto tal cual es. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeFoto.url}
            alt={reportPhotoAlt(report)}
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}
    </>
  );
}

export function ShareButton({ report, className, style, children, wrapperClassName = "relative inline-block" }) {
  const C = useTheme();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const btnRef = useRef(null);

  // /r/<id> (no /?r=<id>) — esa ruta genera meta etiquetas Open Graph del
  // lado del servidor con la foto real de ESTA mascota, para que
  // WhatsApp/Facebook/X armen la vista previa con la imagen correcta en vez
  // del banner genérico de la marca (que es lo único que puede leer un
  // crawler desde la SPA, ya que no ejecuta JavaScript).
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/r/${encodeURIComponent(report.id)}` : "";
  const shareText = buildShareText(report);
  const [sharingInstagram, setSharingInstagram] = useState(false);
  const MENU_WIDTH = 192; // w-48

  // En mobile (Web Share API disponible) preferimos la hoja nativa del SO:
  // muestra TODAS las apps instaladas que aceptan compartir (Telegram, SMS,
  // Mail, Instagram, etc.), no solo las 4 fijas de nuestro menú. Antes
  // siempre abríamos el menú propio, que en mobile se sentía limitado
  // ("no me deja ver todas las opciones de compartir"). El menú propio queda
  // como respaldo para desktop o si la hoja nativa no está disponible.
  async function toggleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Felpus", text: shareText, url: shareUrl });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return; // el usuario cerró la hoja nativa, no mostrar el menú propio
        logError("No se pudo compartir con la hoja nativa", e);
      }
    }
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        left: Math.min(Math.max(8, rect.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8),
      });
    }
    setOpen(true);
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
      logError(e);
    }
  }

  // Instagram no tiene una URL web pública para mandar directo a "Historias"
  // con una imagen — la única forma real de lograrlo desde un sitio es el
  // selector nativo del celular (Web Share API con archivos), donde
  // Instagram ya aparece como una opción y ahí sí ofrece "Agregar a tu
  // historia". En desktop (sin ese selector) se abre la foto en una
  // pestaña nueva para guardarla y subirla a mano.
  async function shareToInstagram() {
    setSharingInstagram(true);
    try {
      const res = await fetch(report.foto);
      const blob = await res.blob();
      const file = new File([blob], "felpus-mascota.jpg", { type: blob.type || "image/jpeg" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText });
        setOpen(false);
        return;
      }
    } catch (e) {
      if (e?.name === "AbortError") {
        setOpen(false);
        return;
      }
      logError("No se pudo compartir a Instagram", e);
    } finally {
      setSharingInstagram(false);
    }
    window.open(report.foto, "_blank", "noopener,noreferrer");
    setOpen(false);
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
              className="fixed z-[71] bg-white dark:bg-[var(--felpus-dark-card)] rounded-xl border shadow-lg py-1 text-xs"
              style={{ borderColor: C.border, top: menuPos.top, left: menuPos.left, width: MENU_WIDTH }}
            >
            <button
              onClick={() => openWindow(`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`)}
              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[#FBF7F0] dark:hover:bg-[var(--felpus-dark-hover)] font-semibold"
              style={{ color: C.text }}
            >
              <Share2 className="w-3.5 h-3.5" /> WhatsApp
            </button>
            <button
              onClick={() =>
                openWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`)
              }
              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[#FBF7F0] dark:hover:bg-[var(--felpus-dark-hover)] font-semibold"
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
              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[#FBF7F0] dark:hover:bg-[var(--felpus-dark-hover)] font-semibold"
              style={{ color: C.text }}
            >
              <Twitter className="w-3.5 h-3.5" /> X / Twitter
            </button>
            <button
              onClick={shareToInstagram}
              disabled={sharingInstagram}
              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[#FBF7F0] dark:hover:bg-[var(--felpus-dark-hover)] font-semibold disabled:opacity-60"
              style={{ color: C.text }}
            >
              {sharingInstagram ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Instagram className="w-3.5 h-3.5" />} Instagram
            </button>
            <button
              onClick={copyLink}
              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[#FBF7F0] dark:hover:bg-[var(--felpus-dark-hover)] font-semibold"
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

// Cuenta ascendente suave para los números de la franja de actividad — le da
// sensación de "vivo" a datos que son reales (no simulados), sin depender de
// ninguna librería de animación nueva. Respeta prefers-reduced-motion
// mostrando el número final directamente.
export function AnimatedNumber({ value }) {
  const [display, setDisplay] = useState(0);
  const prevValue = useRef(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setDisplay(value);
      prevValue.current = value;
      return;
    }
    const from = prevValue.current;
    const to = value;
    const duration = 600;
    const start = performance.now();
    let raf;
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevValue.current = to;
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{display}</>;
}

export function ToastStack({ toasts }) {
  const C = useTheme();
  return (
    <div className="fixed bottom-20 sm:bottom-6 left-0 right-0 flex flex-col items-center gap-2 px-4 z-50 pointer-events-none">
      {toasts.map((t) => {
        const pointsMatch = t.message.match(/\+\d+ (puntos|pts)/);
        return (
          <div
            key={t.id}
            className="felpus-toast flex items-center gap-2 text-sm font-semibold rounded-xl px-4 py-3 shadow-lg max-w-md text-white"
            // toastSuccessBg/toastErrorBg (NO C.ink/C.redDark): esta chapita
            // es siempre oscura con texto blanco, en los dos temas — ver la
            // nota junto a esos tokens en theme.js.
            style={{ background: t.type === "error" ? C.toastErrorBg : C.toastSuccessBg }}
          >
            {t.type === "error" ? <AlertCircle className="w-4 h-4 shrink-0" /> : <PartyPopper className="w-4 h-4 shrink-0" />}
            <span>
              {pointsMatch ? (
                <>
                  {t.message.slice(0, pointsMatch.index)}
                  <span className="felpus-points-pop font-extrabold" style={{ color: C.toastAccent }}>
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

export function SkeletonCard() {
  const C = useTheme();
  return (
    <div className="bg-white dark:bg-[var(--felpus-dark-card)] rounded-2xl border p-3 flex gap-3 animate-pulse" style={{ borderColor: C.border }}>
      <div className="w-20 h-20 rounded-xl bg-[#F0E7D8] dark:bg-[var(--felpus-dark-muted-surface)] shrink-0" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-4 w-20 rounded-full bg-[#F0E7D8] dark:bg-[var(--felpus-dark-muted-surface)]" />
        <div className="h-3 w-2/3 rounded bg-[#F0E7D8] dark:bg-[var(--felpus-dark-muted-surface)]" />
        <div className="h-3 w-1/2 rounded bg-[#F0E7D8] dark:bg-[var(--felpus-dark-muted-surface)]" />
        <div className="h-3 w-full rounded bg-[#F0E7D8] dark:bg-[var(--felpus-dark-muted-surface)]" />
      </div>
    </div>
  );
}

export function SkeletonRankRow() {
  const C = useTheme();
  return (
    <div className="flex items-center gap-3 bg-white dark:bg-[var(--felpus-dark-card)] rounded-xl p-3 border animate-pulse" style={{ borderColor: C.border }}>
      <div className="w-6 h-4 rounded bg-[#F0E7D8] dark:bg-[var(--felpus-dark-muted-surface)] shrink-0" />
      <div className="w-9 h-9 rounded-full bg-[#F0E7D8] dark:bg-[var(--felpus-dark-muted-surface)] shrink-0" />
      <div className="flex-1 space-y-2 py-0.5">
        <div className="h-3.5 w-1/3 rounded bg-[#F0E7D8] dark:bg-[var(--felpus-dark-muted-surface)]" />
        <div className="h-2.5 w-1/2 rounded bg-[#F0E7D8] dark:bg-[var(--felpus-dark-muted-surface)]" />
      </div>
      <div className="h-4 w-8 rounded bg-[#F0E7D8] dark:bg-[var(--felpus-dark-muted-surface)] shrink-0" />
    </div>
  );
}

// Bottom sheet de filtros avanzados de Explorar — desliza desde abajo en vez
// de expandir inline, como en apps mobile premium (Airbnb, Booking). Se
// mantiene el mismo patrón visual que ya usa DetailModal (rounded-t-3xl,
// items-end en mobile / centrado en desktop).
export function FilterSheet({
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
  const C = useTheme();
  const sheetRef = useRef(null);
  useFocusTrap(open, sheetRef, onClose);

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
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filtros avanzados"
        className="felpus-sheet-panel bg-white dark:bg-[var(--felpus-dark-card)] rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-[var(--felpus-dark-card)] flex items-center justify-between px-4 pt-4 pb-3 border-b" style={{ borderColor: C.border }}>
          <h3 className="felpus-display text-lg" style={{ color: C.text }}>Filtros avanzados</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar filtros" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: C.surfaceSubtle }}>
            <X className="w-4 h-4" style={{ color: C.text }} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            <select
              value={filterTamano}
              onChange={(e) => setFilterTamano(e.target.value)}
              className="felpus-input flex-1 border rounded-lg px-3 py-2 text-sm bg-white dark:bg-[var(--felpus-dark-card)]"
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
              className="felpus-input flex-1 border rounded-lg px-3 py-2 text-sm bg-white dark:bg-[var(--felpus-dark-card)]"
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
                      ? { background: C.ink, color: C.cream, borderColor: C.ink }
                      : { color: C.muted, borderColor: C.border, background: C.surface }
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
              className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-[var(--felpus-dark-card)]"
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

        <div className="sticky bottom-0 bg-white dark:bg-[var(--felpus-dark-card)] border-t p-3 flex items-center gap-2" style={{ borderColor: C.border }}>
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
            style={{ background: C.emphasisBg }}
          >
            Ver {resultCount} {resultCount === 1 ? "resultado" : "resultados"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
