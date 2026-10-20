"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, observeMapResize } from "../lib/googleMaps";
import { requestLocation, geolocationErrorMessage, MAP_GEOLOCATION_OPTIONS } from "../lib/geolocation";
import { CITIES } from "../lib/cities";

// Sin ubicación de la persona ni defaultCenter: Salta, donde está la
// comunidad de Felpus (antes, Buenos Aires).
const FALLBACK_CENTER = CITIES.salta.geo;
import { useTheme } from "./felpus/ThemeProvider";

// Mapa con un pin arrastrable/tocable para marcar la ubicación exacta de un
// reporte. Si no hay API key configurada, muestra un aviso y la app sigue
// funcionando igual con el botón "Ubicación" (geolocalización del navegador).
// radiusM (opcional): dibuja un círculo con ese radio alrededor del punto
// confirmado — lo usa /configuracion/alertas para mostrar la zona.
export default function MapPicker({ lat, lng, onChange, defaultCenter, radiusM = null }) {
  const C = useTheme();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const containerRef = useRef(null);
  const mapObjRef = useRef(null);
  const markerObjRef = useRef(null);
  const circleObjRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [status, setStatus] = useState(apiKey ? "loading" : "no-key");
  // Tocar el mapa o arrastrar el pin no mueve la ubicación del reporte todavía
  // — deja el pin en una posición "propuesta" (semitransparente) hasta que el
  // usuario la confirma explícitamente. Así se evita que un toque accidental
  // cambie la zona sin que la persona se dé cuenta (la ubicación es clave
  // para el matching).
  const [pending, setPending] = useState(null);
  // Centro "de arranque" cuando todavía no hay punto marcado: la ubicación
  // de la persona si la da (antes siempre arrancaba en Buenos Aires), si no
  // defaultCenter, si no Buenos Aires. Solo centra el mapa: NO marca el
  // reporte (eso sigue requiriendo tocar y confirmar).
  const startCenterRef = useRef(null);
  const userMovedRef = useRef(false);
  // Botón "Ir a mi ubicación" dentro del mapa: "idle" | "locating" | mensaje de error.
  const [geoState, setGeoState] = useState("idle");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    let stopResizeObserver = null;

    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        const center = {
          lat: lat ?? defaultCenter?.lat ?? FALLBACK_CENTER.lat,
          lng: lng ?? defaultCenter?.lng ?? FALLBACK_CENTER.lng,
        };
        const map = new maps.Map(containerRef.current, {
          center,
          zoom: lat != null ? 15 : 12,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        const marker = new maps.Marker({
          position: center,
          map,
          draggable: true,
        });
        marker.addListener("dragend", () => {
          userMovedRef.current = true;
          const pos = marker.getPosition();
          marker.setOpacity(0.55);
          setPending({ lat: pos.lat(), lng: pos.lng() });
        });
        map.addListener("click", (e) => {
          userMovedRef.current = true;
          marker.setPosition(e.latLng);
          marker.setOpacity(0.55);
          setPending({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        });
        mapObjRef.current = map;
        markerObjRef.current = marker;
        stopResizeObserver = observeMapResize(map, containerRef.current);
        setStatus("ready");
        startCenterRef.current = center;
        if (lat == null || lng == null) {
          // Si la persona no da permiso (o tarda), el mapa queda donde estaba.
          requestLocation(
            (pos) => {
              if (cancelled || userMovedRef.current) return;
              startCenterRef.current = pos;
              map.setCenter(pos);
              map.setZoom(15);
              marker.setPosition(pos);
            },
            () => {},
            MAP_GEOLOCATION_OPTIONS
          );
        }
      })
      .catch(() => setStatus("error"));

    return () => {
      cancelled = true;
      if (stopResizeObserver) stopResizeObserver();
    };
    // Sólo se inicializa una vez con la key disponible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // Si lat/lng cambian desde afuera (ej. botón "Usar mi ubicación"),
  // recentramos el mapa y movemos el pin sin reinicializar todo. Esto ya
  // viene confirmado (es una fuente precisa), así que cancela cualquier
  // propuesta pendiente de tocar/arrastrar el mapa.
  useEffect(() => {
    if (status === "ready" && markerObjRef.current && mapObjRef.current && lat != null && lng != null) {
      const pos = { lat, lng };
      markerObjRef.current.setPosition(pos);
      markerObjRef.current.setOpacity(1);
      mapObjRef.current.panTo(pos);
      setPending(null);
    }
  }, [lat, lng, status]);

  useEffect(() => {
    const map = mapObjRef.current;
    if (status !== "ready" || !map || !window.google?.maps) return;
    if (!radiusM || lat == null || lng == null) {
      circleObjRef.current?.setMap(null);
      return;
    }
    const center = { lat, lng };
    if (!circleObjRef.current) {
      circleObjRef.current = new window.google.maps.Circle({
        map,
        center,
        radius: radiusM,
        strokeColor: C.red,
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: C.red,
        fillOpacity: 0.08,
        clickable: false,
      });
    } else {
      circleObjRef.current.setMap(map);
      circleObjRef.current.setCenter(center);
      circleObjRef.current.setRadius(radiusM);
    }
    const bounds = circleObjRef.current.getBounds();
    if (bounds) map.fitBounds(bounds, 24);
  }, [status, lat, lng, radiusM, C.red]);

  function confirmPending() {
    if (!pending) return;
    markerObjRef.current?.setOpacity(1);
    onChangeRef.current(pending.lat, pending.lng);
    setPending(null);
  }

  // A pedido explícito (toque): si el permiso está bloqueado, explica cómo
  // habilitarlo en vez de no hacer nada. El punto queda como propuesta a
  // confirmar, igual que tocar el mapa.
  function goToMyLocation() {
    setGeoState("locating");
    requestLocation(
      (pos) => {
        setGeoState("idle");
        userMovedRef.current = true;
        startCenterRef.current = pos;
        mapObjRef.current?.setCenter(pos);
        mapObjRef.current?.setZoom(16);
        markerObjRef.current?.setPosition(pos);
        markerObjRef.current?.setOpacity(0.55);
        setPending(pos);
      },
      (err) => setGeoState(geolocationErrorMessage(err)),
      MAP_GEOLOCATION_OPTIONS
    );
  }

  function cancelPending() {
    setPending(null);
    if (markerObjRef.current) {
      const start = startCenterRef.current;
      const fallback = {
        lat: lat ?? start?.lat ?? defaultCenter?.lat ?? FALLBACK_CENTER.lat,
        lng: lng ?? start?.lng ?? defaultCenter?.lng ?? FALLBACK_CENTER.lng,
      };
      markerObjRef.current.setPosition(fallback);
      markerObjRef.current.setOpacity(1);
    }
  }

  if (!apiKey) {
    return (
      <div className="text-xs rounded-lg border p-3" style={{ borderColor: C.border, color: C.muted }}>
        El mapa interactivo no está configurado (falta{" "}
        <code className="felpus-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>). Mientras tanto podés usar el
        botón &ldquo;Ubicación&rdquo; para capturar tu posición actual.
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="text-xs rounded-lg border p-3" style={{ borderColor: C.border, color: C.redDark }}>
        No se pudo cargar Google Maps. Revisá que la clave sea válida y que la Maps JavaScript API esté
        habilitada en tu proyecto de Google Cloud.
      </div>
    );
  }

  return (
    <div>
      <div
        ref={containerRef}
        role="region"
        aria-label="Mapa interactivo para marcar la ubicación exacta. Si usás teclado, el botón Ubicación hace lo mismo sin necesidad del mapa."
        className="w-full rounded-xl overflow-hidden border"
        style={{ height: 220, borderColor: C.border, background: C.surfaceMuted }}
      />
      {status === "ready" && (
        <button
          type="button"
          onClick={goToMyLocation}
          disabled={geoState === "locating"}
          className="mt-2 w-full text-[12px] font-bold rounded-lg py-2 border disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
          style={{ borderColor: C.border, color: C.text, background: C.surfaceSubtle }}
        >
          {geoState === "locating" ? "Buscando tu ubicación…" : "📍 Ir a mi ubicación"}
        </button>
      )}
      {geoState !== "idle" && geoState !== "locating" && (
        <p className="text-[11px] mt-1" style={{ color: C.redDark }} role="alert">
          {geoState}
        </p>
      )}
      {pending ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg p-2.5" style={{ background: C.surfaceSubtle, border: `1px solid ${C.border}` }}>
          <span className="text-[11px] flex-1" style={{ color: C.muted }}>¿Confirmás esta ubicación?</span>
          <button
            type="button"
            onClick={confirmPending}
            className="text-[11px] font-bold text-white rounded-lg px-2.5 py-1"
            style={{ background: C.greenSolid }}
          >
            Confirmar
          </button>
          <button type="button" onClick={cancelPending} className="text-[11px] font-semibold" style={{ color: C.muted }}>
            Cancelar
          </button>
        </div>
      ) : (
        <p className="text-[10px] mt-1" style={{ color: C.muted }}>
          Tocá el mapa o arrastrá el pin para marcar el lugar exacto, y confirmá la ubicación — cuanto más cerca
          esté del pin de otro reporte, mayor el % de coincidencia.
        </p>
      )}
    </div>
  );
}
