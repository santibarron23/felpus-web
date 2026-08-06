"use client";

// Campo de WhatsApp: selector de país compacto + input de número, pensados
// para que nadie tenga que escribir "+54 9 11 1234 5678" a mano ni entender
// qué significa cada parte. Vive en su propio archivo (como Combobox.jsx)
// porque necesita estado propio (popover de países abierto/cerrado,
// resultado de la última validación) que no le corresponde a PureViews
// (componentes sin estado propio del flujo principal).
//
// Diseño: selector + input comparten UN solo marco (.felpus-input con
// focus-within, ver globals.css) para que se sienta un campo compuesto de
// Felpus, no un widget externo pegado encima — mismo motivo por el que no
// se usó una librería de UI de teléfono lista (react-phone-number-input y
// similares traen su propio sistema visual, difícil de hacer pasar por
// "diseñado para la app").
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, AlertCircle, Search } from "lucide-react";
import { normalizeText } from "../../lib/matching";
import { getCountryList, getDefaultCountry, parseWhatsappPhone } from "../../lib/phone";
import { useTheme } from "./ThemeProvider";

// Ejemplos reales para el placeholder — mucho más claro que mostrar
// "+54 9 11 1234 5678" (formato internacional completo) cuando lo único
// que la persona tiene que escribir es su número local. Solo para los
// países prioritarios (ver PRIORITY_COUNTRIES en phone.js): son los que
// realmente va a ver la enorme mayoría de quienes usan Felpus; el resto
// cae a un placeholder genérico en vez de mantener ~240 ejemplos a mano.
const EXAMPLE_PLACEHOLDERS = {
  AR: "387 123 4567",
  UY: "099 123 456",
  CL: "9 1234 5678",
  PY: "0981 123456",
  BO: "712 34567",
  BR: "11 91234-5678",
  MX: "55 1234 5678",
  ES: "612 34 56 78",
  US: "(415) 555-2671",
};

// Mensajes de error concretos — el objetivo explícito es que nunca se vea
// "Número inválido" a secas cuando hay algo más útil para decir.
function errorMessage(reason, countryName) {
  if (reason === "too_short") return `Ese número parece incompleto para ${countryName}.`;
  if (reason === "invalid") return `No pudimos interpretar ese número para ${countryName}.`;
  return "";
}

