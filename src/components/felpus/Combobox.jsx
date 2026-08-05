"use client";

// Reemplaza a <input list="..."> + <datalist>: esa combinación funciona
// bien en Chrome/Firefox de escritorio, pero el soporte en navegadores
// mobile es muy pobre o directamente inexistente (sobre todo Safari en
// iOS) — el desplegable de sugerencias simplemente no aparece al escribir,
// aunque el campo siga aceptando texto libre. Esto es un combobox real
// (patrón WAI-ARIA "combobox with list autocomplete"), con el mismo
// comportamiento en cualquier navegador: filtra mientras se escribe, se
// puede tocar/clickear una opción o navegar con flechas + Enter, y sigue
// aceptando cualquier texto que no esté en la lista.
import { useEffect, useId, useRef, useState } from "react";
import { normalizeText } from "../../lib/matching";
import { useTheme } from "./ThemeProvider";

export default function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder,
  maxLength,
  className,
  style,
}) {
  const C = useTheme();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const listboxId = useId();

  const normalizedValue = normalizeText(value).trim();
  // Con el campo vacío, muestra todas las opciones (mismo comportamiento
  // que el <datalist> nativo al enfocar un input vacío) — filtra recién
  // cuando hay algo escrito.
  const filtered = normalizedValue
    ? options.filter((opt) => normalizeText(opt).includes(normalizedValue))
    : options;

  // Cierra el desplegable al tocar/clickear afuera — el mousedown (no
  // click) es a propósito: sin esto, tocar una opción de la lista dispara
  // primero el blur del input (que cerraría la lista) y el click en la
  // opción nunca llega a registrarse.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        // Sin esto, aria-activedescendant (más abajo) seguía apuntando al
        // id de una opción resaltada que ya no existe en el DOM (la lista
        // deja de renderizarse en cuanto open es false) — un lector de
        // pantalla podía referenciar un elemento fantasma hasta la próxima
        // vez que se abriera el combobox.
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  function selectOption(opt) {
    onChange(opt);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && activeIndex >= 0 && filtered[activeIndex]) {
        e.preventDefault();
        selectOption(filtered[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        maxLength={maxLength}
        placeholder={placeholder}
        className={className}
        style={style}
      />
      {open && filtered.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border shadow-lg py-1"
          style={{ borderColor: C.border, background: C.surface }}
        >
          {filtered.map((opt, i) => (
            <li key={opt} id={`${listboxId}-opt-${i}`} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onClick={() => selectOption(opt)}
                onMouseEnter={() => setActiveIndex(i)}
                // min-h-11 (44px): área táctil cómoda en mobile, que es
                // justamente el caso que este componente existe para
                // arreglar.
                className="w-full min-h-11 text-left px-3 py-2 text-sm"
                style={{ color: C.text, background: i === activeIndex ? C.surfaceSubtle : "transparent" }}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
