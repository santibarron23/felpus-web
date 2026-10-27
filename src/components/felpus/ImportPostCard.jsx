"use client";

// "¿Ya lo publicaste en Facebook?" (2026-10-27): arriba del formulario de
// reporte. Pegás el link (Felpus lee los metadatos públicos que Facebook
// entrega sin iniciar sesión) o, si Facebook no deja, subís una captura. La
// IA (Gemini, /api/import-post) lee el aviso y se completa el formulario de
// siempre: la persona revisa, corrige y publica con el botón Publicar. Nada
// se publica desde acá.
import { useRef, useState } from "react";
import { Check, ChevronDown, Facebook, ImageUp, Link2, Loader2 } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { logError } from "../../lib/log";
import { importSummary, importToFormFields, normalizeFacebookUrl } from "../../lib/postImport";
import { importPost, shrinkForUpload, toPhotoFile } from "../../lib/postImportClient";

const MAX_CAPTURA_MB = 15;

export default function ImportPostCard({ hasPhotos = false, onImport }) {
  const C = useTheme();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(null); // "link" | "captura" | null
  const [error, setError] = useState(null); // { code, message }
  const [done, setDone] = useState(null); // { completados, faltan, conFoto }
  const fileRef = useRef(null);

  async function finish(result, original) {
    let photoFile = null;
    try {
      if (result.photo) photoFile = await toPhotoFile(result.photo);
      else if (original && result.box) photoFile = await toPhotoFile(original, result.box);
    } catch (e) {
      logError("No se pudo preparar la foto importada", e);
    }
    const fields = importToFormFields(result.draft);
    await onImport({ fields, photoFile });
    setDone({ ...importSummary(result.draft, { hasPhoto: hasPhotos || !!photoFile }), conFoto: !!photoFile });
    setOpen(false);
    setLink("");
  }

  async function handleLink(e) {
    e?.preventDefault();
    setError(null);
    if (!normalizeFacebookUrl(link)) {
      setError({ code: "bad_url", message: "Pegá el link de una publicación de Facebook (facebook.com/…)." });
      return;
    }
    setBusy("link");
    const result = await importPost({ url: link.trim() });
    if (result.ok) await finish(result, null);
    else setError({ code: result.code, message: result.error });
    setBusy(null);
  }

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
    setBusy("captura");
    try {
      const image = await shrinkForUpload(file);
      const result = await importPost({ image });
      if (result.ok) await finish(result, file);
      else setError({ code: result.code, message: result.error });
    } catch (err) {
      logError("No se pudo leer la captura", err);
      setError({ code: "error", message: "No pudimos leer esa imagen. Probá con otra." });
    }
    setBusy(null);
  }

  const pideCaptura = error?.code === "needs_screenshot";

  return (
    <div className="bg-white rounded-2xl border" style={{ borderColor: C.border }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="import-post-panel"
        className="w-full flex items-center gap-3 p-3.5 text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
      >
        <span className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#E7F0FD", color: "#1877F2" }}>
          <Facebook size={18} aria-hidden="true" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold" style={{ color: C.text }}>
            ¿Ya lo publicaste en Facebook?
          </span>
          <span className="block text-xs" style={{ color: C.muted }}>
            Importalo y completamos el formulario por vos.
          </span>
        </span>
        <ChevronDown size={18} aria-hidden="true" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: C.muted }} />
      </button>

      {done && !open && (
        <div className="mx-3.5 mb-3.5 rounded-xl p-3 text-xs space-y-1" style={{ background: C.successBg, color: C.successText }} role="status">
          <p className="font-bold flex items-center gap-1.5">
            <Check size={14} aria-hidden="true" /> Listo: revisá el formulario y corregí lo que haga falta.
          </p>
          {done.completados.length > 0 && <p>Completamos: {done.completados.join(", ")}.</p>}
          {done.faltan.length > 0 && <p>Te falta: {done.faltan.join(", ")}.</p>}
          {!done.conFoto && <p>Agregá una foto de la mascota (una foto real, no la captura).</p>}
          <p>Tu contacto lo ponés vos abajo: no copiamos teléfonos ni nombres de la publicación.</p>
        </div>
      )}

      {open && (
        <div id="import-post-panel" className="px-3.5 pb-3.5 space-y-3">
          <div>
            <label htmlFor="import-post-link" className="block text-xs font-bold mb-1" style={{ color: C.text }}>
              Link de la publicación
            </label>
            <div className="flex gap-2">
              <input
                id="import-post-link"
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://www.facebook.com/…"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => {
                  // Adentro del <form> del reporte: Enter no tiene que publicar.
                  if (e.key === "Enter") handleLink(e);
                }}
                className="flex-1 min-w-0 rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={{ borderColor: C.border, background: C.surfaceSubtle, color: C.text }}
                disabled={!!busy}
              />
              <button
                type="button"
                onClick={handleLink}
                disabled={!!busy || !link.trim()}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-bold text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={{ background: C.redSolid }}
              >
                {busy === "link" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
                Leer
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs" style={{ color: C.muted }}>
            <span className="flex-1 h-px" style={{ background: C.border }} />o<span className="flex-1 h-px" style={{ background: C.border }} />
          </div>

          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={!!busy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-3 text-sm font-bold disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              style={{ borderColor: pideCaptura ? C.red : C.border, color: C.text, background: pideCaptura ? C.brandTintBg : "transparent" }}
            >
              {busy === "captura" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ImageUp size={16} aria-hidden="true" />}
              Subir captura de pantalla
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleCaptura} aria-label="Captura de pantalla de la publicación" />
            <p className="text-xs mt-1" style={{ color: C.muted }}>
              Que se vean el texto y la foto de la mascota.
            </p>
          </div>

          <div aria-live="polite">
            {busy && (
              <p className="text-xs" style={{ color: C.muted }}>
                Leyendo la publicación con IA… puede tardar unos segundos.
              </p>
            )}
            {error && (
              <p className="text-xs rounded-lg p-2.5" style={{ background: C.dangerBg, color: C.dangerText }}>
                {error.message}
                {pideCaptura && " Sacale una captura de pantalla y subila acá."}
                {error.code === "unavailable" && " Mientras tanto, completá el formulario a mano."}
              </p>
            )}
          </div>

          <p className="text-[11px] leading-snug" style={{ color: C.muted }}>
            Nada se publica hasta que lo revises y toques Publicar. No guardamos el link, y los teléfonos y nombres de
            personas de la publicación no se copian.
          </p>
        </div>
      )}
    </div>
  );
}
