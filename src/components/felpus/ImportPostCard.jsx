"use client";

// "¿Ya lo publicaste en redes?" (2026-10-27): una fila compacta debajo de
// "Perdí / Encontré", cerrada por defecto para que el formulario siga siendo
// lo principal. Al abrirla se sube la captura de una publicación (Facebook,
// Instagram, WhatsApp, un flyer); la IA (Gemini, /api/import-post) la lee y
// se completa el formulario de siempre — la foto de la mascota se recorta de
// la captura. FelpusMatcher marca después lo que falta. Nada se publica desde
// acá: la persona revisa y toca Publicar.
import { useRef, useState } from "react";
import { Check, ChevronDown, ImageUp, Loader2, ScanText } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { logError } from "../../lib/log";
import { importSummary, importToFormFields } from "../../lib/postImport";
import { importPost, shrinkForUpload, toPhotoFile } from "../../lib/postImportClient";

const MAX_CAPTURA_MB = 15;

export default function ImportPostCard({ onImport }) {
  const C = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); // { code, message }
  const [completados, setCompletados] = useState(null); // cantidad de datos completados
  const fileRef = useRef(null);

  async function handleCaptura(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError({ code: "error", message: "Ese archivo no es una imagen." });
      return;
    }
    if (file.size > MAX_CAPTURA_MB * 1024 * 1024) {
      setError({ code: "error", message: `La captura pesa demasiado (máx. ${MAX_CAPTURA_MB} MB).` });
      return;
    }
    setBusy(true);
    try {
      const result = await importPost({ image: await shrinkForUpload(file) });
      if (!result.ok) {
        setError({ code: result.code, message: result.error });
        return;
      }
      let photoFile = null;
      if (result.box) {
        try {
          photoFile = await toPhotoFile(file, result.box);
        } catch (err) {
          logError("No se pudo recortar la foto de la captura", err);
        }
      }
      setCompletados(importSummary(result.draft).completados.length);
      setOpen(false);
      await onImport({ fields: importToFormFields(result.draft), photoFile });
    } catch (err) {
      logError("No se pudo leer la captura", err);
      setError({ code: "error", message: "No pudimos leer esa imagen. Probá con otra." });
    } finally {
      setBusy(false);
    }
  }

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
              : "Subí una captura y completamos los datos por vos"}
          </span>
        </span>
        <ChevronDown size={18} aria-hidden="true" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: C.muted }} />
      </button>

      {open && (
        <div id="import-captura-panel" className="px-3.5 pb-3.5 space-y-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 text-sm font-bold disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
            style={{ borderColor: C.border, color: C.text, background: C.surfaceSubtle }}
          >
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ImageUp size={16} aria-hidden="true" />}
            {busy ? "Leyendo el aviso… (hasta 20 s)" : "Elegir captura del aviso"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleCaptura} aria-label="Captura del aviso" />

          {error ? (
            <p className="text-xs rounded-lg p-2.5" style={{ background: C.dangerBg, color: C.dangerText }} role="alert">
              {error.message}
              {error.code === "unavailable" && " Podés completar el formulario a mano."}
            </p>
          ) : (
            <p className="text-xs leading-snug" style={{ color: C.muted }}>
              Que se vean el texto y la foto. La captura solo se usa para leer el aviso: no se publica ni se guarda.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
