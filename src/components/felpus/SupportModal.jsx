"use client";

// Ventana "Apoyar" a un colaborador (2026-10-26): muestra su alias para
// transferirle POR FUERA de Felpus. Felpus no cobra ni intermedia nada, y
// apoyar no da ninguna ventaja dentro de la app (regla de Google Play y
// Apple para regalos entre personas). El alias se pide al servidor recién
// al abrir esta ventana (ver /api/support-alias), nunca viene con el ranking.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, ExternalLink, Flag, HeartHandshake, Loader2, ShieldAlert, X } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useFocusTrap } from "./useFocusTrap";
import { fetchSupportAlias, flagSupport } from "../../lib/store";
import { SUPPORT_FLAG_REASONS } from "../../lib/support";

export default function SupportModal({ contributor, onClose }) {
  const C = useTheme();
  const panelRef = useRef(null);
  useFocusTrap(true, panelRef, onClose);
  const [state, setState] = useState({ loading: true, alias: "", error: "" });
  const [copied, setCopied] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [flagMsg, setFlagMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchSupportAlias(contributor.id)
      .then((d) => !cancelled && setState({ loading: false, alias: d.alias, error: "" }))
      .catch((e) => !cancelled && setState({ loading: false, alias: "", error: e.message }));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelled = true;
      document.body.style.overflow = prev;
    };
  }, [contributor.id]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(state.alias);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function report(reason) {
    try {
      await flagSupport(contributor.id, reason);
      setFlagMsg("Gracias. Lo vamos a revisar.");
    } catch (e) {
      setFlagMsg(e.message);
    } finally {
      setFlagging(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end sm:items-center justify-center felpus-sheet-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-title"
        className="felpus-sheet-panel w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4"
        style={{ background: C.surface, paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: C.brandTintBg, color: C.red }}>
            <HeartHandshake className="w-5 h-5" aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 id="support-title" className="font-bold text-base" style={{ color: C.text }}>
              Apoyar a {contributor.nickname}
            </h2>
            <p className="text-[13px]" style={{ color: C.muted }}>
              Un regalo voluntario, de persona a persona, por ayudar a reencontrar mascotas.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-9 h-9 -mr-1 rounded-full flex items-center justify-center" style={{ color: C.text }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {state.loading ? (
          <p className="flex items-center gap-2 text-sm py-3" style={{ color: C.muted }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Buscando el alias…
          </p>
        ) : state.error ? (
          <p className="text-sm rounded-xl border p-3" style={{ borderColor: C.border, color: C.muted }} role="status">
            {state.error}
          </p>
        ) : (
          <>
            <div className="rounded-2xl border p-3" style={{ borderColor: C.border, background: C.surfaceSubtle }}>
              <p className="text-[11px] uppercase font-bold" style={{ color: C.muted }}>Alias o CBU/CVU</p>
              <p className="felpus-mono text-lg break-all" style={{ color: C.text }}>{state.alias}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={copy}
                className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold text-white"
                style={{ background: copied ? C.greenSolid : C.redSolid }}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? "Copiado" : "Copiar alias"}
              </button>
              <a
                href="https://www.mercadopago.com.ar/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold border"
                style={{ borderColor: C.border, color: C.text }}
              >
                <ExternalLink className="w-4 h-4" /> Mercado Pago
              </a>
            </div>
            <p className="text-[12px]" style={{ color: C.muted }}>
              Copiá el alias y transferí desde tu banco o billetera, por el monto que quieras.
            </p>
          </>
        )}

        <div className="flex gap-2 rounded-xl p-3" style={{ background: C.dangerBg }}>
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" style={{ color: C.dangerText }} aria-hidden="true" />
          <p className="text-[12px]" style={{ color: C.dangerText }}>
            Felpus no participa en los pagos ni cobra nada. Apoyar no da ventajas en la app. Nunca le transfieras a
            nadie para recuperar a tu mascota: si alguien te pide plata a cambio, denuncialo.
          </p>
        </div>

        <div>
          {flagMsg ? (
            <p className="text-[12px]" style={{ color: C.muted }} role="status">{flagMsg}</p>
          ) : flagging ? (
            <div className="space-y-1.5">
              <p className="text-[12px] font-semibold" style={{ color: C.text }}>¿Qué pasó?</p>
              {SUPPORT_FLAG_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => report(r)}
                  className="w-full text-left text-[13px] rounded-lg border px-3 py-2"
                  style={{ borderColor: C.border, color: C.text }}
                >
                  {r}
                </button>
              ))}
            </div>
          ) : (
            <button type="button" onClick={() => setFlagging(true)} className="flex items-center gap-1.5 text-[12px] font-semibold py-1" style={{ color: C.muted }}>
              <Flag className="w-3.5 h-3.5" /> Reportar abuso
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
