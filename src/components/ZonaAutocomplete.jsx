"use client";

import { useEffect, useId, useRef, useState } from "react";
import { searchPlaces } from "../lib/osmMap";
import { CITIES } from "../lib/cities";
import { logError } from "../lib/log";
import { useTheme } from "./felpus/ThemeProvider";

// Campo de "Zona / barrio" con sugerencias mientras se escribe.
//
// 2026-10-26: antes usaba el autocompletado de Google Places; al pasar los
// mapas a OpenStreetMap (ver osmMap.js) las sugerencias salen de Photon
// (gratis, sin key). Es un input común con una lista debajo: escribir a mano
// sigue funcionando igual, y si Photon no responde simplemente no aparecen
// sugerencias. Elegir una completa zona, ciudad, provincia y el punto exacto
// (lat/lng), igual que antes.
//
// Accesible como combobox (ARIA 1.2): flechas para moverse, Enter para
// elegir, Escape para cerrar.
const DEBOUNCE_MS = 350;

export default function ZonaAutocomplete({
  id,
  value,
  onManualChange,
  onSelectPlace,
  className,
  style,
  placeholder,
  maxLength,
  near = CITIES.salta.geo,
}) {
  const C = useTheme();
  const listId = useId();
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Último texto que escribió la persona: solo eso dispara la búsqueda (no
  // la zona que se completa sola al marcar el punto en el mapa o con el GPS).
  const [typedValue, setTypedValue] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    // Solo busca lo que la persona escribe (no el valor que se completa solo
    // al elegir una sugerencia o al marcar el punto en el mapa).
    if (typedValue == null || value !== typedValue) {
      abortRef.current?.abort();
      setOpen(false);
      return undefined;
    }
    const q = (value || "").trim();
    if (q.length < 3) {
      setOptions([]);
      setOpen(false);
      return undefined;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const results = await searchPlaces(q, { near, signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        setOptions(results);
        setActive(-1);
        setOpen(results.length > 0);
      } catch (e) {
        if (e?.name !== "AbortError") logError("No se pudieron buscar sugerencias de zona (Photon)", e);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // near es estable (un objeto de CITIES o de la ubicación de la persona).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, typedValue]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function choose(opt) {
    setTypedValue(null);
    setOpen(false);
    setOptions([]);
    setActive(-1);
    onSelectPlace(opt.zona, opt.lat, opt.lng, opt.ciudad, opt.provincia);
  }

  function onKeyDown(e) {
    if (!open || !options.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative flex-1 min-w-0" style={{ minHeight: 40 }}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        value={value}
        onChange={(e) => {
          setTypedValue(e.target.value);
          onManualChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => options.length && setOpen(true)}
        maxLength={maxLength}
        placeholder={placeholder}
        className={className}
        style={{ ...style, width: "100%", minWidth: 0 }}
        autoComplete="off"
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl border shadow-lg overflow-hidden"
          style={{ background: C.surface, borderColor: C.border }}
        >
          {options.map((opt, i) => (
            <li
              key={`${opt.label}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown (no click): se elige antes de que el blur cierre la lista.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(opt);
              }}
              className="px-3 py-2.5 text-sm cursor-pointer border-b last:border-b-0"
              style={{ borderColor: C.border, color: C.text, background: i === active ? C.surfaceSubtle : undefined }}
            >
              <span className="font-semibold">{opt.zona}</span>
              {opt.label !== opt.zona && (
                <span className="block text-[12px] truncate" style={{ color: C.muted }}>
                  {opt.label.slice(opt.zona.length + 3)}
                </span>
              )}
            </li>
          ))}
          <li role="presentation" className="px-3 py-1 text-[10px] text-right" style={{ color: C.muted }}>
            Sugerencias: © OpenStreetMap
          </li>
        </ul>
      )}
    </div>
  );
}
