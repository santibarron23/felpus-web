"use client";

// Edición de una publicación por el administrador: datos y orden de las
// fotos (la primera es la que se ve en tarjetas, mapa y al compartir).
// Guarda vía /api/admin/report, que vuelve a verificar que sea el admin.
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Loader2, Star, X } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { authedFetch } from "../../lib/push";
import { COLOR_OPTIONS, EDAD_OPTIONS, PESO_OPTIONS, SEXO_OPTIONS, TAMANO_OPTIONS, fechaLabel } from "../../lib/matching";

function initialFields(r) {
  return {
    nombre: r.nombre || "",
    tipo: r.tipo,
    especie: r.especie || "perro",
    color: COLOR_OPTIONS.includes(r.color) ? r.color : "Otro color",
    color_otro: r.colorOtro || "",
    tamano: r.tamano || "mediano",
    sexo: r.sexo || "",
    edad: r.edad || "",
    peso: r.peso || "",
    raza: r.raza || "",
    zona: r.zona || "",
    ciudad: r.ciudad || "",
    fecha: r.fecha || "",
    descripcion: r.descripcion || "",
  };
}

export default function AdminEditReport({ report, onClose, onSaved }) {
  const C = useTheme();
  const [fields, setFields] = useState(() => initialFields(report));
  const [fotos, setFotos] = useState(() => (report.fotos || []).map((f) => f.url).filter(Boolean));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const firstRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const set = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }));
  const move = (i, delta) =>
    setFotos((list) => {
      const j = i + delta;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const makeMain = (i) => setFotos((list) => [list[i], ...list.filter((_, k) => k !== i)]);

  async function save(e) {
    e.preventDefault();
    setError("");
    if (!fields.zona.trim()) {
      setError("La zona no puede quedar vacía.");
      return;
    }
    setSaving(true);
    try {
      const original = (report.fotos || []).map((f) => f.url).filter(Boolean);
      const orderChanged = fotos.some((u, i) => u !== original[i]);
      const res = await authedFetch("/api/admin/report", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: report.id,
          fields: { ...fields, color_otro: fields.color === "Otro color" ? fields.color_otro : "" },
          ...(orderChanged ? { fotoOrder: fotos } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo guardar.");
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const input = "felpus-input w-full border rounded-lg px-3 py-2 text-sm";
  const inputStyle = { borderColor: C.border, color: C.text, background: C.surface };
  const label = "text-xs font-bold mb-1 block";
  const select = (key, options, labels = {}) => (
    <select id={`ae-${key}`} value={fields[key]} onChange={set(key)} className={input} style={inputStyle}>
      {options.map((o) => (
        <option key={o} value={o}>
          {labels[o] ?? (o || "Sin dato")}
        </option>
      ))}
    </select>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
      <form
        onSubmit={save}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-edit-title"
        className="felpus-fadein w-full sm:max-w-lg h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col sm:rounded-2xl border shadow-xl"
        style={{ background: C.cream, borderColor: C.border, color: C.text }}
      >
        <header className="flex items-center gap-2 px-4 py-3 border-b shrink-0" style={{ borderColor: C.border, background: C.surface }}>
          <h2 id="admin-edit-title" className="flex-1 font-bold text-base">
            Editar publicación
          </h2>
          <button
            ref={firstRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar sin guardar"
            className="w-10 h-10 rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {fotos.length > 0 && (
            <section aria-labelledby="ae-fotos">
              <h3 id="ae-fotos" className={label}>
                Fotos {fotos.length > 1 ? "— la primera es la principal" : ""}
              </h3>
              <ol className="grid grid-cols-3 gap-2">
                {fotos.map((url, i) => (
                  <li key={url} className="rounded-xl border overflow-hidden" style={{ borderColor: i === 0 ? C.red : C.border, background: C.surface }}>
                    <div className="relative aspect-square">
                      <Image src={url} alt={`Foto ${i + 1}`} fill sizes="128px" className="object-cover" />
                      {i === 0 && (
                        <span className="absolute top-1 left-1 text-[11px] font-bold text-white rounded-full px-2 py-0.5" style={{ background: C.redSolid }}>
                          Principal
                        </span>
                      )}
                    </div>
                    {fotos.length > 1 && (
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          aria-label={`Mover la foto ${i + 1} a la izquierda`}
                          className="w-10 h-10 flex items-center justify-center disabled:opacity-30"
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        {i !== 0 && (
                          <button
                            type="button"
                            onClick={() => makeMain(i)}
                            aria-label={`Hacer principal la foto ${i + 1}`}
                            title="Hacer principal"
                            className="w-10 h-10 flex items-center justify-center"
                            style={{ color: C.red }}
                          >
                            <Star className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => move(i, 1)}
                          disabled={i === fotos.length - 1}
                          aria-label={`Mover la foto ${i + 1} a la derecha`}
                          className="w-10 h-10 flex items-center justify-center disabled:opacity-30"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ae-tipo" className={label}>Tipo</label>
              {select("tipo", ["perdida", "encontrada"], { perdida: "Perdida", encontrada: "Encontrada" })}
            </div>
            <div>
              <label htmlFor="ae-especie" className={label}>Especie</label>
              {select("especie", ["perro", "gato", "otro"], { perro: "Perro", gato: "Gato", otro: "Otro" })}
            </div>
          </div>

          <div>
            <label htmlFor="ae-nombre" className={label}>Nombre</label>
            <input id="ae-nombre" value={fields.nombre} onChange={set("nombre")} maxLength={60} className={input} style={inputStyle} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ae-zona" className={label}>Zona</label>
              <input id="ae-zona" value={fields.zona} onChange={set("zona")} maxLength={100} required className={input} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="ae-ciudad" className={label}>Ciudad</label>
              <input id="ae-ciudad" value={fields.ciudad} onChange={set("ciudad")} maxLength={80} className={input} style={inputStyle} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ae-color" className={label}>Color</label>
              {select("color", COLOR_OPTIONS)}
            </div>
            <div>
              <label htmlFor="ae-tamano" className={label}>Tamaño</label>
              {select("tamano", TAMANO_OPTIONS, { chico: "Chico", mediano: "Mediano", grande: "Grande" })}
            </div>
          </div>
          {fields.color === "Otro color" && (
            <div>
              <label htmlFor="ae-color_otro" className={label}>Describí el color</label>
              <input id="ae-color_otro" value={fields.color_otro} onChange={set("color_otro")} maxLength={60} className={input} style={inputStyle} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ae-sexo" className={label}>Sexo</label>
              {select("sexo", ["", ...SEXO_OPTIONS])}
            </div>
            <div>
              <label htmlFor="ae-edad" className={label}>Edad</label>
              {select("edad", ["", ...EDAD_OPTIONS])}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ae-peso" className={label}>Peso</label>
              {select("peso", ["", ...PESO_OPTIONS])}
            </div>
            <div>
              <label htmlFor="ae-fecha" className={label}>{fechaLabel(fields.tipo)}</label>
              <input id="ae-fecha" type="date" value={fields.fecha} onChange={set("fecha")} className={input} style={inputStyle} />
            </div>
          </div>

          <div>
            <label htmlFor="ae-raza" className={label}>Raza</label>
            <input id="ae-raza" value={fields.raza} onChange={set("raza")} maxLength={60} className={input} style={inputStyle} />
          </div>

          <div>
            <label htmlFor="ae-descripcion" className={label}>Descripción</label>
            <textarea id="ae-descripcion" value={fields.descripcion} onChange={set("descripcion")} maxLength={1000} rows={4} className={input} style={inputStyle} />
          </div>
        </div>

        <footer className="px-4 py-3 border-t shrink-0 space-y-2" style={{ borderColor: C.border, background: C.surface, paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}>
          {error && (
            <p role="alert" className="text-sm font-semibold" style={{ color: C.dangerText }}>
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl py-3 text-sm font-bold border" style={{ borderColor: C.border, color: C.text }}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60 inline-flex items-center justify-center gap-2"
              style={{ background: C.redSolid }}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar cambios
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
