"use client";

// "¿Ya lo publicaste en redes?" (2026-10-27): una fila compacta debajo de
// "Perdí / Encontré", cerrada por defecto para que el formulario siga siendo
// lo principal. Al abrirla se sube la captura de una publicación (Facebook,
// Instagram, WhatsApp, un flyer); la IA (Gemini, /api/import-post) la lee y
// se completa el formulario de siempre — la foto de la mascota se recorta de
// la captura. FelpusMatcher marca después lo que falta. Nada se publica desde
// acá: la persona revisa y toca Publicar.
//
// 2026-11-02, más potente:
// - Hasta MAX_CAPTURAS capturas del mismo aviso en una sola lectura (la
//   foto en una, el texto en otra).
// - Se pueden pegar (Ctrl+V) o arrastrar, además de elegirlas.
// - Texto del aviso pegado, solo o junto con las capturas.
// Elegir, pegar o arrastrar capturas ya empieza a leer (el camino rápido de
// siempre); el texto pegado se lee con su botón, o junto con las capturas.
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ImageUp, Loader2, ScanText } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { logError } from "../../lib/log";
import { importSummary, importToFormFields, MAX_CAPTURAS, MAX_POST_TEXT_CHARS, MIN_POST_TEXT_CHARS } from "../../lib/postImport";
import { importPost, shrinkForUpload, toPhotoFile } from "../../lib/postImportClient";

const MAX_CAPTURA_MB = 15;
// Mientras la IA lee: qué está pasando, en vez de una espera muda.
const PASOS = ["Leyendo el aviso…", "Buscando la foto de la mascota…", "Completando el formulario…"];

