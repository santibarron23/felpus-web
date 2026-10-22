"use client";

// Asistente Felpus: botón flotante + panel de chat. Habla con /api/chat (la
// IA corre solo en el servidor) y nunca publica nada por su cuenta: arma un
// borrador que la persona revisa y corrige acá, y "Revisar y publicar" lo
// pasa al formulario real de Felpus (onApplyDraft), donde se publica con el
// botón de siempre. Lo que no necesita IA (bienvenida, preguntas frecuentes,
// respuestas de respaldo) se resuelve acá mismo, sin costo.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { PawPrint, X, Send, Camera, Loader2, Pencil, Trash2, ArrowRight, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";
import { useTheme } from "./ThemeProvider";
import {
  ASSISTANT_NAME,
  GREETING,
  QUICK_ACTIONS,
  FAQ_TOPICS,
  FALLBACK_ACTIONS,
  QUICK_REPLIES,
  contextualSuggestions,
  faqById,
  fallbackReply,
} from "../../lib/chatFaq";
import { emptyDraft, normalizeDraft, isDraftEmpty, composeDraftDescription, draftToFormFields, detectRegion, MAX_USER_CHARS } from "../../lib/chatbot";
import { COLOR_OPTIONS, TAMANO_OPTIONS, EDAD_OPTIONS, MAX_FOTOS, resizeImageFile, computeHistogram, formatFechaAR, fechaLabel } from "../../lib/matching";
import { logError } from "../../lib/log";
import { zonaConCiudad } from "../../lib/zona";
import { petTitle } from "../../lib/petTitle";
import { loadGoogleMaps, reverseGeocodeLatLng } from "../../lib/googleMaps";
import { requestLocation, geolocationErrorMessage, MAP_GEOLOCATION_OPTIONS } from "../../lib/geolocation";

// El mapa (y el script de Google Maps) recién se carga cuando la persona
// toca "Marcar en el mapa": mismo criterio que el formulario (showMapPicker),
// cada carga del mapa es facturable.
const MapPicker = dynamic(() => import("../MapPicker"), { ssr: false });

const STORAGE_KEY = "felpus_asistente_v1";
const MAX_STORED_MESSAGES = 40;
const MAX_FILE_MB = 15;
const VISION_MAX_DIM = 640;

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// Métricas de producto (GA4, si está configurado — ver layout.js). Solo
// nombres de eventos y valores no personales: nunca texto de la charla.
function track(name, params = {}) {
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") window.gtag("event", name, params);
  } catch {
    // sin analytics no pasa nada
  }
}

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      messages: Array.isArray(data.messages) ? data.messages.filter((m) => m && typeof m.content === "string").slice(-MAX_STORED_MESSAGES) : [],
      draft: normalizeDraft(data.draft),
      draftStartedAt: typeof data.draftStartedAt === "number" ? data.draftStartedAt : null,
      skipped: Array.isArray(data.skipped) ? data.skipped.filter((k) => typeof k === "string") : [],
    };
  } catch {
    return null;
  }
}

function saveStored(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage lleno o bloqueado: el chat sigue andando, solo no se recuerda
  }
}

