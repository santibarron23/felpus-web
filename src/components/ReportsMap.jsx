"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell, Loader2, LocateFixed, Maximize2, X } from "lucide-react";
import { loadLeaflet, createMap, observeMapResize, photoIcon, setMapInteractive } from "../lib/osmMap";
import { logError } from "../lib/log";
import { requestLocation, geolocationErrorMessage, MAP_GEOLOCATION_OPTIONS } from "../lib/geolocation";
import { CITIES } from "../lib/cities";
import { zonaConCiudad } from "../lib/zona";
import { useTheme } from "./felpus/ThemeProvider";

// Mapa de sólo lectura que pinta un marcador por cada reporte que tenga
// ubicación exacta (lat/lng), mostrando la foto real de la mascota en un
// círculo — rojo para perdidas, naranja para encontradas — en vez de un
// punto de color genérico, para poder reconocer a la mascota de un vistazo
// sin tener que abrir cada reporte. Tocar un marcador abre el detalle
// (mismo modal que la lista). OpenStreetMap + Leaflet (ver osmMap.js).
export default function ReportsMap({ reports, onSelectReport, center }) {
  const C = useTheme();
  // Pantallas táctiles (2026-10-22, igual que MapPicker): el mapa de la
  // página es solo vista y al tocarlo pasa a pantalla completa, donde se
  // mueve con un dedo. Es el MISMO mapa (no se crea otro: se conservan la
  // vista y los pines cargados): su <div> se crea a mano y
  // se mueve entre el lugar de la página y el de pantalla completa. Esos dos
  // lugares no tienen hijos de React, así React nunca se cruza con él.
  const mapElRef = useRef(null);
  const inlineHostRef = useRef(null);
  const fullHostRef = useRef(null);
  const [touch, setTouch] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [geoState, setGeoState] = useState("idle");
  const mapObjRef = useRef(null);
  const markersRef = useRef([]);
  const onSelectRef = useRef(onSelectReport);
  const reportsRef = useRef(reports);
  reportsRef.current = reports;
  // Si la persona ya movió el mapa a mano, no se lo recentramos encima.
  const userMovedRef = useRef(false);
  const [status, setStatus] = useState("loading");
  const leafletRef = useRef(null);

  useEffect(() => {
    onSelectRef.current = onSelectReport;
  }, [onSelectReport]);

  useEffect(() => {
    let cancelled = false;
    let stopResizeObserver = null;
    let mapToRemove = null;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !inlineHostRef.current) return;
        const isTouch = !!window.matchMedia?.("(pointer: coarse)").matches;
        setTouch(isTouch);
        const el = document.createElement("div");
        el.style.cssText = "width: 100%; height: 100%;";
        el.className = "felpus-map";
        inlineHostRef.current.appendChild(el);
        mapElRef.current = el;
        // Mientras llega la ubicación: Salta (antes, Buenos Aires).
        const start = center || CITIES.salta.geo;
        const map = createMap(L, el, { center: start, zoom: center ? 13 : 12, interactive: !isTouch });
        mapToRemove = map;
        leafletRef.current = L;
        mapObjRef.current = map;
        map.on("dragstart", () => {
          userMovedRef.current = true;
        });
        stopResizeObserver = observeMapResize(map, el);
        setStatus("ready");
        // Sin ubicación conocida, antes el mapa arrancaba siempre en Buenos
        // Aires aunque los reportes estuvieran en Salta. Ahora: la ubicación
        // de la persona si la da; si no, el área donde están los reportes.
        if (!center) {
          requestLocation(
            (pos) => {
              if (cancelled || userMovedRef.current) return;
              map.setView([pos.lat, pos.lng], 13);
            },
            () => {
              if (cancelled || userMovedRef.current) return;
              fitToReports(L, map, reportsRef.current);
            },
            MAP_GEOLOCATION_OPTIONS
          );
        }
      })
      .catch(() => setStatus("error"));
    return () => {
      cancelled = true;
      if (stopResizeObserver) stopResizeObserver();
      mapToRemove?.remove();
      mapElRef.current?.remove();
    };
    // Se inicializa una sola vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mueve el mapa al lugar que corresponda y ajusta cómo responde al dedo.
  // Mientras está a pantalla completa, la página de atrás no scrollea.
  useEffect(() => {
    const el = mapElRef.current;
    const map = mapObjRef.current;
    if (status !== "ready" || !el || !map) return;
    const host = fullscreen ? fullHostRef.current : inlineHostRef.current;
    if (host && el.parentNode !== host) host.appendChild(el);
    setMapInteractive(map, fullscreen || !touch);
    map.invalidateSize();
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen, status, touch]);

  // "Más cercanas" (o cualquier ubicación que llegue después de montar el
  // mapa): antes el centro solo se usaba al crear el mapa y después se
  // ignoraba.
  useEffect(() => {
    if (status !== "ready" || !mapObjRef.current || !center) return;
    mapObjRef.current.setView([center.lat, center.lng], 13);
  }, [center, status]);

  // Repinta los marcadores cada vez que cambia la lista filtrada de reportes.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapObjRef.current;
    if (status !== "ready" || !map || !L) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = reports
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => {
        try {
          // Encontrada en azul (C.mapFound): el naranja de antes se confundía
          // con el rojo de "perdida" en los pines chicos.
          const color = r.tipo === "perdida" ? C.redSolid : C.mapFound;
          const label = `${r.tipo === "perdida" ? "Perdida" : "Encontrada"} · ${zonaConCiudad(r)}`;
          // keyboard: true + title: el pin se puede alcanzar y activar con el
          // teclado (Leaflet lo hace foco y responde a Enter).
          const marker = L.marker([r.lat, r.lng], { icon: photoIcon(L, { foto: r.foto, color }), title: label, alt: label, keyboard: true }).addTo(map);
          marker.on("click", () => onSelectRef.current?.(r));
          return marker;
        } catch (e) {
          logError("No se pudo crear el marcador del mapa para un reporte", e);
          return null;
        }
      })
      .filter(Boolean);
    // `C` en las deps: si cambia el tema, los pines se repintan con sus colores.
  }, [reports, status, C]);

  if (status === "error") {
    return (
      <div className="text-xs rounded-lg border p-3" style={{ borderColor: C.border, color: C.redDark }}>
        No se pudo cargar el mapa. Probá recargar la página; mientras tanto podés seguir explorando con la
        vista de lista.
      </div>
    );
  }

  // "Vigilar esta zona" (PLAN-alertas.md, Fase 4): lleva a la configuración
  // de alertas con el centro actual del mapa ya marcado.
  const watchZone = (e) => {
    const c = mapObjRef.current?.getCenter();
    if (!c) return;
    e.preventDefault();
    window.location.href = `/configuracion/alertas?lat=${c.lat.toFixed(5)}&lng=${c.lng.toFixed(5)}`;
  };

  function locate() {
    setGeoState("locating");
    requestLocation(
      (pos) => {
        setGeoState("idle");
        userMovedRef.current = true;
        mapObjRef.current?.setView([pos.lat, pos.lng], 14);
      },
      (err) => setGeoState(geolocationErrorMessage(err)),
      MAP_GEOLOCATION_OPTIONS
    );
  }

  // Botón "Vigilar esta zona" y leyenda: iguales en los dos modos.
  const overlays = status === "ready" && (
    <>
      <Link
        href="/configuracion/alertas"
        onClick={watchZone}
        className="absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold shadow-md border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
        style={{ background: C.surface, borderColor: C.border, color: C.text }}
      >
        <Bell className="w-3.5 h-3.5" aria-hidden="true" style={{ color: C.red }} /> Vigilar esta zona
      </Link>
      <div
        className="absolute bottom-2 left-2 flex items-center gap-3 rounded-full px-3 py-1.5 text-xs font-bold shadow-md border"
        style={{ background: C.surface, borderColor: C.border, color: C.text }}
        aria-hidden="true"
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full" style={{ background: C.redSolid }} /> Perdida
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full" style={{ background: C.mapFound }} /> Encontrada
        </span>
      </div>
    </>
  );

  return (
    <div className="relative">
      <div
        ref={inlineHostRef}
        role="region"
        aria-label="Mapa de mascotas reportadas cerca tuyo"
        className="w-full rounded-xl overflow-hidden border"
        style={{ height: 340, borderColor: C.border, background: C.surfaceMuted }}
      />
      {!fullscreen && overlays}
      {touch && status === "ready" && !fullscreen && (
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          aria-label="Abrir el mapa en pantalla completa"
          className="absolute inset-0 top-12 bottom-12 flex items-center justify-center focus:outline-none"
        >
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold text-white shadow-md"
            style={{ background: C.emphasisBg }}
          >
            <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" /> Tocá para abrir el mapa
          </span>
        </button>
      )}
      {fullscreen &&
        createPortal(
          // z-[55]: tapa la barra de abajo (z-40) pero queda DEBAJO del
          // detalle de un reporte (z-60), que se abre al tocar un pin.
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mapa de mascotas reportadas"
            className="fixed inset-0 z-[55] flex flex-col"
            style={{ background: C.surface }}
          >
            <div
              className="flex items-center gap-2 px-3 pb-2 border-b"
              style={{ borderColor: C.border, paddingTop: "calc(8px + env(safe-area-inset-top, 0px))" }}
            >
              <button
                type="button"
                onClick={() => setFullscreen(false)}
                aria-label="Cerrar el mapa"
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={{ background: C.surfaceSubtle, color: C.text }}
              >
                <X className="w-5 h-5" />
              </button>
              <p className="text-[13px] font-semibold leading-snug" style={{ color: C.text }}>
                Tocá una foto para ver el reporte
              </p>
            </div>
            <div className="relative flex-1" style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}>
              <div ref={fullHostRef} className="absolute inset-0" style={{ background: C.surfaceMuted }} />
              {overlays}
              <button
                type="button"
                onClick={locate}
                disabled={geoState === "locating"}
                aria-label="Ir a mi ubicación"
                className="absolute right-3 w-12 h-12 rounded-full shadow-lg flex items-center justify-center disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={{ background: C.surface, color: C.text, bottom: 12 }}
              >
                {geoState === "locating" ? <Loader2 className="w-5 h-5 animate-spin" /> : <LocateFixed className="w-5 h-5" />}
              </button>
              {geoState !== "idle" && geoState !== "locating" && (
                <p
                  className="absolute left-3 right-3 top-14 rounded-lg px-3 py-2 text-[12px] shadow-md"
                  style={{ background: C.surface, color: C.redDark }}
                  role="alert"
                >
                  {geoState}
                </p>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

// Encuadra el mapa en los reportes con ubicación (sin acercarse de más si
// hay uno solo o están todos juntos).
// Solo reportes dentro de Argentina: uno con coordenadas mal cargadas (visto
// en producción: un punto en Norteamérica) alejaba el mapa hasta mostrar
// medio continente.
const ARGENTINA = { latMin: -56, latMax: -21, lngMin: -74, lngMax: -53 };
const enArgentina = (r) =>
  r.lat >= ARGENTINA.latMin && r.lat <= ARGENTINA.latMax && r.lng >= ARGENTINA.lngMin && r.lng <= ARGENTINA.lngMax;

function fitToReports(L, map, reports) {
  const conPunto = (reports || []).filter((r) => r.lat != null && r.lng != null && enArgentina(r));
  if (!conPunto.length) return;
  const bounds = L.latLngBounds(conPunto.map((r) => [r.lat, r.lng]));
  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
}