export default function ImportPostCard({ onImport }) {
  const C = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paso, setPaso] = useState(0);
  const [error, setError] = useState(null); // { code, message }
  const [completados, setCompletados] = useState(null); // cantidad de datos completados
  const [texto, setTexto] = useState("");
  const [arrastrando, setArrastrando] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!busy) return;
    setPaso(0);
    const t = setInterval(() => setPaso((p) => Math.min(p + 1, PASOS.length - 1)), 4000);
    return () => clearInterval(t);
  }, [busy]);

  // Capturas (Files) y/o el texto pegado → formulario.
  async function leer(archivos) {
    if (busy) return;
    setError(null);
    const imagenes = archivos.filter((f) => f && f.type?.startsWith("image/"));
    if (archivos.length && !imagenes.length) {
      setError({ code: "error", message: "Eso no es una imagen." });
      return;
    }
    if (imagenes.length > MAX_CAPTURAS) {
      setError({ code: "error", message: `Hasta ${MAX_CAPTURAS} capturas por vez: elegí las que muestran la foto y el texto.` });
      return;
    }
    if (imagenes.some((f) => f.size > MAX_CAPTURA_MB * 1024 * 1024)) {
      setError({ code: "error", message: `Una de las capturas pesa demasiado (máx. ${MAX_CAPTURA_MB} MB).` });
      return;
    }
    const textoAviso = texto.trim();
    if (!imagenes.length && textoAviso.length < MIN_POST_TEXT_CHARS) {
      setError({ code: "error", message: "Pegá el texto completo del aviso o subí una captura." });
      return;
    }
    setBusy(true);
    try {
      // Con varias, un poco más chicas: el texto se sigue leyendo bien y el
      // envío no se hace pesado.
      const maxDim = imagenes.length > 1 ? 1280 : 1600;
      const images = await Promise.all(imagenes.map((f) => shrinkForUpload(f, maxDim)));
      const result = await importPost({ images, ...(textoAviso ? { text: textoAviso } : {}) });
      if (!result.ok) {
        setError({ code: result.code, message: result.error });
        return;
      }
      let photoFile = null;
      const conFoto = imagenes[result.boxImagen ?? 0] || imagenes[0];
      if (result.box && conFoto) {
        try {
          photoFile = await toPhotoFile(conFoto, result.box);
        } catch (err) {
          logError("No se pudo recortar la foto de la captura", err);
        }
      }
      setCompletados(importSummary(result.draft).completados.length);
      setOpen(false);
      setTexto("");
      await onImport({ fields: importToFormFields(result.draft), photoFile, contacto: result.contacto || null });
    } catch (err) {
      logError("No se pudo leer la captura", err);
      setError({ code: "error", message: "No pudimos leer esa imagen. Probá con otra." });
    } finally {
      setBusy(false);
    }
  }

  function elegidas(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (files.length) leer(files);
  }

  // Ctrl+V de una captura en cualquier parte del panel (el texto se pega
  // normal en su campo).
  function pegar(e) {
    const imagenes = [...(e.clipboardData?.items || [])].filter((it) => it.kind === "file" && it.type.startsWith("image/")).map((it) => it.getAsFile());
    if (!imagenes.length) return;
    e.preventDefault();
    leer(imagenes);
  }

  function soltar(e) {
    e.preventDefault();
    setArrastrando(false);
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) leer(files);
  }

  const textoListo = texto.trim().length >= MIN_POST_TEXT_CHARS;

  return (
    <div className="bg-white rounded-2xl border" style={{ borderColor: C.border }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="import-captura-panel"
        className="w-full min-h-[56px] flex items-center gap-3 px-3.5 py-2.5 text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
      >
        <span
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
          style={completados != null ? { background: C.successBg, color: C.green } : { background: C.brandTintBg, color: C.red }}
        >
          {completados != null ? <Check size={16} aria-hidden="true" /> : <ScanText size={16} aria-hidden="true" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold leading-tight" style={{ color: C.text }}>
            ¿Ya lo publicaste en redes?
          </span>
          <span className="block text-xs leading-snug" style={{ color: completados != null ? C.successText : C.muted }} aria-live="polite">
            {completados != null
              ? `Completamos ${completados} ${completados === 1 ? "dato" : "datos"} · revisá lo marcado`
              : "Subí capturas o pegá el texto y completamos los datos por vos"}
          </span>
        </span>
        <ChevronDown size={18} aria-hidden="true" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: C.muted }} />
      </button>

      {open && (
        <div id="import-captura-panel" className="px-3.5 pb-3.5 space-y-2" onPaste={pegar}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={soltar}
            disabled={busy}
            className="w-full min-h-[56px] inline-flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed px-3 py-2 text-sm font-bold disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
            style={{ borderColor: arrastrando ? C.red : C.border, color: C.text, background: arrastrando ? C.brandTintBg : C.surfaceSubtle }}
          >
            <span className="inline-flex items-center gap-2" aria-live="polite">
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ImageUp size={16} aria-hidden="true" />}
              {busy ? PASOS[paso] : `Elegir capturas del aviso (hasta ${MAX_CAPTURAS})`}
            </span>
            {!busy && (
              <span className="text-[11px] font-normal" style={{ color: C.muted }}>
                También podés pegarlas (Ctrl+V) o arrastrarlas acá
              </span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={elegidas} aria-label="Capturas del aviso" />

          <div>
            <label htmlFor="import-texto" className="text-[12px] font-semibold block mb-1" style={{ color: C.muted }}>
              ¿Tenés el texto del aviso? Pegalo acá <span className="font-normal">(opcional)</span>
            </label>
            <textarea
              id="import-texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={MAX_POST_TEXT_CHARS}
              rows={3}
              disabled={busy}
              placeholder="Ej: Se perdió Luna, perrita negra con collar rojo, en Tres Cerritos…"
              className="felpus-input w-full border rounded-lg px-3 py-2 text-sm"
              style={{ borderColor: C.border, color: C.text, background: C.surfaceSubtle }}
            />
            {textoListo && !busy && (
              <button
                type="button"
                onClick={() => leer([])}
                className="mt-1.5 w-full min-h-[44px] rounded-xl text-sm font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--felpus-focus)]"
                style={{ background: C.redSolid }}
              >
                Completar con este texto
              </button>
            )}
            {textoListo && !busy && (
              <p className="text-[11px] mt-1" style={{ color: C.muted }}>Si además elegís capturas, se leen junto con el texto.</p>
            )}
          </div>

          {error ? (
            <p className="text-xs rounded-lg p-2.5" style={{ background: C.dangerBg, color: C.dangerText }} role="alert">
              {error.message}
              {error.code === "unavailable" && " Podés completar el formulario a mano."}
            </p>
          ) : (
            <p className="text-xs leading-snug" style={{ color: C.muted }}>
              Que se vean el texto y la foto. Las capturas solo se usan para leer el aviso: no se publican ni se guardan.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
