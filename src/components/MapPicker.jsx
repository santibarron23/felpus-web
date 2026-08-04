"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, observeMapResize } from "../lib/googleMaps";
import { useTheme } from "./felpus/ThemeProvider";

// Mapa con un pin arrastrable/tocable para marcar la ubicación exacta de un
// reporte. Si no hay API key configurada, muestra un aviso y la app sigue
// funcionando igual con el botón "Ubicación" (geolocalización del navegador).
export default function MapPicker({ lat, lng, onChange, defaultCenter }) {
  const C = useTheme();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const containerRef = useRef(null);
  const mapObjRef = useRef(null);
  const markerObjRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [status, setStatus] = useState(apiKey ? "loading" : "no-key");
  // Tocar el mapa o arrastrar el pin no mueve la ubicación del reporte todavía
  // — deja el pin en una posición "propuesta" (semitransparente) hasta que el
  // usuario la confirma explícitamente. Así se evita que un toque accidental
  // cambie la zona sin que la persona se dé cuenta (la ubicación es clave
  // para el matching).
  const [pending, setPending] = useState(null);

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
          lat: lat ?? defaultCenter?.lat ?? -34.6037,
          lng: lng ?? defaultCenter?.lng ?? -58.3816,
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
          const pos = marker.getPosition();
          marker.setOpacity(0.55);
          setPending({ lat: pos.lat(), lng: pos.lng() });
        });
        map.addListener("click", (e) => {
          marker.setPosition(e.latLng);
          marker.setOpacity(0.55);
          setPending({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        });
        mapObjRef.current = map;
        markerObjRef.current = marker;
        stopResizeObserver = observeMapResize(map, containerRef.current);
        setStatus("ready");
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

  function confirmPending() {
    if (!pending) return;
    markerObjRef.current?.setOpacity(1);
    onChangeRef.current(pending.lat, pending.lng);
    setPending(null);
  }

  function cancelPending() {
    setPending(null);
    if (markerObjRef.current) {
      const fallback = { lat: lat ?? defaultCenter?.lat ?? -34.6037, lng: lng ?? defaultCenter?.lng ?? -58.3816 };
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
