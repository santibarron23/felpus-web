"use client";

// Ubicación de UNA publicación dentro de la app (2026-10-24, a pedido): antes
// tocar la zona en la ficha abría Google Maps y sacaba a la persona de
// Felpus. Ahora se abre este mapa encima de la ficha:
// - con punto marcado (lat/lng): el pin con la foto, mismo estilo que el
//   mapa de Explorar (rojo perdida / azul encontrada), en un punto corrido
//   y con un círculo que contiene el real — el punto marcado puede ser la
//   casa de quien publicó (ver approxLocation.js);
// - solo con la zona escrita: se busca esa zona y se marca un círculo como
//   ubicación aproximada.
// Queda un link chico a Google Maps para quien quiera cómo llegar.
// - con `avistamientos` (solo el dueño de una perdida, 2026-10-30): pines
//   numerados donde la vieron, del más viejo al más nuevo, unidos por una
//   línea punteada desde donde se perdió (ver avistamientosMapa.js).
import { useEffect, useRef, useState } from "react";
import { MapPin, Navigation, X } from "lucide-react";
import { loadLeaflet, createMap, observeMapResize, photoIcon, geocodeText } from "../lib/osmMap";
import { CITIES } from "../lib/cities";
import { logError } from "../lib/log";
import { zonaConCiudad } from "../lib/zona";
import { approxLocation, APPROX_RADIUS_M } from "../lib/approxLocation";
import { estadoColor, isSighting } from "../lib/sighting";
import { recorridoAvistamientos, escapeHtml } from "../lib/avistamientosMapa";
import { useTheme } from "./felpus/ThemeProvider";

// Círculo cuando solo hay zona escrita (el geocoding de un barrio es más
// impreciso que un punto marcado).
const ZONA_RADIUS_M = 600;

export function externalMapsUrl(report) {
  const approx = approxLocation(report);
  return approx
    ? `https://www.google.com/maps?q=${approx.lat},${approx.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([report.zona, report.ciudad].filter(Boolean).join(", "))}`;
}

// Pin chico con el número del avistamiento.
function numeroIcon(L, n, color) {
  const size = 28;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};color:#fff;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font:700 13px/1 system-ui,sans-serif">${Number(n) || ""}</div>`,
  });
}

// Línea punteada (origen → 1 → 2 → ...) y pines numerados; encuadra todo.
function dibujarAvistamientos(L, map, origen, puntos, color) {
  if (!puntos.length) return;
  const coords = [...(origen ? [[origen.lat, origen.lng]] : []), ...puntos.map((p) => [p.lat, p.lng])];
  if (coords.length > 1) L.polyline(coords, { color, weight: 3, opacity: 0.8, dashArray: "6 8", interactive: false }).addTo(map);
  for (const p of puntos) {
    L.marker([p.lat, p.lng], { icon: numeroIcon(L, p.n, color), title: p.etiqueta, keyboard: false })
      .bindTooltip(escapeHtml(p.etiqueta))
      .addTo(map);
  }
  if (coords.length > 1) map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 16 });
  else map.setView(coords[0], 15);
}

export default function ReportLocationMap({ report, onClose, avistamientos = [] }) {
  const C = useTheme();
  const containerRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [status, setStatus] = useState("loading"); // loading | ready | approx | not-found | error
  const approx = approxLocation(report);
  const hasPoint = !!approx;
  const color = estadoColor({ ...report, resuelto: false }, C);
  const recorrido = recorridoAvistamientos(report, avistamientos);
  const conAvistamientos = recorrido.puntos.length > 0;
  // El padre arma la lista en cada render: el mapa se rehace solo si cambian
  // los avistamientos de verdad (no por una referencia nueva).
  const recorridoRef = useRef(recorrido);
  recorridoRef.current = recorrido;
  const claveAvistamientos = recorrido.puntos.map((p) => `${p.id}@${p.lat},${p.lng}`).join("|");

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
        const start = approx || CITIES.salta.geo;
        map = createMap(L, containerRef.current, { center: start, zoom: hasPoint ? 15 : 13 });
        stopResize = observeMapResize(map, containerRef.current);
        if (hasPoint) {
          L.circle([approx.lat, approx.lng], {
            radius: APPROX_RADIUS_M,
            color,
            opacity: 0.9,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.12,
            interactive: false,
          }).addTo(map);
          L.marker([approx.lat, approx.lng], {
            icon: photoIcon(L, { foto: report.foto, color, size: 52 }),
            title: zonaConCiudad(report),
            keyboard: false,
          }).addTo(map);
          dibujarAvistamientos(L, map, approx, recorridoRef.current.puntos, C.sightingSolid);
          setStatus("ready");
          return;
        }
        // Sin punto marcado: se ubica la zona escrita (aproximado).
        const loc = await geocodeText([report.zona, report.ciudad, report.provincia, "Argentina"].filter(Boolean).join(", "));
        if (cancelled) return;
        if (!loc) {
          if (recorridoRef.current.puntos.length) {
            dibujarAvistamientos(L, map, null, recorridoRef.current.puntos, C.sightingSolid);
            setStatus("ready");
          } else {
            setStatus("not-found");
          }
          return;
        }
        map.setView([loc.lat, loc.lng], 15);
        L.circle([loc.lat, loc.lng], {
          radius: ZONA_RADIUS_M,
          color,
          opacity: 0.9,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.15,
          interactive: false,
        }).addTo(map);
        dibujarAvistamientos(L, map, loc, recorridoRef.current.puntos, C.sightingSolid);
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
    // approx sale de report (mismo id y punto = mismo resultado).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPoint, report, color, claveAvistamientos, C.sightingSolid]);

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
              {conAvistamientos
                ? "Dónde se perdió y dónde la vieron (zonas aproximadas)"
                : status === "approx"
                ? "Ubicación aproximada según la zona escrita"
                : report.tipo === "perdida"
                  ? "Dónde se perdió (zona aproximada)"
                  : isSighting(report)
                    ? "Dónde la vieron (zona aproximada)"
                    : "Dónde se encontró (zona aproximada)"}
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

        {conAvistamientos && (
          <ul className="px-4 pt-3 space-y-1 text-[12px]" style={{ color: C.text }} aria-label="Referencias del mapa">
            <li className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: color }} aria-hidden="true" /> Dónde se perdió
            </li>
            <li className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: C.sightingSolid }} aria-hidden="true" />
              Avistamientos, del 1 (el más viejo) al {recorrido.puntos.length}. Aportados por la comunidad, sin confirmar.
            </li>
            {avistamientos.length > recorrido.puntos.length && (
              <li style={{ color: C.muted }}>
                {avistamientos.length - recorrido.puntos.length} sin punto marcado: están solo en la lista.
              </li>
            )}
          </ul>
        )}
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
