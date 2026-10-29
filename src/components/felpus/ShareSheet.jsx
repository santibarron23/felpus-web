"use client";

// Hoja "Compartir" de un reporte (2026-10-27). Reemplaza al menú chiquito y
// al salto directo a la hoja nativa: en el celular es un panel desde abajo
// con botones grandes, y arriba se ve la vista previa tal cual la va a ver
// quien reciba el link (la imagen de /r/<id>/opengraph-image).
//
// Historias: Instagram no tiene un link web para subir a historias. Lo que
// sí funciona es pasarle una imagen a la hoja nativa del celular, donde
// Instagram aparece con "Historias". Por eso la imagen vertical
// (/r/<id>/historia) se baja apenas se abre esta hoja: si se bajara recién
// al tocar el botón, Safari en iPhone rechaza el compartir (pasó demasiado
// tiempo desde el toque). El link se copia antes, para pegarlo en el sticker
// "Enlace" de Instagram.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, Facebook, Instagram, Loader2, MessageCircle, Share2, Twitter, X } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useFocusTrap } from "./useFocusTrap";
import { logError } from "../../lib/log";
import { buildShareMessage, whatsappUrl } from "../../lib/shareCard";
import { track } from "../../lib/analytics";

// Botón → canal para analytics (ver lib/analytics.js).
const SHARE_CANAL = { wa: "whatsapp", fb: "facebook", ig: "instagram", copy: "copiar", more: "nativo", x: "nativo" };

function canShareFiles() {
  try {
    if (typeof navigator === "undefined" || !navigator.canShare) return false;
    return navigator.canShare({ files: [new File([""], "x.jpg", { type: "image/jpeg" })] });
  } catch {
    return false;
  }
}

