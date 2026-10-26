"use client";

// Mapa a pantalla completa para marcar un punto desde el celular
// (2026-10-22, a pedido del usuario: "desde el móvil el mapa es
// complicado"). En vez de tocar el lugar justo o arrastrar un pin chico,
// el pin queda FIJO en el centro y se mueve el mapa debajo, con un dedo
// (acá no compite con el scroll de la página). OpenStreetMap + Leaflet.
// "Usar esta ubicación" confirma el centro y cierra. Lo abre MapPicker solo
// en pantallas táctiles; en compu sigue el mapa de siempre.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, LocateFixed, MapPin, X } from "lucide-react";
import { loadLeaflet, createMap } from "../lib/osmMap";
import { requestLocation, geolocationErrorMessage, MAP_GEOLOCATION_OPTIONS } from "../lib/geolocation";
import { useTheme } from "./felpus/ThemeProvider";

export default function FullscreenMapPicker({ center, zoom, radiusM = null, onConfirm, onClose }) {
  const C = useTheme();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [geoState, setGeoState] = useState("idle");

  // Mientras está abierto, la página de atrás no scrollea; Escape cierra.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    let map = null;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current) return;
        map = createMap(L, containerRef.current, { center, zoom, interactive: true, zoomControl: false });
        mapRef.current = map;
        // Alertas: el círculo del radio acompaña al centro mientras se mueve.
        if (radiusM) {
          const circle = L.circle([center.lat, center.lng], {
            radius: radiusM,
            color: C.red,
            opacity: 0.8,
            weight: 2,
            fillColor: C.red,
            fillOpacity: 0.08,
            interactive: false,
          }).addTo(map);
          map.on("move", () => circle.setLatLng(map.getCenter()));
          map.fitBounds(circle.getBounds(), { padding: [32, 32] });
        }
        setReady(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      map?.remove();
    };
    // Se crea una sola vez al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function locate() {
    setGeoState("locating");
    requestLocation(
      (pos) => {
        setGeoState("idle");
        if (radiusM) mapRef.current?.panTo([pos.lat, pos.lng]);
        else mapRef.current?.setView([pos.lat, pos.lng], 17);
      },
      (err) => setGeoState(geolocationErrorMessage(err)),
      MAP_GEOLOCATION_OPTIONS
    );
  }

  function confirm() {
    const c = mapRef.current?.getCenter();
    if (!c) return;
    onConfirm(c.lat, c.lng);
  }

  // Portal al body: si algún contenedor de arriba tiene transform (las
  // animaciones de entrada), un position:fixed adentro dejaría de cubrir la
  // pantalla. z-[90]: por encima del asistente (z-75), que también usa este mapa.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Elegir la ubicación en el mapa"
      className="fixed inset-0 z-[90] flex flex-col"
      style={{ background: C.surface }}
    >
      <div
        className="flex items-center gap-2 px-3 pb-2 border-b"
        style={{ borderColor: C.border, paddingTop: "calc(8px + env(safe-area-inset-top, 0px))" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar el mapa sin cambiar la ubicación"
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
          style={{ background: C.surfaceSubtle, color: C.text }}
        >
          <X className="w-5 h-5" />
        </button>
        <p className="text-[13px] font-semibold leading-snug" style={{ color: C.text }}>
          Mové el mapa hasta que el pin quede en el lugar
        </p>
      </div>

      <div className="relative flex-1">
        <div ref={containerRef} className="felpus-map absolute inset-0" style={{ background: C.surfaceMuted }} />
        {/* Pin fijo: la punta queda exactamente en el centro del mapa. */}
        <div className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden="true">
          <span className="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2" style={{ background: "rgba(0,0,0,0.3)" }} />
          <MapPin
            className="absolute w-11 h-11 -translate-x-1/2 drop-shadow-md"
            style={{ top: -42 }}
            fill={C.redSolid}
            stroke="#fff"
            strokeWidth={1.5}
          />
        </div>
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ color: C.muted }}>
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}
        <button
          type="button"
          onClick={locate}
          disabled={geoState === "locating"}
          aria-label="Ir a mi ubicación"
          className="absolute right-3 bottom-3 w-12 h-12 rounded-full shadow-lg flex items-center justify-center disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
          style={{ background: C.surface, color: C.text }}
        >
          {geoState === "locating" ? <Loader2 className="w-5 h-5 animate-spin" /> : <LocateFixed className="w-5 h-5" />}
        </button>
      </div>

      <div
        className="px-4 pt-3 border-t space-y-2"
        style={{ borderColor: C.border, paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}
      >
        {geoState !== "idle" && geoState !== "locating" && (
          <p className="text-[12px]" style={{ color: C.redDark }} role="alert">
            {geoState}
          </p>
        )}
        <button
          type="button"
          onClick={confirm}
          disabled={!ready}
          className="w-full rounded-xl py-3.5 text-base font-bold text-white disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
          style={{ background: C.redSolid }}
        >
          Usar esta ubicación
        </button>
      </div>
    </div>,
    document.body
  );
}
