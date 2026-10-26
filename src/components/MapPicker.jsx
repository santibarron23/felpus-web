"use client";

import { useEffect, useRef, useState } from "react";
import { loadLeaflet, createMap, observeMapResize, pinIcon } from "../lib/osmMap";
import {
  requestLocation,
  geolocationErrorMessage,
  isInAppBrowser,
  MAP_GEOLOCATION_OPTIONS,
  OPEN_IN_BROWSER_HINT,
} from "../lib/geolocation";
import { CITIES } from "../lib/cities";
import FullscreenMapPicker from "./FullscreenMapPicker";

// Sin ubicación de la persona ni defaultCenter: Salta, donde está la
// comunidad de Felpus (antes, Buenos Aires).
const FALLBACK_CENTER = CITIES.salta.geo;
import { useTheme } from "./felpus/ThemeProvider";

// Mapa con un pin arrastrable/tocable para marcar la ubicación exacta de un
// reporte. OpenStreetMap + Leaflet (ver osmMap.js): sin key ni facturación.
// Si el mapa no carga, la app sigue funcionando con el botón "Ubicación"
// (geolocalización del navegador).
// radiusM (opcional): dibuja un círculo con ese radio alrededor del punto
// confirmado — lo usa /configuracion/alertas para mostrar la zona.
// fallbackActions (opcional): si el mapa no carga, ofrece igual marcar el
// punto con el GPS o, si hay defaultCenterLabel, con el centro de esa
// ciudad — para pantallas como /configuracion/alertas donde el mapa es la
// ÚNICA forma de elegir la zona (en el formulario de reporte ya existe el
// botón "Ubicación" aparte, por eso no es el default).
export default function MapPicker({
  lat,
  lng,
  onChange,
  defaultCenter,
  radiusM = null,
  fallbackActions = false,
  defaultCenterLabel = null,
}) {
  const C = useTheme();
  const containerRef = useRef(null);
  const mapObjRef = useRef(null);
  const markerObjRef = useRef(null);
  const circleObjRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [status, setStatus] = useState("loading");
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
  // true cuando ya se sabe dónde está la persona (GPS): el mapa grande
  // arranca más cerca.
  const locatedRef = useRef(false);
  // Botón "Ir a mi ubicación" dentro del mapa: "idle" | "locating" | mensaje de error.
  const [geoState, setGeoState] = useState("idle");
  // Pantallas táctiles (2026-10-22): el mapa chico de la página es solo una
  // vista (no se mueve ni se toca, así no pide "usá dos dedos" ni se pelea
  // con el scroll) y para marcar se abre FullscreenMapPicker, con pin fijo
  // en el centro. Se decide una vez al crear el mapa.
  const [touch, setTouch] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    let stopResizeObserver = null;
    let mapToRemove = null;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current) return;
        const isTouch = !!window.matchMedia?.("(pointer: coarse)").matches;
        setTouch(isTouch);
        const center = {
          lat: lat ?? defaultCenter?.lat ?? FALLBACK_CENTER.lat,
          lng: lng ?? defaultCenter?.lng ?? FALLBACK_CENTER.lng,
        };
        const map = createMap(L, containerRef.current, { center, zoom: lat != null ? 15 : 12, interactive: !isTouch });
        mapToRemove = map;
        const marker = L.marker([center.lat, center.lng], { draggable: !isTouch, icon: pinIcon(L, C.redSolid), keyboard: false }).addTo(map);
        marker.on("dragend", () => {
          userMovedRef.current = true;
          const pos = marker.getLatLng();
          marker.setOpacity(0.55);
          setPending({ lat: pos.lat, lng: pos.lng });
        });
        map.on("click", (e) => {
          if (isTouch) return;
          userMovedRef.current = true;
          marker.setLatLng(e.latlng);
          marker.setOpacity(0.55);
          setPending({ lat: e.latlng.lat, lng: e.latlng.lng });
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
              locatedRef.current = true;
              startCenterRef.current = pos;
              map.setView([pos.lat, pos.lng], 15);
              marker.setLatLng([pos.lat, pos.lng]);
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
      circleObjRef.current = null;
      mapToRemove?.remove();
    };
    // Se inicializa una sola vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si lat/lng cambian desde afuera (ej. botón "Usar mi ubicación"),
  // recentramos el mapa y movemos el pin sin reinicializar todo. Esto ya
  // viene confirmado (es una fuente precisa), así que cancela cualquier
  // propuesta pendiente de tocar/arrastrar el mapa.
  useEffect(() => {
    if (status === "ready" && markerObjRef.current && mapObjRef.current && lat != null && lng != null) {
      markerObjRef.current.setLatLng([lat, lng]);
      markerObjRef.current.setOpacity(1);
      mapObjRef.current.panTo([lat, lng]);
      setPending(null);
    }
  }, [lat, lng, status]);

  useEffect(() => {
    const map = mapObjRef.current;
    if (status !== "ready" || !map) return;
    if (!radiusM || lat == null || lng == null) {
      circleObjRef.current?.remove();
      circleObjRef.current = null;
      return;
    }
    loadLeaflet().then((L) => {
      if (!circleObjRef.current) {
        circleObjRef.current = L.circle([lat, lng], {
          radius: radiusM,
          color: C.red,
          opacity: 0.8,
          weight: 2,
          fillColor: C.red,
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(map);
      } else {
        circleObjRef.current.setLatLng([lat, lng]);
        circleObjRef.current.setRadius(radiusM);
      }
      map.fitBounds(circleObjRef.current.getBounds(), { padding: [24, 24] });
    });
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
        mapObjRef.current?.setView([pos.lat, pos.lng], 16);
        markerObjRef.current?.setLatLng([pos.lat, pos.lng]);
        markerObjRef.current?.setOpacity(0.55);
        setPending(pos);
      },
      (err) => setGeoState(geolocationErrorMessage(err)),
      MAP_GEOLOCATION_OPTIONS
    );
  }

  // Sin mapa no hay pin para "proponer": el GPS es una fuente precisa, así
  // que se confirma directo (igual que el botón "Ubicación" del formulario).
  function locateWithoutMap() {
    setGeoState("locating");
    requestLocation(
      (pos) => {
        setGeoState("idle");
        onChangeRef.current(pos.lat, pos.lng);
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
      markerObjRef.current.setLatLng([fallback.lat, fallback.lng]);
      markerObjRef.current.setOpacity(1);
    }
  }

  const geoMessage = geoState !== "idle" && geoState !== "locating" && (
    <p className="text-[12px] mt-1" style={{ color: C.redDark }} role="alert">
      {geoState}
    </p>
  );

  if (status === "error") {
    const inApp = isInAppBrowser();
    const hasPoint = lat != null && lng != null;
    return (
      <div className="rounded-xl border p-3" style={{ borderColor: C.border, background: C.surfaceSubtle }} role="status">
        <p className="text-[13px] font-semibold" style={{ color: C.text }}>
          No pudimos cargar el mapa en este navegador.
        </p>
        <p className="text-[12px] mt-1" style={{ color: C.muted }}>
          {inApp ? `Pasa seguido en el navegador de Instagram o Facebook. ${OPEN_IN_BROWSER_HINT}` : "Probá recargar la página."}
          {fallbackActions && " Mientras tanto podés marcar la zona así:"}
        </p>
        {fallbackActions && (
          <div className="mt-2 flex flex-col gap-2">
            <button
              type="button"
              onClick={locateWithoutMap}
              disabled={geoState === "locating"}
              className="w-full text-[12px] font-bold rounded-lg py-2 border disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              style={{ borderColor: C.border, color: C.text, background: C.surface }}
            >
              {geoState === "locating" ? "Buscando tu ubicación…" : "📍 Usar mi ubicación actual"}
            </button>
            {defaultCenter && defaultCenterLabel && (
              <button
                type="button"
                onClick={() => onChangeRef.current(defaultCenter.lat, defaultCenter.lng)}
                className="w-full text-[12px] font-bold rounded-lg py-2 border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={{ borderColor: C.border, color: C.text, background: C.surface }}
              >
                🏙️ Usar el centro de {defaultCenterLabel}
              </button>
            )}
          </div>
        )}
        {geoMessage}
        {fallbackActions && hasPoint && (
          <p className="text-[12px] mt-2 font-semibold" style={{ color: C.greenSolid }}>
            ✓ Zona marcada. Elegí el radio abajo y guardá.
          </p>
        )}
      </div>
    );
  }

  const hasPoint = lat != null && lng != null;
  const fullscreenCenter = hasPoint
    ? { lat, lng }
    : startCenterRef.current || { lat: defaultCenter?.lat ?? FALLBACK_CENTER.lat, lng: defaultCenter?.lng ?? FALLBACK_CENTER.lng };

  return (
    <div>
      <div className="relative">
        <div
          ref={containerRef}
          role="region"
          aria-label="Mapa interactivo para marcar la ubicación exacta. Si usás teclado, el botón Ubicación hace lo mismo sin necesidad del mapa."
          className="felpus-map w-full rounded-xl overflow-hidden border"
          style={{ height: 220, borderColor: C.border, background: C.surfaceMuted }}
        />
        {touch && status === "ready" && (
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            aria-label="Abrir el mapa para marcar la ubicación"
            className="absolute inset-0 rounded-xl flex items-end justify-center pb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
          >
            <span className="rounded-full px-3.5 py-2 text-[13px] font-bold text-white shadow-md" style={{ background: C.emphasisBg }}>
              {hasPoint ? "Tocá para cambiar el lugar" : "Tocá para marcar en el mapa"}
            </span>
          </button>
        )}
      </div>
      {fullscreen && (
        <FullscreenMapPicker
          center={fullscreenCenter}
          zoom={hasPoint || locatedRef.current ? 16 : 13}
          radiusM={radiusM}
          onClose={() => setFullscreen(false)}
          onConfirm={(newLat, newLng) => {
            setFullscreen(false);
            userMovedRef.current = true;
            onChangeRef.current(newLat, newLng);
          }}
        />
      )}
      {touch && status === "ready" && (
        <>
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            className="mt-2 w-full text-[13px] font-bold rounded-lg py-2.5 border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
            style={{ borderColor: C.border, color: C.text, background: C.surfaceSubtle }}
          >
            📍 {hasPoint ? "Cambiar el lugar en el mapa" : "Marcar en el mapa"}
          </button>
          <p className="text-[11px] mt-1" style={{ color: C.muted }}>
            {hasPoint
              ? "✓ Ubicación marcada. Cuanto más cerca esté del pin de otro reporte, mayor el % de coincidencia."
              : "Se abre el mapa grande: movelo hasta que el pin quede en el lugar y tocá \"Usar esta ubicación\"."}
          </p>
        </>
      )}
      {!touch && status === "ready" && (
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
      {geoMessage}
      {touch ? null : pending ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg p-2.5" style={{ background: C.surfaceSubtle, border: `1px solid ${C.border}` }}>
          <span className="text-[12px] flex-1" style={{ color: C.muted }}>¿Confirmás esta ubicación?</span>
          <button
            type="button"
            onClick={confirmPending}
            className="text-[12px] font-bold text-white rounded-lg px-2.5 py-1"
            style={{ background: C.greenSolid }}
          >
            Confirmar
          </button>
          <button type="button" onClick={cancelPending} className="text-[12px] font-semibold" style={{ color: C.muted }}>
            Cancelar
          </button>
        </div>
      ) : (
        <p className="text-[11px] mt-1" style={{ color: C.muted }}>
          Tocá el mapa o arrastrá el pin para marcar el lugar exacto, y confirmá la ubicación — cuanto más cerca
          esté del pin de otro reporte, mayor el % de coincidencia.
        </p>
      )}
    </div>
  );
}
