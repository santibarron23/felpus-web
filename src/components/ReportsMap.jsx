"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, observeMapResize } from "../lib/googleMaps";

// Mapa de sólo lectura que pinta un marcador por cada reporte que tenga
// ubicación exacta (lat/lng) — rojo para perdidas, naranja para encontradas.
// Tocar un marcador abre el detalle de ese reporte (mismo modal que la lista).
export default function ReportsMap({ reports, onSelectReport, center }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const containerRef = useRef(null);
  const mapObjRef = useRef(null);
  const markersRef = useRef([]);
  const onSelectRef = useRef(onSelectReport);
  const [status, setStatus] = useState(apiKey ? "loading" : "no-key");

  useEffect(() => {
    onSelectRef.current = onSelectReport;
  }, [onSelectReport]);

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    let stopResizeObserver = null;
    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        const map = new maps.Map(containerRef.current, {
          center: center || { lat: -34.6037, lng: -58.3816 },
          zoom: center ? 13 : 12,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        mapObjRef.current = map;
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

  // Repinta los marcadores cada vez que cambia la lista filtrada de reportes.
  useEffect(() => {
    if (status !== "ready" || !mapObjRef.current || !window.google) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = reports
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => {
        const marker = new window.google.maps.Marker({
          position: { lat: r.lat, lng: r.lng },
          map: mapObjRef.current,
          title: `${r.tipo === "perdida" ? "Perdida" : "Encontrada"} · ${r.zona}`,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: r.tipo === "perdida" ? "#D31C22" : "#B14A12",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
        });
        marker.addListener("click", () => onSelectRef.current?.(r));
        return marker;
      });
  }, [reports, status]);

  if (!apiKey) {
    return (
      <div className="text-xs rounded-lg border p-3" style={{ borderColor: "#EFE3D2", color: "#6B5643" }}>
        El mapa no está configurado (falta <code className="felpus-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>).
        Mientras tanto podés seguir explorando con la vista de lista.
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="text-xs rounded-lg border p-3" style={{ borderColor: "#EFE3D2", color: "#AB1017" }}>
        No se pudo cargar Google Maps. Revisá que la clave sea válida y que la Maps JavaScript API esté
        habilitada en tu proyecto de Google Cloud.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full rounded-xl overflow-hidden border"
      style={{ height: 340, borderColor: "#EFE3D2", background: "#F0E7D8" }}
    />
  );
}
