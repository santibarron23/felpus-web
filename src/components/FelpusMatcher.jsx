"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import {
  PawPrint,
  Search,
  MapPin,
  Camera,
  Navigation,
  Loader2,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Check,
  HelpCircle,
  ArrowLeft,
  Crown,
  PartyPopper,
  Home,
  Plus,
  Share2,
  X,
  LogIn,
  LogOut,
  Lock,
  Heart,
  Bell,
  Flame,
  Sun,
  Moon,
  Mic,
  Square,
} from "lucide-react";
import {
  normalizeText,
  computeHistogram,
  resizeImageFile,
  getImageEmbedding,
  findMatches,
  scoreLabel,
  getTier,
  getTierProgress,
  getBadges,
  isRecent,
  timeAgo,
  emptyForm,
  MAX_FOTOS,
  haversineKm,
  COLOR_OPTIONS,
  SEXO_OPTIONS,
  sanitizePhoneForWhatsapp,
  EDAD_OPTIONS,
  PESO_OPTIONS,
  getRazaOptions,
  RAZA_NO_SE,
  ACCESORIO_OPTIONS,
  REACCION_OPTIONS,
  MARCA_OPTIONS,
  MANCHA_UBICACION_OPTIONS,
  MANCHA_COLOR_OPTIONS,
  composeDescripcionBase,
  composeAccesorioSentence,
  composeReaccionSentence,
  composeMarcaSentence,
  buildDetallesEstructurados,
  reportPhotoAlt,
  PUNTOS_PERDIDA,
  PUNTOS_ENCONTRADA,
  PUNTOS_REENCUENTRO,
  PUNTOS_BONO_ORIGINAL,
  SCORE_MINIMO,
} from "../lib/matching";
import {
  fetchReports,
  fetchReportContact,
  createReport,
  resolveReports,
  deleteReport,
  fetchLeaderboard,
  fetchMyRank,
  awardPoints as awardPointsRemote,
  sendHeart,
  bumpStreak,
  seedIfEmpty,
} from "../lib/store";
import { playTap, playSuccess } from "../lib/sound";
import { loadGoogleMaps } from "../lib/googleMaps";
import { requestLocation } from "../lib/geolocation";
import { subscribeReportPush, isPushSupported } from "../lib/push";
import { logError } from "../lib/log";
import { displayColor } from "../lib/theme";
import { useTheme, useThemeToggle } from "./felpus/ThemeProvider";
import MapPicker from "./MapPicker";
import ReportsMap from "./ReportsMap";
import Mascot from "./Mascot";
import ZonaAutocomplete from "./ZonaAutocomplete";
import Combobox from "./felpus/Combobox";
import {
  Badge,
  EspecieIcon,
  MatchScoreRing,
  ReportCard,
  DetailModal,
  ShareButton,
  AnimatedNumber,
  ToastStack,
  SkeletonCard,
  SkeletonRankRow,
  FilterSheet,
} from "./felpus/PureViews";
import { useToasts } from "./felpus/useToasts";
import { useAuth } from "./felpus/useAuth";

const LOGO_RED = "/assets/logo_full_red.png";
// En dark mode el logo rojo compite con el resto de la interfaz por ser "el
// rojo que llama la atención" — el mismo problema de fondo que el resto de
// este rediseño (el rojo debe ganar importancia porque aparece poco, no
// porque esté en todos lados). El logo blanco integra mejor con las
// superficies oscuras y deja que el rojo real de la marca se lo lleven los
// CTAs/alertas. Mismas dimensiones que LOGO_RED (2419x1409) — el swap no
// mueve ni redimensiona nada.
const LOGO_WHITE = "/assets/logo_full_white.png";
const MASCOT_HERO = "/assets/mascot_hero.png";
const PAW_MAGNIFIER = "/assets/paw_magnifier.png";
const MAX_FOTO_MB = 15;
const SCAN_STEP_INTERVAL_MS = 900;
// Delay artificial en el submit — sin esto la pantalla de "escaneo" (que
// muestra los pasos del matching) parpadea y desaparece antes de que la
// persona llegue a leerla, aunque el insert real haya sido instantáneo.
const SUBMIT_PERCEIVED_DELAY_MS = 900;
// La búsqueda de Explorar recalculaba filteredReports (filtra + ordena toda
// la lista) en cada tecla — con este debounce, solo recalcula 250ms después
// de que la persona deja de tipear.
const SEARCH_DEBOUNCE_MS = 250;
// La vista de lista de Explorar montaba TODAS las ReportCard de golpe, sin
// importar cuántas hubiera — con pocos reportes no se nota, pero escala mal.
// En vez de virtualización real (los ReportCard no tienen una altura
// uniforme: descripción, apodo y coincidencias expandidas varían), se
// renderiza de a tandas — mismo resultado práctico (no hay cientos de nodos
// de más en el DOM), sin la complejidad/fragilidad de medir alturas.
const REPORTS_PAGE_SIZE = 20;
// Direcciones fijas del estallido de partículas al completar el checklist
// de "Reportar" (ver felpus-confetti en globals.css) — con posiciones fijas
// en vez de aleatorias, el efecto es el mismo en cada disparo, sin tener
// que generar valores random en cada render.
const CHECKLIST_CONFETTI = [
  { emoji: "🐾", tx: -46, ty: -34, rot: -30 },
  { emoji: "✨", tx: 34, ty: -38, rot: 20 },
  { emoji: "🐾", tx: 48, ty: 12, rot: 40 },
  { emoji: "✨", tx: -48, ty: 8, rot: -20 },
  { emoji: "🎉", tx: 2, ty: -46, rot: 0 },
  { emoji: "✨", tx: 16, ty: 38, rot: -15 },
];

// Pasos que realmente hace el matching (histograma de color + embedding de
// forma en resizeImageFile/scoreMatch, más zona/cercanía) — se muestran en
// la pantalla de "escaneo" para que se perciba el trabajo real detrás del
// resultado, sin inventar capacidades que la app no tiene.
const SCAN_STEPS = [
  "Analizando la foto...",
  "Comparando color y forma...",
  "Buscando reportes cercanos...",
];

// Rediseño de "Detalles para reconocerlo" (ver ACCESORIO_OPTIONS/
// REACCION_OPTIONS/MARCA_OPTIONS + composeAccesorioSentence/
// composeReaccionSentence/composeMarcaSentence en matching.js): 3 preguntas
// cortas, casi todas de un toque, en vez de una hoja en blanco pidiendo
// señas + accesorio + comportamiento a la vez. Lo que sí varía persona a
// persona y no entra en ningún chip queda en el campo de texto de abajo.
// Clase compartida por todos los chips de esta sección — min-h-[38px]
// (además del padding) para que el área táctil en mobile quede cómoda,
// hover/active discretos, y el mismo anillo de foco que el resto del form.
const CHIP_BTN_CLASS =
  "min-h-[38px] rounded-full px-3.5 py-2 text-xs font-semibold border flex items-center gap-1 transition-colors hover:opacity-80 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40";

// El error crudo de Supabase (ej. violación de un CHECK constraint de largo
// máximo) nunca llegaba a mostrarse — todo caía en el mismo "Algo falló,
// probá de nuevo" genérico, así que alguien podía quedar reintentando sin
// entender qué campo corregir. Esto traduce las causas más comunes a un
// mensaje accionable; si no reconoce el error, se queda con el genérico.
function describeSubmitError(err) {
  const msg = String(err?.message || "");
  if (err?.code === "23514" || /violates check constraint/.test(msg)) {
    if (/descripcion_len/.test(msg)) return "La descripción es muy larga — acortala e intentá de nuevo.";
    if (/zona_len/.test(msg)) return "La zona/dirección elegida es muy larga — probá escribirla más corta.";
    if (/nombre_len/.test(msg)) return "El nombre de la mascota es muy largo — acortalo e intentá de nuevo.";
    if (/color_otro_len/.test(msg)) return "La descripción del color es muy larga — acortala e intentá de nuevo.";
    if (/nickname_len/.test(msg)) return "Tu apodo es muy largo — probá uno más corto.";
    if (/contacto_email_len/.test(msg)) return "El email de contacto es muy largo.";
    if (/contacto_whatsapp_len/.test(msg)) return "El WhatsApp de contacto es muy largo.";
    return "Algún campo supera el largo permitido — revisá los textos e intentá de nuevo.";
  }
  if (msg.includes("Failed to fetch") || err?.name === "TypeError") {
    return "No pudimos conectar con el servidor — revisá tu conexión e intentá de nuevo.";
  }
  // Mensaje del trigger enforce_report_rate_limit (supabase/schema.sql) — ya
  // viene redactado en español y listo para mostrar tal cual.
  if (/límite de reportes por hora/.test(msg)) return msg;
  return "Algo falló al publicar el reporte. Probá de nuevo.";
}

