"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "../lib/googleMaps";
import { logError } from "../lib/log";

// Campo de "Zona / barrio" con autocompletado de Google Places — usa
// PlaceAutocompleteElement, la API nueva que Google recomienda desde 2025
// (requiere "Places API (New)" habilitada en el proyecto de Google Cloud).
// Si esa API no está habilitada o falla por cualquier motivo, se queda con
// un <input> de texto plano — a diferencia de la Autocomplete legacy vieja,
// acá una falla nunca se lleva puesta el resto de la sesión de Maps
// compartida (el mapa de abajo sigue funcionando pase lo que pase acá).
export default function ZonaAutocomplete({
  id,
  value,
  onManualChange,
  onSelectPlace,
  className,
  style,
  placeholder,
  maxLength,
}) {
  const containerRef = useRef(null);
  const elRef = useRef(null);
  const [ready, setReady] = useState(false);
  // Antes se cargaba el script de Google Maps apenas se montaba este campo,
  // es decir, apenas se entraba al tab "Reportar" — aunque la persona solo
  // quisiera tipear la zona a mano. Ahora se difiere hasta el primer foco
  // real del campo (el contenedor sigue siempre visible desde el montaje,
  // solo se posterga instanciar el PlaceAutocompleteElement de Google).
  const [interacted, setInteracted] = useState(false);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !interacted) return;
    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !containerRef.current || elRef.current) return;
        if (!maps.places?.PlaceAutocompleteElement) return;

        const el = new maps.places.PlaceAutocompleteElement({
          includedRegionCodes: ["AR"],
        });
        el.style.width = "100%";
        if (id) el.setAttribute("aria-label", "Zona / barrio");
        containerRef.current.appendChild(el);
        elRef.current = el;

        el.addEventListener("gmp-select", async (event) => {
          try {
            const place = event.placePrediction.toPlace();
            await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
            const zona = place.displayName || place.formattedAddress;
            if (!zona) return;
            const lat = place.location?.lat();
            const lng = place.location?.lng();
            onSelectPlace(zona, lat, lng);
          } catch (e) {
            logError("No se pudo leer el lugar seleccionado", e);
          }
        });

        setReady(true);
      })
      .catch(() => {
        // Se queda con el input de texto plano — no bloquea nada más.
      });

    return () => {
      cancelled = true;
      if (elRef.current) {
        elRef.current.remove();
        elRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interacted]);

  // El contenedor del elemento de Google se renderiza SIEMPRE visible y en
  // flujo normal, desde el primer render — nunca con display:none. Si se le
  // hace appendChild mientras está oculto, el componente de Google mide mal
  // su tamaño al conectarse (connectedCallback) y el desplegable de
  // sugerencias queda roto para siempre, aunque después se muestre. Mientras
  // no está listo, el input de texto plano se superpone encima (position:
  // absolute) tapándolo — así solo se ve una cosa a la vez, pero el
  // contenedor de abajo nunca estuvo escondido.
  return (
    <div className="relative flex-1" style={{ minHeight: 40 }}>
      <div ref={containerRef} className={className} style={{ ...style, padding: 0, width: "100%" }} />
      {!ready && (
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onManualChange(e.target.value)}
          onFocus={() => setInteracted(true)}
          maxLength={maxLength}
          placeholder={placeholder}
          className={className}
          style={{ ...style, position: "absolute", inset: 0 }}
          autoComplete="off"
        />
      )}
    </div>
  );
}