// Versión chica de la foto para que Claude la mire (menos tokens = menos
// costo). La foto completa (con marca de agua e histograma) queda para el
// formulario y el matching.
function downscaleForVision(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, VISION_MAX_DIM / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

const greetingMessage = () => ({ id: "greeting", role: "assistant", content: GREETING, local: true, quick: true });

export default function FelpusAssistant({ section = "inicio", openReport = null, onApplyDraft, onOpenReport, onNavigate, publishedToken = 0, openToken = 0 }) {
  const C = useTheme();
  const [open, setOpen] = useState(false);
  // En celular el botón flotante tapaba los botones del costado derecho de
  // las tarjetas (Compartir, corazones, "Ubicación") mientras se scrollea.
  // Se esconde al bajar y vuelve al subir o al quedarse quieto un momento.
  const [fabHidden, setFabHidden] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let lastY = window.scrollY;
    let idle = null;
    const onScroll = () => {
      const y = window.scrollY;
      if (window.innerWidth < 640) {
        if (y > lastY + 4 && y > 120) setFabHidden(true);
        else if (y < lastY - 4) setFabHidden(false);
      }
      lastY = y;
      clearTimeout(idle);
      // Al llegar al pie (redes y enlaces legales) se queda escondido para no
      // tapar los links.
      const atBottom = window.innerWidth < 640 && window.innerHeight + y >= document.documentElement.scrollHeight - 140;
      if (atBottom) setFabHidden(true);
      else idle = setTimeout(() => setFabHidden(false), 1200);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(idle);
    };
  }, []);
  const [messages, setMessages] = useState(() => [greetingMessage()]);
  const [draft, setDraft] = useState(emptyDraft);
  const [draftStartedAt, setDraftStartedAt] = useState(null);
  // Datos que la persona salteó con "No sé"/"Ahora no" en los botones de
  // respuesta rápida: el servidor no los vuelve a pedir.
  const [skipped, setSkipped] = useState([]);
  const [locating, setLocating] = useState(false);
  const [photos, setPhotos] = useState([]); // [{ dataUrl, hist }] — solo en memoria
  const [pendingImage, setPendingImage] = useState(null); // versión chica, se manda UNA vez
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const fabRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const fileRef = useRef(null);
  const openedAtRef = useRef(null);

  // Restaurar la charla y el borrador de este dispositivo (después del
  // montaje: localStorage no existe en el render del servidor).
  useEffect(() => {
    const stored = loadStored();
    if (stored) {
      if (stored.messages.length) setMessages([greetingMessage(), ...stored.messages.filter((m) => m.id !== "greeting")]);
      setDraft(stored.draft);
      setDraftStartedAt(stored.draftStartedAt);
      setSkipped(stored.skipped);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveStored({
      // Sin fotos ni tarjetas pesadas: solo texto, para no llenar el almacenamiento.
      messages: messages.filter((m) => m.id !== "greeting").map(({ id, role, content, local }) => ({ id, role, content, local })),
      draft,
      draftStartedAt,
      skipped,
    });
  }, [messages, draft, draftStartedAt, skipped, hydrated]);

  // Se publicó (en el formulario) un reporte que salió de este chat: el
  // borrador ya cumplió su función.
  useEffect(() => {
    if (!publishedToken) return;
    setDraft(emptyDraft());
    setDraftStartedAt(null);
    setSkipped([]);
    setPhotos([]);
    setPendingImage(null);
    setMessages((prev) => [
      ...prev,
      {
        id: newId(),
        role: "assistant",
        local: true,
        content: "¡Tu reporte quedó publicado! 🐾 Ya podés ver sus posibles coincidencias en la pantalla de resultados. Si necesitás algo más, acá estoy.",
      },
    ]);
  }, [publishedToken]);

  // Apertura pedida desde afuera (ej. "Preguntale al asistente" en una ficha).
  useEffect(() => {
    if (openToken) setOpen(true);
  }, [openToken]);

  useEffect(() => {
    if (open) {
      openedAtRef.current = Date.now();
      track("asistente_abierto", { seccion: section });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open, busy, draft]);

  const close = useCallback(() => {
    setOpen(false);
    setTimeout(() => fabRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const pushLocal = useCallback((msg) => setMessages((prev) => [...prev, { id: newId(), role: "assistant", local: true, ...msg }]), []);

  const send = useCallback(
    async (rawText, { draftOverride = null, skipKey = null } = {}) => {
      const text = (rawText || "").trim() || (pendingImage ? "Te mando una foto de la mascota." : "");
      if (!text || busy) return;
      const image = pendingImage;
      const currentDraft = draftOverride || draft;
      const nextSkipped = skipKey && !skipped.includes(skipKey) ? [...skipped, skipKey] : skipped;
      if (nextSkipped !== skipped) setSkipped(nextSkipped);
      const userMsg = { id: newId(), role: "user", content: image ? `📷 ${text}` : text, thumb: image ? photos[photos.length - 1]?.dataUrl : null };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInput("");
      setPendingImage(null);
      setBusy(true);
      track("asistente_mensaje", { seccion: section, con_foto: !!image });

      // Solo la charla real con la IA: la bienvenida, las preguntas
      // frecuentes y los avisos locales no se mandan (menos tokens).
      const history = nextMessages.filter((m) => !m.local).map((m) => ({ role: m.role, content: m.content }));
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history,
            draft: currentDraft,
            context: { section, reportId: openReport?.id || null, hasPhoto: photos.length > 0, skipped: nextSkipped },
            image,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const kind = data.code || (res.status === 429 ? "rate_limit" : res.status === 501 || res.status === 503 ? "unavailable" : "error");
          track("asistente_error", { codigo: kind, status: res.status });
          if (res.status === 400 && data.error) pushLocal({ content: data.error });
          else pushLocal({ content: fallbackReply(kind), actions: FALLBACK_ACTIONS });
          if (image) setPendingImage(image); // no se perdió: se puede reintentar
          return;
        }
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            content: data.reply,
            cards: data.matches?.length ? data.matches : data.results?.length ? data.results : null,
            cardsKind: data.matches?.length ? "matches" : data.results ? "results" : null,
            // Dato que está preguntando: la UI muestra sus botones de respuesta.
            pending: typeof data.pending === "string" && QUICK_REPLIES[data.pending] ? data.pending : null,
          },
        ]);
        if (data.results) track("asistente_busqueda", { resultados: data.results.length });
        if (data.matches) track("asistente_coincidencias", { cantidad: data.matches.length });
        if (data.draft) {
          setDraft(normalizeDraft(data.draft));
          if (!draftStartedAt) {
            setDraftStartedAt(Date.now());
            track("asistente_borrador_iniciado", { tipo: data.draft.tipo || "" });
          }
        }
      } catch (e) {
        logError("No se pudo hablar con el asistente", e);
        track("asistente_error", { codigo: "red" });
        pushLocal({ content: fallbackReply("error"), actions: FALLBACK_ACTIONS });
        if (image) setPendingImage(image);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, draft, draftStartedAt, skipped, section, openReport, photos, pendingImage, pushLocal]
  );

  // Botón de respuesta rápida (perro/gato, color, sexo, ubicación, foto…).
  function handleQuickReply(reply) {
    track("asistente_boton_respuesta", { dato: reply.label });
    if (reply.action === "foto") {
      fileRef.current?.click();
      return;
    }
    if (reply.action === "ubicacion") {
      shareMyLocation();
      return;
    }
    send(reply.send, { skipKey: reply.skip || null });
  }

  // "📍 Usar mi ubicación actual": marca el punto en el borrador (igual que
  // el mapa de la vista previa) y le cuenta al asistente el barrio/ciudad —
  // nunca la dirección exacta (ver reverseGeocodeLatLng).
  function shareMyLocation() {
    if (locating) return;
    setLocating(true);
    requestLocation(
      async ({ lat, lng }) => {
        let zona = "";
        try {
          const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
          if (apiKey) {
            const place = await reverseGeocodeLatLng(await loadGoogleMaps(apiKey), lat, lng);
            if (place) zona = [place.zona, place.ciudad && place.ciudad !== place.zona ? place.ciudad : ""].filter(Boolean).join(", ");
          }
        } catch (e) {
          logError("No se pudo geocodificar la ubicación del asistente", e);
        }
        const nextDraft = normalizeDraft({ ...draft, lat, lng, zona: draft.zona?.trim() ? draft.zona : zona });
        setDraft(nextDraft);
        setLocating(false);
        track("asistente_ubicacion_actual");
        send(zona ? `Fue por ${zona}` : "Ya marqué el lugar en el mapa", { draftOverride: nextDraft });
      },
      (err) => {
        setLocating(false);
        pushLocal({ content: `${geolocationErrorMessage(err)} También podés escribir el barrio o marcar el punto en el mapa de la vista previa.` });
      },
      MAP_GEOLOCATION_OPTIONS
    );
  }

  function handleQuick(action) {
    track("asistente_acceso_rapido", { id: action.id });
    if (action.faq) {
      setMessages((prev) => [...prev, { id: newId(), role: "user", local: true, content: action.label }]);
      pushLocal({ content: "Elegí un tema o escribime tu pregunta:", faqMenu: true });
      return;
    }
    if (action.search) {
      // Sin IA: las opciones ya son consultas completas.
      setMessages((prev) => [...prev, { id: newId(), role: "user", local: true, content: action.label }]);
      pushLocal({ content: "¿Qué querés buscar? Tocá una opción o escribime, por ejemplo: \"caniche blanco por San Lorenzo\".", pending: "buscar" });
      return;
    }
    if (action.draftPatch) {
      const nextDraft = normalizeDraft({ ...draft, ...action.draftPatch });
      setDraft(nextDraft);
      if (!draftStartedAt) setDraftStartedAt(Date.now());
      send(action.send, { draftOverride: nextDraft });
      return;
    }
    send(action.send);
  }

  function handleFaq(topic) {
    track("asistente_faq", { id: topic.id });
    setMessages((prev) => [...prev, { id: newId(), role: "user", local: true, content: topic.label }]);
    pushLocal({ content: topic.answer, actions: topic.action ? [topic.action] : null });
  }

  function handleAction(id) {
    if (id === "ir-reportar") {
      onNavigate?.("reportar");
      close();
    } else if (id === "ir-explorar") {
      onNavigate?.("explorar");
      close();
    } else if (id === "abrir-faq") {
      pushLocal({ content: "Elegí un tema:", faqMenu: true });
    }
  }

  async function handlePickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      pushLocal({ content: "Ese archivo no es una imagen. Probá con una foto." });
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      pushLocal({ content: `La foto pesa demasiado (máximo ${MAX_FILE_MB} MB).` });
      return;
    }
    if (photos.length >= MAX_FOTOS) {
      pushLocal({ content: `Ya tenés ${MAX_FOTOS} fotos, que es el máximo por reporte.` });
      return;
    }
    setProcessingPhoto(true);
    try {
      // Mismo procesamiento que el formulario (resizeImageFile +
      // computeHistogram): al pasar al formulario, la foto ya va lista
      // para publicar y para el matching, sin procesarla de nuevo.
      const dataUrl = await resizeImageFile(file);
      const hist = await computeHistogram(dataUrl);
      const vision = await downscaleForVision(dataUrl);
      setPhotos((prev) => [...prev, { dataUrl, hist }]);
      setPendingImage(vision);
      track("asistente_foto");
      inputRef.current?.focus();
    } catch (err) {
      logError("No se pudo procesar la foto del chat", err);
      pushLocal({ content: "No pude procesar esa foto. Probá con otra." });
    } finally {
      setProcessingPhoto(false);
    }
  }

  function removePendingPhoto() {
    setPendingImage(null);
    setPhotos((prev) => prev.slice(0, -1));
  }

  function handlePublish(finalDraft = draft) {
    const fields = draftToFormFields(finalDraft);
    track("asistente_a_formulario", {
      con_foto: photos.length > 0,
      segundos: draftStartedAt ? Math.round((Date.now() - draftStartedAt) / 1000) : null,
    });
    onApplyDraft?.({ ...fields, fotos: photos.map((p) => ({ dataUrl: p.dataUrl, hist: p.hist, embedding: null })), startedAt: draftStartedAt });
    pushLocal({ content: "Listo, te pasé todo al formulario. Revisalo, agregá tu contacto y tocá \"Publicar\". Si querés volver, el chat queda acá." });
    close();
  }

  // Punto marcado en el mapa de la vista previa. Si la zona todavía está
  // vacía, se completa sola con el barrio/ciudad de ese punto (nunca la
  // dirección exacta, ver reverseGeocodeLatLng) — no pisa lo ya escrito.
  function handleLocation(lat, lng) {
    setDraft((d) => normalizeDraft({ ...d, lat, lng }));
    track("asistente_mapa_marcado");
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;
    loadGoogleMaps(apiKey)
      .then((maps) => reverseGeocodeLatLng(maps, lat, lng))
      .then((place) => {
        if (!place) return;
        const zona = [place.zona, place.ciudad && place.ciudad !== place.zona ? place.ciudad : ""].filter(Boolean).join(", ");
        setDraft((d) =>
          normalizeDraft({
            ...d,
            zona: d.zona.trim() ? d.zona : zona,
            provincia: d.provincia.trim() ? d.provincia : place.provincia || "",
          })
        );
      })
      .catch((e) => logError("No se pudo geocodificar el punto del mapa del asistente", e));
  }

  function handleDiscard() {
    track("asistente_borrador_descartado");
    setSkipped([]);
    setDraft(emptyDraft());
    setDraftStartedAt(null);
    setPhotos([]);
    setPendingImage(null);
    pushLocal({ content: "Borré el borrador. Si querés empezar de nuevo, contame qué pasó." });
  }

  function handleReset() {
    setSkipped([]);
    setMessages([greetingMessage()]);
    setDraft(emptyDraft());
    setDraftStartedAt(null);
    setPhotos([]);
    setPendingImage(null);
    track("asistente_reiniciado");
  }

  const suggestions = useMemo(() => contextualSuggestions(section, { hasOpenReport: !!openReport }), [section, openReport]);
  const showDraft = !isDraftEmpty(draft);
  const onlyGreeting = messages.length === 1;
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  return (
    <>
      {!open && (
        <button
          ref={fabRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Abrir ${ASSISTANT_NAME}`}
          aria-expanded={false}
          className={`felpus-assistant-fab fixed right-4 z-40 flex items-center gap-2 rounded-full pl-3 pr-4 h-12 text-white text-sm font-bold shadow-lg transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--felpus-focus)]/40 ${fabHidden ? "translate-x-24 opacity-0 pointer-events-none" : ""}`}
          style={{ background: C.redSolid, bottom: "calc(110px + env(safe-area-inset-bottom, 0px))" }}
        >
          <PawPrint className="w-5 h-5" aria-hidden="true" />
          <span className="hidden sm:inline">Asistente</span>
          {showDraft && <span className="w-2 h-2 rounded-full bg-white" aria-label="Tenés un borrador sin publicar" />}
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-modal="false"
          aria-labelledby="felpus-assistant-title"
          className="felpus-assistant-panel felpus-sheet-panel fixed z-[75] inset-x-0 bottom-0 top-[6vh] sm:top-auto sm:left-auto sm:right-4 sm:bottom-6 sm:w-[390px] sm:h-[640px] sm:max-h-[calc(100vh-48px)] flex flex-col rounded-t-3xl sm:rounded-3xl shadow-2xl border overflow-hidden"
          style={{ background: C.surface, borderColor: C.border, color: C.text }}
        >
          <header className="flex items-center gap-2.5 px-4 py-3 shrink-0" style={{ background: C.redSolid }}>
            <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" aria-hidden="true">
              <PawPrint className="w-5 h-5 text-white" />
            </span>
            <div className="flex-1 min-w-0">
              <h2 id="felpus-assistant-title" className="text-white font-extrabold text-sm leading-tight">
                {ASSISTANT_NAME}
              </h2>
              <p className="text-white/80 text-[12px] leading-tight">Te ayuda a buscar y a reportar</p>
            </div>
            {!onlyGreeting && (
              <button
                type="button"
                onClick={handleReset}
                className="p-2 rounded-full text-white/90 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label="Empezar una charla nueva"
                title="Empezar de nuevo"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={close}
              className="p-2 rounded-full text-white hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Cerrar asistente (la charla queda guardada)"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          <div ref={listRef} role="log" aria-live="polite" aria-relevant="additions" className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 space-y-3" style={{ background: C.cream }}>
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                m={m}
                C={C}
                onQuick={handleQuick}
                onFaq={handleFaq}
                onAction={handleAction}
                quickReplies={!busy && m.pending && m.id === lastAssistantId ? QUICK_REPLIES[m.pending] : null}
                onQuickReply={handleQuickReply}
                locating={locating}
                onOpenReport={(id) => {
                  track("asistente_ficha_abierta", { desde: m.cardsKind || "" });
                  // La ficha se abre debajo del panel: se cierra el chat (la
                  // charla queda guardada) para que se vea.
                  close();
                  onOpenReport?.(id);
                }}
                disabled={busy}
              />
            ))}
            {showDraft && (
              <DraftPreview
                C={C}
                draft={draft}
                photos={photos}
                onChange={(d) => setDraft(normalizeDraft(d))}
                onLocation={handleLocation}
                onPublish={handlePublish}
                onDiscard={handleDiscard}
              />
            )}
            {busy && (
              <div className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl rounded-bl-md w-fit" style={{ background: C.surface }}>
                <span className="sr-only">El asistente está escribiendo…</span>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="felpus-typing-dot w-1.5 h-1.5 rounded-full" style={{ background: C.muted, animationDelay: `${i * 0.15}s` }} aria-hidden="true" />
                ))}
              </div>
            )}
          </div>

          <form
            className="shrink-0 border-t px-3 pt-2.5"
            style={{ borderColor: C.border, background: C.surface, paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))" }}
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            {/* Ayuda según dónde está la persona (sección o ficha abierta). */}
            {suggestions.length > 0 && !busy && (
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                {suggestions.map((sg) => (
                  <span key={sg.id} className="shrink-0 whitespace-nowrap">
                    <Chip C={C} onClick={() => handleQuick(sg)}>
                      {sg.label}
                    </Chip>
                  </span>
                ))}
              </div>
            )}
            {(pendingImage || processingPhoto) && (
              <div className="flex items-center gap-2 mb-2 text-xs" style={{ color: C.muted }}>
                {processingPhoto ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Preparando la foto…
                  </>
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- data URL local, no pasa por el optimizador */}
                    <img src={pendingImage} alt="Foto lista para enviar" className="w-10 h-10 rounded-lg object-cover" />
                    <span className="flex-1">Foto lista: se manda con tu próximo mensaje.</span>
                    <button type="button" onClick={removePendingPhoto} className="p-1 rounded-full" aria-label="Quitar la foto" style={{ color: C.muted }}>
                      <X className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            )}
            <div className="flex items-end gap-2">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePickPhoto} tabIndex={-1} aria-hidden="true" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy || processingPhoto || !!pendingImage}
                className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center border disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={{ borderColor: C.border, color: C.text, background: C.surfaceSubtle }}
                aria-label="Adjuntar una foto de la mascota"
                title="Adjuntar foto"
              >
                <Camera className="w-5 h-5" />
              </button>
              <label htmlFor="felpus-assistant-input" className="sr-only">
                Escribile al asistente
              </label>
              <textarea
                id="felpus-assistant-input"
                ref={inputRef}
                rows={1}
                value={input}
                maxLength={MAX_USER_CHARS}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder="Contame qué pasó…"
                className="flex-1 resize-none rounded-2xl border px-3.5 py-2.5 text-sm max-h-28 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                style={{ borderColor: C.border, background: C.surfaceSubtle, color: C.text }}
              />
              <button
                type="submit"
                disabled={busy || (!input.trim() && !pendingImage)}
                className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={{ background: C.redSolid }}
                aria-label="Enviar mensaje"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-[11px] mt-1.5 text-center" style={{ color: C.muted }}>
              Asistente con IA: puede equivocarse. No compartas teléfonos ni direcciones en el chat.
            </p>
          </form>
        </section>
      )}
    </>
  );
}

function Chip({ C, children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-left text-[13px] font-semibold rounded-full px-3.5 py-2 border transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
      style={{ background: C.surface, borderColor: C.border, color: C.red }}
    >
      {children}
    </button>
  );
}

function MessageBubble({ m, C, onQuick, onFaq, onAction, onOpenReport, disabled, quickReplies, onQuickReply, locating }) {
  const isUser = m.role === "user";
  return (
    <div className={`felpus-fadein flex flex-col ${isUser ? "items-end" : "items-start"} gap-2`}>
      <div
        className={`max-w-[88%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${isUser ? "rounded-2xl rounded-br-md text-white" : "rounded-2xl rounded-bl-md"}`}
        style={isUser ? { background: C.redSolid } : { background: C.surface, color: C.text }}
      >
        {m.thumb && (
          // eslint-disable-next-line @next/next/no-img-element -- data URL local
          <img src={m.thumb} alt="Foto enviada" className="w-28 h-28 object-cover rounded-xl mb-1.5" />
        )}
        <span className="sr-only">{isUser ? "Vos: " : "Asistente: "}</span>
        {m.content}
      </div>
      {m.quick && (
        <div className="flex flex-wrap gap-2 max-w-full">
          {QUICK_ACTIONS.map((a) => (
            <Chip key={a.id} C={C} onClick={() => onQuick(a)} disabled={disabled}>
              {a.label}
            </Chip>
          ))}
        </div>
      )}
      {quickReplies?.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Respuestas rápidas">
          {quickReplies.map((r) => (
            <Chip key={r.label} C={C} onClick={() => onQuickReply(r)} disabled={r.action === "ubicacion" && locating}>
              {r.action === "ubicacion" && locating ? "Buscando tu ubicación…" : r.label}
            </Chip>
          ))}
        </div>
      )}
      {m.faqMenu && (
        <div className="flex flex-wrap gap-2">
          {FAQ_TOPICS.map((t) => (
            <Chip key={t.id} C={C} onClick={() => onFaq(t)}>
              {t.label}
            </Chip>
          ))}
        </div>
      )}
      {m.actions?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {m.actions.map((a) => (
            <Chip key={a.id} C={C} onClick={() => onAction(a.id)}>
              {a.label}
            </Chip>
          ))}
        </div>
      )}
      {m.cards?.length > 0 && (
        <div className="w-full space-y-2" role="list" aria-label={m.cardsKind === "matches" ? "Posibles coincidencias" : "Resultados de la búsqueda"}>
          {m.cardsKind === "matches" && (
            <p className="text-[12px] font-semibold px-1" style={{ color: C.muted }}>
              Posibles coincidencias — revisalas con calma, no son seguras.
            </p>
          )}
          {m.cards.map((card) => (
            <ResultCard key={card.id} C={C} card={card} kind={m.cardsKind} onOpen={() => onOpenReport(card.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

const PROB_LABEL = { alta: "Probabilidad alta", media: "Probabilidad media", baja: "Probabilidad baja" };

function ResultCard({ C, card, kind, onOpen }) {
  const titulo = petTitle(card);
  const rasgos = [card.tipo === "perdida" ? "Perdida" : "Encontrada", card.color, card.tamano, card.raza].filter(Boolean).join(", ");
  const probColor = card.probabilidad === "alta" ? C.matchText : card.probabilidad === "media" ? C.orangeInk : C.muted;
  return (
    <div role="listitem">
      <button
        type="button"
        onClick={onOpen}
        className="w-full flex gap-3 p-2.5 rounded-2xl border text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
        style={{ background: C.surface, borderColor: C.border }}
        aria-label={`Ver la publicación: ${titulo}${card.zona ? `, ${zonaConCiudad(card)}` : ""}`}
      >
        <span className="relative w-16 h-16 shrink-0 rounded-xl overflow-hidden" style={{ background: C.surfaceMuted }}>
          {card.foto ? (
            <Image src={card.foto} alt="" fill sizes="64px" className="object-cover" />
          ) : (
            <PawPrint className="w-6 h-6 absolute inset-0 m-auto" style={{ color: C.muted }} aria-hidden="true" />
          )}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-bold truncate" style={{ color: C.text }}>
            {titulo}
          </span>
          {rasgos && (
            <span className="block text-xs truncate" style={{ color: C.muted }}>
              {rasgos}
            </span>
          )}
          <span className="block text-xs truncate" style={{ color: C.muted }}>
            {[zonaConCiudad(card), card.fecha ? formatFechaAR(card.fecha) : null].filter(Boolean).join(" · ")}
          </span>
          <span className="flex items-center gap-2 mt-0.5 text-[12px] font-bold">
            {kind === "matches" && card.probabilidad && <span style={{ color: probColor }}>{PROB_LABEL[card.probabilidad]}</span>}
            <span style={{ color: card.resuelto ? C.green : C.red }}>{card.resuelto ? "Reencontrada" : "Activa"}</span>
            <span className="ml-auto flex items-center gap-0.5" style={{ color: C.red }}>
              Ver ficha <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}

const fieldClass =
  "w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40";

function DraftPreview({ C, draft, photos, onChange, onLocation, onPublish, onDiscard }) {
  // Mientras se corrige, los campos editan una copia local SIN normalizar:
  // normalizar en cada tecla (trim) se comía el espacio al final y no se
  // podía separar palabras. Se valida recién al tocar "Listo" o "Revisar y
  // publicar".
  const [local, setLocal] = useState(null);
  const editing = local != null;
  const [collapsed, setCollapsed] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const shown = local || draft;
  const descripcion = composeDraftDescription(shown);
  const set = (k) => (e) => setLocal((l) => ({ ...(l || draft), [k]: e.target.value }));
  const commit = () => {
    if (!local) return draft;
    // La zona que completó el mapa mientras se editaba no se pierde.
    const next = normalizeDraft({
      ...local,
      zona: local.zona?.trim() ? local.zona : draft.zona,
      provincia: local.provincia?.trim() ? local.provincia : draft.provincia,
      lat: draft.lat,
      lng: draft.lng,
    });
    onChange(next);
    setLocal(null);
    return next;
  };
  const hasPoint = draft.lat != null && draft.lng != null;
  const region = detectRegion(draft.zona, draft.provincia);
  const fieldStyle = { borderColor: C.border, background: C.surfaceSubtle, color: C.text };
  const listo = shown.tipo && shown.especie && shown.zona?.trim() && (shown.color || shown.colorDetalle?.trim());
  const resumen = [
    ["Tipo", draft.tipo === "perdida" ? "Perdida" : draft.tipo === "encontrada" ? "Encontrada" : ""],
    ["Especie", draft.especie === "perro" ? "Perro" : draft.especie === "gato" ? "Gato" : ""],
    ["Nombre", draft.nombre],
    ["Color", draft.colorDetalle || draft.color],
    ["Tamaño", draft.tamano],
    ["Sexo", draft.sexo],
    ["Zona", draft.zona],
    ["Ubicación", hasPoint ? "Marcada en el mapa ✓" : ""],
    ["Fecha", draft.fecha ? formatFechaAR(draft.fecha) : ""],
  ];

  return (
    <section className="felpus-fadein rounded-2xl border-2 p-3 space-y-2.5" style={{ background: C.surface, borderColor: C.red }} aria-labelledby="felpus-draft-title">
      <div className="flex items-center gap-2">
        <h3 id="felpus-draft-title" className="flex-1 text-sm font-extrabold" style={{ color: C.text }}>
          📝 Vista previa del reporte
        </h3>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="p-1 rounded-full"
          style={{ color: C.muted }}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Mostrar vista previa" : "Ocultar vista previa"}
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>
      {!collapsed && (
        <>
          {photos.length > 0 && (
            <div className="flex gap-1.5">
              {photos.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- data URL local
                <img key={i} src={p.dataUrl} alt={`Foto ${i + 1} del reporte`} className="w-14 h-14 rounded-lg object-cover" />
              ))}
            </div>
          )}
          {!editing ? (
            <>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {resumen.map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="font-semibold" style={{ color: C.muted }}>
                      {k}
                    </dt>
                    <dd className="truncate capitalize-first" style={{ color: v ? C.text : C.muted }}>
                      {v || "Sin dato"}
                    </dd>
                  </div>
                ))}
              </dl>
              <div>
                <p className="text-[12px] font-semibold mb-0.5" style={{ color: C.muted }}>
                  Descripción que se va a publicar
                </p>
                <p className="text-xs leading-relaxed" style={{ color: C.text }}>
                  {descripcion}
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-0.5">
                  <span className="font-semibold" style={{ color: C.muted }}>Tipo</span>
                  <select className={fieldClass} style={fieldStyle} value={shown.tipo} onChange={set("tipo")}>
                    <option value="">Sin dato</option>
                    <option value="perdida">Perdida</option>
                    <option value="encontrada">Encontrada</option>
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="font-semibold" style={{ color: C.muted }}>Especie</span>
                  <select className={fieldClass} style={fieldStyle} value={shown.especie} onChange={set("especie")}>
                    <option value="">Sin dato</option>
                    <option value="perro">Perro</option>
                    <option value="gato">Gato</option>
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="font-semibold" style={{ color: C.muted }}>Nombre</span>
                  <input className={fieldClass} style={fieldStyle} value={shown.nombre} maxLength={40} onChange={set("nombre")} />
                </label>
                <label className="space-y-0.5">
                  <span className="font-semibold" style={{ color: C.muted }}>Color</span>
                  <select className={fieldClass} style={fieldStyle} value={shown.color} onChange={set("color")}>
                    <option value="">Sin dato</option>
                    {COLOR_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="font-semibold" style={{ color: C.muted }}>Tamaño</span>
                  <select className={fieldClass} style={fieldStyle} value={shown.tamano} onChange={set("tamano")}>
                    <option value="">Sin dato</option>
                    {TAMANO_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="font-semibold" style={{ color: C.muted }}>Sexo</span>
                  <select className={fieldClass} style={fieldStyle} value={shown.sexo} onChange={set("sexo")}>
                    <option value="">Sin dato</option>
                    <option value="Macho">Macho</option>
                    <option value="Hembra">Hembra</option>
                    <option value="No sé">No sé</option>
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="font-semibold" style={{ color: C.muted }}>Edad</span>
                  <select className={fieldClass} style={fieldStyle} value={shown.edad} onChange={set("edad")}>
                    <option value="">Sin dato</option>
                    {EDAD_OPTIONS.filter((e) => e !== "No sé").map((e) => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="font-semibold" style={{ color: C.muted }}>{fechaLabel(shown.tipo)}</span>
                  <input type="date" className={fieldClass} style={fieldStyle} value={shown.fecha} onChange={set("fecha")} />
                </label>
              </div>
              <label className="block space-y-0.5">
                <span className="font-semibold" style={{ color: C.muted }}>Color con tus palabras</span>
                <input className={fieldClass} style={fieldStyle} value={shown.colorDetalle} maxLength={60} onChange={set("colorDetalle")} />
              </label>
              <label className="block space-y-0.5">
                <span className="font-semibold" style={{ color: C.muted }}>Zona aproximada</span>
                <input className={fieldClass} style={fieldStyle} value={shown.zona} maxLength={100} onChange={set("zona")} placeholder="Barrio o referencia, no tu dirección" />
              </label>
              <label className="block space-y-0.5">
                <span className="font-semibold" style={{ color: C.muted }}>Detalles (editable)</span>
                <textarea className={fieldClass} style={fieldStyle} rows={3} value={shown.detalleLibre} maxLength={400} onChange={set("detalleLibre")} />
              </label>
              <p className="text-[12px] leading-relaxed" style={{ color: C.muted }}>
                Así queda: {descripcion}
              </p>
            </div>
          )}
          {/* Mismo MapPicker que el formulario: el punto se confirma
              explícitamente ahí adentro antes de guardarse. */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowMap((v) => !v)}
              aria-expanded={showMap}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              style={{ borderColor: C.border, color: C.text, background: C.surfaceSubtle }}
            >
              📍 {showMap ? "Ocultar mapa" : hasPoint ? "Cambiar el punto en el mapa" : "Marcar en el mapa dónde fue"}
            </button>
            {showMap && (
              <div className="rounded-xl overflow-hidden">
                <MapPicker
                  lat={draft.lat}
                  lng={draft.lng}
                  defaultCenter={region?.geo}
                  onChange={(lat, lng) => onLocation(lat, lng)}
                />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => onPublish(commit())}
              disabled={!listo}
              className="flex-1 min-w-[150px] flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              style={{ background: C.redSolid }}
            >
              Revisar y publicar <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => (editing ? commit() : setLocal({ ...draft }))}
              className="flex items-center gap-1 rounded-xl px-3 py-2.5 text-sm font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              style={{ borderColor: C.border, color: C.text }}
              aria-pressed={editing}
            >
              <Pencil className="w-4 h-4" aria-hidden="true" /> {editing ? "Listo" : "Corregir"}
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="flex items-center rounded-xl px-3 py-2.5 border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              style={{ borderColor: C.border, color: C.muted }}
              aria-label="Descartar borrador"
              title="Descartar borrador"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[12px]" style={{ color: C.muted }}>
            {listo
              ? "Todavía no está publicado. En el formulario agregás tu contacto y lo publicás con el botón \"Publicar\"."
              : "Para seguir faltan: si la perdiste o encontraste, perro o gato, zona y color."}
          </p>
        </>
      )}
    </section>
  );
}