export default function ShareSheet({ report, onClose }) {
  const C = useTheme();
  const panelRef = useRef(null);
  useFocusTrap(true, panelRef, onClose);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const id = encodeURIComponent(report.id);
  const shareUrl = `${origin}/r/${id}`;
  const previewUrl = `/r/${id}/opengraph-image`;
  const storyUrl = `/r/${id}/historia`;
  const message = buildShareMessage(report);
  const [copied, setCopied] = useState(false);
  const [previewOk, setPreviewOk] = useState(true);
  const [story, setStory] = useState({ file: null, loading: false, error: false });
  const [storyTip, setStoryTip] = useState(false);
  const [nativeShare, setNativeShare] = useState(false);
  const [filesShare, setFilesShare] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setNativeShare(typeof navigator !== "undefined" && !!navigator.share);
    setFilesShare(canShareFiles());
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Precarga de la imagen para historias (solo donde se puede compartir un
  // archivo: celulares).
  useEffect(() => {
    if (!filesShare) return;
    let cancelled = false;
    setStory({ file: null, loading: true, error: false });
    fetch(storyUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`historia ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        const file = new File([blob], `felpus-${report.id}.jpg`, { type: blob.type || "image/jpeg" });
        setStory({ file, loading: false, error: false });
      })
      .catch((e) => {
        if (cancelled) return;
        logError("No se pudo preparar la imagen para historias", e);
        setStory({ file: null, loading: false, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [filesShare, storyUrl, report.id]);

  function open(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      logError("No se pudo copiar el enlace", e);
    }
  }

  async function shareStory() {
    // Sin hoja nativa con archivos (computadora): se descarga la imagen.
    if (!filesShare || !story.file) {
      const a = document.createElement("a");
      a.href = storyUrl;
      a.download = `felpus-historia-${report.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStoryTip(true);
      return;
    }
    // Primero el link al portapapeles (sin esperar): así ya está listo para
    // el sticker "Enlace" de Instagram.
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setStoryTip(true);
    try {
      await navigator.share({ files: [story.file] });
    } catch (e) {
      if (e?.name !== "AbortError") logError("No se pudo compartir la historia", e);
    }
  }

  async function shareNative() {
    try {
      await navigator.share({ title: "Felpus", text: message, url: shareUrl });
      onClose();
    } catch (e) {
      if (e?.name !== "AbortError") logError("No se pudo compartir con la hoja nativa", e);
    }
  }

  const actions = [
    {
      key: "wa",
      label: "WhatsApp",
      icon: MessageCircle,
      bg: "#25D366",
      onClick: () => open(whatsappUrl(`${message}\n${shareUrl}`)),
    },
    {
      key: "fb",
      label: "Facebook",
      icon: Facebook,
      bg: "#1877F2",
      onClick: () => open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`),
    },
    {
      key: "ig",
      label: "Historia",
      icon: story.loading ? Loader2 : filesShare ? Instagram : Download,
      bg: "linear-gradient(45deg, #F58529, #DD2A7B 55%, #8134AF)",
      onClick: shareStory,
      disabled: filesShare && story.loading,
      spin: story.loading,
    },
    {
      key: "copy",
      label: copied ? "¡Copiado!" : "Copiar enlace",
      icon: copied ? Check : Copy,
      bg: copied ? C.greenSolid : C.emphasisBg,
      onClick: copyLink,
    },
    nativeShare
      ? { key: "more", label: "Más apps", icon: Share2, bg: C.redSolid, onClick: shareNative }
      : {
          key: "x",
          label: "X",
          icon: Twitter,
          bg: "#111111",
          onClick: () => open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(shareUrl)}`),
        },
  ];

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end sm:items-center justify-center felpus-sheet-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className="felpus-sheet-panel w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[92dvh] overflow-y-auto"
        style={{ background: C.surface, paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="share-title" className="font-bold text-lg" style={{ color: C.text }}>
            Compartir
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center" style={{ color: C.text }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {previewOk && (
          <figure className="space-y-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- imagen generada por el servidor, no pasa por next/image */}
            <img
              src={previewUrl}
              alt="Vista previa de la publicación"
              width={1200}
              height={630}
              onError={() => setPreviewOk(false)}
              className="w-full h-auto rounded-2xl border"
              style={{ borderColor: C.border, aspectRatio: "1200 / 630", background: C.surfaceMuted }}
            />
            <figcaption className="text-[12px] text-center" style={{ color: C.muted }}>
              Así se va a ver en WhatsApp y Facebook
            </figcaption>
          </figure>
        )}

        <ul className="grid grid-cols-5 gap-1">
          {actions.map((a) => (
            <li key={a.key}>
              <button
                type="button"
                onClick={() => {
                  track("reporte_compartido", { canal: SHARE_CANAL[a.key], tipo: report.tipo });
                  a.onClick();
                }}
                disabled={a.disabled}
                className="w-full flex flex-col items-center gap-1.5 py-1 rounded-xl disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              >
                <span className="w-14 h-14 rounded-full flex items-center justify-center text-white" style={{ background: a.bg }}>
                  <a.icon className={`w-6 h-6 ${a.spin ? "animate-spin" : ""}`} aria-hidden="true" />
                </span>
                <span className="text-[12px] font-semibold leading-tight text-center" style={{ color: C.text }}>
                  {a.label}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {storyTip && (
          <p className="text-[13px] rounded-xl p-3" style={{ background: C.brandTintBg, color: C.text }} role="status">
            {filesShare ? (
              <>
                Elegí <b>Instagram → Historia</b>. Ya copiamos el enlace: agregá el sticker <b>“Enlace”</b> y pegalo, así
                pueden tocar y ver la publicación.
              </>
            ) : (
              <>Se descargó la imagen vertical. Subila a tu historia y agregá el sticker “Enlace” con este link: {shareUrl}</>
            )}
          </p>
        )}
        {story.error && filesShare && (
          <p className="text-[12px]" style={{ color: C.muted }}>
            No se pudo preparar la imagen para historias. Probá de nuevo en un rato.
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}
