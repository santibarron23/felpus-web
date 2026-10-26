"use client";

// Ubicación de UNA publicación dentro de la app (2026-10-24, a pedido): antes
// tocar la zona en la ficha abría Google Maps y sacaba a la persona de
// Felpus. Ahora se abre este mapa encima de la ficha:
// - con punto marcado (lat/lng): el pin con la foto, mismo estilo que el
//   mapa de Explorar (rojo perdida / azul encontrada);
// - solo con la zona escrita: se busca esa zona y se marca un círculo como
//   ubicación aproximada.
// Queda un link chico a Google Maps para quien quiera cómo llegar.
import { useEffect, useRef, useState } from "react";
import { MapPin, Navigation, X } from "lucide-react";
import { loadLeaflet, createMap, observeMapResize, photoIcon, geocodeText } from "../lib/osmMap";
import { CITIES } from "../lib/cities";
import { logError } from "../lib/log";
import { zonaConCiudad } from "../lib/zona";
import { useTheme } from "./felpus/ThemeProvider";

const APPROX_RADIUS_M = 600;

export function externalMapsUrl(report) {
  return report.lat != null && report.lng != null
    ? `https://www.google.com/maps?q=${report.lat},${report.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([report.zona, report.ciudad].filter(Boolean).join(", "))}`;
}

export default function ReportLocationMap({ report, onClose }) {
  const C = useTheme();
  const containerRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [status, setStatus] = useState("loading"); // loading | ready | approx | not-found | error
  const hasPoint = report.lat != null && report.lng != null;
  const color = report.tipo === "perdida" ? C.redSolid : C.mapFound;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stopResize = null;
    let map = null;
    loadLeaflet()
      .then(async (L) => {
        if (cancelled || !containerRef.current) return;
        const start = hasPoint ? { lat: report.lat, lng: report.lng } : CITIES.salta.geo;
        map = createMap(L, containerRef.current, { center: start, zoom: hasPoint ? 16 : 13 });
        stopResize = observeMapResize(map, containerRef.current);
        if (hasPoint) {
          L.marker([report.lat, report.lng], {
            icon: photoIcon(L, { foto: report.foto, color, size: 52 }),
            title: zonaConCiudad(report),
            keyboard: false,
          }).addTo(map);
          setStatus("ready");
          return;
        }
        // Sin punto marcado: se ubica la zona escrita (aproximado).
        const loc = await geocodeText([report.zona, report.ciudad, report.provincia, "Argentina"].filter(Boolean).join(", "));
        if (cancelled) return;
        if (!loc) {
          setStatus("not-found");
          return;
        }
        map.setView([loc.lat, loc.lng], 15);
        L.circle([loc.lat, loc.lng], {
          radius: APPROX_RADIUS_M,
          color,
          opacity: 0.9,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.15,
          interactive: false,
        }).addTo(map);
        setStatus("approx");
      })
      .catch((e) => {
        logError("No se pudo cargar el mapa de la publicación", e);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      if (stopResize) stopResize();
      map?.remove();
    };
  }, [hasPoint, report, color]);

  return (
    <div className="fixed inset-0 z-[75] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-location-title"
        className="felpus-fadein w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl border flex flex-col"
        style={{ background: C.surface, borderColor: C.border, maxHeight: "92dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-2 px-4 py-3 border-b" style={{ borderColor: C.border }}>
          <MapPin className="w-5 h-5 mt-0.5 shrink-0" style={{ color }} aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <h2 id="report-location-title" className="font-bold text-base leading-snug" style={{ color: C.text }}>
              {zonaConCiudad(report)}
            </h2>
            <p className="text-[12px]" style={{ color: C.muted }}>
              {status === "approx"
                ? "Ubicación aproximada según la zona escrita"
                : report.tipo === "perdida"
                  ? "Dónde se perdió"
                  : "Dónde se encontró"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar el mapa"
            className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
            style={{ color: C.text }}
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="relative" style={{ height: "min(60dvh, 420px)", background: C.surfaceMuted }}>
          <div ref={containerRef} className="felpus-map absolute inset-0" role="region" aria-label={`Mapa de ${zonaConCiudad(report)}`} />
          {status !== "loading" && status !== "ready" && status !== "approx" && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm" style={{ color: C.muted, background: C.surfaceMuted }}>
              {status === "not-found"
                ? "No pudimos ubicar esta zona en el mapa."
                : "No se pudo cargar el mapa."}
            </div>
          )}
        </div>

        <footer className="px-4 py-3 flex justify-end" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}>
          <a
            href={externalMapsUrl(report)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold py-2 underline underline-offset-2"
            style={{ color: C.muted }}
          >
            <Navigation className="w-3.5 h-3.5" aria-hidden="true" /> Cómo llegar en Google Maps
          </a>
        </footer>
      </section>
    </div>
  );
}