export default function PhoneInput({ id, country, onCountryChange, value, onChange, onParsed, forceTouched }) {
  const C = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [countries, setCountries] = useState(null); // null = todavía no cargó
  const [activeIndex, setActiveIndex] = useState(-1);
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState({ isValid: false, reason: null }); // se completa async
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const listboxId = useId();
  // Evita que una validación vieja (de un valor ya reemplazado por uno más
  // nuevo) pise el resultado de la validación más reciente — el parseo es
  // async (carga la librería la primera vez), así que dos llamados pueden
  // resolver fuera de orden si la persona sigue escribiendo rápido.
  const requestIdRef = useRef(0);

  // País por defecto — se resuelve en un efecto (no en el valor inicial del
  // estado del padre) para no depender de navigator en el primer render del
  // servidor; ver el comentario de getDefaultCountry en phone.js. Si el
  // padre ya trae un país explícito (ej. reabriendo el formulario, o un
  // contacto guardado), no lo pisa.
  useEffect(() => {
    if (country) return;
    onCountryChange(getDefaultCountry());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Precarga la lista de países (y de paso la librería de parseo) apenas se
  // monta el campo, no recién cuando se abre el selector — así, para cuando
  // la persona termine de escribir su número, la validación ya no tiene que
  // esperar la carga de la librería.
  useEffect(() => {
    let cancelled = false;
    getCountryList().then((list) => {
      if (!cancelled) setCountries(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Validación: corre en cada cambio de valor/país, pero nunca bloquea ni
  // se muestra como error mientras la persona sigue escribiendo (ver
  // "touched" — el éxito (✓) sí se muestra apenas se alcanza, no hace
  // falta salir del campo para ver la confirmación positiva).
  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!value.trim()) {
      setStatus({ isValid: false, reason: null });
      onParsed?.({ isValid: false, reason: "empty", e164: "", digits: "" });
      return;
    }
    parseWhatsappPhone(value, country).then((result) => {
      if (requestIdRef.current !== requestId) return; // llegó una respuesta más nueva primero
      setStatus(result);
      onParsed?.(result);
      // Pegar un número internacional completo (ej. "+56 9 1234 5678") debe
      // reflejarse en el selector, no dejarlo mostrando un país que ya no
      // coincide con lo que se escribió — la librería ya detecta el país
      // real cuando el texto trae "+", acá solo se sincroniza la UI.
      if (result.isValid && result.country && result.country !== country) {
        onCountryChange(result.country);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, country]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  // Autofoco en el buscador apenas se abre el popover — con ~240 países,
  // buscar por nombre o código es mucho más rápido que scrollear.
  useEffect(() => {
    if (open) searchInputRef.current?.focus();
    else {
      setSearch("");
      setActiveIndex(-1);
    }
  }, [open]);

  const normalizedSearch = normalizeText(search).trim();
  const filtered =
    countries && normalizedSearch
      ? countries.filter(
          (c) => normalizeText(c.name).includes(normalizedSearch) || c.callingCode.includes(normalizedSearch)
        )
      : countries || [];

  const current = countries?.find((c) => c.code === country);

  function selectCountry(code) {
    onCountryChange(code);
    // Si lo que hay escrito empieza con "+" (un número internacional
    // completo, ej. pegado desde otro país), dejarlo tal cual pelearía con
    // esta elección manual: el efecto de arriba vuelve a detectar el país
    // A PARTIR de ese "+" en cada re-parseo (así es como se sincroniza el
    // selector solo al pegar, ver más arriba) y revertiría el cambio que la
    // persona acaba de hacer a mano. Se limpia el campo para que arranque
    // en blanco bajo el país recién elegido, en vez de quedar en un loop
    // silencioso volviendo al país anterior.
    if (value.trim().startsWith("+")) onChange("");
    setOpen(false);
    setActiveIndex(-1);
    // Después de cambiar el país, el foco vuelve al número — es lo próximo
    // que la persona quiere tocar, no el botón que acaba de usar.
    document.getElementById(id)?.focus();
  }

  function handleSearchKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && filtered[activeIndex]) selectCountry(filtered[activeIndex].code);
      else if (filtered.length === 1) selectCountry(filtered[0].code);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const countryName = current?.name || country || "";
  const showError = (touched || forceTouched) && value.trim() && !status.isValid && status.reason;
  const showSuccess = status.isValid;

  return (
    <div>
      <div
        ref={containerRef}
        className="felpus-input relative flex items-stretch border rounded-lg overflow-visible"
        style={{ borderColor: showError ? C.red : C.border }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`País del WhatsApp: ${countryName || "elegir país"}`}
          className="flex items-center gap-1 pl-2.5 pr-1.5 shrink-0 border-r focus:outline-none"
          style={{ borderColor: C.border }}
        >
          <span className="text-base leading-none" aria-hidden="true">
            {current?.flag || "🏳️"}
          </span>
          <span className="text-sm font-semibold tabular-nums" style={{ color: C.text }}>
            +{current?.callingCode || ""}
          </span>
          <ChevronDown className="w-3 h-3 shrink-0" style={{ color: C.muted }} />
        </button>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          aria-label="Número de WhatsApp"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          maxLength={25}
          placeholder={EXAMPLE_PLACEHOLDERS[country] || "Tu número"}
          className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm focus:outline-none"
          style={{ color: C.text }}
        />
        {showSuccess && (
          <span className="flex items-center pr-3 shrink-0" aria-hidden="true">
            <Check className="w-4 h-4" style={{ color: C.green }} />
          </span>
        )}
        {open && (
          <div
            className="absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border shadow-lg overflow-hidden"
            style={{ borderColor: C.border, background: C.surface }}
          >
            <div className="flex items-center gap-1.5 px-2.5 py-2 border-b" style={{ borderColor: C.border }}>
              <Search className="w-3.5 h-3.5 shrink-0" style={{ color: C.muted }} />
              <input
                ref={searchInputRef}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls={listboxId}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setActiveIndex(-1);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Buscar país..."
                className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
                style={{ color: C.text }}
              />
            </div>
            <ul id={listboxId} role="listbox" className="max-h-56 overflow-y-auto py-1">
              {!countries && (
                <li className="px-3 py-2 text-sm" style={{ color: C.muted }}>
                  Cargando países...
                </li>
              )}
              {countries && filtered.length === 0 && (
                <li className="px-3 py-2 text-sm" style={{ color: C.muted }}>
                  Sin resultados.
                </li>
              )}
              {filtered.map((c, i) => (
                <li key={c.code} role="option" aria-selected={c.code === country}>
                  <button
                    type="button"
                    onClick={() => selectCountry(c.code)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className="w-full min-h-11 flex items-center gap-2 text-left px-3 py-2 text-sm"
                    style={{
                      color: C.text,
                      background: i === activeIndex ? C.surfaceSubtle : c.code === country ? C.brandTintBg : "transparent",
                    }}
                  >
                    <span aria-hidden="true">{c.flag}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="tabular-nums" style={{ color: C.muted }}>
                      +{c.callingCode}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {showError && (
        <p className="flex items-center gap-1 text-[11px] mt-1" style={{ color: C.red }}>
          <AlertCircle className="w-3 h-3 shrink-0" /> {errorMessage(status.reason, countryName)}
        </p>
      )}
      {showSuccess && (
        <p className="flex items-center gap-1 text-[11px] mt-1" style={{ color: C.greenDark }}>
          <Check className="w-3 h-3 shrink-0" /> WhatsApp listo
        </p>
      )}
    </div>
  );
}
