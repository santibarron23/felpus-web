"use client";

// Recortar una foto (2026-10-29): en el formulario al cargarla, y en la
// edición del admin. El marco se arrastra para moverlo y se agranda o achica
// desde las esquinas (con el dedo o el mouse); con el teclado, las flechas lo
// mueven y Shift + flechas cambian el tamaño. Las cuentas están en lib/crop.js.
//
// src puede ser un data URL (foto recién cargada) o la URL pública de una
// foto ya publicada (admin): se carga con crossOrigin para poder leerla en un
// canvas. onDone recibe el recorte como data URL JPEG.
import { useEffect, useRef, useState } from "react";
import { Crop, X } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useFocusTrap } from "./useFocusTrap";
import { moverRect, redimensionarRect, rectConTecla, rectEnPixeles, esCompleto, RECTO_COMPLETO } from "../../lib/crop";

const ESQUINAS = [
  { id: "nw", style: { left: 0, top: 0 }, cursor: "nwse-resize" },
  { id: "ne", style: { right: 0, top: 0 }, cursor: "nesw-resize" },
  { id: "sw", style: { left: 0, bottom: 0 }, cursor: "nesw-resize" },
  { id: "se", style: { right: 0, bottom: 0 }, cursor: "nwse-resize" },
];

// Recorta la imagen ya cargada (img) al rectángulo r y devuelve un data URL.
export function recortarImagen(img, r, calidad = 0.9) {
  const { sx, sy, sw, sh } = rectEnPixeles(r, img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.toDataURL("image/jpeg", calidad);
}

export default function PhotoCropper({ src, onCancel, onDone, titulo = "Recortar la foto" }) {
  const C = useTheme();
  const panelRef = useRef(null);
  const imgRef = useRef(null);
  const marcoRef = useRef(null);
  const arrastre = useRef(null); // { modo: "mover" | esquina, x, y, rect }
  const [rect, setRect] = useState({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
  const [estado, setEstado] = useState("cargando"); // cargando | listo | error | guardando
  useFocusTrap(true, panelRef, onCancel);

  useEffect(() => {
    if (estado === "listo") marcoRef.current?.focus();
  }, [estado]);

  function empezar(e, modo) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    arrastre.current = { modo, x: e.clientX, y: e.clientY, rect };
  }
  function mover(e) {
    const a = arrastre.current;
    const img = imgRef.current;
    if (!a || !img) return;
    const dx = (e.clientX - a.x) / img.clientWidth;
    const dy = (e.clientY - a.y) / img.clientHeight;
    setRect(a.modo === "mover" ? moverRect(a.rect, dx, dy) : redimensionarRect(a.rect, a.modo, dx, dy));
  }
  function soltar() {
    arrastre.current = null;
  }

  function aceptar() {
    const img = imgRef.current;
    if (!img) return;
    if (esCompleto(rect)) return onCancel();
    setEstado("guardando");
    try {
      onDone(recortarImagen(img, rect));
    } catch {
      // Una foto remota sin permiso de lectura (CORS) no se puede recortar.
      setEstado("error");
    }
  }

  const pct = (v) => `${v * 100}%`;

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:p-4 bg-black/60" onClick={onCancel}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cropper-title"
        aria-describedby="cropper-ayuda"
        className="felpus-fadein w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-4 space-y-3 max-h-[100dvh] overflow-y-auto"
        style={{ background: C.surface, color: C.text, paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="cropper-title" className="font-bold text-lg flex items-center gap-2">
            <Crop className="w-5 h-5" aria-hidden="true" /> {titulo}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancelar el recorte"
            className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <p id="cropper-ayuda" className="text-[13px] leading-snug" style={{ color: C.muted }}>
          Mové el recuadro y agrandalo o achicalo desde las esquinas para que se vea bien la mascota. Con el teclado: flechas
          para mover, Shift + flechas para cambiar el tamaño.
        </p>

        <div className="flex justify-center">
          <div className="relative inline-block select-none touch-none" onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL o foto del bucket, se lee en un canvas */}
            <img
              ref={imgRef}
              src={src}
              crossOrigin={src.startsWith("data:") ? undefined : "anonymous"}
              alt="Foto a recortar"
              draggable={false}
              onLoad={() => setEstado("listo")}
              onError={() => setEstado("error")}
              className="block max-w-full max-h-[55dvh] w-auto h-auto rounded-lg"
            />
            {estado !== "cargando" && estado !== "error" && (
              <>
                {/* Afuera del recorte, oscurecido (4 franjas). */}
                {[
                  { left: 0, top: 0, width: "100%", height: pct(rect.y) },
                  { left: 0, top: pct(rect.y + rect.h), width: "100%", bottom: 0 },
                  { left: 0, top: pct(rect.y), width: pct(rect.x), height: pct(rect.h) },
                  { left: pct(rect.x + rect.w), top: pct(rect.y), right: 0, height: pct(rect.h) },
                ].map((s, i) => (
                  <div key={i} className="absolute bg-black/55 pointer-events-none" style={s} aria-hidden="true" />
                ))}
                <div
                  ref={marcoRef}
                  tabIndex={0}
                  role="group"
                  aria-label={`Recuadro de recorte: ${Math.round(rect.w * 100)} % de ancho y ${Math.round(rect.h * 100)} % de alto`}
                  onPointerDown={(e) => empezar(e, "mover")}
                  onKeyDown={(e) => {
                    const n = rectConTecla(rect, e.key, e.shiftKey);
                    if (n) {
                      e.preventDefault();
                      setRect(n);
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      aceptar();
                    }
                  }}
                  className="absolute border-2 border-white cursor-move focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--felpus-focus)]"
                  style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h), boxShadow: "0 0 0 1px rgba(0,0,0,0.5)" }}
                >
                  {ESQUINAS.map((q) => (
                    // Área táctil de 44 px; el cuadrado visible es más chico.
                    <span
                      key={q.id}
                      onPointerDown={(e) => empezar(e, q.id)}
                      className="absolute w-11 h-11 -m-[22px] flex items-center justify-center"
                      style={{ ...q.style, cursor: q.cursor }}
                      aria-hidden="true"
                    >
                      <span className="w-4 h-4 rounded-sm bg-white shadow" style={{ border: "2px solid rgba(0,0,0,0.6)" }} />
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {estado === "error" && (
          <p role="alert" className="text-sm font-semibold" style={{ color: C.dangerText }}>
            No pudimos abrir esta foto para recortarla. Probá de nuevo o cancelá.
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRect(RECTO_COMPLETO)}
            className="min-h-[48px] px-3 rounded-xl border text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
            style={{ borderColor: C.border, color: C.text }}
          >
            Foto completa
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[48px] rounded-xl border text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
            style={{ borderColor: C.border, color: C.text }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={aceptar}
            disabled={estado !== "listo"}
            className="flex-1 min-h-[48px] rounded-xl text-sm font-bold text-white disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--felpus-focus)]"
            style={{ background: C.emphasisBg }}
          >
            {estado === "guardando" ? "Recortando…" : "Recortar"}
          </button>
        </div>
      </div>
    </div>
  );
}
