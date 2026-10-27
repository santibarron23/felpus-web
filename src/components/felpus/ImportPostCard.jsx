"use client";

// "¿Ya está publicado en redes?" (2026-10-27): arriba del formulario de
// reporte. La persona sube la captura de una publicación (Facebook,
// Instagram, WhatsApp, un flyer), la IA (Gemini, /api/import-post) la lee y
// se completa el formulario de siempre; la foto de la mascota se recorta de
// la captura. La persona revisa, corrige y publica con el botón Publicar:
// nada se publica desde acá.
//
// Antes también se podía pegar el link del post de Facebook, pero Facebook
// casi nunca deja leerlo sin iniciar sesión — se sacó.
import { useRef, useState } from "react";
import { Check, ImageUp, Loader2, ScanText } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { logError } from "../../lib/log";
import { importSummary, importToFormFields } from "../../lib/postImport";
import { importPost, shrinkForUpload, toPhotoFile } from "../../lib/postImportClient";

const MAX_CAPTURA_MB = 15;

export default function ImportPostCard({ hasPhotos = false, onImport }) {
  const C = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); // { code, message }
  const [done, setDone] = useState(null); // { completados, faltan, conFoto }
  const fileRef = useRef(null);

  async function handleCaptura(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setDone(null);
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
      await onImport({ fields: importToFormFields(result.draft), photoFile });
      setDone({ ...importSummary(result.draft, { hasPhoto: hasPhotos || !!photoFile }), conFoto: !!photoFile });
    } catch (err) {
      logError("No se pudo leer la captura", err);
      setError({ code: "error", message: "No pudimos leer esa imagen. Probá con otra." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border p-3.5 space-y-3" style={{ borderColor: C.border }}>
      <div className="flex items-center gap-3">
        <span className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: C.brandTintBg, color: C.red }}>
          <ScanText size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: C.text }}>
            ¿Ya está publicado en redes?
          </p>
          <p className="text-xs" style={{ color: C.muted }}>
            Subí una captura del aviso y completamos el formulario por vos.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-3 text-sm font-bold disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
        style={{ borderColor: C.border, color: C.text }}
      >
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ImageUp size={16} aria-hidden="true" />}
        {busy ? "Leyendo la captura…" : "Subir captura del aviso"}
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleCaptura} aria-label="Captura del aviso" />

      <div aria-live="polite">
        {busy && (
          <p className="text-xs" style={{ color: C.muted }}>
            La IA está leyendo el aviso… puede tardar hasta 20 segundos.
          </p>
        )}
        {error && (
          <p className="text-xs rounded-lg p-2.5" style={{ background: C.dangerBg, color: C.dangerText }}>
            {error.message}
            {error.code === "unavailable" && " Mientras tanto, completá el formulario a mano."}
          </p>
        )}
        {done && (
          <div className="rounded-xl p-3 text-xs space-y-1" style={{ background: C.successBg, color: C.successText }} role="status">
            <p className="font-bold flex items-center gap-1.5">
              <Check size={14} aria-hidden="true" /> Listo: revisá el formulario y corregí lo que haga falta.
            </p>
            {done.completados.length > 0 && <p>Completamos: {done.completados.join(", ")}.</p>}
            {done.faltan.length > 0 && <p>Te falta: {done.faltan.join(", ")}.</p>}
            {!done.conFoto && <p>Agregá una foto de la mascota (una foto real, no la captura).</p>}
            <p>Tu contacto lo ponés vos abajo: no copiamos teléfonos ni nombres del aviso.</p>
          </div>
        )}
      </div>

      {!done && (
        <p className="text-[11px] leading-snug" style={{ color: C.muted }}>
          Que se vean el texto y la foto de la mascota. Nada se publica hasta que lo revises y toques Publicar, y la
          captura no se guarda.
        </p>
      )}
    </div>
  );
}