export default function FelpusMatcher() {
  const C = useTheme();
  const { mode: themeMode, toggle: toggleTheme } = useThemeToggle();
  const [activeTab, setActiveTab] = useState("inicio");
  const [reportKind, setReportKind] = useState("perdida");
  const [form, setForm] = useState(emptyForm());
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  // Antes reports=[] significaba lo mismo para "todavía no hay reportes" que
  // para "no se pudo conectar" — el empty-state mostraba siempre el mismo
  // mensaje optimista aunque la causa real fuera un error de red/Supabase.
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [matchResult, setMatchResult] = useState(null);
  const [pushSubState, setPushSubState] = useState("idle"); // idle | loading | active | error
  // Estado del rediseño de "Detalles para reconocerlo" — ver comentario
  // junto a CHIP_BTN_CLASS más arriba. form.descripcion sigue siendo el
  // único campo de texto que se manda a la base (nada cambia ahí); estas
  // piezas se combinan para armarlo Y además viajan aparte como objeto
  // estructurado en el submit (ver buildDetallesEstructurados) — separarlas
  // evita tener que hacer cirugía de texto sobre un string cada vez que
  // alguien toca/destoca un chip.
  const [accesorioChips, setAccesorioChips] = useState([]);
  const [reaccionChips, setReaccionChips] = useState([]);
  const [marcaChips, setMarcaChips] = useState([]);
  // Sub-preguntas de "Mancha particular" — sólo tienen sentido mientras ese
  // chip esté seleccionado (ver toggleMarcaChip, que las limpia si se
  // destilda).
  const [manchaUbicacion, setManchaUbicacion] = useState("");
  const [manchaColor, setManchaColor] = useState("");
  const [detalleLibre, setDetalleLibre] = useState("");
  const [dictating, setDictating] = useState(false);
  const [geoStatus, setGeoStatus] = useState("idle");
  // El mapa interactivo no se monta hasta que la persona lo pide — antes
  // MapPicker disparaba la carga del script de Google Maps apenas se entraba
  // al tab "Reportar", aunque terminara usando el botón "Ubicación" (GPS) o
  // escribiendo la zona a mano, que cubren la mayoría de los casos.
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [filterTipo, setFilterTipo] = useState("todos");
  const [filterEspecie, setFilterEspecie] = useState("todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearchQuery(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [searchQuery]);
  const [filterTamano, setFilterTamano] = useState("todos");
  const [filterColor, setFilterColor] = useState("todos");
  const [filterFecha, setFilterFecha] = useState("todos");
  const [filterRadioKm, setFilterRadioKm] = useState(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [exploreView, setExploreView] = useState("lista");
  // En desktop (lg+) el mapa de Explorar se muestra siempre, lado a lado con
  // la lista, en vez de detrás del toggle Lista/Mapa. Se rastrea con JS (no
  // solo CSS) para no montar el mapa —y su costo de llamadas a la API de
  // Google— en mobile cuando la persona nunca lo abre.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  const [heartedIds, setHeartedIds] = useState([]);
  const [poppingHeartId, setPoppingHeartId] = useState(null);
  const [matchesSeenAt, setMatchesSeenAt] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("felpus_hearted_ids") || "[]");
      if (Array.isArray(saved)) setHeartedIds(saved);
    } catch {
      // localStorage no disponible o corrupto — no es bloqueante
    }
  }, []);
  const [expandedCard, setExpandedCard] = useState(null);
  const [cardMatches, setCardMatches] = useState({});
  const [formError, setFormError] = useState("");
  // Antes el único feedback de validación era un banner al final del
  // formulario — en un formulario largo (apodo, foto, zona, color,
  // descripción, sexo, contacto) había que scrollear para encontrar qué
  // campo corregir. Esto marca el/los campos puntuales con error y lleva
  // el foco directo ahí.
  const [fieldErrors, setFieldErrors] = useState({});

  function focusField(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }
  const [visionStatus, setVisionStatus] = useState("idle"); // idle | analyzing | ai | basic
  const [nickname, setNickname] = useState("");
  const [leaderboard, setLeaderboard] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [showResueltas, setShowResueltas] = useState(false);
  const { toasts, pushToast } = useToasts();
  const [detailReport, setDetailReport] = useState(null);
  const [sortBy, setSortBy] = useState("recientes");
  const [myLocation, setMyLocation] = useState(null);
  const [locatingMe, setLocatingMe] = useState(false);
  const { user, authLoading, googleDisplayName, googleAvatar, signInWithGoogle, signOut } = useAuth(pushToast);
  const fileInputRef = useRef(null);
  const deepLinkHandled = useRef(false);

  // Apenas la persona toca cualquier campo del formulario, los errores
  // marcados quedan obsoletos — sin esto, el borde rojo de un campo ya
  // corregido seguía ahí hasta el próximo intento de submit.
  useEffect(() => {
    setFieldErrors((prev) => (Object.keys(prev).length > 0 ? {} : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, nickname]);

  // Escape cierra el overlay que esté abierto, de más encima a menos: el
  // modal de detalle de un reporte, el panel de notificaciones, y por
  // último el bottom sheet de filtros — accesibilidad básica de teclado
  // que faltaba en todos los overlays de la app.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== "Escape") return;
      if (detailReport) {
        setDetailReport(null);
        setConfirmingId(null);
      } else if (notifOpen) {
        setNotifOpen(false);
      } else if (showAdvancedFilters) {
        setShowAdvancedFilters(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailReport, notifOpen, showAdvancedFilters]);

  // Rota los mensajes de la pantalla de "escaneo" mientras dura la
  // publicación real (subida de fotos + insert), para que se perciba el
  // trabajo del matching en vez de un spinner mudo.
  useEffect(() => {
    if (!scanning) {
      setScanStep(0);
      return;
    }
    const id = setInterval(() => {
      setScanStep((s) => (s + 1) % SCAN_STEPS.length);
    }, SCAN_STEP_INTERVAL_MS);
    return () => clearInterval(id);
  }, [scanning]);

  // Racha de días consecutivos: se actualiza una vez por sesión apenas hay
  // un usuario logueado (bumpStreak es idempotente si "hoy" ya se contó).
  // Es la mecánica de retención más emblemática de apps tipo Duolingo —
  // "no quiero perder mi racha" trae de vuelta todos los días.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    bumpStreak(user.id, user.user_metadata?.full_name || user.user_metadata?.name || user.email)
      .then((res) => {
        if (!res || cancelled) return;
        setMyRank((prev) => (prev ? { ...prev, streak_days: res.streakDays } : prev));
        if (res.isNewToday && res.streakDays > 1) {
          pushToast("success", `🔥 ¡Racha de ${res.streakDays} días seguidos ayudando!`);
        }
      })
      .catch((e) => logError("No se pudo actualizar la racha diaria", e));
    return () => {
      cancelled = true;
    };
  }, [user, pushToast]);

  // Cuándo fue la última vez que este usuario revisó sus propias
  // coincidencias — se usa para saber qué mostrar como "novedad" en la
  // campanita, sin necesitar un sistema de notificaciones push/email real.
  useEffect(() => {
    if (!user) {
      setMatchesSeenAt(0);
      return;
    }
    try {
      const saved = Number(localStorage.getItem(`felpus_last_seen_matches_${user.id}`)) || 0;
      setMatchesSeenAt(saved);
    } catch {
      // localStorage no disponible — no es bloqueante, simplemente no hay "vistos"
    }
  }, [user]);

  function markMatchesSeen() {
    if (!user) return;
    const now = Date.now();
    setMatchesSeenAt(now);
    try {
      localStorage.setItem(`felpus_last_seen_matches_${user.id}`, String(now));
    } catch {
      // no bloqueante
    }
  }

  // El listado general (reports) ya no trae contacto_whatsapp/contacto_email
  // (ver fetchReports en lib/store.js) — se piden recién acá, al abrir el
  // detalle de ESE reporte puntual, vía una función rate-limitada
  // (fetchReportContact -> RPC get_report_contact, ver schema.sql). Esas dos
  // columnas tienen el SELECT revocado a nivel de Postgres para
  // anon/authenticated, así que ya no hay ningún SELECT directo —ni desde
  // acá ni desde afuera de la app— que pueda traer el contacto en bloque.
  async function openReportDetail(report) {
    setDetailReport(report);
    if (!report || report.resuelto) return; // resuelto: la base ya lo borró, no hay nada que pedir
    try {
      const contact = await fetchReportContact(report.id);
      setDetailReport((prev) => (prev?.id === report.id ? { ...prev, ...contact } : prev));
    } catch (e) {
      logError("No se pudo cargar el contacto del reporte", e);
    }
  }

  // Coincidencias nuevas desde la última visita: para cada reporte propio
  // activo, busca su mejor candidato nuevo (creado después del último
  // "visto") con score suficiente. Antes esto solo contaba un número y
  // mandaba a Explorar a ciegas — ahora la campanita puede mostrar
  // directamente CUÁL reporte tuyo tiene una coincidencia nueva y con qué,
  // para poder ir directo al detalle en vez de tener que buscarlo.
  const newMatchItems = useMemo(() => {
    if (!user) return [];
    const myActive = reports.filter((r) => r.userId === user.id && !r.resuelto);
    if (myActive.length === 0) return [];
    const items = [];
    for (const mine of myActive) {
      const opposite = mine.tipo === "perdida" ? "encontrada" : "perdida";
      const candidates = reports.filter((r) => r.tipo === opposite && !r.resuelto && r.creadoEn > matchesSeenAt);
      const scored = findMatches(mine, candidates);
      if (scored.length > 0) {
        items.push({ mine, best: scored[0].report, score: scored[0].score, extraCount: scored.length - 1 });
      }
    }
    return items;
  }, [reports, user, matchesSeenAt]);
  const newMatchesCount = newMatchItems.length;

  // Rediseño de "Detalles para reconocerlo" (ver CHIP_BTN_CLASS/
  // composeDescripcionBase más arriba): form.descripcion ya no es un campo
  // que el usuario edita directamente, se recompone acá cada vez que cambia
  // alguna de sus fuentes (los campos estructurados de arriba, los chips de
  // esta sección, o el texto libre) — evita tener que hacer cirugía de
  // texto sobre un string cada vez que se toca/destoca un chip.
  useEffect(() => {
    const base = composeDescripcionBase(form);
    const accesorioSentence = composeAccesorioSentence(accesorioChips);
    const reaccionSentence = composeReaccionSentence(reaccionChips);
    const marcaSentence = composeMarcaSentence(marcaChips, { manchaUbicacion, manchaColor });
    const composed = [base, accesorioSentence, reaccionSentence, marcaSentence, detalleLibre.trim()]
      .filter(Boolean)
      .join(" ");
    setForm((f) => (f.descripcion === composed ? f : { ...f, descripcion: composed }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.especie,
    form.raza,
    form.tamano,
    form.color,
    form.colorOtro,
    form.edad,
    form.sexo,
    accesorioChips,
    reaccionChips,
    marcaChips,
    manchaUbicacion,
    manchaColor,
    detalleLibre,
  ]);

  function toggleAccesorioChip(id) {
    playTap();
    setAccesorioChips((prev) => {
      if (id === "nada") return prev.includes(id) ? [] : ["nada"];
      const withoutNada = prev.filter((c) => c !== "nada");
      return withoutNada.includes(id) ? withoutNada.filter((c) => c !== id) : [...withoutNada, id];
    });
  }

  function toggleReaccionChip(id) {
    playTap();
    setReaccionChips((prev) => {
      if (id === "no_se") return prev.includes(id) ? [] : ["no_se"];
      const withoutNoSe = prev.filter((c) => c !== "no_se");
      return withoutNoSe.includes(id) ? withoutNoSe.filter((c) => c !== id) : [...withoutNoSe, id];
    });
  }

  // "Mancha particular" es la única marca con sub-preguntas (ubicación +
  // color, ver JSX) — si se destilda, se limpian también, para no guardar
  // una ubicación/color "huérfana" de una marca que ya no está tildada.
  // "Otro" no tiene una frase propia (ver MARCA_OPTIONS en matching.js): al
  // tildarlo, llevamos el foco directo al campo de texto libre, que es
  // donde ese detalle realmente va a quedar escrito.
  function toggleMarcaChip(id) {
    playTap();
    const turningOn = !marcaChips.includes(id);
    setMarcaChips((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
    if (id === "mancha" && !turningOn) {
      setManchaUbicacion("");
      setManchaColor("");
    }
    if (id === "otro" && turningOn) {
      focusField("form-detalle-libre");
    }
  }

  // Dictado por voz para "¿Querés agregar algo más?" — Web Speech API,
  // nativa del navegador (Chrome/Edge/Safari en mobile), sin dependencias
  // ni costo. Se degrada con gracia: si el navegador no la soporta (ej.
  // Firefox), el botón de mic directamente no se muestra (ver JSX).
  function startDictation() {
    const SpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "es-AR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) setDetalleLibre((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
    };
    recognition.onerror = () => {
      setDictating(false);
      pushToast("error", "No pudimos escuchar bien — probá de nuevo o escribí a mano.");
    };
    recognition.onend = () => setDictating(false);
    setDictating(true);
    recognition.start();
  }

  // Checklist de campos clave del formulario de reporte, en el mismo orden
  // en que handleSubmit los valida — sirve para la barra de progreso que
  // motiva a completar todo antes de publicar (menos fricción, más feedback
  // inmediato, en línea con la filosofía de gamificación del proyecto).
  // Si "¿Cómo reacciona con desconocidos?" sólo tiene tildado "No sé", no
  // cuenta como un dato extra aportado (mismo criterio que "Nada" en
  // accesorios: no suma señal). Se usa tanto para el checklist de progreso
  // como para decidir si mostrar la vista previa (ver JSX más abajo).
  const hasMeaningfulDetails = useMemo(() => {
    const reaccionAporta = reaccionChips.length > 0 && !(reaccionChips.length === 1 && reaccionChips[0] === "no_se");
    return accesorioChips.length > 0 || reaccionAporta || marcaChips.length > 0 || !!detalleLibre.trim();
  }, [accesorioChips, reaccionChips, marcaChips, detalleLibre]);

  const reportChecklist = useMemo(() => {
    const whatsappDigits = sanitizePhoneForWhatsapp(form.contactoWhatsapp);
    const colorOk = form.color.trim() && (form.color !== "Otro color" || form.colorOtro.trim());
    return [
      { id: "apodo", label: "Apodo", done: !!nickname.trim() },
      { id: "fotos", label: "Foto", done: form.fotos.length > 0 },
      { id: "zona", label: "Zona", done: !!form.zona.trim() },
      { id: "color", label: "Color", done: !!colorOk },
      // Ya no chequea form.descripcion: ahora se arma sola apenas se
      // completan especie/tamaño (ver el useEffect que la recompone), así
      // que estaría siempre "lista" sin que la persona hiciera nada — este
      // paso pasa a medir si sumó algún detalle EXTRA (chip o texto propio)
      // más allá de esa base automática.
      { id: "descripcion", label: "Detalles", done: hasMeaningfulDetails },
      { id: "sexo", label: "Sexo", done: !!form.sexo },
      { id: "contacto", label: "Contacto", done: !!whatsappDigits || !!form.contactoEmail.trim() },
    ];
  }, [nickname, form.fotos.length, form.zona, form.color, form.colorOtro, form.sexo, form.contactoWhatsapp, form.contactoEmail, hasMeaningfulDetails]);
  const reportProgressDone = reportChecklist.filter((s) => s.done).length;
  const reportProgressPct = Math.round((reportProgressDone / reportChecklist.length) * 100);

  // Celebración (estilo Duolingo) en el momento exacto en que el checklist
  // pasa de incompleto a 100% — no en cada render mientras ya está completo
  // (si no, reabrir el tab o tocar cualquier cosa la volvería a disparar).
  const [justCompletedChecklist, setJustCompletedChecklist] = useState(false);
  const prevProgressPctRef = useRef(reportProgressPct);
  useEffect(() => {
    const prevPct = prevProgressPctRef.current;
    prevProgressPctRef.current = reportProgressPct;
    if (prevPct < 100 && reportProgressPct === 100) {
      setJustCompletedChecklist(true);
      const id = setTimeout(() => setJustCompletedChecklist(false), 900);
      return () => clearTimeout(id);
    }
  }, [reportProgressPct]);

  useEffect(() => {
    if (googleDisplayName) setNickname(googleDisplayName);
  }, [googleDisplayName]);

  async function handleGoogleLogin() {
    await signInWithGoogle();
  }

  async function handleLogout() {
    await signOut();
    setNickname("");
  }

  // Cambiar de pestaña siempre vuelve al tope — si no, se entra a una vista
  // nueva ya scrolleada a la mitad porque quedó así en la pestaña anterior.
  const goToTab = useCallback((tabId) => {
    setActiveTab(tabId);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  // Share target: cuando alguien comparte una foto hacia Felpus desde la
  // galería/cámara/otra app (el selector nativo del celular, no el menú de
  // "Compartir" de acá adentro), el service worker intercepta ese POST,
  // guarda la foto en Cache Storage (no puede pasarse un File por URL) y
  // redirige acá con "?shareTarget=1" — ver sw.js y manifest.js. Esto
  // recupera esa foto, precarga el formulario de "Encontré" (compartir una
  // foto de una mascota casi siempre es para reportarla encontrada, no
  // perdida) y limpia el caché para no reusarla en una visita futura.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.search.includes("shareTarget=missed")) {
      // El service worker no llegó a interceptar el POST (ver
      // share-target/route.js) — no hay foto que recuperar.
      window.history.replaceState(null, "", window.location.pathname);
      setReportKind("encontrada");
      goToTab("reportar");
      pushToast("error", "No pudimos traer la foto compartida — subila desde acá.");
      return;
    }
    if (!window.location.search.includes("shareTarget=1")) return;
    (async () => {
      try {
        const cache = await caches.open("felpus-share-target-v1");
        const photoRes = await cache.match("/__share-target-photo");
        const textRes = await cache.match("/__share-target-text");
        await cache.delete("/__share-target-photo");
        await cache.delete("/__share-target-text");
        window.history.replaceState(null, "", window.location.pathname);

        if (photoRes) {
          const blob = await photoRes.blob();
          const file = new File([blob], "compartida.jpg", { type: blob.type || "image/jpeg" });
          setReportKind("encontrada");
          await processPhotoFile(file);
          // A detalleLibre, no a form.descripcion directo: ese campo ahora se
          // recompone solo a partir de los campos estructurados + chips +
          // este texto (ver el useEffect de más abajo) — escribirlo acá
          // quedaría pisado en el próximo render.
          const text = textRes ? (await textRes.text()).trim() : "";
          if (text) setDetalleLibre((prev) => (prev.trim() ? prev : text.slice(0, 600)));
          goToTab("reportar");
          pushToast("success", "📸 Foto cargada — completá los datos y publicá el reporte.");
        }
      } catch (e) {
        logError("No se pudo recuperar la foto compartida", e);
      }
      // Deliberadamente sin dependencias más allá de mount: solo debe
      // correr una vez, al abrir la app desde el share target.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, []);

  const loadLeaderboard = useCallback(async () => {
    try {
      const items = await fetchLeaderboard();
      setLeaderboard(items);
    } catch (e) {
      logError("No se pudo cargar el ranking", e);
    }
    // La posición propia se busca aparte porque el leaderboard general solo
    // trae el top 10 — si no estás ahí, igual queremos saber tu puesto real.
    if (user) {
      try {
        const rank = await fetchMyRank(user.id);
        setMyRank(rank);
      } catch (e) {
        logError("No se pudo cargar tu posición en el ranking", e);
      }
    } else {
      setMyRank(null);
    }
  }, [user]);

  const loadAll = useCallback(async () => {
    setLoadingReports(true);
    try {
      await seedIfEmpty();
      const items = await fetchReports();
      setReports(items);
      setLoadError(false);
      await loadLeaderboard();
    } catch (e) {
      logError("No se pudieron cargar los reportes", e);
      pushToast("error", "No pudimos conectar con la base de datos. Revisá tu configuración de Supabase.");
      setLoadError(true);
    } finally {
      setLoadingReports(false);
    }
  }, [loadLeaderboard, pushToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Deep link desde un flyer/QR o un enlace compartido (?r=<id>) — abre esa
  // publicación directamente apenas cargan los reportes. Solo una vez: si el
  // usuario cierra el modal, no debe reabrirse solo en el próximo refresh.
  useEffect(() => {
    if (deepLinkHandled.current || reports.length === 0) return;
    deepLinkHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const rid = params.get("r");
    if (!rid) return;
    const found = reports.find((r) => r.id === rid);
    if (found) {
      openReportDetail(found);
      goToTab("explorar");
    }
  }, [reports, goToTab]);

  // Confirmar un reencuentro requiere sesión con Google (evita que cualquiera
  // se autoasigne puntos con un apodo de texto libre) Y ser quien publicó ese
  // reporte específico (evita que un tercero resuelva el reporte de otra
  // persona). Cada reporte solo lo puede marcar como reencontrado su propio
  // autor.
  function handleConfirmTrigger(ownerReport, toggleId = ownerReport?.id) {
    if (!user) {
      pushToast("error", "Iniciá sesión con Google para confirmar reencuentros y sumar puntos.");
      handleGoogleLogin();
      return;
    }
    if (ownerReport.userId !== user.id) {
      pushToast("error", "Solo quien publicó este reporte puede marcarlo como reencontrado.");
      return;
    }
    setConfirmingId(toggleId);
  }

  // Mandar un corazón es un gesto de "gracias" entre colaboradores — pide
  // login (mismo motivo que los puntos: evita spam anónimo) y queda
  // recordado en este navegador para no poder mandar 10 seguidos a la misma
  // persona.
  async function handleSendHeart(contributor) {
    if (!user) {
      pushToast("error", "Iniciá sesión con Google para mandar corazones.");
      handleGoogleLogin();
      return;
    }
    if (heartedIds.includes(contributor.id)) return;
    try {
      playTap();
      setPoppingHeartId(contributor.id);
      setTimeout(() => setPoppingHeartId((prev) => (prev === contributor.id ? null : prev)), 450);
      const nextHearts = await sendHeart(contributor.id);
      setLeaderboard((prev) => prev.map((u) => (u.id === contributor.id ? { ...u, hearts: nextHearts } : u)));
      const updated = [...heartedIds, contributor.id];
      setHeartedIds(updated);
      localStorage.setItem("felpus_hearted_ids", JSON.stringify(updated));
    } catch (e) {
      logError(e);
      pushToast("error", "No pudimos enviar el corazón. Probá de nuevo.");
    }
  }

  function confirmButtonContent(report, ownedLabel) {
    if (!user) {
      return (
        <>
          <LogIn className="w-3.5 h-3.5" /> Iniciá sesión para confirmar reencuentro
        </>
      );
    }
    if (report.userId !== user.id) {
      return (
        <>
          <Lock className="w-3.5 h-3.5" /> Solo el autor puede confirmar reencuentro
        </>
      );
    }
    return (
      <>
        <PartyPopper className="w-3.5 h-3.5" /> {ownedLabel}
      </>
    );
  }

  async function markResolvedAndReward({ repObjs, bonusFor = [] }) {
    if (!user) {
      pushToast("error", "Iniciá sesión con Google para confirmar reencuentros y sumar puntos.");
      return;
    }
    const ownedRepObjs = repObjs.filter((r) => r.userId === user.id);
    if (ownedRepObjs.length === 0) {
      pushToast("error", "Solo quien publicó este reporte puede marcarlo como reencontrado.");
      setConfirmingId(null);
      return;
    }
    const resolverDisplayName = googleDisplayName || user.email || "Colaborador";
    try {
      const ids = ownedRepObjs.map((r) => r.id);
      await resolveReports(ids, user.id, resolverDisplayName);

      const updatedList = ownedRepObjs.map((r) => ({
        ...r,
        resuelto: true,
        resueltoPor: resolverDisplayName,
        resueltoPorUserId: user.id,
        // resolveReports() ya borró estos dos campos en la base (ver
        // src/lib/store.js) — se reflejan acá también para que el estado en
        // memoria no muestre datos de contacto que ya no existen del lado
        // del servidor.
        contactoWhatsapp: "",
        contactoEmail: "",
      }));
      setReports((prev) => {
        const map = new Map(prev.map((r) => [r.id, r]));
        updatedList.forEach((u) => map.set(u.id, u));
        return Array.from(map.values());
      });
      setMatchResult((prev) => {
        if (!prev) return prev;
        const map = new Map(updatedList.map((u) => [u.id, u]));
        const source = map.get(prev.source.id) || prev.source;
        const results = prev.results.map((r) => (map.has(r.report.id) ? { ...r, report: map.get(r.report.id) } : r));
        return { ...prev, source, results };
      });
      setDetailReport((prev) => {
        if (!prev) return prev;
        const updated = updatedList.find((u) => u.id === prev.id);
        return updated || prev;
      });

      await awardPointsRemote(user.id, resolverDisplayName, PUNTOS_REENCUENTRO, "reencuentro");
      const seenBonusIds = new Set();
      for (const b of bonusFor) {
        if (!b?.userId || b.userId === user.id || seenBonusIds.has(b.userId)) continue;
        seenBonusIds.add(b.userId);
        await awardPointsRemote(b.userId, b.displayName, PUNTOS_BONO_ORIGINAL, "bono-reporte-original");
      }
      await loadLeaderboard();
      setConfirmingId(null);
      playSuccess();
      pushToast("success", `🎉 ¡Gracias ${resolverDisplayName}! +${PUNTOS_REENCUENTRO} puntos por confirmar el reencuentro.`);
    } catch (e) {
      logError(e);
      pushToast("error", "No pudimos guardar el reencuentro. Probá de nuevo.");
    }
  }

  // Eliminar la propia publicación (fila + fotos de Storage). No toca los
  // puntos ya ganados en contributors — restarlos retroactivamente abriría
  // más preguntas de las que resuelve (¿y si ya se reencontró de verdad y
  // solo borra la publicación para limpiar?).
  async function handleDeleteReport(report) {
    if (!user || report.userId !== user.id) {
      pushToast("error", "Solo quien publicó este reporte puede eliminarlo.");
      return;
    }
    try {
      const fotoUrls = (report.fotos?.length ? report.fotos : [{ url: report.foto }]).map((f) => f.url);
      await deleteReport(report.id, user.id, fotoUrls);
      setReports((prev) => prev.filter((r) => r.id !== report.id));
      setDetailReport(null);
      pushToast("success", "Publicación eliminada.");
    } catch (e) {
      logError(e);
      pushToast("error", "No pudimos eliminar la publicación. Probá de nuevo.");
    }
  }

  // Extraído de handleAddPhoto para poder reusarlo desde el share target
  // (compartir una foto hacia Felpus desde la galería/otra app) sin
  // depender de un <input type="file"> real — ver el efecto más abajo.
  async function processPhotoFile(file) {
    if (!file || form.fotos.length >= MAX_FOTOS) return;
    if (!file.type.startsWith("image/")) {
      setFormError("Ese archivo no es una imagen.");
      return;
    }
    if (file.size > MAX_FOTO_MB * 1024 * 1024) {
      setFormError(`La foto pesa demasiado — subí una de menos de ${MAX_FOTO_MB}MB.`);
      return;
    }
    const idx = form.fotos.length;
    try {
      const dataUrl = await resizeImageFile(file);
      const hist = await computeHistogram(dataUrl);
      setForm((f) => ({ ...f, fotos: [...f.fotos, { dataUrl, hist, embedding: null }] }));
      setVisionStatus("analyzing");
      const embedding = await getImageEmbedding(dataUrl);
      setForm((f) => {
        const fotos = [...f.fotos];
        if (fotos[idx]) fotos[idx] = { ...fotos[idx], embedding };
        return { ...f, fotos };
      });
      setVisionStatus(embedding ? "ai" : "basic");
    } catch (err) {
      logError(err);
      setFormError("No pudimos procesar esa imagen. Probá con otra foto.");
      setVisionStatus("idle");
    }
  }

  async function handleAddPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    await processPhotoFile(file);
  }

  async function handleActivatePush(reportId) {
    setPushSubState("loading");
    try {
      await subscribeReportPush(reportId);
      setPushSubState("active");
      pushToast("success", "🔔 Listo — te avisamos acá si aparece una coincidencia.");
    } catch (e) {
      setPushSubState("error");
      logError("No se pudo activar las notificaciones push", e);
      pushToast("error", e?.message || "No pudimos activar las notificaciones.");
    }
  }

  function handleRemovePhoto(index) {
    setForm((f) => ({ ...f, fotos: f.fotos.filter((_, i) => i !== index) }));
  }

  // Nota: este campo usaba antes google.maps.places.Autocomplete (legacy)
  // para sugerir zonas mientras se escribe. Se sacó por completo — Google
  // dejó de habilitar esa API a proyectos nuevos desde marzo 2025, y cuando
  // no está disponible, la falla de autenticación se lleva puesta toda la
  // sesión de Maps compartida (rompía el mapa de abajo apenas se tipeaba
  // acá, aunque el mapa en sí no tenía ningún problema). El campo sigue
  // funcionando 100% escribiendo a mano, con el botón "Ubicación", o
  // tocando el pin en el mapa. Si algún día se quiere retomar el
  // autocompletado, la reemplazante oficial es
  // google.maps.places.PlaceAutocompleteElement (API nueva, requiere
  // habilitar "Places API (New)" en Google Cloud y un componente propio,
  // no un simple input).

  function handleUseLocation() {
    setGeoStatus("locating");
    requestLocation(
      ({ lat, lng }) => {
        setForm((f) => ({ ...f, lat, lng }));
        setGeoStatus("done");
      },
      () => setGeoStatus("error")
    );
  }

  function handleLocateMe() {
    setLocatingMe(true);
    requestLocation(
      (loc) => {
        setMyLocation(loc);
        setSortBy("cercania");
        setLocatingMe(false);
      },
      () => {
        setLocatingMe(false);
        pushToast("error", "No pudimos acceder a tu ubicación.");
      }
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    setFieldErrors({});
    if (!nickname.trim()) {
      const msg = "Escribí tu apodo arriba — así te reconocemos por ayudar.";
      setFormError(msg);
      setFieldErrors({ apodo: msg });
      focusField("apodo-input");
      return;
    }
    if (form.fotos.length === 0) {
      const msg = "Subí al menos una foto de la mascota para poder buscar coincidencias.";
      setFormError(msg);
      setFieldErrors({ fotos: msg });
      focusField("form-fotos");
      return;
    }
    // form.descripcion salió de esta lista: ya no es algo que el usuario
    // pueda "dejar vacío" — se arma solo a partir de especie/tamaño (que
    // siempre tienen un valor por defecto) apenas monta el formulario, ver
    // el useEffect que la recompone más arriba.
    if (!form.zona.trim() || !form.color.trim()) {
      const msg = "Completá zona y color — son clave para el matching.";
      setFormError(msg);
      setFieldErrors({
        ...(!form.zona.trim() ? { zona: msg } : {}),
        ...(!form.color.trim() ? { color: msg } : {}),
      });
      focusField(!form.zona.trim() ? "form-zona" : "form-color");
      return;
    }
    if (!form.sexo) {
      const msg = "Elegí el sexo de la mascota (o \"No sé\" si no lo sabés).";
      setFormError(msg);
      setFieldErrors({ sexo: msg });
      focusField("form-sexo");
      return;
    }
    const whatsappDigits = sanitizePhoneForWhatsapp(form.contactoWhatsapp);
    if (!whatsappDigits && !form.contactoEmail.trim()) {
      const msg = "Dejá un WhatsApp o un email de contacto — así pueden avisarte si la reconocen.";
      setFormError(msg);
      setFieldErrors({ contacto: msg });
      focusField("form-contacto-whatsapp");
      return;
    }
    if (form.contactoWhatsapp.trim() && whatsappDigits.length < 8) {
      const msg = "Ese WhatsApp no parece completo — incluí el código de país y de área.";
      setFormError(msg);
      setFieldErrors({ contacto: msg });
      focusField("form-contacto-whatsapp");
      return;
    }
    if (form.contactoEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactoEmail.trim())) {
      const msg = "Revisá el email de contacto, no parece válido.";
      setFormError(msg);
      setFieldErrors({ contacto: msg });
      focusField("form-contacto-email");
      return;
    }
    if (form.color === "Otro color" && !form.colorOtro.trim()) {
      const msg = "Contanos qué color tiene, ya que elegiste \"Otro color\".";
      setFormError(msg);
      setFieldErrors({ colorOtro: msg });
      focusField("form-color-otro");
      return;
    }
    playTap();
    setSubmitting(true);
    try {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const draft = {
        id,
        tipo: reportKind,
        especie: form.especie,
        raza: form.raza.trim(),
        nombre: form.nombre.trim(),
        color: form.color.trim(),
        colorOtro: form.colorOtro.trim(),
        tamano: form.tamano,
        sexo: form.sexo,
        edad: form.edad,
        peso: form.peso,
        zona: form.zona.trim(),
        lat: form.lat,
        lng: form.lng,
        fecha: form.fecha,
        descripcion: form.descripcion.trim(),
        // "Detalles para reconocerlo" en forma estructurada (ver
        // buildDetallesEstructurados en matching.js) — además de la frase ya
        // incluida en descripcion, esto es lo que puede pesar en el
        // matching sin depender de comparar texto libre (ver
        // detallesSimilarity). Si la migración de la columna "detalles"
        // todavía no se corrió, createReport() la omite sola (ver
        // src/lib/store.js) sin que falle la publicación.
        detalles: buildDetallesEstructurados({
          accesorios: accesorioChips,
          comportamientos: reaccionChips,
          marcaDistintiva: marcaChips,
          ubicacionMarca: manchaUbicacion,
          colorMarca: manchaColor,
        }),
        contactoWhatsapp: whatsappDigits,
        contactoEmail: form.contactoEmail.trim(),
        fotos: form.fotos,
        nickname: nickname.trim(),
        userId: user?.id || null,
        resuelto: false,
        creadoEn: Date.now(),
      };

      const opposite = reportKind === "perdida" ? "encontrada" : "perdida";
      const candidates = reports.filter((r) => r.tipo === opposite && !r.resuelto);

      goToTab("resultado");
      setScanning(true);
      setMatchResult(null);
      setPushSubState("idle");

      const savedReport = await createReport(draft);
      await new Promise((r) => setTimeout(r, SUBMIT_PERCEIVED_DELAY_MS));

      const scored = findMatches(savedReport, candidates, { limit: 6 });

      setMatchResult({ source: savedReport, results: scored, hadCandidates: candidates.length > 0 });
      setReports((prev) => [savedReport, ...prev]);
      playSuccess();
      if (user) {
        await awardPointsRemote(
          user.id,
          googleDisplayName || user.email,
          reportKind === "perdida" ? PUNTOS_PERDIDA : PUNTOS_ENCONTRADA,
          "reporte"
        );
        await loadLeaderboard();
      } else {
        pushToast("success", "Reporte publicado. Iniciá sesión con Google para sumar puntos por tus aportes.");
      }
      setForm(emptyForm());
      setAccesorioChips([]);
      setReaccionChips([]);
      setMarcaChips([]);
      setManchaUbicacion("");
      setManchaColor("");
      setDetalleLibre("");
      setGeoStatus("idle");
      setVisionStatus("idle");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      logError(err);
      setFormError(describeSubmitError(err));
      goToTab("reportar");
    } finally {
      setScanning(false);
      setSubmitting(false);
    }
  }

  async function toggleCardMatches(report) {
    if (expandedCard === report.id) {
      setExpandedCard(null);
      return;
    }
    setExpandedCard(report.id);
    if (cardMatches[report.id]) return;
    const opposite = report.tipo === "perdida" ? "encontrada" : "perdida";
    const candidates = reports.filter((r) => r.id !== report.id && r.tipo === opposite && !r.resuelto);
    const scored = findMatches(report, candidates, { limit: 4 });
    setCardMatches((prev) => ({ ...prev, [report.id]: scored }));
  }

  const FECHA_LIMITES_MS = { "24h": 24 * 3600 * 1000, "7d": 7 * 24 * 3600 * 1000, "30d": 30 * 24 * 3600 * 1000 };
  const normalizedQuery = normalizeText(debouncedSearchQuery).trim();
  const hasAdvancedFilters =
    filterTamano !== "todos" || filterColor !== "todos" || filterFecha !== "todos" || filterRadioKm != null;

  // Memoizados por la misma razón que filteredReports más abajo: reports
  // solo cambia cuando de verdad llega data nueva, no en cada render.
  const activeReports = useMemo(() => reports.filter((r) => !r.resuelto), [reports]);
  const resueltas = useMemo(() => reports.filter((r) => r.resuelto), [reports]);
  const happyReunions = [...resueltas]
    .sort((a, b) => (b.resueltoEn || b.creadoEn) - (a.resueltoEn || a.creadoEn))
    .slice(0, 10);
  // Franja de actividad de la comunidad en Inicio — números reales (no
  // simulados) derivados de los reportes ya cargados, para transmitir que
  // hay gente usando la app ahora mismo sin inventar datos.
  const last24hCount = reports.filter(isRecent).length;
  // Memoizado: sin esto, esta lista se recalculaba (con una referencia de
  // array NUEVA) en cada render de todo el componente, sin importar si algo
  // relevante había cambiado. Eso hacía que ReportsMap reconstruyera todos
  // sus marcadores todo el tiempo, no solo cuando la lista filtrada
  // realmente cambiaba — carísimo, y encima expuso un crash real cuando el
  // mapa estaba en un estado roto (ver ReportsMap.jsx).
  const filteredReports = useMemo(() => {
    let list = activeReports.filter((r) => {
      if (filterTipo !== "todos" && r.tipo !== filterTipo) return false;
      if (filterEspecie !== "todos" && r.especie !== filterEspecie) return false;
      if (filterTamano !== "todos" && r.tamano !== filterTamano) return false;
      if (filterColor !== "todos" && r.color !== filterColor) return false;
      if (filterFecha !== "todos" && Date.now() - r.creadoEn > FECHA_LIMITES_MS[filterFecha]) return false;
      if (normalizedQuery) {
        const haystack = normalizeText(
          [r.zona, r.nombre, r.color, r.colorOtro, r.descripcion].filter(Boolean).join(" ")
        );
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });

    if (myLocation) {
      list = list.map((r) => ({
        ...r,
        _dist: r.lat != null && r.lng != null ? haversineKm(myLocation.lat, myLocation.lng, r.lat, r.lng) : Infinity,
      }));
    }
    if (filterRadioKm != null && myLocation) {
      list = list.filter((r) => r._dist <= filterRadioKm);
    }
    if (sortBy === "cercania" && myLocation) {
      list = [...list].sort((a, b) => a._dist - b._dist);
    } else {
      list = [...list].sort((a, b) => b.creadoEn - a.creadoEn);
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeReports,
    filterTipo,
    filterEspecie,
    filterTamano,
    filterColor,
    filterFecha,
    normalizedQuery,
    myLocation,
    filterRadioKm,
    sortBy,
  ]);

  // Cuántas tarjetas de la lista filtrada se montan de una — arranca de
  // nuevo cada vez que cambian los criterios de filtro/orden (no cuando
  // simplemente llega data nueva de un refresh, para no perder de golpe lo
  // que la persona ya scrolleó y cargó).
  const [visibleCount, setVisibleCount] = useState(REPORTS_PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(REPORTS_PAGE_SIZE);
  }, [filterTipo, filterEspecie, filterTamano, filterColor, filterFecha, filterRadioKm, normalizedQuery, sortBy]);
  const visibleReports = filteredReports.slice(0, visibleCount);

  const myTier = getTier(myRank?.points || 0, C);

  const NAV_ITEMS = [
    { id: "inicio", label: "Inicio", icon: Home },
    { id: "explorar", label: "Explorar", icon: Search },
    { id: "reportar", label: "Reportar", icon: Plus, primary: true },
    { id: "ranking", label: "Colaboradores", icon: Crown },
  ];

  return (
    <div className="min-h-screen w-full" style={{ background: C.cream, fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header — fondo claro con el rojo reservado a acentos puntuales, para
          que el beige tenga más protagonismo y el rojo destaque donde importa
          (las llamadas a la acción), no como color de fondo de la barra). En
          dark mode usa el mismo tier que el bottom nav (--felpus-dark-muted-surface),
          NO el de las cards — el header es "marco" de la app, no contenido,
          así que debe leerse como una capa distinta de las tarjetas de abajo. */}
      <header className="bg-white dark:bg-[var(--felpus-dark-muted-surface)] border-b" style={{ borderColor: C.border }}>
        <div className="max-w-2xl mx-auto px-4 pt-5 pb-4 flex items-center justify-between">
          {/* El H1 vive fuera del botón de navegación: un control con rol de
              link/botón no debería ser también el único encabezado de la
              página — quien navega por headings con lector de pantalla
              debe llegar a texto, no a "activar para ir al inicio". */}
          <h1 className="sr-only">Felpus — Buscador inteligente de mascotas perdidas y encontradas</h1>
          <button
            type="button"
            onClick={() => goToTab("inicio")}
            className="flex items-center gap-2.5 text-left min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40 rounded-lg"
          >
            <div className="min-w-0">
              {/* Se queda como <img> nativo a propósito: es un logo local
                  chico, una sola instancia por página (no se repite en
                  listas como las fotos de reportes, que son el target real
                  de next/image acá), y "w-auto" (ancho intrínseco) no
                  combina bien con el width/height fijo que pide next/image
                  sin arriesgar un layout shift si el archivo cambia. */}
              {/* Dos <img> en vez de elegir el src en JS según themeMode: ese
                  enfoque generaba un mismatch de hidratación (el server
                  siempre renderiza asumiendo tema claro, ya que no tiene
                  forma de saber la preferencia guardada del visitante) — acá
                  el src de cada <img> es siempre el mismo, y es el CSS
                  "dark:" (ligado a [data-theme], ya exento de esa advertencia
                  a nivel de <html>) el que decide cuál se ve. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO_RED} alt="Felpus" className="h-9 w-auto object-contain dark:hidden" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO_WHITE} alt="Felpus" className="hidden h-9 w-auto object-contain dark:block" />
              {/* text-[#6B5643] dark:text-[#B9ADA5] en vez de style={{color: C.muted}}:
                  igual que con el logo, un color elegido en JS según themeMode
                  no coincide entre el render del server (siempre asume tema
                  claro) y el del cliente (ya conoce el tema real), lo que
                  generaba una advertencia de hidratación acá. Con clases
                  "dark:" el color lo decide el CSS vía [data-theme], sin ese
                  riesgo. */}
              <p className="hidden sm:block text-[11px] mt-0.5 truncate text-[#6B5643] dark:text-[#B9ADA5]">
                Buscador inteligente de mascotas perdidas y encontradas
              </p>
            </div>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                playTap();
                toggleTheme();
              }}
              // aria-label/title elegidos según themeMode: el texto en sí
              // también puede diferir entre lo que renderizó el server (sin
              // forma de conocer el tema real de quien visita) y lo que
              // corrige el cliente al hidratar — a diferencia del ícono o el
              // logo, acá no hay un equivalente "CSS puro" razonable para un
              // atributo de texto, así que se avisa explícitamente a React
              // que esta discrepancia es esperada y no debe advertir por
              // ella (mismo patrón recomendado por React para valores que
              // legítimamente solo se conocen en el cliente).
              suppressHydrationWarning
              aria-label={themeMode === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
              title={themeMode === "dark" ? "Tema claro" : "Tema oscuro"}
              className="w-8 h-8 rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40 bg-[#F6EFE4] dark:bg-[#12100F]"
            >
              {/* Mismo motivo que el logo del header: dos íconos siempre
                  presentes, alternados por CSS "dark:" en vez de elegir uno
                  en JS según themeMode, para no repetir el mismatch de
                  hidratación acá también — y por eso el color de cada uno
                  (antes style={{color: C.x}}) también pasa a ser un par
                  claro/oscuro fijo en clases, no un valor calculado en JS. */}
              <Sun className="w-4 h-4 hidden dark:block text-[#E8934A]" />
              <Moon className="w-4 h-4 dark:hidden text-[#6B5643]" />
            </button>
            {user && (
              <div className="relative">
                <button
                  onClick={() => {
                    playTap();
                    setNotifOpen((v) => !v);
                  }}
                  aria-label={
                    newMatchesCount > 0
                      ? `${newMatchesCount} coincidencias nuevas desde tu última visita`
                      : "Sin coincidencias nuevas"
                  }
                  className="relative w-8 h-8 rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                  style={{ background: C.cream }}
                >
                  <Bell className="w-4 h-4" style={{ color: C.red }} />
                  {newMatchesCount > 0 && (
                    <span
                      className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                      style={{ background: C.orangeInkSolid }}
                    >
                      {newMatchesCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <>
                    <button
                      type="button"
                      aria-label="Cerrar notificaciones"
                      onClick={() => setNotifOpen(false)}
                      className="fixed inset-0 z-[65] cursor-default"
                    />
                    <div
                      className="absolute right-0 top-full mt-2 w-72 max-h-[70vh] overflow-y-auto bg-white dark:bg-[var(--felpus-dark-card)] rounded-2xl border shadow-lg z-[66] text-left"
                      style={{ borderColor: C.border }}
                    >
                      <div className="px-3.5 pt-3 pb-2 border-b" style={{ borderColor: C.border }}>
                        <p className="text-sm font-bold" style={{ color: C.text }}>Coincidencias nuevas</p>
                      </div>
                      {newMatchItems.length === 0 ? (
                        <p className="px-3.5 py-4 text-xs" style={{ color: C.muted }}>
                          Todavía no hay coincidencias nuevas para tus reportes. Te avisamos acá apenas aparezca alguna.
                        </p>
                      ) : (
                        <div className="py-1">
                          {newMatchItems.map(({ mine, best, score, extraCount }) => (
                            <button
                              key={mine.id}
                              type="button"
                              onClick={() => {
                                playTap();
                                setNotifOpen(false);
                                markMatchesSeen();
                                openReportDetail(best);
                              }}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-[#FBF7F0] dark:hover:bg-[var(--felpus-dark-hover)] focus:outline-none focus-visible:bg-[#FBF7F0] dark:focus-visible:bg-[var(--felpus-dark-hover)]"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <Image src={best.foto} alt="" width={44} height={44} loading="lazy" className="w-11 h-11 rounded-lg object-cover shrink-0 bg-[#F0E7D8] dark:bg-[var(--felpus-dark-muted-surface)]" />
                              <span className="flex-1 min-w-0">
                                <span className="block text-xs font-bold truncate" style={{ color: C.text }}>
                                  Tu {mine.tipo === "perdida" ? "reporte de perdida" : "reporte de encontrada"}
                                  {mine.nombre ? ` (${mine.nombre})` : ""}
                                </span>
                                <span className="block text-[11px] truncate" style={{ color: C.muted }}>
                                  Coincide con {best.nombre || best.especie} · {Math.round(score * 100)}%
                                  {extraCount > 0 ? ` · +${extraCount} más` : ""}
                                </span>
                              </span>
                              <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: C.muted }} />
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          playTap();
                          setNotifOpen(false);
                          goToTab("explorar");
                          markMatchesSeen();
                        }}
                        className="w-full text-center text-xs font-bold py-2.5 border-t"
                        style={{ color: C.red, borderColor: C.border }}
                      >
                        Ver todo en Explorar
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              onClick={() => goToTab("explorar")}
              className="felpus-mono text-[11px] font-bold text-white rounded-full px-3 py-1.5 whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
              style={{ background: C.redSolid }}
            >
              {activeReports.length} mascotas
            </button>
          </div>
        </div>
      </header>

      {/* Identificación del contribuyente — tarjeta propia, no un buscador:
          ícono en placa circular + micro-label arriba dejan claro que esto
          identifica a la persona, no busca nada. */}
      <div className="max-w-2xl mx-auto px-4 pt-3 space-y-2">
        <div className="flex items-center gap-2.5 bg-white dark:bg-[var(--felpus-dark-card)] rounded-xl border px-3 py-2.5 shadow-sm" style={{ borderColor: C.border }}>
          {user ? (
            <>
              {googleAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <Image src={googleAvatar} alt="" width={32} height={32} className="w-8 h-8 rounded-full shrink-0" referrerPolicy="no-referrer" />
              ) : (
                <span
                  className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: C.redSolid }}
                >
                  {(googleDisplayName || "?").charAt(0).toUpperCase()}
                </span>
              )}
              <span className="flex-1 min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>
                  Colaborador
                </span>
                <span className="block text-sm font-semibold truncate" style={{ color: C.text }}>
                  {googleDisplayName}
                </span>
              </span>
            </>
          ) : (
            <>
              <span
                className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center"
                style={{ background: C.cream }}
              >
                <PawPrint className="w-4 h-4" style={{ color: C.red }} fill="currentColor" strokeWidth={1.5} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>
                  Elegí un apodo
                </span>
                <input
                  id="apodo-input"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={40}
                  placeholder="Para sumar puntos como colaborador"
                  className="block w-full text-sm font-semibold outline-none bg-transparent min-w-0"
                  style={{ color: fieldErrors.apodo ? C.red : C.text }}
                />
                {fieldErrors.apodo && (
                  <span className="block text-[10px] font-semibold mt-0.5" style={{ color: C.red }}>{fieldErrors.apodo}</span>
                )}
              </span>
            </>
          )}
          {/* Antes la racha y los puntos eran dos píldoras casi idénticas
              (mismo tono naranja, mismo tamaño) pegadas una a la otra — se
              leían como un solo bloque en vez de dos datos distintos. Ahora
              los puntos/nivel (el dato principal) llevan la píldora sólida
              con más peso visual, y la racha queda como un indicador chico
              y discreto al lado, sin competir por atención. */}
          {!!myRank?.streak_days && (
            <span
              className="felpus-mono text-[11px] font-bold shrink-0 flex items-center gap-0.5"
              style={{ color: C.orangeInkDark }}
              title={`Racha de ${myRank.streak_days} ${myRank.streak_days === 1 ? "día" : "días"} seguidos`}
            >
              <Flame className="w-3.5 h-3.5" fill="currentColor" /> {myRank.streak_days}
            </span>
          )}
          {nickname.trim() && (
            <span
              className="felpus-mono text-[11px] font-extrabold shrink-0 px-2.5 py-1.5 rounded-full text-white shadow-sm"
              style={{ background: myTier.bg }}
            >
              {myRank?.points || 0} pts · {myTier.label}
            </span>
          )}
          {!authLoading && (
            <button
              onClick={user ? handleLogout : handleGoogleLogin}
              className="shrink-0 flex items-center gap-1 text-[11px] font-bold px-2 py-1.5 rounded-lg border"
              style={{ borderColor: C.border, color: C.muted }}
            >
              {user ? <LogOut className="w-3.5 h-3.5" /> : <LogIn className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
        {!user && (
          <p className="text-[10px] px-1" style={{ color: C.muted }}>
            Podés reportar mascotas como invitado con solo un apodo, pero para sumar puntos y confirmar
            reencuentros necesitás{" "}
            <button onClick={handleGoogleLogin} className="font-bold underline" style={{ color: C.text }}>
              iniciar sesión con Google
            </button>
            .
          </p>
        )}
      </div>

      <main className="px-4 py-4 pb-28">
        {/* INICIO */}
        {activeTab === "inicio" && (
          <div key="inicio" className="max-w-2xl mx-auto space-y-5 felpus-fadein">
            <div className="bg-white dark:bg-[var(--felpus-dark-card)] rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: C.border }}>
              <div className="p-5 text-center">
                <div
                  className="relative w-28 h-28 rounded-full overflow-hidden mx-auto mb-2 border-4"
                  style={{ borderColor: C.cream }}
                >
                  <Image
                    src={MASCOT_HERO}
                    alt="Perro esperando volver a casa"
                    fill
                    sizes="112px"
                    className="object-cover"
                    style={{ objectPosition: "50% 35%" }}
                  />
                </div>
                <h2 className="felpus-display text-xl sm:text-2xl mb-2" style={{ color: C.text }}>
                  Cada mascota merece volver a casa
                </h2>
                <p className="text-sm leading-relaxed max-w-sm mx-auto" style={{ color: C.muted }}>
                  Subí una foto y Felpus la compara automáticamente con toda la comunidad para encontrar
                  coincidencias cerca tuyo.
                </p>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => {
                      playTap();
                      setReportKind("perdida");
                      goToTab("reportar");
                    }}
                    className="felpus-cta flex-1 text-white text-sm font-bold rounded-xl py-3 transition-all duration-200 flex flex-col items-center justify-center gap-1 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--felpus-focus)]"
                    style={{ background: C.redSolid }}
                  >
                    <Heart className="w-5 h-5" fill="currentColor" />
                    Perdí a mi mascota
                  </button>
                  <button
                    onClick={() => {
                      playTap();
                      setReportKind("encontrada");
                      goToTab("reportar");
                    }}
                    // Antes ring-[#E36525] — un naranja descartado en la
                    // auditoría de contraste (ver theme.js); además no
                    // coincidía con el color real del botón (C.orangeInk).
                    className="felpus-cta flex-1 text-white text-sm font-bold rounded-xl py-3 transition-all duration-200 flex flex-col items-center justify-center gap-1 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--felpus-focus)]"
                    style={{ background: C.orangeInkSolid }}
                  >
                    <MapPin className="w-5 h-5" fill="currentColor" strokeWidth={1.5} />
                    Encontré una mascota
                  </button>
                </div>
              </div>
            </div>

            {/* Franja de actividad — le da pulso a la app con datos reales
                (nada simulado): cuántos reportes hay activos ahora, cuántos
                se publicaron en las últimas 24hs, y cuántas mascotas ya
                volvieron a casa gracias a la comunidad. */}
            <div className="grid grid-cols-3 gap-2.5">
              {[
                {
                  value: activeReports.length,
                  label: "Reportes activos",
                  color: C.red,
                  onClick: () => {
                    setFilterTipo("todos");
                    setFilterFecha("todos");
                    setExploreView("lista");
                    setShowResueltas(false);
                    goToTab("explorar");
                  },
                },
                {
                  value: last24hCount,
                  label: "Últimas 24hs",
                  color: C.orangeInk,
                  onClick: () => {
                    setFilterTipo("todos");
                    setFilterFecha("24h");
                    setExploreView("lista");
                    setShowResueltas(false);
                    goToTab("explorar");
                  },
                },
                {
                  value: resueltas.length,
                  label: "Reencontradas",
                  color: C.green,
                  onClick: () => {
                    setShowResueltas(true);
                    goToTab("explorar");
                  },
                },
              ].map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    playTap();
                    s.onClick();
                  }}
                  // El número cuenta hacia arriba con una animación (AnimatedNumber);
                  // sin aria-label estático, un lector de pantalla podía anunciar
                  // cada valor intermedio de la cuenta en vez de solo el final.
                  aria-label={`${s.value} — ${s.label}`}
                  className="felpus-card-hover bg-white dark:bg-[var(--felpus-dark-card)] rounded-xl border shadow-sm p-3 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                  style={{ borderColor: C.border }}
                >
                  <p className="felpus-mono text-xl font-bold" style={{ color: s.color }} aria-hidden="true">
                    <AnimatedNumber value={s.value} />
                  </p>
                  <p className="text-[10px] font-semibold leading-tight mt-0.5" style={{ color: C.muted }} aria-hidden="true">
                    {s.label}
                  </p>
                </button>
              ))}
            </div>

            {/* Cómo funciona — tarjetas con más aire y jerarquía visual clara,
                estilo Duolingo: ícono grande en placa de color + un solo
                renglón de texto, conectados por una flecha vertical. */}
            <div className="bg-white dark:bg-[var(--felpus-dark-card)] rounded-2xl border shadow-sm p-4" style={{ borderColor: C.border }}>
              {/* Era una sucesión de <div> sin ningún elemento semántico de
                  lista ni encabezado — para quien navega con lector de
                  pantalla sonaba a texto suelto en vez de a "3 pasos". */}
              <h2 className="sr-only">Cómo funciona Felpus</h2>
              <ol className="list-none p-0 m-0">
                {[
                  { icon: Camera, label: "Subí una foto", color: C.red },
                  { icon: Sparkles, label: "Felpus la compara automáticamente", color: C.orangeInk },
                  { icon: Heart, label: "Recibís las coincidencias", color: C.green },
                ].map((s, i, arr) => (
                  <li key={i}>
                    <div
                      className="felpus-step flex items-center gap-3.5 py-1.5 -mx-2 px-2 rounded-xl cursor-default"
                      style={{ "--step-color": s.color, "--step-tint": `${s.color}1A` }}
                    >
                      <span className="felpus-step-badge w-12 h-12 rounded-full flex items-center justify-center shrink-0">
                        <s.icon className="felpus-step-icon w-6 h-6" />
                      </span>
                      <p className="text-sm font-bold" style={{ color: C.text }}>
                        {s.label}
                      </p>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="flex justify-center py-0.5" aria-hidden="true">
                        <ChevronDown className="w-4 h-4" style={{ color: C.border }} />
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </div>

            <button
              onClick={() => goToTab("ranking")}
              className="w-full rounded-2xl p-4 text-white flex items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              // emphasisBg (no C.ink): este banner debe seguir siendo la
              // tarjeta oscura distintiva en los dos temas — con C.ink se
              // volvería blanca (texto blanco invisible) en modo oscuro.
              style={{ background: C.emphasisBg }}
            >
              {/* toastAccent, no orangeInk: orangeInk está calibrado para
                  fondos claros (da 3.16:1 acá, falla AA) — este fondo es
                  oscuro siempre, así que corresponde el mismo naranja que ya
                  se usa en los toasts sobre fondo oscuro (4.90:1). */}
              <Crown className="w-6 h-6 shrink-0" style={{ color: C.toastAccent }} />
              <div className="flex-1">
                <p className="felpus-display text-base leading-none mb-0.5">Mayores colaboradores</p>
                <p className="text-[11px] text-white/75">Puntos por reportar y por confirmar reencuentros — mirá quién ayuda más.</p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/60 shrink-0" />
            </button>

            {/* Reencuentros felices — historias reales de la comunidad (reportes
                que alguien marcó como reencontrados), no reseñas inventadas:
                no tenemos un sistema de calificaciones, así que en vez de
                simular estrellas se muestra el final feliz real de cada caso. */}
            {happyReunions.length > 0 && (
              <div>
                <h2 className="felpus-display text-lg mb-0.5" style={{ color: C.text }}>
                  Reencuentros felices
                </h2>
                <p className="text-xs mb-3" style={{ color: C.muted }}>
                  Historias reales de la comunidad — mascotas que volvieron a casa gracias a Felpus.
                </p>
                <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 snap-x snap-mandatory">
                  {happyReunions.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => openReportDetail(r)}
                      className="felpus-card-hover shrink-0 w-44 snap-start text-left rounded-2xl p-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                      style={{ background: C.brandTintBg }}
                    >
                      <div className="relative w-12 h-12 mb-2">
                        <Image src={r.foto} alt={reportPhotoAlt(r)} fill sizes="48px" loading="lazy" className="rounded-full object-cover border-2 border-white shadow-sm" />
                        <span
                          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white border-2 border-white"
                          style={{ background: C.greenSolid }}
                        >
                          <Heart className="w-2.5 h-2.5" fill="currentColor" />
                        </span>
                      </div>
                      <p className="text-sm font-bold truncate" style={{ color: C.text }}>
                        {r.nombre || (r.especie === "gato" ? "Gatito/a" : r.especie === "perro" ? "Perrito/a" : "Mascota")}
                      </p>
                      <p className="text-[11px] font-semibold mb-1.5" style={{ color: C.greenDark }}>
                        {r.resueltoEn ? `Reencontrada ${timeAgo(r.resueltoEn)}` : "Reencontrada"}
                      </p>
                      <p className="text-[11px] line-clamp-2" style={{ color: C.muted }}>
                        {r.descripcion}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* REPORTAR */}
        {activeTab === "reportar" && (
          <form key="reportar" onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-4 felpus-fadein">
            <div className="flex gap-2 bg-white dark:bg-[var(--felpus-dark-card)] p-1 rounded-xl border" style={{ borderColor: C.border }}>
              {["perdida", "encontrada"].map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setReportKind(k)}
                  className="flex-1 py-2 rounded-lg text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                  style={reportKind === k ? { background: k === "perdida" ? C.redSolid : C.orangeInkSolid, color: "#fff" } : { color: C.muted }}
                >
                  {k === "perdida" ? "Perdí una mascota" : "Encontré una mascota"}
                </button>
              ))}
            </div>

            <div
              className={`relative bg-white dark:bg-[var(--felpus-dark-card)] rounded-2xl p-3.5 border sticky top-2 z-10 shadow-sm ${justCompletedChecklist ? "felpus-checklist-pop felpus-checklist-glow" : ""}`}
              style={{ borderColor: C.border }}
            >
              {justCompletedChecklist && (
                <div className="absolute inset-0 overflow-visible pointer-events-none" aria-hidden="true">
                  {CHECKLIST_CONFETTI.map((p, i) => (
                    <span
                      key={i}
                      className="felpus-confetti absolute left-1/2 top-1/2 text-sm"
                      style={{ "--tx": `${p.tx}px`, "--ty": `${p.ty}px`, "--rot": `${p.rot}deg`, animationDelay: `${i * 0.03}s` }}
                    >
                      {p.emoji}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-bold" style={{ color: C.text }} aria-live="polite">
                  {reportProgressPct === 100 ? "¡Publicación lista para enviar!" : "Completá tu publicación"}
                </p>
                <p className="felpus-mono text-xs font-bold" style={{ color: reportProgressPct === 100 ? C.green : C.muted }}>
                  {reportProgressDone}/{reportChecklist.length}
                </p>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: C.surfaceMuted }}>
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${reportProgressPct}%`,
                    background: reportProgressPct === 100 ? C.greenSolid : reportKind === "perdida" ? C.redSolid : C.orangeInkSolid,
                  }}
                />
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {reportChecklist.map((step) => (
                  <span
                    key={step.id}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold transition-colors duration-300"
                    style={
                      step.done
                        ? { background: C.successBg, color: C.successText }
                        : { background: C.surfaceSubtle, color: C.muted }
                    }
                  >
                    {step.done ? <Check className="w-2.5 h-2.5" /> : <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />}
                    {step.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-[var(--felpus-dark-card)] rounded-2xl p-4 border space-y-4" style={{ borderColor: C.border }}>
              <div id="form-fotos" tabIndex={-1}>
                <label className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>
                  Fotos <span style={{ color: C.red }}>*</span>{" "}
                  <span className="font-normal" style={{ color: C.muted }}>
                    ({form.fotos.length}/{MAX_FOTOS})
                  </span>
                </label>
                {fieldErrors.fotos && (
                  <p className="text-[11px] mb-1.5" style={{ color: C.red }}>{fieldErrors.fotos}</p>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAddPhoto}
                  className="hidden"
                  id="foto-input"
                />
                <div className="grid grid-cols-3 gap-2">
                  {form.fotos.map((foto, i) => (
                    <div key={i} className="relative h-24 rounded-xl overflow-hidden border" style={{ borderColor: C.border }}>
                      {/* Se queda como <img> nativo a propósito: foto.dataUrl
                          es un data: URL ya redimensionado en el cliente
                          (resizeImageFile en matching.js), no una URL remota
                          — next/image no tiene nada que optimizar ahí, solo
                          agregaría overhead. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={foto.dataUrl} alt={`Foto ${i + 1} de la mascota que estás reportando`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(i)}
                        aria-label="Quitar foto"
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {form.fotos.length < MAX_FOTOS && (
                    <label
                      htmlFor="foto-input"
                      className="flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-xl h-24 cursor-pointer text-[11px] text-center transition-colors"
                      style={{ borderColor: C.border, color: C.muted }}
                    >
                      <Camera className="w-4 h-4" />
                      {form.fotos.length === 0 ? "Subir foto" : "Agregar otra"}
                    </label>
                  )}
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: C.muted }}>
                  Subí distintos ángulos o poses — ayuda a un matching más preciso.
                </p>
                {visionStatus === "analyzing" && (
                  <p className="text-[11px] mt-1.5 flex items-center gap-1.5" style={{ color: C.muted }}>
                    <Loader2 className="w-3 h-3 animate-spin" /> Analizando la foto con IA...
                  </p>
                )}
                {visionStatus === "ai" && (
                  <p className="text-[11px] mt-1.5 flex items-center gap-1.5" style={{ color: C.green }}>
                    <Check className="w-3 h-3" /> Análisis visual con IA activado
                  </p>
                )}
                {visionStatus === "basic" && (
                  <p className="text-[11px] mt-1.5" style={{ color: C.muted }}>
                    Comparación visual básica por color (IA de visión no configurada)
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="form-especie" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>Especie</label>
                  <select
                    id="form-especie"
                    value={form.especie}
                    onChange={(e) => setForm((f) => ({ ...f, especie: e.target.value }))}
                    className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)]"
                    style={{ borderColor: C.border, color: C.text }}
                  >
                    <option value="perro">Perro</option>
                    <option value="gato">Gato</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="form-tamano" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>Tamaño</label>
                  <select
                    id="form-tamano"
                    value={form.tamano}
                    onChange={(e) => setForm((f) => ({ ...f, tamano: e.target.value }))}
                    className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)]"
                    style={{ borderColor: C.border, color: C.text }}
                  >
                    <option value="chico">Chico</option>
                    <option value="mediano">Mediano</option>
                    <option value="grande">Grande</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label htmlFor="form-raza" className="text-xs font-bold block" style={{ color: C.text }}>
                    Raza (si la sabés)
                  </label>
                  {/* Atajo de un toque para "no sé" — más visible que dejar
                      el campo en blanco y esperar que se entienda solo.
                      Sobre todo importa en gatos: ahí la raza pesa poco en
                      el matching (ver structuredFieldSimilarity en
                      matching.js), así que no vale la pena que alguien
                      abandone el formulario por no saber la raza exacta. */}
                  <button
                    type="button"
                    onClick={() => {
                      playTap();
                      setForm((f) => ({ ...f, raza: f.raza === RAZA_NO_SE ? "" : RAZA_NO_SE }));
                    }}
                    aria-pressed={form.raza === RAZA_NO_SE}
                    className="shrink-0 flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                    style={form.raza === RAZA_NO_SE ? { background: C.ink, color: C.cream, borderColor: C.ink } : { color: C.text, borderColor: C.border, background: C.surface }}
                  >
                    No sé la raza
                  </button>
                </div>
                {/* Combobox propio en vez de <select>: a diferencia de color/
                    tamaño, hay cientos de razas y mezclas reales — un
                    desplegable cerrado dejaría afuera a la mayoría. Antes
                    era <input list> + <datalist> (comportamiento nativo del
                    navegador, sin JS extra) pero el soporte de <datalist> en
                    mobile es muy pobre o inexistente (sobre todo Safari en
                    iOS) — las sugerencias no aparecían al escribir. Ver
                    Combobox.jsx: mismo resultado (getRazaOptions: "Sin raza
                    / Mestizo", "No sé / Desconocida" y "Otra raza" primero,
                    después las razas de la especie en orden alfabético;
                    filtra mientras se escribe; acepta texto libre igual),
                    pero funciona en cualquier navegador. */}
                <Combobox
                  id="form-raza"
                  value={form.raza}
                  onChange={(raza) => setForm((f) => ({ ...f, raza }))}
                  options={getRazaOptions(form.especie)}
                  maxLength={60}
                  placeholder={form.especie === "otro" ? "Opcional" : "Ej: Labrador, Siamés..."}
                  className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)]"
                  style={{ borderColor: C.border, color: C.text }}
                />
                <p className="text-[11px] mt-1" style={{ color: C.muted }}>
                  {form.especie === "gato"
                    ? "En gatos la raza pesa poco en la búsqueda — \"No sé\" es una respuesta perfectamente válida, no te compliques."
                    : "Si no la sabés, dejalo en blanco o tocá \"No sé la raza\" — no es obligatorio."}
                </p>
              </div>

              <div>
                <label htmlFor="form-sexo" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>
                  Sexo <span style={{ color: C.red }}>*</span>
                </label>
                <select
                  id="form-sexo"
                  value={form.sexo}
                  onChange={(e) => setForm((f) => ({ ...f, sexo: e.target.value }))}
                  className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)]"
                  style={{ borderColor: fieldErrors.sexo ? C.red : C.border, color: C.text }}
                >
                  <option value="">Elegir sexo...</option>
                  {SEXO_OPTIONS.map((op) => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
                {fieldErrors.sexo && (
                  <p className="text-[11px] mt-1" style={{ color: C.red }}>{fieldErrors.sexo}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="form-nombre" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>Nombre (si lo sabés)</label>
                  <input
                    id="form-nombre"
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    maxLength={60}
                    placeholder="Opcional"
                    className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)]"
                    style={{ borderColor: C.border, color: C.text }}
                  />
                </div>
                <div>
                  <label htmlFor="form-color" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>
                    Color <span style={{ color: C.red }}>*</span>
                  </label>
                  <select
                    id="form-color"
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)]"
                    style={{ borderColor: fieldErrors.color ? C.red : C.border, color: C.text }}
                  >
                    <option value="">Elegir color...</option>
                    {COLOR_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {form.color === "Otro color" && (
                <div>
                  <label htmlFor="form-color-otro" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>Describí el color</label>
                  <input
                    id="form-color-otro"
                    type="text"
                    value={form.colorOtro}
                    onChange={(e) => setForm((f) => ({ ...f, colorOtro: e.target.value }))}
                    maxLength={60}
                    placeholder="Ej: tricolor, manchas naranjas..."
                    className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)]"
                    style={{ borderColor: fieldErrors.colorOtro ? C.red : C.border, color: C.text }}
                  />
                  {fieldErrors.colorOtro && (
                    <p className="text-[11px] mt-1" style={{ color: C.red }}>{fieldErrors.colorOtro}</p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="form-edad" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>Edad aproximada</label>
                  <select
                    id="form-edad"
                    value={form.edad}
                    onChange={(e) => setForm((f) => ({ ...f, edad: e.target.value }))}
                    className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)]"
                    style={{ borderColor: C.border, color: C.text }}
                  >
                    <option value="">Elegir edad...</option>
                    {EDAD_OPTIONS.map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="form-peso" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>Peso aproximado</label>
                  <select
                    id="form-peso"
                    value={form.peso}
                    onChange={(e) => setForm((f) => ({ ...f, peso: e.target.value }))}
                    className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)]"
                    style={{ borderColor: C.border, color: C.text }}
                  >
                    <option value="">Elegir peso...</option>
                    {PESO_OPTIONS.map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="form-zona" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>
                  Zona / barrio <span style={{ color: C.red }}>*</span>
                </label>
                <div className="flex gap-2">
                  <ZonaAutocomplete
                    id="form-zona"
                    value={form.zona}
                    onManualChange={(zona) => setForm((f) => ({ ...f, zona }))}
                    onSelectPlace={(zona, lat, lng) => {
                      // El widget de Google no respeta el maxLength del input
                      // (ese límite solo aplica al fallback de texto plano) —
                      // sin este recorte, una dirección larga puede superar el
                      // límite de 100 caracteres de la base y tirar abajo la
                      // publicación entera con un error genérico.
                      setForm((f) => ({
                        ...f,
                        zona: zona.slice(0, 100),
                        ...(lat != null && lng != null ? { lat, lng } : {}),
                      }));
                      if (lat != null && lng != null) setGeoStatus("done");
                    }}
                    maxLength={100}
                    placeholder="Ej: Palermo, cerca de Plaza Serrano"
                    className="felpus-input flex-1 border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)]"
                    style={{ borderColor: fieldErrors.zona ? C.red : C.border, color: C.text }}
                  />
                  <button
                    type="button"
                    onClick={handleUseLocation}
                    className="shrink-0 flex items-center gap-1.5 px-3 rounded-lg border text-xs font-semibold bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                    style={{ borderColor: C.border, color: C.text }}
                  >
                    {geoStatus === "locating" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : geoStatus === "done" ? (
                      <Check className="w-3.5 h-3.5" style={{ color: C.green }} />
                    ) : (
                      <Navigation className="w-3.5 h-3.5" />
                    )}
                    Ubicación
                  </button>
                </div>
                {fieldErrors.zona && (
                  <p className="text-[11px] mt-1" style={{ color: C.red }}>{fieldErrors.zona}</p>
                )}
                <p className="text-[11px] mt-1" style={{ color: C.muted }}>
                  Cuanto más exacta sea la dirección — escrita o marcada en el mapa — mejor va a ser el match.
                </p>
                {geoStatus === "done" && (
                  <p className="text-[11px] mt-1" style={{ color: C.green }}>Ubicación capturada — mejora mucho la precisión del match.</p>
                )}
                {geoStatus === "error" && (
                  <p className="text-[11px] mt-1" style={{ color: C.muted }}>No pudimos acceder a tu ubicación, se usará solo la zona escrita.</p>
                )}
                <div className="mt-2">
                  {showMapPicker ? (
                    <MapPicker
                      lat={form.lat}
                      lng={form.lng}
                      onChange={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowMapPicker(true)}
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2.5 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                      style={{ borderColor: C.border, color: C.muted }}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      Marcar ubicación exacta en el mapa
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="form-fecha" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>Fecha</label>
                <input
                  id="form-fecha"
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                  className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)]"
                  style={{ borderColor: C.border, color: C.text }}
                />
              </div>

              {/* "Detalles para reconocerlo": 3 preguntas cortas, casi todas
                  de un toque, más un campo de texto acotado a lo que de
                  verdad no entra en ningún chip. form.descripcion se sigue
                  armando sola en segundo plano (ver el useEffect de más
                  arriba) — nada cambió del lado de la base de datos; lo
                  nuevo es que además queda guardada de forma estructurada
                  (ver detalles en handleSubmit) para pesar en el matching. */}
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-extrabold" style={{ color: C.text }}>Detalles para reconocerlo</p>
                  <p className="text-[11px] mt-0.5" style={{ color: C.muted }}>
                    Todo es opcional, pero cuantos más datos agregues, más fácil será identificarlo.
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold mb-1.5" style={{ color: C.text }}>¿Tenía algo puesto?</p>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="¿Tenía algo puesto?">
                    {ACCESORIO_OPTIONS.map((opt) => {
                      const selected = accesorioChips.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggleAccesorioChip(opt.id)}
                          aria-pressed={selected}
                          className={CHIP_BTN_CLASS}
                          style={selected ? { background: C.ink, color: C.cream, borderColor: C.ink } : { color: C.muted, borderColor: C.border, background: C.surface }}
                        >
                          {selected && <Check className="w-3 h-3 shrink-0" />}
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold mb-1.5" style={{ color: C.text }}>¿Cómo reacciona con desconocidos?</p>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="¿Cómo reacciona con desconocidos?">
                    {REACCION_OPTIONS.map((opt) => {
                      const selected = reaccionChips.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggleReaccionChip(opt.id)}
                          aria-pressed={selected}
                          className={CHIP_BTN_CLASS}
                          style={selected ? { background: C.ink, color: C.cream, borderColor: C.ink } : { color: C.muted, borderColor: C.border, background: C.surface }}
                        >
                          {selected && <Check className="w-3 h-3 shrink-0" />}
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold mb-1" style={{ color: C.text }}>¿Tiene algo que lo haga fácil de reconocer?</p>
                  <p className="text-[11px] mb-1.5" style={{ color: C.muted }}>Elegí una opción o contanos algo particular.</p>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="¿Tiene algo que lo haga fácil de reconocer?">
                    {MARCA_OPTIONS.map((opt) => {
                      const selected = marcaChips.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggleMarcaChip(opt.id)}
                          aria-pressed={selected}
                          className={CHIP_BTN_CLASS}
                          style={selected ? { background: C.ink, color: C.cream, borderColor: C.ink } : { color: C.muted, borderColor: C.border, background: C.surface }}
                        >
                          {selected && <Check className="w-3 h-3 shrink-0" />}
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Progressive disclosure: "Mancha particular" es la única
                      marca con datos propios. El truco de grid-rows 0fr/1fr
                      anima la altura sin medir nada por JS y sin saltos
                      bruscos — a diferencia de max-height con un valor fijo,
                      no depende de adivinar cuánto mide el contenido. */}
                  <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${marcaChips.includes("mancha") ? "grid-rows-[1fr] mt-3" : "grid-rows-[0fr]"}`}>
                    <div className="overflow-hidden">
                      <div className="rounded-lg pl-3 border-l-2" style={{ borderColor: C.border }}>
                        <p className="text-[11px] font-bold mb-1.5" style={{ color: C.text }}>¿Dónde tiene la mancha?</p>
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="¿Dónde tiene la mancha?">
                          {MANCHA_UBICACION_OPTIONS.map((opt) => {
                            const selected = manchaUbicacion === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                  playTap();
                                  setManchaUbicacion((prev) => (prev === opt.id ? "" : opt.id));
                                }}
                                aria-pressed={selected}
                                className={CHIP_BTN_CLASS}
                                style={selected ? { background: C.ink, color: C.cream, borderColor: C.ink } : { color: C.muted, borderColor: C.border, background: C.surface }}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>

                        <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${manchaUbicacion ? "grid-rows-[1fr] mt-2.5" : "grid-rows-[0fr]"}`}>
                          <div className="overflow-hidden">
                            <p className="text-[11px] font-bold mb-1.5" style={{ color: C.text }}>¿De qué color? (opcional)</p>
                            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Color de la mancha">
                              {MANCHA_COLOR_OPTIONS.map((color) => {
                                const selected = manchaColor === color;
                                return (
                                  <button
                                    key={color}
                                    type="button"
                                    onClick={() => {
                                      playTap();
                                      setManchaColor((prev) => (prev === color ? "" : color));
                                    }}
                                    aria-pressed={selected}
                                    className={CHIP_BTN_CLASS}
                                    style={selected ? { background: C.ink, color: C.cream, borderColor: C.ink } : { color: C.muted, borderColor: C.border, background: C.surface }}
                                  >
                                    {color}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="form-detalle-libre" className="text-xs font-bold block" style={{ color: C.text }}>
                      ¿Querés agregar algo más? (opcional)
                    </label>
                    {typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition) && (
                      <button
                        type="button"
                        onClick={startDictation}
                        disabled={dictating}
                        aria-label={dictating ? "Escuchando..." : "Dictar por voz"}
                        className="shrink-0 flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full border disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                        style={dictating ? { background: C.redSolid, color: "#fff", borderColor: C.redSolid } : { color: C.text, borderColor: C.border, background: C.surface }}
                      >
                        {dictating ? <Square className="w-3 h-3" fill="currentColor" /> : <Mic className="w-3 h-3" />}
                        {dictating ? "Escuchando..." : "Dictar"}
                      </button>
                    )}
                  </div>
                  <textarea
                    id="form-detalle-libre"
                    value={detalleLibre}
                    onChange={(e) => setDetalleLibre(e.target.value)}
                    rows={2}
                    maxLength={400}
                    placeholder="Ej: tiene una mancha en forma de corazón en la panza..."
                    className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)] resize-none"
                    style={{ borderColor: C.border, color: C.text }}
                  />
                </div>

                {/* Vista previa — a diferencia de la versión anterior, sólo
                    aparece cuando hay algo propio que mostrar (no la base
                    automática sola), y es deliberadamente compacta: no debe
                    sentirse como "otro campo más" del formulario. */}
                <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${hasMeaningfulDetails ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="overflow-hidden">
                    <div className="rounded-lg px-3 py-2 text-[11px] border flex items-start gap-1.5" style={{ background: C.surfaceSubtle, borderColor: C.border, color: C.muted }}>
                      <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
                      <p>
                        <span className="font-bold" style={{ color: C.text }}>Vista previa: </span>
                        {form.descripcion}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label id="form-contacto-label" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>
                  Contacto <span style={{ color: C.red }}>*</span>
                </label>
                <p className="text-[11px] mb-1.5" style={{ color: C.muted }}>
                  Para que puedan avisarte si la reconocen. Completá al menos uno.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    id="form-contacto-whatsapp"
                    type="tel"
                    inputMode="tel"
                    aria-label="WhatsApp de contacto"
                    aria-describedby="form-contacto-label"
                    value={form.contactoWhatsapp}
                    onChange={(e) => setForm((f) => ({ ...f, contactoWhatsapp: e.target.value }))}
                    maxLength={25}
                    placeholder="WhatsApp: +54 9 11 1234-5678"
                    className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)]"
                    style={{ borderColor: fieldErrors.contacto ? C.red : C.border, color: C.text }}
                  />
                  <input
                    id="form-contacto-email"
                    type="email"
                    aria-label="Email de contacto"
                    aria-describedby="form-contacto-label"
                    value={form.contactoEmail}
                    onChange={(e) => setForm((f) => ({ ...f, contactoEmail: e.target.value }))}
                    maxLength={120}
                    placeholder="Email"
                    className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)]"
                    style={{ borderColor: fieldErrors.contacto ? C.red : C.border, color: C.text }}
                  />
                </div>
                {fieldErrors.contacto && (
                  <p className="text-[11px] mt-1" style={{ color: C.red }}>{fieldErrors.contacto}</p>
                )}
              </div>

              {formError && (
                <p className="text-xs rounded-lg px-3 py-2" style={{ color: C.redDark, background: C.dangerBg }}>
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full text-white font-bold text-sm rounded-xl py-3 flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: C.emphasisBg }}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Publicar y buscar coincidencias
              </button>
              <p className="text-[10px] text-center -mt-2" style={{ color: C.muted }}>
                +{reportKind === "perdida" ? PUNTOS_PERDIDA : PUNTOS_ENCONTRADA} puntos por este reporte · queda visible para todos.
              </p>
            </div>
          </form>
        )}

        {/* RESULTADO */}
        {activeTab === "resultado" && (
          <div key="resultado" className="max-w-2xl mx-auto space-y-4 felpus-fadein">
            <button onClick={() => goToTab("explorar")} className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.muted }}>
              <ArrowLeft className="w-3.5 h-3.5" /> Volver a explorar
            </button>

            {scanning && (
              <div className="bg-white dark:bg-[var(--felpus-dark-card)] rounded-2xl border p-8 flex flex-col items-center justify-center gap-3" style={{ borderColor: C.border }}>
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <span className="absolute inset-0 rounded-full felpus-ring" style={{ background: C.redRing }} />
                  <span className="absolute inset-0 rounded-full felpus-ring [animation-delay:0.5s]" style={{ background: C.redRing }} />
                  <div className="relative w-12 h-12 rounded-full bg-white dark:bg-[var(--felpus-dark-card)] border-2 flex items-center justify-center p-2" style={{ borderColor: C.red }}>
                    <Image src={PAW_MAGNIFIER} alt="" fill sizes="48px" className="object-contain" />
                  </div>
                </div>
                <p key={scanStep} className="felpus-mono text-xs felpus-fadein" style={{ color: C.muted }}>
                  {SCAN_STEPS[scanStep]}
                </p>
                <div className="w-full max-w-[220px] h-1.5 rounded-full overflow-hidden" style={{ background: C.surfaceMuted }}>
                  <div className="felpus-progress-fill h-full rounded-full" style={{ background: C.redSolid }} />
                </div>
              </div>
            )}

            {!scanning && matchResult && (
              <>
                <div className="bg-white dark:bg-[var(--felpus-dark-card)] rounded-2xl border p-4" style={{ borderColor: C.border }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Mascot mood="celebrating" size={40} />
                    <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: C.green }}>
                      <Check className="w-4 h-4" /> Reporte publicado (
                      <span className="felpus-points-pop">
                        +{matchResult.source.tipo === "perdida" ? PUNTOS_PERDIDA : PUNTOS_ENCONTRADA} pts
                      </span>
                      )
                    </p>
                  </div>
                  <ReportCard report={matchResult.source} onOpenDetail={openReportDetail} />
                  {isPushSupported() && pushSubState !== "active" && (
                    <button
                      type="button"
                      onClick={() => handleActivatePush(matchResult.source.id)}
                      disabled={pushSubState === "loading"}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold border disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                      style={{ borderColor: C.border, color: C.text }}
                    >
                      {pushSubState === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                      Avisame acá si hay una coincidencia
                    </button>
                  )}
                  {pushSubState === "active" && (
                    <p className="mt-3 text-xs font-semibold flex items-center gap-1.5 justify-center" style={{ color: C.successText }}>
                      <Check className="w-3.5 h-3.5" /> Notificaciones activadas para este reporte
                    </p>
                  )}
                </div>

                <div>
                  <h3 className="felpus-display text-lg mb-2" style={{ color: C.text }}>
                    {matchResult.results.length > 0 ? "Posibles coincidencias" : "Todavía no hay coincidencias"}
                  </h3>
                  {matchResult.results.length === 0 && (
                    <div className="text-sm bg-white dark:bg-[var(--felpus-dark-card)] rounded-2xl p-5 text-center border" style={{ color: C.muted, borderColor: C.border }}>
                      <Mascot mood="searching" size={80} className="mx-auto mb-2" />
                      <p>
                        {matchResult.hadCandidates
                          ? `Hay reportes en la zona, pero ninguno supera el ${Math.round(SCORE_MINIMO * 100)}% mínimo de similitud todavía.`
                          : `Ni bien alguien reporte una mascota ${matchResult.source.tipo === "perdida" ? "encontrada" : "perdida"} que se parezca, va a aparecer acá.`}{" "}
                        Revisá la pestaña &ldquo;Explorar&rdquo; más tarde.
                      </p>
                    </div>
                  )}
                  <div className="space-y-3">
                    {matchResult.results.map((m) => (
                      <div
                        key={m.report.id}
                        className={`bg-white dark:bg-[var(--felpus-dark-card)] rounded-2xl border p-3 ${!m.report.resuelto && m.score >= 0.7 ? "felpus-match-glow" : ""}`}
                        style={{ borderColor: m.report.resuelto ? C.successBorder : C.border, opacity: m.report.resuelto ? 0.75 : 1 }}
                      >
                        <button
                          type="button"
                          onClick={() => openReportDetail(m.report)}
                          className="w-full flex items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40 rounded-xl"
                        >
                          <MatchScoreRing score={m.score} />
                          <Image src={m.report.foto} alt={reportPhotoAlt(m.report)} width={64} height={64} loading="lazy" className="w-16 h-16 rounded-xl object-cover bg-[#F0E7D8] dark:bg-[var(--felpus-dark-muted-surface)] shrink-0" />
                          <div className="min-w-0 flex-1">
                            {m.report.resuelto ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: C.successBg, color: C.successText }}>
                                🎉 Reencontrada
                              </span>
                            ) : (
                              <Badge tipo={m.report.tipo} />
                            )}
                            <p className="text-sm font-semibold mt-1 truncate" style={{ color: C.text }}>{displayColor(m.report)} · {m.report.tamano}</p>
                            <p className="text-[11px] flex items-center gap-1" style={{ color: C.muted }}>
                              <MapPin className="w-3 h-3" /> {m.report.zona} · {m.distanceLabel}
                            </p>
                            <p className="text-[10px] font-semibold" style={{ color: scoreLabel(m.score, C).color }}>{scoreLabel(m.score, C).text}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 shrink-0" style={{ color: C.muted }} />
                        </button>
                        {!m.report.resuelto && !matchResult.source.resuelto && (
                          <div className="mt-2 pt-2 border-t" style={{ borderColor: C.border }}>
                            {confirmingId === m.report.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] flex-1" style={{ color: C.muted }}>¿Es ella/él?</span>
                                <button
                                  onClick={() =>
                                    markResolvedAndReward({
                                      repObjs: [matchResult.source, m.report],
                                      bonusFor: [
                                        { userId: matchResult.source.userId, displayName: matchResult.source.nickname },
                                        { userId: m.report.userId, displayName: m.report.nickname },
                                      ],
                                    })
                                  }
                                  className="text-[11px] font-bold text-white rounded-lg px-2.5 py-1"
                                  style={{ background: C.greenSolid }}
                                >
                                  Sí, confirmar
                                </button>
                                <button onClick={() => setConfirmingId(null)} className="text-[11px] font-semibold" style={{ color: C.muted }}>
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => handleConfirmTrigger(matchResult.source, m.report.id)} className="text-[11px] font-bold flex items-center gap-1" style={{ color: C.red }}>
                                {confirmButtonContent(matchResult.source, "¡Es ella/él! Confirmar reencuentro")}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* EXPLORAR */}
        {activeTab === "explorar" && (
          <div key="explorar" className="max-w-2xl lg:max-w-6xl mx-auto space-y-4 felpus-fadein">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.muted }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por zona, nombre, color o descripción..."
                className="felpus-input w-full border rounded-lg pl-9 pr-3 py-2 text-sm bg-white dark:bg-[var(--felpus-dark-card)]"
                style={{ borderColor: C.border, color: C.text }}
              />
            </div>

            <div className="flex gap-2">
              <select
                value={filterTipo}
                onChange={(e) => setFilterTipo(e.target.value)}
                className="felpus-input flex-1 border rounded-lg px-3 py-2 text-sm bg-white dark:bg-[var(--felpus-dark-card)]"
                style={{ borderColor: C.border, color: C.text }}
              >
                <option value="todos">Perdidas y encontradas</option>
                <option value="perdida">Solo perdidas</option>
                <option value="encontrada">Solo encontradas</option>
              </select>
              <select
                value={filterEspecie}
                onChange={(e) => setFilterEspecie(e.target.value)}
                className="felpus-input flex-1 border rounded-lg px-3 py-2 text-sm bg-white dark:bg-[var(--felpus-dark-card)]"
                style={{ borderColor: C.border, color: C.text }}
              >
                <option value="todos">Todas las especies</option>
                <option value="perro">Perros</option>
                <option value="gato">Gatos</option>
                <option value="otro">Otros</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSortBy("recientes")}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={sortBy === "recientes" ? { background: C.ink, color: C.cream, borderColor: C.ink } : { color: C.muted, borderColor: C.border, background: C.surface }}
              >
                Más recientes
              </button>
              <button
                onClick={() => (myLocation ? setSortBy("cercania") : handleLocateMe())}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={sortBy === "cercania" ? { background: C.ink, color: C.cream, borderColor: C.ink } : { color: C.muted, borderColor: C.border, background: C.surface }}
              >
                {locatingMe ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
                Más cercanas
              </button>
            </div>

            {/* En desktop (lg+) la lista y el mapa se muestran lado a lado
                (ver más abajo), así que este toggle deja de tener sentido —
                aprovecha el espacio ancho en vez de forzar a elegir una vista. */}
            <div className="flex items-center gap-2 lg:hidden">
              <button
                type="button"
                onClick={() => setExploreView("lista")}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={exploreView === "lista" ? { background: C.ink, color: C.cream, borderColor: C.ink } : { color: C.muted, borderColor: C.border, background: C.surface }}
              >
                Lista
              </button>
              <button
                type="button"
                onClick={() => setExploreView("mapa")}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={exploreView === "mapa" ? { background: C.ink, color: C.cream, borderColor: C.ink } : { color: C.muted, borderColor: C.border, background: C.surface }}
              >
                <MapPin className="w-3.5 h-3.5" /> Mapa
              </button>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(true)}
                className="flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: C.text }}
              >
                <ChevronDown className="w-3.5 h-3.5" />
                Filtros avanzados
                {hasAdvancedFilters && (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.redSolid }} />
                )}
              </button>

              <FilterSheet
                open={showAdvancedFilters}
                onClose={() => setShowAdvancedFilters(false)}
                filterTamano={filterTamano}
                setFilterTamano={setFilterTamano}
                filterColor={filterColor}
                setFilterColor={setFilterColor}
                filterFecha={filterFecha}
                setFilterFecha={setFilterFecha}
                filterRadioKm={filterRadioKm}
                setFilterRadioKm={setFilterRadioKm}
                myLocation={myLocation}
                locatingMe={locatingMe}
                handleLocateMe={handleLocateMe}
                hasAdvancedFilters={hasAdvancedFilters}
                resultCount={filteredReports.length}
              />
            </div>

            {!loadingReports && (
              <p className="text-xs" style={{ color: C.muted }}>
                {filteredReports.length} {filteredReports.length === 1 ? "reporte encontrado" : "reportes encontrados"}
              </p>
            )}

            {/* Desde lg (escritorio) la lista y el mapa se muestran siempre
                lado a lado — abajo de eso, cada columna respeta el toggle
                Lista/Mapa como antes. El mapa además solo se monta si está
                activo o si ya estamos en desktop, para no gastar llamadas a
                la API de Google en mobile cuando nunca se abre esa vista. */}
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-5 lg:items-start">
              <div className={exploreView === "lista" ? "" : "hidden lg:block"}>
                {loadingReports && (
                  <div className="space-y-3">
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                  </div>
                )}

                {!loadingReports && filteredReports.length === 0 && loadError && (
                  <div className="bg-white dark:bg-[var(--felpus-dark-card)] rounded-2xl p-6 text-center text-sm border" style={{ color: C.muted, borderColor: C.border }}>
                    <Mascot mood="searching" size={88} className="mx-auto mb-2" />
                    <p className="font-semibold" style={{ color: C.text }}>No pudimos cargar los reportes.</p>
                    <p className="mt-1">Puede ser un problema de conexión — no es que no haya publicaciones.</p>
                    <button
                      type="button"
                      onClick={loadAll}
                      className="mt-3 text-xs font-bold rounded-lg px-3 py-1.5 border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                      style={{ borderColor: C.border, color: C.text }}
                    >
                      Reintentar
                    </button>
                  </div>
                )}

                {!loadingReports && filteredReports.length === 0 && !loadError && (
                  <div className="bg-white dark:bg-[var(--felpus-dark-card)] rounded-2xl p-6 text-center text-sm border" style={{ color: C.muted, borderColor: C.border }}>
                    <Mascot mood="searching" size={88} className="mx-auto mb-2" />
                    <p className="font-semibold" style={{ color: C.text }}>Todavía no hay reportes por acá.</p>
                    <p className="mt-1">Probá con otros filtros, o sé la primera persona en publicar uno.</p>
                  </div>
                )}

            <div className="space-y-3">
              {visibleReports.map((r) => (
                <ReportCard key={r.id} report={r} onOpenDetail={openReportDetail}>
                  <button
                    onClick={() => toggleCardMatches(r)}
                    className="w-full flex items-center justify-between px-3 py-2.5 border-t text-xs font-semibold"
                    style={{ borderColor: C.border, color: C.red }}
                  >
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      {expandedCard === r.id ? "Ocultar coincidencias" : "Ver posibles coincidencias"}
                    </span>
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expandedCard === r.id ? "rotate-90" : ""}`} />
                  </button>
                  {expandedCard === r.id && (
                    <div className="px-3 pb-3 space-y-2">
                      {!cardMatches[r.id] && (
                        <p className="text-xs flex items-center gap-1.5 py-2" style={{ color: C.muted }}>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> calculando...
                        </p>
                      )}
                      {cardMatches[r.id]?.length === 0 && (
                        <p className="text-xs py-2" style={{ color: C.muted }}>
                          Sin coincidencias de al menos {Math.round(SCORE_MINIMO * 100)}% por ahora.
                        </p>
                      )}
                      {cardMatches[r.id]?.map((m) => (
                        <button
                          key={m.report.id}
                          type="button"
                          onClick={() => openReportDetail(m.report)}
                          className="w-full text-left bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)] rounded-xl p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="scale-75 -m-2">
                              <MatchScoreRing score={m.score} />
                            </div>
                            <Image src={m.report.foto} alt={reportPhotoAlt(m.report)} width={40} height={40} loading="lazy" className="w-10 h-10 rounded-lg object-cover bg-white dark:bg-[var(--felpus-dark-card)]" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold truncate" style={{ color: C.text }}>{displayColor(m.report)} · {m.report.zona}</p>
                              <p className="text-[10px]" style={{ color: C.muted }}>{m.distanceLabel}</p>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: C.muted }} />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: C.border }}>
                    {confirmingId === r.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] flex-1" style={{ color: C.muted }}>¿Confirmás el reencuentro?</span>
                        <button
                          onClick={() => markResolvedAndReward({ repObjs: [r], bonusFor: [{ userId: r.userId, displayName: r.nickname }] })}
                          className="text-[11px] font-bold text-white rounded-lg px-2.5 py-1"
                          style={{ background: C.greenSolid }}
                        >
                          Sí, ya está en casa
                        </button>
                        <button onClick={() => setConfirmingId(null)} className="text-[11px] font-semibold" style={{ color: C.muted }}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <button onClick={() => handleConfirmTrigger(r)} className="text-[11px] font-bold flex items-center gap-1" style={{ color: C.green }}>
                          {confirmButtonContent(r, "Marcar como reencontrada")}
                        </button>
                        <ShareButton
                          report={r}
                          className="text-[11px] font-bold flex items-center gap-1"
                          style={{ color: C.text }}
                        >
                          <Share2 className="w-3.5 h-3.5" /> Compartir
                        </ShareButton>
                      </div>
                    )}
                  </div>
                </ReportCard>
              ))}
            </div>
            {filteredReports.length > visibleCount && (
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + REPORTS_PAGE_SIZE)}
                className="w-full mt-3 rounded-xl py-2.5 text-sm font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                style={{ borderColor: C.border, color: C.text }}
              >
                Cargar {Math.min(REPORTS_PAGE_SIZE, filteredReports.length - visibleCount)} más
                <span className="font-normal" style={{ color: C.muted }}>
                  {" "}
                  ({filteredReports.length - visibleCount} restantes)
                </span>
              </button>
            )}
              </div>

              <div className={exploreView === "mapa" ? "" : "hidden lg:block"}>
                {!loadingReports && (exploreView === "mapa" || isDesktop) && (
                  <div className="space-y-2">
                    <ReportsMap reports={filteredReports} onSelectReport={openReportDetail} center={myLocation} />
                    {filteredReports.some((r) => r.lat == null || r.lng == null) && (
                      <p className="text-[11px]" style={{ color: C.muted }}>
                        Algunos reportes no tienen ubicación exacta marcada en el mapa y no aparecen acá — probá la
                        vista de lista para verlos todos.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {resueltas.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => setShowResueltas((v) => !v)}
                  className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-semibold"
                  style={{ background: C.successBg, color: C.successText }}
                >
                  <span className="flex items-center gap-1.5">
                    <PartyPopper className="w-4 h-4" /> Reencuentros felices ({resueltas.length})
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showResueltas ? "rotate-180" : ""}`} />
                </button>
                {showResueltas && (
                  <div className="space-y-3 mt-3">
                    {resueltas.map((r) => (
                      <ReportCard key={r.id} report={r} onOpenDetail={openReportDetail} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* RANKING */}
        {activeTab === "ranking" && (
          <div key="ranking" className="max-w-2xl mx-auto space-y-3 felpus-fadein">
            <div className="bg-white dark:bg-[var(--felpus-dark-card)] rounded-2xl p-4 border" style={{ borderColor: C.border }}>
              <h2 className="felpus-display text-xl mb-1 flex items-center gap-2" style={{ color: C.text }}>
                <Crown className="w-5 h-5" style={{ color: C.orangeInk }} /> Mayores colaboradores
              </h2>
              <p className="text-sm" style={{ color: C.muted }}>
                Puntos por reportar mascotas y, sobre todo, por confirmar reencuentros reales.
              </p>
            </div>

            {user ? (
              myRank ? (
                // En modo claro se mantiene igual que siempre (superficie
                // roja sólida). En modo oscuro NO: una card enteramente roja
                // era justo el problema que este rediseño busca resolver —
                // "gran masa roja" en vez de rojo como acento puntual. Ahora
                // es una superficie oscura elevada (mismo nivel que el resto
                // de las cards) con rojo/naranja reservados para lo que de
                // verdad importa acá: posición, puntos y progreso.
                <div
                  className="rounded-2xl p-4"
                  style={
                    themeMode === "dark"
                      ? { background: C.surface, border: `1px solid ${C.border}`, color: C.text }
                      : { background: C.redSolid, color: "#fff" }
                  }
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold shrink-0"
                      style={
                        themeMode === "dark"
                          ? { background: C.redSolid, color: "#fff" }
                          : { background: "rgba(255,255,255,0.18)" }
                      }
                    >
                      {(googleDisplayName || myRank.nickname || "?").charAt(0).toUpperCase()}
                    </span>
                    <div className="felpus-mono text-xl font-bold w-10 text-center shrink-0" style={themeMode === "dark" ? { color: C.red } : undefined}>
                      #{myRank.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold" style={themeMode === "dark" ? { color: C.muted } : { color: "rgba(255,255,255,0.8)" }}>
                        Tu posición
                      </p>
                      <p className="text-sm font-bold truncate">{getTier(myRank.points || 0, C).label}</p>
                    </div>
                    <div className="felpus-mono text-lg font-bold shrink-0" style={themeMode === "dark" ? { color: C.orangeInk } : undefined}>
                      {myRank.points || 0} pts
                    </div>
                  </div>
                  {(() => {
                    const progress = getTierProgress(myRank.points || 0);
                    const trackBg = themeMode === "dark" ? C.surfaceSubtle : "rgba(255,255,255,0.25)";
                    const fillBg = themeMode === "dark" ? C.orangeInkSolid : "#fff";
                    return (
                      <div className="mt-3">
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: trackBg }}>
                          <div
                            className="h-full rounded-full transition-[width] duration-700 ease-out"
                            style={{ width: `${progress.progressPct}%`, background: fillBg }}
                          />
                        </div>
                        <p className="text-[11px] font-semibold mt-1" style={themeMode === "dark" ? { color: C.muted } : { color: "rgba(255,255,255,0.85)" }}>
                          {progress.nextLabel
                            ? `${progress.pointsToNext} pts para ${progress.nextLabel}`
                            : "¡Nivel máximo alcanzado!"}
                        </p>
                      </div>
                    );
                  })()}
                  {!!(myRank.reencuentros || myRank.reportes) && (
                    <div
                      className="flex items-center gap-4 mt-3 pt-3 text-[13px] font-bold"
                      style={{ borderTop: `1px solid ${themeMode === "dark" ? C.border : "rgba(255,255,255,0.2)"}` }}
                    >
                      {!!myRank.reportes && (
                        <span className="flex items-center gap-1.5">
                          <Camera className="w-4 h-4" /> {myRank.reportes} {myRank.reportes === 1 ? "reporte" : "reportes"}
                        </span>
                      )}
                      {!!myRank.reencuentros && (
                        <span className="flex items-center gap-1.5">
                          <PartyPopper className="w-4 h-4" /> {myRank.reencuentros}{" "}
                          {myRank.reencuentros === 1 ? "reencuentro" : "reencuentros"}
                        </span>
                      )}
                    </div>
                  )}
                  {!!myRank.streak_days && (
                    <div
                      className="flex items-center gap-1.5 mt-3 pt-3 text-[13px] font-bold"
                      style={{ borderTop: `1px solid ${themeMode === "dark" ? C.border : "rgba(255,255,255,0.2)"}` }}
                    >
                      <Flame className="w-4 h-4" fill="currentColor" style={{ color: C.streak }} />
                      Racha de {myRank.streak_days} {myRank.streak_days === 1 ? "día" : "días"} seguidos
                    </div>
                  )}
                  {getBadges(myRank).length > 0 && (
                    <div
                      className="flex flex-wrap gap-1.5 mt-3 pt-3"
                      style={{ borderTop: `1px solid ${themeMode === "dark" ? C.border : "rgba(255,255,255,0.2)"}` }}
                    >
                      {getBadges(myRank).map((b) => (
                        <span
                          key={b.id}
                          title={b.label}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
                          style={
                            themeMode === "dark"
                              ? { background: C.surfaceSubtle, color: C.tierGoldText }
                              : { background: "rgba(255,255,255,0.15)", color: "#fff" }
                          }
                        >
                          <span>{b.icon}</span> {b.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm bg-white dark:bg-[var(--felpus-dark-card)] rounded-2xl p-4 text-center border" style={{ color: C.muted, borderColor: C.border }}>
                  Todavía no sumaste puntos — reportá una mascota o confirmá un reencuentro para aparecer en el ranking.
                </div>
              )
            ) : (
              <div className="text-sm bg-white dark:bg-[var(--felpus-dark-card)] rounded-2xl p-4 text-center border" style={{ color: C.muted, borderColor: C.border }}>
                <button onClick={handleGoogleLogin} className="font-bold underline" style={{ color: C.red }}>
                  Iniciá sesión con Google
                </button>{" "}
                para ver tu posición y tus puntos.
              </div>
            )}

            {loadingReports && leaderboard.length === 0 && (
              <div className="space-y-2">
                <SkeletonRankRow />
                <SkeletonRankRow />
                <SkeletonRankRow />
              </div>
            )}

            {!loadingReports && leaderboard.length === 0 && (
              <div className="text-sm bg-white dark:bg-[var(--felpus-dark-card)] rounded-2xl p-6 text-center border" style={{ color: C.muted, borderColor: C.border }}>
                <Mascot mood="happy" size={88} className="mx-auto mb-2" />
                <p className="font-semibold" style={{ color: C.text }}>Todavía nadie sumó puntos.</p>
                <p className="mt-1">¡Sé la primera persona de la lista!</p>
              </div>
            )}

            <div className="space-y-2">
              {leaderboard.map((u, i) => {
                const tier = getTier(u.points || 0, C);
                const isMe = !!user && u.id === user.id;
                const alreadyHearted = heartedIds.includes(u.id);
                return (
                  <div key={u.id || u.nickname + i} className="relative">
                    <div className="flex items-center gap-2.5 bg-white dark:bg-[var(--felpus-dark-card)] rounded-xl p-3 border" style={{ borderColor: isMe ? C.red : C.border }}>
                      <div className="w-5 text-center felpus-mono text-sm font-bold shrink-0" style={{ color: C.muted }}>{i + 1}</div>
                      <span
                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                        style={{ background: tier.bg }}
                      >
                        {i === 0 ? <Crown className="w-4 h-4" /> : u.nickname.charAt(0).toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: C.text }}>
                          {u.nickname} {isMe && <span style={{ color: C.red }}>(vos)</span>}
                        </p>
                        <p className="text-[11px] flex items-center flex-wrap gap-x-1.5" style={{ color: tier.text }}>
                          <span>
                            {tier.label} · {"🐾".repeat(tier.paws)}
                          </span>
                          {!!u.reencuentros && (
                            <span className="inline-flex items-center gap-0.5" style={{ color: C.greenDark }}>
                              <PartyPopper className="w-3 h-3" /> {u.reencuentros}
                            </span>
                          )}
                          {getBadges(u).length > 0 && (
                            <span>
                              {getBadges(u).map((b) => (
                                <span key={b.id} title={b.label}>{b.icon}</span>
                              ))}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <span className="felpus-mono text-base font-bold" style={{ color: C.red }}>{u.points || 0}</span>
                        <span className="text-[9px] font-semibold -mt-0.5" style={{ color: C.muted }}>pts</span>
                      </div>
                    </div>
                    {!isMe && (
                      <button
                        type="button"
                        onClick={() => handleSendHeart(u)}
                        disabled={alreadyHearted}
                        aria-label={alreadyHearted ? "Ya le mandaste un corazón" : `Mandarle un corazón a ${u.nickname}`}
                        className="absolute -top-2 -right-2 flex items-center gap-1 bg-white dark:bg-[var(--felpus-dark-card)] border rounded-full px-2 py-1 shadow-sm disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                        style={{ borderColor: C.border }}
                      >
                        <Heart
                          className={poppingHeartId === u.id ? "w-3.5 h-3.5 felpus-heart-pop" : "w-3.5 h-3.5"}
                          style={{ color: alreadyHearted ? C.red : C.muted }}
                          fill={alreadyHearted ? C.red : "none"}
                        />
                        <span className="felpus-mono text-[10px] font-bold" style={{ color: C.muted }}>
                          {u.hearts || 0}
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="bg-[#FBF7F0] dark:bg-[var(--felpus-dark-hover)] rounded-xl p-3.5 border text-[11px] space-y-1.5" style={{ borderColor: C.border, color: C.muted }}>
              <p className="font-bold text-xs mb-1" style={{ color: C.text }}>Cómo se suman puntos</p>
              <p>+{PUNTOS_PERDIDA} pts · publicar una mascota perdida</p>
              <p>+{PUNTOS_ENCONTRADA} pts · publicar una mascota encontrada</p>
              <p>+{PUNTOS_REENCUENTRO} pts · confirmar un reencuentro real</p>
              <p>+{PUNTOS_BONO_ORIGINAL} pts · bono para quien reportó originalmente esa mascota</p>
            </div>
          </div>
        )}
      </main>

      {/* Navegación inferior — más redondeada y con más peso visual propio,
          en vez del Material Design genérico de antes (esquinas superiores
          grandes, sombra flotante, íconos más grandes). */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[var(--felpus-dark-muted-surface)] rounded-t-[28px] flex items-stretch justify-around z-40 px-2"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          // La sombra flotante (pensada para separar una barra BLANCA del
          // contenido de abajo) es invisible en dark mode — oscuro sobre
          // oscuro. Ahí, un borde superior nítido cumple el mismo trabajo de
          // "separar la navegación del contenido" con mucho menos ruido que
          // intentar afinar una sombra que no se nota.
          boxShadow: themeMode === "dark" ? "none" : "0 -6px 24px -4px rgba(43, 27, 18, 0.14)",
          borderTop: themeMode === "dark" ? `1px solid ${C.border}` : "none",
        }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id || (activeTab === "resultado" && item.id === "reportar");
          if (item.primary) {
            return (
              <button
                key={item.id}
                onClick={() => {
                  playTap();
                  setReportKind("perdida");
                  goToTab("reportar");
                }}
                className="flex flex-col items-center justify-center -mt-5 focus:outline-none"
                aria-label="Reportar mascota"
              >
                <span
                  className="felpus-cta w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg border-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
                  style={{ background: C.redSolid, borderColor: C.cream }}
                >
                  <item.icon className="w-7 h-7" />
                </span>
                <span className="text-[10px] font-bold mt-1" style={{ color: isActive ? C.red : C.muted }}>
                  {item.label}
                </span>
              </button>
            );
          }
          return (
            <button
              key={item.id}
              onClick={() => {
                playTap();
                goToTab(item.id);
              }}
              className="flex flex-col items-center justify-center gap-1 py-2.5 px-3 focus:outline-none"
            >
              <span
                className="flex items-center justify-center w-11 h-8 rounded-full transition-all duration-300"
                style={{ background: isActive ? C.brandTintBg : "transparent", transform: isActive ? "scale(1)" : "scale(0.9)" }}
              >
                <item.icon className="w-6 h-6 transition-colors duration-200" style={{ color: isActive ? C.red : C.muted }} />
              </span>
              <span className="text-[10px] font-bold" style={{ color: isActive ? C.red : C.muted }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <ToastStack toasts={toasts} />

      <DetailModal
        report={detailReport}
        onClose={() => {
          setDetailReport(null);
          setConfirmingId(null);
        }}
        onResolve={() => detailReport && handleConfirmTrigger(detailReport)}
        confirming={confirmingId === detailReport?.id}
        isOwner={!!detailReport && detailReport.userId === user?.id}
        onConfirm={() =>
          markResolvedAndReward({
            repObjs: [detailReport],
            bonusFor: [{ userId: detailReport?.userId, displayName: detailReport?.nickname }],
          })
        }
        onCancelConfirm={() => setConfirmingId(null)}
        isLoggedIn={!!user}
        onDelete={handleDeleteReport}
      />

      <footer className="max-w-2xl mx-auto px-4 pb-24 pt-2 space-y-1.5">
        <p className="text-[11px] font-semibold flex items-center gap-1 justify-center" style={{ color: C.greenDark }}>
          <PartyPopper className="w-3.5 h-3.5" /> {resueltas.length} mascotas reencontradas gracias a la comunidad
        </p>
        <p className="text-[10px] flex items-center gap-1 justify-center" style={{ color: C.muted }}>
          <HelpCircle className="w-3 h-3" /> Prototipo — no reemplaza denunciar ante autoridades o refugios locales.
        </p>
      </footer>
    </div>
  );
}
