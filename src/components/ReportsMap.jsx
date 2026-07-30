"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, observeMapResize } from "../lib/googleMaps";

// Mapa de sólo lectura que pinta un marcador por cada reporte que tenga
// ubicación exacta (lat/lng), mostrando la foto real de la mascota en un
// círculo — rojo para perdidas, naranja para encontradas — en vez de un
// punto de color genérico, para poder reconocer a la mascota de un vistazo
// sin tener que abrir cada reporte. Tocar un marcador abre el detalle
// (mismo modal que la lista).
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
          // Los AdvancedMarkerElement (foto de la mascota) necesitan un Map ID
          // para renderizarse — "DEMO_MAP_ID" es el ID público de Google para
          // desarrollo/uso sin configuración extra, no requiere Cloud Console.
          mapId: "DEMO_MAP_ID",
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
    markersRef.current.forEach((m) => {
      m.map = null;
    });
    markersRef.current = reports
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => {
        // Si el mapa quedó en un estado internamente roto (ej. la key
        // rechazada por dominio no autorizado) aunque nuestro propio status
        // diga "ready", instanciar un AdvancedMarkerElement puede tirar una
        // excepción interna de la librería de Google. Se aísla por marcador
        // para que un pin roto no tumbe el resto del mapa ni la página.
        try {
          const color = r.tipo === "perdida" ? "#D31C22" : "#E36525";
          const pin = document.createElement("div");
          pin.style.cssText = `
            width: 40px; height: 40px; border-radius: 9999px; overflow: hidden;
            border: 3px solid ${color}; background: #fff; cursor: pointer;
            box-shadow: 0 2px 6px rgba(0,0,0,0.35);
          `;
          const img = document.createElement("img");
          img.src = r.foto;
          img.alt = "";
          img.style.cssText = "width: 100%; height: 100%; object-fit: cover; display: block;";
          img.onerror = () => {
            pin.style.background = color;
          };
          pin.appendChild(img);

          const marker = new window.google.maps.marker.AdvancedMarkerElement({
            position: { lat: r.lat, lng: r.lng },
            map: mapObjRef.current,
            title: `${r.tipo === "perdida" ? "Perdida" : "Encontrada"} · ${r.zona}`,
            content: pin,
          });
          marker.addListener("gmp-click", () => onSelectRef.current?.(r));
          return marker;
        } catch (e) {
          console.error("No se pudo crear el marcador del mapa para un reporte", e);
          return null;
        }
      })
      .filter(Boolean);
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
