"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import SocialLinks from "./felpus/SocialLinks";
import FelpusAssistant from "./felpus/FelpusAssistant";
import ImportPostCard from "./felpus/ImportPostCard";
import SightingSheet from "./felpus/SightingSheet";
import { buildSightingDraft, PUNTOS_AVISTAMIENTO } from "../lib/sighting";
import { novedadesDue, NOVEDADES_KEY_PREFIX } from "../lib/emailAvisos";
import { findDuplicates, duplicateMessage } from "../lib/duplicates";
import { REPORT_DRAFT_KEY, serializeReportDraft, parseReportDraft } from "../lib/reportDraft";
import { importPost } from "../lib/postImportClient";
import {
  PawPrint,
  Search,
  MapPin,
  Camera,
  Navigation,
  LayoutGrid,
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
  Mic,
  Square,
  Images,
  Coffee,
  ShieldCheck,
  Eye,
  EyeOff,
  AlertTriangle,
  AlertCircle,
  Trash2,
  User,
  Bookmark,
  Pencil,
  MessageCircle,
  Download,
  Star,
} from "lucide-react";
import {
  normalizeText,
  computeHistogram,
  resizeImageFile,
  getImageEmbedding,
  findMatches,
  scoreLabel,
  matchBreakdown,
  getTier,
  getTierProgress,
  getBadges,
  BADGES,
  timeAgo,
  emptyForm,
  MAX_FOTOS,
  haversineKm,
  COLOR_OPTIONS,
  SEXO_OPTIONS,
  EDAD_OPTIONS,
  PESO_OPTIONS,
  getRazaOptions,
  RAZA_NO_SE,
  reportFlagReasonLabel,
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
  computeAdminBreakdowns,
  fechaLabel,
} from "../lib/matching";
import {
  fetchReports,
  fetchReportVectors,
  mergeReportVectors,
  fetchReportContact,
  createReport,
  resolveReports,
  deleteReport,
  fetchLeaderboard,
  fetchMyRank,
  fetchMyPointsHistory,
  fetchMyReferrals,
  registerReferral,
  awardPoints as awardPointsRemote,
  sendHeart,
  bumpStreak,
  flagReport,
  adminListAllReports,
  adminDeleteReport,
  adminSetOculto,
  adminListFlaggedReports,
  adminFetchMetrics,
  adminFetchUsers,
  fetchProfile,
  updateProfile,
  fetchMySupport,
  uploadAvatar,
  deleteAvatarFile,
  fetchSavedReportIds,
  saveReport,
  unsaveReport,
} from "../lib/store";
import { usersReportToCsv } from "../lib/csv";
import { petTitle, nombreReal } from "../lib/petTitle";
import { zonaConCiudad } from "../lib/zona";
import { ADMIN_EMAIL } from "../lib/adminEdit";
import AdminEditReport from "./felpus/AdminEditReport";
import { playTap, playSuccess } from "../lib/sound";
import { reverseGeocode } from "../lib/osmMap";
import { requestLocation, geolocationErrorMessage } from "../lib/geolocation";
import { dictationErrorMessage } from "../lib/dictation";
import {
  subscribeReportPush,
  isPushSupported,
  pushPermissionState,
  needsIosInstallForPush,
  subscribeUserPush,
  authedFetch,
  rememberReportToken,
  reportToken,
} from "../lib/push";
import AlertOptInModal from "./felpus/AlertOptInModal";
import { logError } from "../lib/log";
import { useTheme, useThemeToggle } from "./felpus/ThemeProvider";
import MapPicker from "./MapPicker";
import ReportsMap from "./ReportsMap";
import Mascot from "./Mascot";
import ZonaAutocomplete from "./ZonaAutocomplete";
import MatchScorecard from "./felpus/MatchScorecard";
import ReportGrid from "./felpus/ReportGrid";
import SupportModal from "./felpus/SupportModal";
import ContributorSheet from "./felpus/ContributorSheet";
import { InviteCard, PointsHistory } from "./felpus/PointsHistory";
import { PUNTOS_REFERIDO, REF_STORAGE_KEY, parseReferrer, referralLink, storedReferrer } from "../lib/pointsHistory";
import AdminUsers from "./felpus/AdminUsers";
import { normalizeAlias, normalizeLinkCobro } from "../lib/support";
import { checkPhotoKind } from "../lib/photoCheckClient";
import { Avatar, RankingList, RankingMeCard, RankingStatTiles } from "./felpus/Ranking";
import { PAIS_DEFAULT, PAISES, PROVINCIAS_AR, UBICACION_MAX, cleanUbicacion, cropAvatarDataUrl, formatUbicacion } from "../lib/profile";
import Combobox from "./felpus/Combobox";
import PhoneInput from "./felpus/PhoneInput";
import { splitStoredWhatsapp, getDefaultCountry, formatE164ForDisplay } from "../lib/phone";
import {
  Badge,
  EspecieIcon,
  MatchScoreRing,
  MatchBreakdownChips,
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

const LOGO_RED = "/assets/logo_full_red.webp";
// Imágenes fijas de la interfaz: se sirven tal cual (unoptimized), sin
// gastar transformaciones de Vercel (ver docs/IMAGENES.md). mascot_hero.webp
// es el mismo dibujo que mascot_hero.png, convertido una vez (62 KB -> 12 KB).
const MASCOT_HERO = "/assets/mascot_hero.webp";
const PAW_MAGNIFIER = "/assets/paw_magnifier.png";
const MAX_FOTO_MB = 15;
// Link externo de donación (Mercado Pago) — la app no procesa pagos, solo
// linkea afuera. Vive en Colaboradores, debajo del ranking: es donde ya está
// instalada la idea de "aportar a la comunidad" (puntos, corazones), y lejos
// de Inicio/Explorar/Reportar, que son el flujo real de buscar o publicar
// una mascota — ahí un pedido de plata sería mal timing.
const DONATION_URL = "https://link.mercadopago.com.ar/felpus";
// Panel de administrador — un solo dueño, sin sistema de roles (ver el
// comentario largo junto a las funciones admin_* en schema.sql). El botón y
// la pestaña de abajo se esconden por completo para cualquier otro email;
// la barrera real vive del lado del servidor (cada función admin_* vuelve a
// chequear auth.email() ahí), esto es solo para no confundir a nadie más
// mostrando un botón que de todos modos le va a fallar.
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

// Muestra el WhatsApp de perfil (guardado como E.164 en contributors.whatsapp,
// ver schema.sql) en formato lindo ("+54 9 387 588 5427") en vez del E.164
// crudo — mismo formateo que ya usa la pill de "contacto guardado" del
// formulario de Reportar (ver formatE164ForDisplay en lib/phone.js), acá
// factorizado aparte porque "Mi Felpus" lo necesita en dos lugares (la
// cabecera y la pestaña Perfil).
function ProfileWhatsappLine({ value, textClassName = "text-xs" }) {
  const C = useTheme();
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    let cancelled = false;
    formatE164ForDisplay(value).then((formatted) => {
      if (!cancelled) setDisplay(formatted);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);
  return (
    <p className={`${textClassName} truncate flex items-center gap-1`} style={{ color: C.muted }}>
      <MessageCircle className="w-3 h-3 shrink-0" /> {display}
    </p>
  );
}

// Una tarjeta de desglose del panel de admin (ver computeAdminBreakdowns en
// matching.js): título + lista de barras horizontales, cada una con
// etiqueta, cantidad y porcentaje. Mismo patrón que ProfileWhatsappLine de
// arriba — componente a nivel de módulo con su propio useTheme(), no recibe
// C por prop, para no tener que enhebrarlo desde FelpusMatcher.
function AdminBreakdownCard({ title, items }) {
  const C = useTheme();
  return (
    <div className="rounded-xl p-3.5 border" style={{ borderColor: C.border, background: C.surface }}>
      <p className="text-[12px] uppercase font-bold mb-2.5" style={{ color: C.muted }}>{title}</p>
      {items.length === 0 ? (
        <p className="text-xs" style={{ color: C.muted }}>Todavía no hay datos.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.label}>
              <div className="flex items-baseline justify-between gap-2 mb-0.5">
                <span className="text-xs font-semibold truncate" style={{ color: C.text }}>{item.label}</span>
                <span className="felpus-mono text-[12px] shrink-0" style={{ color: C.muted }}>
                  {item.count} · {item.pct}%
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.surfaceMuted }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(item.pct, item.count > 0 ? 2 : 0)}%`, background: C.orangeInkSolid }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FelpusMatcher({ initialStats = null } = {}) {
  const C = useTheme();
  const { mode: themeMode } = useThemeToggle();
  const [activeTab, setActiveTab] = useState("inicio");
  const [reportKind, setReportKind] = useState("perdida");
  const [form, setForm] = useState(emptyForm());
  const [reports, setReports] = useState([]);
  // Carga en dos pasos (2026-10-28): primero el listado liviano, sin
  // histogramas ni embeddings (Explorar y el mapa aparecen enseguida), y
  // después, en segundo plano, los vectores de las fotos. Todo lo que compara
  // fotos espera a vectoresListos o a reportesParaComparar().
  const [vectoresListos, setVectoresListos] = useState(false);
  const vectoresRef = useRef({ promise: null, rows: null });
  const reportsRef = useRef(reports);
  reportsRef.current = reports;
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
  // Modal "¿Te avisamos?" después de publicar (una vez por reporte). Nunca
  // se muestra si la persona ya bloqueó las notificaciones.
  const [alertOptIn, setAlertOptIn] = useState(null); // null | { reportId, pushToken, tipo }
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
  // Mensaje específico del último error de geolocalización (ver
  // geolocationErrorMessage en lib/geolocation.js) — antes geoStatus="error"
  // siempre mostraba el mismo texto genérico, sin distinguir el caso más
  // confuso (permiso ya bloqueado antes, sin cartel del navegador) de un
  // simple timeout.
  const [geoErrorMessage, setGeoErrorMessage] = useState("");
  // El mapa interactivo no se monta hasta que la persona lo pide — antes
  // MapPicker disparaba la carga del script de Google Maps apenas se entraba
  // al tab "Reportar", aunque terminara usando el botón "Ubicación" (GPS) o
  // escribiendo la zona a mano, que cubren la mayoría de los casos.
  const [showMapPicker, setShowMapPicker] = useState(false);
  // Última zona que se completó sola a partir de coordenadas (GPS o pin del
  // mapa) — si la persona después mueve el pin, se puede reemplazar por la
  // del lugar nuevo; lo que escribió a mano nunca se pisa.
  const zonaAutoRef = useRef("");
  // Auditoría UX mobile: el formulario mostraba ~12 campos en fila, todos
  // con el mismo peso visual, aunque el propio checklist de la app (más
  // abajo) ya sabe que solo Foto/Zona/Sexo/Color/Contacto son necesarios
  // para publicar — raza, nombre, edad, peso, fecha y "Detalles para
  // reconocerlo" son datos que ayudan pero nunca bloquean. Colapsados acá
  // detrás de un solo toque: "Foto → Ubicación → esencial → publicar" en
  // vez de scrollear 12 campos con el pulgar antes de poder publicar.
  const [showMoreDetails, setShowMoreDetails] = useState(false);
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
  // Filtros nuevos (2026-10-22): raza (texto, coincide parcial: "cani"
  // encuentra "Caniche") y sexo.
  const [filterRaza, setFilterRaza] = useState("");
  const [filterSexo, setFilterSexo] = useState("todos");
  const [filterFecha, setFilterFecha] = useState("todos");
  const [filterRadioKm, setFilterRadioKm] = useState(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [exploreView, setExploreView] = useState("lista");
  // La sección "Explorar" (y con ella el mapa, que en desktop se muestra
  // siempre lado a lado con la lista — ver más abajo) antes vivía detrás de
  // {activeTab === "explorar" && (...)}: cada vez que alguien SALÍA de esa
  // pestaña y volvía a ENTRAR, React desmontaba y volvía a montar todo el
  // bloque de cero, incluido <ReportsMap>. Cada remount de ReportsMap crea
  // una instancia NUEVA de google.maps.Map — y Google factura cada una como
  // una "carga" de mapa nueva, aunque sea la misma persona en la misma
  // visita yendo y viniendo entre pestañas. exploreVisited es un cerrojo de
  // una sola dirección (una vez true, nunca vuelve a false): la primera vez
  // que se entra a Explorar se monta el bloque, y de ahí en más solo se
  // oculta/muestra con CSS (ver className más abajo) en vez de destruirse —
  // el mapa (si se cargó) queda vivo en memoria entre visitas a la pestaña,
  // sin generar cargas facturables extra. Mobile, que nunca monta el mapa a
  // menos que la persona toque "Mapa", no se ve afectado por este cambio.
  const [exploreVisited, setExploreVisited] = useState(false);
  useEffect(() => {
    if (activeTab === "explorar") setExploreVisited(true);
  }, [activeTab]);
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
  // Último resultado de validación del PhoneInput (ver PhoneInput.jsx,
  // prop onParsed) — evita volver a parsear el número a mano en
  // handleSubmit: la fuente de verdad de "¿es válido, y cuáles son sus
  // dígitos?" vive en un solo lugar (src/lib/phone.js).
  const [whatsappParsed, setWhatsappParsed] = useState({ isValid: false, reason: null, e164: "", digits: "", country: null });
  // Contacto de WhatsApp recordado EN ESTE DISPOSITIVO (localStorage, no en
  // la cuenta): mismo dato que ya se manda a la base con cada reporte, así
  // que guardarlo acá no expone nada nuevo — solo evita volver a escribirlo
  // en la próxima publicación. whatsappUsingSaved=true muestra la pill
  // "+54 9 ... ✓ Cambiar" en vez del input vacío (ver JSX del campo).
  const [savedWhatsapp, setSavedWhatsapp] = useState(null);
  const [savedWhatsappDisplay, setSavedWhatsappDisplay] = useState("");
  const [whatsappUsingSaved, setWhatsappUsingSaved] = useState(false);
  // Fuerza el estado de error del PhoneInput en un intento de submit fallido
  // aunque la persona nunca haya salido del campo (blur) — ver "no validar
  // agresivo mientras escribe, pero sí explicar al intentar publicar".
  const [whatsappForceTouched, setWhatsappForceTouched] = useState(false);

  // Activa la pill "+54 9 ... ✓ Cambiar" a partir de un E.164 ya conocido y
  // precarga form.contactoWhatsapp/contactoWhatsappCountry con su
  // desglose — así, si más tarde se toca "Cambiar", el PhoneInput arranca
  // desde ese número en vez de un campo vacío. Un solo lugar para las dos
  // veces que hace falta esto: al montar (contacto guardado de una
  // publicación anterior) y apenas se publica un reporte con éxito (para
  // que, si se publica un segundo reporte en la misma sesión, ya aparezca
  // recordado también).
  const applySavedWhatsapp = useCallback((e164) => {
    setSavedWhatsapp(e164);
    setWhatsappUsingSaved(true);
    splitStoredWhatsapp(e164).then(({ country, national }) => {
      setForm((f) => ({
        ...f,
        contactoWhatsapp: national || f.contactoWhatsapp,
        contactoWhatsappCountry: country || f.contactoWhatsappCountry,
      }));
    });
    formatE164ForDisplay(e164).then(setSavedWhatsappDisplay);
  }, []);

  // Al montar: si hay un WhatsApp guardado de una publicación anterior en
  // este dispositivo, precarga el campo (colapsado en la pill) en vez de
  // arrancar de un input vacío. Si no hay nada guardado, solo ajusta el
  // país por defecto según el navegador (ver getDefaultCountry en
  // phone.js) — en un efecto, no en el useState inicial, porque navigator
  // no existe en el primer render del servidor.
  useEffect(() => {
    let saved = "";
    try {
      saved = localStorage.getItem("felpus_saved_whatsapp") || "";
    } catch {
      // localStorage no disponible — sigue sin contacto guardado, no bloquea
    }
    if (saved) applySavedWhatsapp(saved);
    else setForm((f) => ({ ...f, contactoWhatsappCountry: getDefaultCountry() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // El formulario se completó desde una captura (ImportPostCard): se marcan
  // en naranja los datos obligatorios que el aviso no traía, hasta que la
  // persona los complete. Aparte de fieldErrors, que se borra con cada cambio.
  const [fromCapture, setFromCapture] = useState(false);
  // Candado contra el doble clic en Publicar: el estado (submitting) recién
  // deshabilita el botón en el próximo render; el ref corta en el acto.
  const submittingRef = useRef(false);
  // Hoja "Lo vi suelto" abierta: { vistaDe: reporte de perdida | null }.
  const [sighting, setSighting] = useState(null);
  // Sugerencias de la IA a partir de la primera foto (especie, color, tamaño,
  // raza). Solo completan lo que la persona no eligió a mano (tocadosRef) y
  // se marcan como sugeridas hasta que las cambie.
  const tocadosRef = useRef(new Set());
  const sugerenciaPedidaRef = useRef(false);
  const [aiSugeridos, setAiSugeridos] = useState([]);
  // Aviso de posible duplicado que la persona descartó ("No es la misma").
  const [dupDescartado, setDupDescartado] = useState(null);
  // Se recuperó un borrador guardado en este dispositivo (ver reportDraft.js).
  const [borradorRecuperado, setBorradorRecuperado] = useState(false);

  function focusField(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }
  const [visionStatus, setVisionStatus] = useState("idle"); // idle | analyzing | ai | basic
  const [nickname, setNickname] = useState("");
  const [leaderboard, setLeaderboard] = useState([]);
  // Colaborador al que se está por apoyar (ventana SupportModal).
  const [supportTarget, setSupportTarget] = useState(null); // { u, prefetched }
  // Ficha del colaborador tocado en el ranking ({ u, rank }).
  const [profileTarget, setProfileTarget] = useState(null);
  // Mis datos de apoyo (alias + acepto), y el borrador al editar el perfil.
  const [mySupport, setMySupport] = useState(null);
  const [supportDraft, setSupportDraft] = useState(null);
  const [myRank, setMyRank] = useState(null);
  // Historial de huellitas y referidos (sección Colaboradores). null =
  // todavía no cargó o la migración 20261027_02 no se corrió.
  const [pointsHistory, setPointsHistory] = useState(null);
  const [myReferrals, setMyReferrals] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  // Auditoría integral (2026-08-09): el botón "Sí, confirmar"/"Sí, ya está
  // en casa" no se deshabilitaba mientras la confirmación estaba en
  // vuelo — un doble-tap (común en mobile con conexión lenta, justo el
  // escenario de alguien angustiado tocando la pantalla) podía disparar
  // markResolvedAndReward() dos veces antes de que confirmingId pasara a
  // null. El otorgamiento de puntos duplicado ya quedó cerrado del lado
  // del servidor (award_points es idempotente por evento, ver schema.sql),
  // pero el botón igual debería reflejar "ya estoy procesando esto" —
  // evita además una segunda escritura innecesaria a resolveReports.
  const [resolvingId, setResolvingId] = useState(null);
  // "Comparar fotos" en una tarjeta de coincidencia — mismo patrón que
  // confirmingId (un solo id "abierto" por vez, alcanza para una lista).
  const [comparingId, setComparingId] = useState(null);
  const [showResueltas, setShowResueltas] = useState(false);
  const { toasts, pushToast } = useToasts();
  const [detailReport, setDetailReport] = useState(null);
  // Hallazgo real de UX: el contacto (WhatsApp/email) se pide aparte, de
  // forma asíncrona, recién al abrir el detalle (ver openReportDetail) —
  // por privacidad, ya no viene en el listado general (ver PENDIENTE_DECISION.md).
  // Sin este estado, mientras esa espera está en curso (o si falla: rate
  // limit de 30/hora por IP, red lenta, etc.) la sección "Contactar" del
  // modal simplemente no aparecía — nada, ni carga ni error — dejando a
  // quien mira el reporte sin ninguna forma visible de comunicarse ni de
  // entender por qué. Ahora el modal distingue "cargando" / "no se pudo,
  // reintentar" / "listo" en vez de solo "aparece o no aparece".
  const [contactStatus, setContactStatus] = useState("idle"); // idle | loading | ready | error
  const [sortBy, setSortBy] = useState("recientes");
  const [myLocation, setMyLocation] = useState(null);
  const [locatingMe, setLocatingMe] = useState(false);
  const { user, authLoading, googleDisplayName, googleAvatar, signInWithGoogle, signOut } = useAuth(pushToast);
  const fileInputRef = useRef(null);
  const deepLinkHandled = useRef(false);
  // Asistente Felpus (FelpusAssistant.jsx): chatOriginRef marca que el
  // formulario actual se completó desde el chat (para medir si esos reportes
  // se terminan publicando y para que el chat descarte su borrador cuando
  // pasa); chatPublishedToken/chatOpenToken son señales hacia el chat.
  const chatOriginRef = useRef(null);
  const [chatPublishedToken, setChatPublishedToken] = useState(0);
  const [chatOpenToken, setChatOpenToken] = useState(0);
  const isAdmin = user?.email === ADMIN_EMAIL;

  // "Mi Felpus" — perfil personal + mascotas guardadas. Igual que el panel
  // de admin, estado propio en vez de mezclarlo con `reports`/`user`: solo
  // le importa a quien está logueado y mirando esta pantalla puntual.
  const [savedReportIds, setSavedReportIds] = useState(() => new Set());
  const [savedBusyId, setSavedBusyId] = useState(null);
  const [mifelpusSection, setMifelpusSection] = useState("reportes"); // "reportes" | "guardadas" | "perfil"
  const [mifelpusFilter, setMifelpusFilter] = useState("todas"); // "todas" | "perdida" | "encontrada" | "resuelto"
  const [myReportsDeleteConfirmId, setMyReportsDeleteConfirmId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  // Foto y ubicación del perfil (2026-10-22). avatarDraft: data URL recién
  // elegida (todavía sin subir); avatarRemoved: tocó "Quitar foto".
  const [avatarDraft, setAvatarDraft] = useState(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [paisDraft, setPaisDraft] = useState(PAIS_DEFAULT);
  const [provinciaDraft, setProvinciaDraft] = useState("");
  const [ciudadDraft, setCiudadDraft] = useState("");
  const avatarInputRef = useRef(null);
  // La foto propia: la del perfil si subió una; si no, la de Google.
  const myAvatarUrl = profile?.avatar_url || myRank?.avatar_url || googleAvatar || null;
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profilePhoneCountry, setProfilePhoneCountry] = useState("AR");
  const [profilePhoneText, setProfilePhoneText] = useState("");
  const [profilePhoneParsed, setProfilePhoneParsed] = useState({ isValid: false, reason: null, e164: "", digits: "" });
  const [profileSaving, setProfileSaving] = useState(false);

  // Mascotas guardadas: se cargan apenas hay sesión (no solo al entrar a
  // "Mi Felpus") — así el marcador de "guardado" ya sale bien tildado la
  // primera vez que alguien ve una tarjeta en Explorar, sin depender de
  // haber visitado Mi Felpus antes en esa sesión.
  useEffect(() => {
    if (!user) {
      setSavedReportIds(new Set());
      return;
    }
    let cancelled = false;
    fetchSavedReportIds(user.id)
      .then((ids) => {
        if (!cancelled) setSavedReportIds(new Set(ids));
      })
      .catch((e) => logError("No se pudieron cargar las mascotas guardadas", e));
    return () => {
      cancelled = true;
    };
  }, [user]);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    setProfileLoading(true);
    setProfileError("");
    try {
      setProfile(await fetchProfile(user.id));
    } catch (e) {
      logError("No se pudo cargar el perfil", e);
      setProfileError(e?.message || "No se pudo cargar tu perfil.");
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (activeTab === "mifelpus" && user) loadProfile();
  }, [activeTab, user, loadProfile]);

  // Optimista (togglea antes de que responda la base) con reversión si
  // falla — el mismo criterio que ya usa heartedIds/toggleHeart más abajo
  // para "Colaboradores": la reacción tiene que sentirse instantánea, no
  // esperar un viaje de red para ver el marcador cambiar.
  async function handleToggleSaved(report) {
    if (!user) {
      pushToast("error", "Iniciá sesión con Google para guardar mascotas.");
      return;
    }
    const wasSaved = savedReportIds.has(report.id);
    setSavedBusyId(report.id);
    setSavedReportIds((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(report.id);
      else next.add(report.id);
      return next;
    });
    try {
      if (wasSaved) await unsaveReport(user.id, report.id);
      else await saveReport(user.id, report.id);
    } catch (e) {
      setSavedReportIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.add(report.id);
        else next.delete(report.id);
        return next;
      });
      logError("No se pudo actualizar mascotas guardadas", e);
      pushToast("error", e?.message || "No se pudo actualizar guardados. Probá de nuevo.");
    } finally {
      setSavedBusyId(null);
    }
  }

  function openEditProfile() {
    setProfileNameDraft(profile?.nickname || googleDisplayName || "");
    // Apoyos: el alias no viene con el perfil (no es legible por SELECT).
    setSupportDraft(null);
    fetchMySupport()
      .then((sup) => {
        setMySupport(sup);
        setSupportDraft(sup ? { acepta: sup.acepta, alias: sup.alias, link: sup.link } : null);
      })
      .catch((e) => logError("No se pudieron leer los datos de apoyo", e));
    setProfilePhoneText("");
    setProfilePhoneParsed({ isValid: false, reason: null, e164: "", digits: "" });
    if (profile?.whatsapp) {
      splitStoredWhatsapp(profile.whatsapp).then(({ country, national }) => {
        setProfilePhoneCountry(country || "AR");
        setProfilePhoneText(national || "");
      });
    } else {
      setProfilePhoneCountry(getDefaultCountry());
    }
    setAvatarDraft(null);
    setAvatarRemoved(false);
    setPaisDraft(profile?.pais || PAIS_DEFAULT);
    setProvinciaDraft(profile?.provincia || "");
    setCiudadDraft(profile?.ciudad || "");
    setEditingProfile(true);
  }

  async function handlePickAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setAvatarDraft(await cropAvatarDataUrl(file));
      setAvatarRemoved(false);
    } catch (err) {
      pushToast("error", err?.message || "No pudimos leer esa imagen. Probá con otra.");
    }
  }

  async function handleSaveProfile() {
    const name = profileNameDraft.trim();
    if (!name) {
      pushToast("error", "Poné un nombre — es lo que ve el resto de la comunidad.");
      return;
    }
    // Mismo criterio que el WhatsApp del formulario de Reportar: si hay
    // texto pero no resultó válido, no se guarda a medias — se le pide
    // corregirlo o borrarlo. Vacío es perfectamente válido (el WhatsApp de
    // perfil es opcional).
    if (profilePhoneText.trim() && !profilePhoneParsed.isValid) {
      pushToast("error", "Revisá el WhatsApp del perfil — no logramos interpretarlo bien.");
      return;
    }
    setProfileSaving(true);
    try {
      const whatsapp = profilePhoneParsed.isValid ? profilePhoneParsed.digits && `+${profilePhoneParsed.digits}` : profile?.whatsapp || "";
      // Solo se mandan foto/ubicación si cambiaron: así guardar nombre o
      // WhatsApp sigue andando aunque la migración de esas columnas todavía
      // no se haya corrido.
      const extra = {};
      const prevAvatar = profile?.avatar_url || null;
      if (avatarDraft) extra.avatar_url = await uploadAvatar(avatarDraft, user.id);
      else if (avatarRemoved && prevAvatar) extra.avatar_url = null;
      const ubicacion = cleanUbicacion({ pais: paisDraft, provincia: provinciaDraft, ciudad: ciudadDraft });
      for (const key of ["pais", "provincia", "ciudad"]) {
        if ((profile?.[key] || null) !== ubicacion[key]) extra[key] = ubicacion[key];
      }
      // El WhatsApp va solo si cambió: si no se pudo leer el guardado (ver
      // fetchMyWhatsapp), cambiar el nombre o la foto no lo borra.
      if ((whatsapp || null) !== (profile?.whatsapp || null)) extra.whatsapp = whatsapp || "";
      // Apoyos: solo si cambió algo (y si la migración ya está: supportDraft
      // queda en null si get_my_support no existe).
      if (supportDraft) {
        const alias = normalizeAlias(supportDraft.alias);
        if (!alias.ok) throw new Error(alias.error);
        const link = normalizeLinkCobro(supportDraft.link);
        if (!link.ok) throw new Error(link.error);
        if (supportDraft.acepta && !alias.alias && !link.link) throw new Error("Para aceptar apoyos, cargá tu alias o un link de cobro.");
        if ((alias.alias || "") !== (mySupport?.alias || "")) extra.alias_pago = alias.alias;
        if ((link.link || "") !== (mySupport?.link || "")) extra.link_cobro = link.link;
        if (supportDraft.acepta !== !!mySupport?.acepta) extra.acepta_apoyos = supportDraft.acepta;
      }
      await updateProfile(user.id, { nickname: name, ...extra });
      if ("alias_pago" in extra || "acepta_apoyos" in extra || "link_cobro" in extra) {
        setMySupport({
          alias: "alias_pago" in extra ? extra.alias_pago || "" : mySupport?.alias || "",
          acepta: "acepta_apoyos" in extra ? extra.acepta_apoyos : !!mySupport?.acepta,
          link: "link_cobro" in extra ? extra.link_cobro || "" : mySupport?.link || "",
        });
      }
      if ("avatar_url" in extra && prevAvatar) deleteAvatarFile(prevAvatar);
      const { alias_pago: _aliasPerfil, link_cobro: _linkPerfil, ...extraPerfil } = extra;
      setProfile((prev) => ({ ...(prev || { id: user.id }), ...extraPerfil, nickname: name, whatsapp: whatsapp || null }));
      if ("avatar_url" in extra) setMyRank((prev) => (prev ? { ...prev, avatar_url: extra.avatar_url } : prev));
      if ("acepta_apoyos" in extra) setMyRank((prev) => (prev ? { ...prev, acepta_apoyos: extra.acepta_apoyos } : prev));
      // Al ranking solo los datos públicos (nunca el WhatsApp, el alias ni el link).
      const { whatsapp: _privado, alias_pago: _alias, link_cobro: _link, ...publico } = extra;
      setLeaderboard((prev) => prev.map((u) => (u.id === user.id ? { ...u, nickname: name, ...publico } : u)));
      setNickname(name);
      setEditingProfile(false);
      pushToast("success", "Perfil actualizado.");
    } catch (e) {
      logError("No se pudo guardar el perfil", e);
      pushToast("error", e?.message || "No se pudo guardar el perfil. Probá de nuevo.");
    } finally {
      setProfileSaving(false);
    }
  }

  const myReports = useMemo(() => (user ? reports.filter((r) => r.userId === user.id) : []), [reports, user]);
  const myReportsFiltered = useMemo(() => {
    if (mifelpusFilter === "resuelto") return myReports.filter((r) => r.resuelto);
    if (mifelpusFilter === "todas") return myReports;
    return myReports.filter((r) => r.tipo === mifelpusFilter && !r.resuelto);
  }, [myReports, mifelpusFilter]);
  const savedReportsList = useMemo(
    () => reports.filter((r) => savedReportIds.has(r.id)).sort((a, b) => b.creadoEn - a.creadoEn),
    [reports, savedReportIds]
  );

  // Panel de administrador — estado propio, separado del resto de la app a
  // propósito: solo lo toca una persona, así que no vale la pena acoplarlo a
  // `reports`/`loadingReports` (que sí necesitan servir a todo el mundo).
  // "metricas" | "denuncias" | "reportes"
  const [adminSection, setAdminSection] = useState("metricas");
  const [adminMetrics, setAdminMetrics] = useState(null);
  const [adminFlags, setAdminFlags] = useState([]);
  const [adminAllReports, setAdminAllReports] = useState([]);
  const [adminSearch, setAdminSearch] = useState("");
  // Solo los reportes con alguna foto marcada como flyer/captura al publicar.
  const [adminSoloFotosDudosas, setAdminSoloFotosDudosas] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminBusyId, setAdminBusyId] = useState(null);
  // Publicación que el admin está editando (datos y orden de fotos).
  const [adminEditing, setAdminEditing] = useState(null);
  const [adminDeleteConfirmId, setAdminDeleteConfirmId] = useState(null);
  const [usersReportLoading, setUsersReportLoading] = useState(false);

  // Auditoría integral (2026-08-09): antes recargaba TODO (métricas +
  // denuncias + el listado completo de reportes, con embeddings incluidos
  // — ver el hallazgo de performance sobre fetchReports) cada vez que
  // activeTab volvía a "admin", aunque hubiera sido hacía 10 segundos. Este
  // ref evita repetir la carga si ya se hizo hace poco — force=true (el
  // botón "Actualizar" de la UI) la salta a propósito.
  const adminLastLoadedAtRef = useRef(0);
  const ADMIN_DATA_STALE_MS = 30_000;
  const loadAdminData = useCallback(
    async (force = false) => {
      if (!isAdmin) return;
      if (!force && Date.now() - adminLastLoadedAtRef.current < ADMIN_DATA_STALE_MS) return;
      setAdminLoading(true);
      setAdminError("");
      try {
        const [metrics, flags, allReports] = await Promise.all([
          adminFetchMetrics(),
          adminListFlaggedReports(),
          adminListAllReports(),
        ]);
        setAdminMetrics(metrics);
        setAdminFlags(flags);
        setAdminAllReports(allReports);
        adminLastLoadedAtRef.current = Date.now();
      } catch (e) {
        logError("No se pudo cargar el panel de administrador", e);
        setAdminError(e?.message || "No se pudo cargar el panel de administrador.");
      } finally {
        setAdminLoading(false);
      }
    },
    [isAdmin]
  );

  useEffect(() => {
    if (activeTab === "admin" && isAdmin) loadAdminData();
  }, [activeTab, isAdmin, loadAdminData]);

  // adminListFlaggedReports() devuelve una forma recortada (reportId,
  // fotoUrl, nombre... lo justo para la fila de denuncias) — no alcanza
  // para abrir el DetailModal completo (le faltan descripcion, fotos[],
  // contacto, etc.). adminAllReports en cambio SÍ trae el reporte
  // completo (misma forma que usa toda la app) y siempre se carga en
  // paralelo con las denuncias (ver loadAdminData) — se busca ahí por id.
  function openAdminFlaggedReportDetail(flaggedReportId) {
    const full = adminAllReports.find((r) => r.id === flaggedReportId);
    if (full) openReportDetail(full);
  }

  // Elimina de verdad (foto de Storage + fila) — no hay deshacer, por eso
  // pasa por adminDeleteConfirmId en vez de borrar directo al primer click.
  async function handleAdminDelete(report) {
    setAdminBusyId(report.id);
    try {
      await adminDeleteReport(report);
      setAdminAllReports((prev) => prev.filter((r) => r.id !== report.id));
      setAdminFlags((prev) => prev.filter((f) => f.reportId !== report.id));
      setAdminDeleteConfirmId(null);
      pushToast("success", "Publicación eliminada.");
    } catch (e) {
      logError("No se pudo eliminar la publicación (admin)", e);
      pushToast("error", e?.message || "No se pudo eliminar la publicación.");
    } finally {
      setAdminBusyId(null);
    }
  }

  // Ocultar/mostrar es reversible (a diferencia de eliminar), así que no
  // pide confirmación — sirve tanto para esconder algo a mano como para
  // revertir un auto-ocultamiento por denuncias infundadas.
  async function handleAdminToggleOculto(report) {
    const nextOculto = !report.oculto;
    setAdminBusyId(report.id);
    try {
      await adminSetOculto(report.id, nextOculto);
      setAdminAllReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, oculto: nextOculto } : r)));
      setAdminFlags((prev) => prev.map((f) => (f.reportId === report.id ? { ...f, oculto: nextOculto } : f)));
      pushToast("success", nextOculto ? "Publicación ocultada." : "Publicación visible de nuevo.");
    } catch (e) {
      logError("No se pudo cambiar la visibilidad de la publicación (admin)", e);
      pushToast("error", e?.message || "No se pudo cambiar la visibilidad.");
    } finally {
      setAdminBusyId(null);
    }
  }

  // Genera el CSV en el cliente (usersReportToCsv, ver csv.js) a partir de
  // lo que trae adminFetchUsers() y lo descarga como archivo — no hace
  // falta una ruta /api aparte: admin_list_users ya está protegida del
  // lado del servidor (chequea auth.email() adentro, ver schema.sql), así
  // que el cliente autenticado del propio admin alcanza. El BOM ("﻿")
  // es para que Excel abra los acentos bien en vez de mostrarlos rotos.
  async function handleDownloadUsersReport() {
    setUsersReportLoading(true);
    try {
      const users = await adminFetchUsers();
      const csv = usersReportToCsv(users);
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `felpus-usuarios-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      pushToast("success", `Informe descargado (${users.length} usuario${users.length === 1 ? "" : "s"}).`);
    } catch (e) {
      logError("No se pudo descargar el informe de usuarios (admin)", e);
      pushToast("error", e?.message || "No se pudo descargar el informe de usuarios.");
    } finally {
      setUsersReportLoading(false);
    }
  }

  // Desgloses de la pestaña "Métricas" (especie/tamaño/sexo/edad/
  // provincia/ciudad/raza por tipo) — se calculan 100% en el cliente a
  // partir de adminAllReports, que ya se trae completo para "Reportes"
  // (ver loadAdminData): no hace falta ningún viaje de red extra ni
  // función SQL nueva (ver computeAdminBreakdowns en matching.js).
  const adminBreakdowns = useMemo(() => computeAdminBreakdowns(adminAllReports), [adminAllReports]);

  const adminSearchNormalized = normalizeText(adminSearch.trim());
  const tieneFotoDudosa = (r) => (r.fotos || []).some((f) => f.dudosa);
  const adminFotosDudosasCount = adminAllReports.filter(tieneFotoDudosa).length;
  const adminFilteredReports = adminAllReports.filter(
    (r) =>
      (!adminSoloFotosDudosas || tieneFotoDudosa(r)) &&
      (!adminSearchNormalized ||
        [r.nombre, r.zona, r.ciudad, r.provincia, r.especie, r.color, r.nickname].some((v) =>
          normalizeText(v || "").includes(adminSearchNormalized)
        ))
  );

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

  // Link de invitación (?invita=<id>): se guarda en el dispositivo al
  // entrar, porque el login con Google sale del sitio y vuelve sin el
  // parámetro. Apenas hay sesión se le avisa a la base, que decide si
  // cuenta (solo cuentas nuevas, ver register_referral). El premio para
  // quien invitó lo da la base cuando esta persona publica su primer reporte.
  useEffect(() => {
    const ref = parseReferrer(window.location.search);
    if (!ref) return;
    try {
      localStorage.setItem(REF_STORAGE_KEY, JSON.stringify({ id: ref, at: Date.now() }));
    } catch {
      // Sin almacenamiento (modo privado): el referido no se registra.
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let ref = null;
    try {
      ref = storedReferrer(localStorage.getItem(REF_STORAGE_KEY));
    } catch {
      return;
    }
    if (!ref) return;
    registerReferral(ref)
      .then((res) => {
        try {
          localStorage.removeItem(REF_STORAGE_KEY);
        } catch {
          // no es bloqueante
        }
        if (res === "ok") pushToast("success", "¡Te damos la bienvenida a Felpus! Publicá tu primer reporte y le sumás huellitas a quien te invitó. 🐾");
      })
      .catch((e) => logError("No se pudo registrar la invitación", e));
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
    // resuelto: la base ya borró el contacto al confirmar el reencuentro
    // (ver resolveReports en store.js) — no hay nada que pedir, y no es un
    // error: "idle" hace que el modal no muestre ni carga ni "no se pudo".
    if (!report || report.resuelto) {
      setContactStatus("idle");
      return;
    }
    setContactStatus("loading");
    try {
      const contact = await fetchReportContact(report.id);
      setDetailReport((prev) => (prev?.id === report.id ? { ...prev, ...contact } : prev));
      setContactStatus("ready");
    } catch (e) {
      logError("No se pudo cargar el contacto del reporte", e);
      setContactStatus("error");
    }
  }

  // Reintentar sin cerrar y reabrir el modal — para el botón "Reintentar"
  // del estado de error (ver DetailModal). No usa openReportDetail directo
  // porque ese vuelve a pisar detailReport con el objeto "report" que le
  // pasan (perdería cualquier otro dato ya mergeado); acá solo se repite el
  // pedido de contacto para el reporte que ya está abierto.
  async function retryFetchContact() {
    if (!detailReport || detailReport.resuelto) return;
    setContactStatus("loading");
    try {
      const contact = await fetchReportContact(detailReport.id);
      setDetailReport((prev) => (prev?.id === detailReport.id ? { ...prev, ...contact } : prev));
      setContactStatus("ready");
    } catch (e) {
      logError("No se pudo cargar el contacto del reporte", e);
      setContactStatus("error");
    }
  }

  // Denunciar — se pasa tal cual a DetailModal (ver onFlagReport), que ya
  // maneja sus propios estados de carga/éxito/error en el botón mismo; acá
  // solo hace falta el pushToast como refuerzo (por si el modal se cierra
  // antes de que la persona llegue a leer el mensaje inline) y no volver a
  // tragarse el error: DetailModal lo necesita para mostrar "Reintentar".
  async function handleFlagReport(report, reasonId) {
    try {
      await flagReport(report.id, reasonId);
      pushToast("success", "Gracias por avisar — vamos a revisar esta publicación.");
    } catch (e) {
      logError("No se pudo enviar la denuncia", e);
      throw e;
    }
  }

  // Coincidencias nuevas desde la última visita: para cada reporte propio
  // activo, busca su mejor candidato nuevo (creado después del último
  // "visto") con score suficiente. Antes esto solo contaba un número y
  // mandaba a Explorar a ciegas — ahora la campanita puede mostrar
  // directamente CUÁL reporte tuyo tiene una coincidencia nueva y con qué,
  // para poder ir directo al detalle en vez de tener que buscarlo.
  const newMatchItems = useMemo(() => {
    if (!user || !vectoresListos) return [];
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
  }, [reports, user, matchesSeenAt, vectoresListos]);
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
    const reaccionSentence = composeReaccionSentence(reaccionChips, form.sexo);
    const marcaSentence = composeMarcaSentence(marcaChips, { manchaUbicacion, manchaColor, sexo: form.sexo });
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
  //
  // Arreglo 2026-10-20 (no funcionaba en celulares): el header
  // Permissions-Policy bloqueaba el micrófono (ver next.config.mjs); además
  // el botón quedaba deshabilitado mientras escuchaba (no se podía frenar) y
  // cualquier error mostraba el mismo mensaje genérico.
  const recognitionRef = useRef(null);
  function toggleDictation() {
    if (dictating) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ya estaba detenido
      }
      return;
    }
    const SpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "es-AR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => {
      const transcript = [...(e.results || [])].map((r) => r?.[0]?.transcript || "").join(" ").trim();
      if (transcript) setDetalleLibre((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
    };
    recognition.onerror = (e) => {
      setDictating(false);
      const msg = dictationErrorMessage(e?.error);
      if (msg) pushToast("error", msg);
    };
    recognition.onend = () => setDictating(false);
    try {
      recognition.start();
      setDictating(true);
    } catch (err) {
      logError("No se pudo iniciar el dictado", err);
      setDictating(false);
      pushToast("error", "No pudimos activar el dictado. Probá de nuevo o escribí a mano.");
    }
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

  // La sección "opcional" del formulario (ver showMoreDetails) queda
  // expandida sola si ya hay algo cargado ahí adentro — por ejemplo, el
  // texto libre que llega precargado desde el share-target (ver el useEffect
  // de "shareTarget" más abajo). Sin esto, esa información quedaría oculta
  // detrás de un toggle colapsado, invisible hasta que alguien lo abra.
  const hasOptionalFieldsFilled =
    !!form.raza.trim() || !!form.nombre.trim() || !!form.edad || !!form.peso || hasMeaningfulDetails;
  const moreDetailsExpanded = showMoreDetails || hasOptionalFieldsFilled;

  const faltaTrasCaptura = fromCapture
    ? {
        fotos: form.fotos.length === 0,
        zona: !form.zona.trim() && (form.lat == null || form.lng == null),
        color: !form.color.trim(),
      }
    : {};
  const bordeCampo = (key) => (fieldErrors[key] ? C.red : faltaTrasCaptura[key] ? C.orange : C.border);
  const avisoFalta = (key) =>
    !fieldErrors[key] && faltaTrasCaptura[key] ? (
      <p className="text-[12px] mt-1 font-semibold" style={{ color: C.orangeInk }}>
        {key === "fotos" ? "Falta la foto: el aviso no traía una que sirva." : "Falta este dato."}
      </p>
    ) : null;

  // Último form, para callbacks async (sugerencias de la IA).
  const formRef = useRef(form);
  formRef.current = form;

  // Posible duplicado (ver duplicates.js): mismo motor de coincidencias,
  // contra reportes activos del mismo tipo. Solo con foto, zona y color —
  // antes no hay con qué comparar en serio. Es un aviso: nunca bloquea.
  const posibleDuplicado = useMemo(() => {
    if (!vectoresListos || !form.fotos.length || !form.color || !(form.zona.trim() || (form.lat != null && form.lng != null))) return null;
    const draft = {
      id: "_nuevo",
      tipo: reportKind,
      especie: form.especie,
      raza: form.raza.trim(),
      color: form.color,
      colorOtro: form.colorOtro,
      tamano: form.tamano,
      sexo: form.sexo,
      edad: form.edad,
      zona: form.zona.trim(),
      provincia: form.provincia,
      lat: form.lat,
      lng: form.lng,
      fecha: form.fecha,
      descripcion: "",
      fotos: form.fotos.map((f) => ({ hist: f.hist, embedding: f.embedding, dudosa: !!f.check?.dudosa })),
      creadoEn: Date.now(),
    };
    return findDuplicates(draft, reports, { userId: user?.id || null, nickname })[0] || null;
  }, [form.fotos, form.color, form.colorOtro, form.zona, form.lat, form.lng, form.especie, form.raza, form.tamano, form.sexo, form.edad, form.provincia, form.fecha, reportKind, reports, user, nickname, vectoresListos]);
  const dupVisible = posibleDuplicado && posibleDuplicado.report.id !== dupDescartado ? posibleDuplicado : null;

  // Borrador en el dispositivo: se recupera una sola vez al montar y se
  // guarda (sin fotos ni contacto) con cada cambio. Ver reportDraft.js.
  const borradorListoRef = useRef(false);
  useEffect(() => {
    let d = null;
    try {
      d = parseReportDraft(localStorage.getItem(REPORT_DRAFT_KEY));
    } catch {
      // localStorage no disponible
    }
    borradorListoRef.current = true;
    if (!d) return;
    setReportKind(d.reportKind);
    setForm((f) => ({ ...f, ...d.form }));
    setAccesorioChips(d.accesorioChips);
    setReaccionChips(d.reaccionChips);
    setMarcaChips(d.marcaChips);
    setManchaUbicacion(d.manchaUbicacion);
    setManchaColor(d.manchaColor);
    setDetalleLibre(d.detalleLibre);
    if (d.form.lat != null) setGeoStatus("done");
    // Lo recuperado lo eligió la persona: la IA no lo pisa.
    if (d.form.especie) tocadosRef.current.add("especie");
    if (d.form.tamano) tocadosRef.current.add("tamano");
    setBorradorRecuperado(true);
  }, []);
  useEffect(() => {
    if (!borradorListoRef.current) return;
    const id = setTimeout(() => {
      try {
        const raw = serializeReportDraft({ reportKind, form, accesorioChips, reaccionChips, marcaChips, manchaUbicacion, manchaColor, detalleLibre });
        if (parseReportDraft(raw)) localStorage.setItem(REPORT_DRAFT_KEY, raw);
        else localStorage.removeItem(REPORT_DRAFT_KEY);
      } catch {
        // localStorage no disponible o lleno: el formulario sigue igual.
      }
    }, 600);
    return () => clearTimeout(id);
  }, [reportKind, form, accesorioChips, reaccionChips, marcaChips, manchaUbicacion, manchaColor, detalleLibre]);

  const reportChecklist = useMemo(() => {
    const colorOk = form.color.trim() && (form.color !== "Otro color" || form.colorOtro.trim());
    // whatsappUsingSaved cuenta como "listo" sin esperar el parseo async del
    // PhoneInput (que ni siquiera está montado en ese modo, ver JSX) — el
    // contacto guardado ya fue válido cuando se guardó.
    const whatsappOk = whatsappUsingSaved || whatsappParsed.isValid;
    return [
      { id: "apodo", label: "Apodo", done: !!nickname.trim() },
      { id: "fotos", label: "Foto", done: form.fotos.length > 0 },
      // Marcar el lugar en el mapa (o con GPS) cuenta como zona completa
      // aunque el texto quede vacío — antes el checklist seguía mostrando
      // "Zona" pendiente con el pin ya puesto.
      { id: "zona", label: "Zona", done: !!form.zona.trim() || (form.lat != null && form.lng != null) },
      { id: "color", label: "Color", done: !!colorOk },
      // "Detalles" (chip/texto extra más allá de la descripción automática)
      // NO va acá: es explícitamente opcional en el copy de esa sección
      // ("Todo es opcional..."), así que antes el checklist nunca llegaba a
      // 100% aunque el reporte ya fuera 100% publicable — confuso para
      // alguien angustiado que cree que algo obligatorio le falta. Este
      // checklist ahora refleja 1 a 1 lo que handleSubmit exige de verdad.
      { id: "contacto", label: "Contacto", done: whatsappOk || !!form.contactoEmail.trim() },
    ];
  }, [nickname, form.fotos.length, form.zona, form.lat, form.lng, form.color, form.colorOtro, whatsappUsingSaved, whatsappParsed.isValid, form.contactoEmail]);
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

  // El nombre elegido en "Mi Felpus" gana sobre el de Google (antes el de
  // Google lo pisaba en cada carga y el cambio "volvía atrás").
  useEffect(() => {
    const nombre = profile?.nickname || googleDisplayName;
    if (nombre) setNickname(nombre);
  }, [profile?.nickname, googleDisplayName]);

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
    })();
    // Deliberadamente sin dependencias más allá de mount: solo debe correr
    // una vez, al abrir la app desde el share target. goToTab/pushToast son
    // estables (useCallback/useToasts); processPhotoFile no lo es, pero
    // agregarla dispararía este efecto de nuevo en cada render sin motivo
    // — el disable de abajo tiene que apuntar a la línea real del array de
    // dependencias, no a un punto intermedio del IIFE de arriba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLeaderboard = useCallback(async () => {
    try {
      const items = await fetchLeaderboard();
      setLeaderboard(items);
    } catch (e) {
      logError("No se pudo cargar el ranking", e);
    }
    // La posición propia se busca aparte porque el leaderboard general solo
    // trae el top 50 — si no estás ahí, igual queremos saber tu puesto real.
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

  // Se recarga al entrar a Colaboradores y cada vez que cambian mis
  // huellitas (acabo de publicar o confirmar un reencuentro).
  const myPoints = myRank?.points;
  useEffect(() => {
    if (!user) {
      setPointsHistory(null);
      setMyReferrals(null);
      return;
    }
    if (activeTab !== "ranking") return;
    let cancelled = false;
    fetchMyPointsHistory()
      .then((h) => !cancelled && setPointsHistory(h))
      .catch((e) => logError("No se pudo cargar el historial de huellitas", e));
    fetchMyReferrals()
      .then((r) => !cancelled && setMyReferrals(r))
      .catch((e) => logError("No se pudieron cargar las invitaciones", e));
    return () => {
      cancelled = true;
    };
  }, [user, activeTab, myPoints]);

  const loadAll = useCallback(async () => {
    setLoadingReports(true);
    try {
      const items = await fetchReports({ light: true });
      setReports(items);
      setLoadError(false);
      // Sin await: el listado ya se muestra; los vectores llegan solos. Si
      // fallan, el matching compara sin fotos (mejor que no mostrar nada).
      setVectoresListos(false);
      vectoresRef.current.promise = fetchReportVectors()
        .then((rows) => {
          vectoresRef.current.rows = rows;
          setReports((prev) => mergeReportVectors(prev, rows));
        })
        .catch((e) => logError("No se pudieron cargar los vectores de las fotos", e))
        .finally(() => setVectoresListos(true));
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
    } else {
      // Alguien llegó desde un flyer, QR o link compartido con un id que ya
      // no está disponible (oculta, eliminada, o el link tiene un error) —
      // antes esto no hacía nada, sin ningún indicio de por qué "no pasó
      // nada" al abrir el link.
      pushToast("error", "No pudimos encontrar esa publicación. Puede que ya no esté disponible.");
    }
  }, [reports, goToTab, pushToast]);

  // "¿Seguís buscando?" (aviso a los 53 días sin actividad) lleva a
  // /?renovar=<id>. Se espera a saber si hay sesión: el dueño se valida con
  // la cuenta o, para invitados, con el token guardado en este dispositivo.
  const renewHandled = useRef(false);
  useEffect(() => {
    if (renewHandled.current || authLoading) return;
    const rid = new URLSearchParams(window.location.search).get("renovar");
    if (!rid) return;
    renewHandled.current = true;
    renewReport(rid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  // "¿Hubo novedades?" dentro de la app (emailAvisos.js): uno de tus
  // reportes activos cumplió 30 días. Tuyo = de tu cuenta, o publicado desde
  // este dispositivo (token guardado). Descartarlo lo esconde 30 días.
  const [novedadesVistas, setNovedadesVistas] = useState(0);
  const reporteNovedades = useMemo(() => {
    if (typeof window === "undefined") return null;
    const now = Date.now();
    return (
      reports.find((r) => {
        const mio = (user && r.userId === user.id) || !!reportToken(r.id);
        if (!mio) return false;
        let dismissedAt = null;
        try {
          dismissedAt = Number(localStorage.getItem(NOVEDADES_KEY_PREFIX + r.id)) || null;
        } catch {
          // sin localStorage: se muestra igual
        }
        return novedadesDue(r, { dismissedAt, now });
      }) || null
    );
    // novedadesVistas: recalcula al descartar uno.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports, user, novedadesVistas]);

  function descartarNovedades(reportId) {
    try {
      localStorage.setItem(NOVEDADES_KEY_PREFIX + reportId, String(Date.now()));
    } catch {
      // sin localStorage: se descarta solo en esta visita
    }
    setNovedadesVistas((n) => n + 1);
  }

  async function renewReport(reportId) {
    try {
      const res = await authedFetch("/api/reports/renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, pushToken: reportToken(reportId) || undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "No se pudo renovar.");
      setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, inactivo: false } : r)));
      pushToast("success", "Listo, seguimos buscando. Te avisamos si aparece algo.");
    } catch (e) {
      pushToast("error", e?.message || "No pudimos renovar el reporte.");
    }
  }

  // Lo que la persona decide sobre una coincidencia ("Es mi mascota" / "No
  // es") se guarda en la tabla matches para no volver a avisar de ese par.
  // Sin sesión no hay dónde guardarlo: queda solo en esta pantalla.
  function recordMatchDecision(ownReport, otherReport, estado) {
    if (!user || !ownReport || !otherReport) return;
    const lost = ownReport.tipo === "perdida" ? ownReport : otherReport;
    const found = ownReport.tipo === "perdida" ? otherReport : ownReport;
    authedFetch("/api/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lostId: lost.id, foundId: found.id, estado }),
    }).catch((e) => logError("No se pudo guardar la decisión sobre la coincidencia", e));
  }

  // Confirmar un reencuentro requiere sesión con Google (evita que cualquiera
  // se autoasigne puntos con un apodo de texto libre) Y ser quien publicó ese
  // reporte específico (evita que un tercero resuelva el reporte de otra
  // persona). Cada reporte solo lo puede marcar como reencontrado su propio
  // autor.
  function handleConfirmTrigger(ownerReport, toggleId = ownerReport?.id) {
    if (!user) {
      pushToast("error", "Iniciá sesión con Google para confirmar reencuentros y sumar huellitas.");
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
      // e.message: cuando el límite server-side de send_heart (ver
      // schema.sql) rechaza el pedido — quien llega hasta acá ya pasó el
      // chequeo de heartedIds del propio navegador, así que en la práctica
      // solo se dispara desde otra pestaña/navegador o tras borrar ese
      // localStorage — igual vale mostrar el motivo real en vez de uno
      // genérico.
      pushToast("error", e?.message || "No pudimos enviar el corazón. Probá de nuevo.");
    }
  }

  // "Posibles coincidencias" (paleta 2026-10-20): función central, en rojo
  // suave para no competir con PERDIDA. Antes de buscar, la acción es
  // discreta; si la búsqueda ya corrió y encontró algo, se destaca la
  // cantidad (las que se muestran, nunca un número inventado); si no
  // encontró nada, queda en gris.
  function matchToggleStyle(report) {
    const found = cardMatches[report.id];
    if (found && found.length > 0) return { borderColor: C.border, background: C.matchBg, color: C.matchText };
    if (found) return { borderColor: C.border, color: C.muted };
    return { borderColor: C.border, color: C.matchText };
  }
  function matchToggleLabel(report) {
    if (expandedCard === report.id) return "Ocultar coincidencias";
    const found = cardMatches[report.id];
    if (!found) return "Buscar posibles coincidencias";
    if (found.length === 0) return "Sin coincidencias por ahora";
    return found.length === 1 ? "Ver 1 posible coincidencia" : `Ver ${found.length} posibles coincidencias`;
  }
  // Iniciar sesión o "solo el autor" son acciones neutras (marrón/gris);
  // el verde queda para quien de verdad puede confirmar el reencuentro.
  function confirmButtonColor(report) {
    if (!user) return C.text;
    if (report?.userId !== user.id) return C.muted;
    return C.green;
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
      pushToast("error", "Iniciá sesión con Google para confirmar reencuentros y sumar huellitas.");
      return;
    }
    // Re-entrada: si ya hay una confirmación en vuelo para este mismo
    // reporte, un segundo click (doble-tap) no dispara nada nuevo.
    const firstId = repObjs[0]?.id;
    if (firstId && resolvingId === firstId) return;
    setResolvingId(firstId ?? true);
    const ownedRepObjs = repObjs.filter((r) => r.userId === user.id);
    if (ownedRepObjs.length === 0) {
      pushToast("error", "Solo quien publicó este reporte puede marcarlo como reencontrado.");
      setConfirmingId(null);
      setResolvingId(null);
      return;
    }
    const resolverDisplayName = profile?.nickname || googleDisplayName || user.email || "Colaborador";
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

      // Aislado del resto del flujo (try/catch propio, no deja que su error
      // se propague al catch de más abajo): el reencuentro en sí ya quedó
      // guardado arriba (resolveReports + el estado en memoria) — que
      // falle sumar puntos (a quien confirma, o el bono a quien publicó el
      // otro reporte del match) no debería mostrarle un error genérico a
      // alguien que sí logró lo que vino a hacer. Esto además protege
      // puntualmente el caso "bono-reporte-original": antes de correr la
      // migración de award_points (ver PENDIENTE_DECISION.md) ese llamado
      // sigue fallando (RLS deniega escribir en la fila de otra persona
      // desde acá), pero ya no se lleva puesto el resto del flujo con él —
      // hallazgo de auditoría: antes SIEMPRE pasaba esto en cualquier
      // confirmación con un bono real de por medio, con o sin la migración.
      try {
        await awardPointsRemote(user.id, resolverDisplayName, PUNTOS_REENCUENTRO, "reencuentro", ids[0]);
        const seenBonusIds = new Set();
        for (const b of bonusFor) {
          if (!b?.userId || b.userId === user.id || seenBonusIds.has(b.userId)) continue;
          seenBonusIds.add(b.userId);
          await awardPointsRemote(b.userId, b.displayName, PUNTOS_BONO_ORIGINAL, "bono-reporte-original", b.reportId);
        }
      } catch (e) {
        logError("No se pudieron sumar los puntos del reencuentro", e);
      }
      await loadLeaderboard();
      setConfirmingId(null);
      playSuccess();
      pushToast("success", `🎉 ¡Gracias ${resolverDisplayName}! +${PUNTOS_REENCUENTRO} huellitas por confirmar el reencuentro.`);
    } catch (e) {
      logError(e);
      pushToast("error", "No pudimos guardar el reencuentro. Probá de nuevo.");
    } finally {
      setResolvingId(null);
    }
  }

  // "Descartar" una coincidencia — decisión de la persona ("no es mi
  // mascota"), no un dato que haya que guardar en ningún lado: solo la saca
  // de la lista visible en ESTA pantalla de resultados, para esta sesión.
  // Deliberadamente sin backend ni confirmación extra (recargar la página
  // la trae de vuelta) — es la acción de menor fricción posible para una
  // decisión de bajo riesgo.
  function dismissMatch(reportId) {
    const other = matchResult?.results.find((m) => m.report.id === reportId)?.report;
    recordMatchDecision(matchResult?.source, other, "descartado");
    setMatchResult((prev) => (prev ? { ...prev, results: prev.results.filter((m) => m.report.id !== reportId) } : prev));
    pushToast("success", "Coincidencia descartada de esta lista.");
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
    try {
      const dataUrl = await resizeImageFile(file);
      const hist = await computeHistogram(dataUrl);
      const esPrimera = form.fotos.length === 0;
      setForm((f) => ({ ...f, fotos: [...f.fotos, { dataUrl, hist, embedding: null }] }));
      revisarFoto(dataUrl);
      if (esPrimera) sugerirDesdeFoto(dataUrl);
      setVisionStatus("analyzing");
      const embedding = await getImageEmbedding(dataUrl);
      // Se busca la foto por su dataUrl y no por posición: mientras se
      // calcula el embedding la persona puede quitar o reordenar fotos
      // ("Hacer principal"), y el índice original ya no sería esta foto.
      setForm((f) => ({
        ...f,
        fotos: f.fotos.map((foto) => (foto.dataUrl === dataUrl ? { ...foto, embedding } : foto)),
      }));
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

  async function handleActivatePush(reportId, pushToken) {
    setPushSubState("loading");
    try {
      await subscribeReportPush(reportId, pushToken);
      // Con sesión iniciada, el dispositivo también queda en la cuenta (alertas
      // de zona y de matches en todos los reportes). Si falla, el del reporte
      // ya quedó activo.
      if (user) await subscribeUserPush().catch((e) => logError("No se pudo guardar el dispositivo en la cuenta", e));
      setPushSubState("active");
      pushToast("success", "🔔 Listo — te avisamos acá si aparece una coincidencia.");
    } catch (e) {
      setPushSubState("error");
      logError("No se pudo activar las notificaciones push", e);
      pushToast("error", e?.message || "No pudimos activar las notificaciones.");
    }
  }

  // Con la primera foto, la IA (Gemini, /api/import-post modo "foto") sugiere
  // especie, color, tamaño y raza. Corre en paralelo y nunca frena nada: si
  // falla o no está configurada, no pasa nada. Una vez por formulario, y no
  // si los datos vinieron de una captura o del asistente.
  function sugerirDesdeFoto(dataUrl) {
    if (sugerenciaPedidaRef.current || fromCapture || chatOriginRef.current) return;
    sugerenciaPedidaRef.current = true;
    importPost({ image: dataUrl, modo: "foto" }).then((res) => {
      const s = res.ok ? res.sugerencia : null;
      if (!s) return;
      const f = formRef.current;
      const tocados = tocadosRef.current;
      const cambios = {};
      if ((s.especie === "perro" || s.especie === "gato") && !tocados.has("especie") && s.especie !== f.especie) cambios.especie = s.especie;
      if (s.tamano && !tocados.has("tamano") && s.tamano !== f.tamano) cambios.tamano = s.tamano;
      if (s.color && !f.color) {
        cambios.color = s.color;
        if (s.color === "Otro color" && s.colorDetalle && !f.colorOtro.trim()) cambios.colorOtro = s.colorDetalle;
      }
      if (s.raza && !f.raza.trim()) cambios.raza = s.raza;
      const keys = Object.keys(cambios).filter((k) => k !== "colorOtro");
      if (!keys.length) return;
      setForm((prev) => ({ ...prev, ...cambios }));
      setAiSugeridos(keys);
    });
  }

  // La persona eligió un dato a mano: ya no es una sugerencia de la IA.
  function marcarTocado(key) {
    tocadosRef.current.add(key);
    setAiSugeridos((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : prev));
  }

  // ¿Foto real o flyer/captura/ilustración? (ver photoCheck.js). Corre en
  // paralelo y nunca frena nada: si tarda o falla, la foto queda sin aviso.
  // Se busca la foto por dataUrl, igual que el embedding.
  function revisarFoto(dataUrl) {
    checkPhotoKind(dataUrl).then((check) => {
      if (!check) return;
      setForm((f) => ({
        ...f,
        fotos: f.fotos.map((foto) => (foto.dataUrl === dataUrl ? { ...foto, check } : foto)),
      }));
    });
  }

  // "Es una foto real, seguir": se publica igual, marcada para revisar.
  function handleKeepDudosa(index) {
    setForm((f) => ({ ...f, fotos: f.fotos.map((foto, i) => (i === index ? { ...foto, keep: true } : foto)) }));
  }

  // "Cambiar foto": la saca y abre el selector para elegir otra.
  function handleReplaceDudosa(index) {
    handleRemovePhoto(index);
    fileInputRef.current?.click();
  }

  function handleRemovePhoto(index) {
    setForm((f) => ({ ...f, fotos: f.fotos.filter((_, i) => i !== index) }));
  }

  // La primera foto es la principal: la de la tarjeta, el mapa, al
  // compartir y la que usa el matching (ver store.js). Mismo criterio que
  // "Hacer principal" en el panel de admin (AdminEditReport).
  function handleMakeMainPhoto(index) {
    setForm((f) => ({ ...f, fotos: [f.fotos[index], ...f.fotos.filter((_, i) => i !== index)] }));
  }

  // Coordenadas nuevas (GPS o pin del mapa): las guarda, da la zona por
  // completa y, best-effort, completa Zona/ciudad/provincia a partir de
  // ellas sin bloquear nada (lat/lng ya quedaron guardadas pase lo que pase).
  // Nunca pisa lo que la persona escribió a mano; sí reemplaza una zona que
  // se había completado sola con un pin anterior.
  function setUbicacionDesdeCoordenadas(lat, lng) {
    setForm((f) => ({ ...f, lat, lng }));
    setGeoStatus("done");
    setFieldErrors((prev) => (prev.zona ? { ...prev, zona: undefined } : prev));
    reverseGeocode(lat, lng)
      .then((place) => {
        if (!place) return;
        setForm((f) => {
          // El pin se movió de nuevo mientras se resolvía esta dirección.
          if (f.lat !== lat || f.lng !== lng) return f;
          const zonaEsAuto = !f.zona.trim() || f.zona === zonaAutoRef.current;
          if (!zonaEsAuto) {
            return {
              ...f,
              ciudad: f.ciudad?.trim() ? f.ciudad : place.ciudad || "",
              provincia: f.provincia?.trim() ? f.provincia : place.provincia || "",
            };
          }
          const zona = (place.zona || f.zona).slice(0, 100);
          zonaAutoRef.current = zona;
          return {
            ...f,
            zona,
            ciudad: (place.ciudad || "").slice(0, 80),
            provincia: (place.provincia || "").slice(0, 80),
          };
        });
      })
      .catch((e) => logError("No se pudo geocodificar la ubicación capturada", e));
  }

  function handleUseLocation() {
    setGeoStatus("locating");
    requestLocation(
      ({ lat, lng }) => setUbicacionDesdeCoordenadas(lat, lng),
      (err) => {
        setGeoErrorMessage(geolocationErrorMessage(err));
        setGeoStatus("error");
      }
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
      (err) => {
        setLocatingMe(false);
        pushToast("error", geolocationErrorMessage(err));
      }
    );
  }

  // "Revisar y publicar" desde el Asistente Felpus: vuelca el borrador del
  // chat (ya validado contra las mismas opciones de este formulario, ver
  // draftToFormFields en lib/chatbot.js) y las fotos (ya procesadas con
  // resizeImageFile/computeHistogram, igual que processPhotoFile) en el
  // formulario de siempre. Publicar sigue siendo exclusivamente handleSubmit,
  // con todas sus validaciones: el chat nunca publica por su cuenta.
  // origin "captura": lo mismo desde "Subir captura del aviso" (ImportPostCard),
  // donde fields trae solo lo que decía el aviso y la persona ya está en el
  // formulario.
  function applyChatDraft({ reportKind: kind, form: fields, accesorioChips: acc, reaccionChips: rea, marcaChips: mar, manchaUbicacion: mu, manchaColor: mc, detalleLibre: dl, fotos, startedAt }, { origin = "chat" } = {}) {
    const fromChat = origin === "chat";
    // Si el aviso no trae zona, se conserva la ubicación que ya estaba.
    const keepLocation = !fromChat && !fields.zona;
    if (kind) setReportKind(kind === "encontrada" ? "encontrada" : "perdida");
    setForm((f) => ({
      ...f,
      ...fields,
      // La zona del chat es texto libre: la ciudad de una selección anterior
      // del autocompletado ya no corresponde. lat/lng: el punto que se marcó
      // en el mapa del chat, si se marcó (si no, null — tampoco corresponde
      // uno anterior).
      ...(keepLocation ? {} : { ciudad: "", lat: fields.lat ?? null, lng: fields.lng ?? null }),
      fotos: fotos?.length ? fotos.slice(0, MAX_FOTOS) : f.fotos,
    }));
    (fotos || []).slice(0, MAX_FOTOS).forEach((foto) => foto?.dataUrl && revisarFoto(foto.dataUrl));
    setAccesorioChips(acc || []);
    setReaccionChips(rea || []);
    setMarcaChips(mar || []);
    setManchaUbicacion(mu || "");
    setManchaColor(mc || "");
    setDetalleLibre(dl || "");
    if ((acc || []).length || (rea || []).length || (mar || []).length || dl || fields.nombre || fields.raza || fields.edad) {
      setShowMoreDetails(true);
    }
    if (!keepLocation) setGeoStatus(fields.lat != null && fields.lng != null ? "done" : "idle");
    setFormError("");
    setFieldErrors({});
    if (!fromChat) return;
    chatOriginRef.current = { startedAt: startedAt || Date.now() };
    setDetailReport(null);
    goToTab("reportar");
    pushToast("success", "Te dejamos el reporte completado. Revisalo, marcá la ubicación, agregá tu contacto y tocá Publicar.");
  }

  // "Subir captura del aviso": completa el formulario y suma la foto
  // recortada de la captura por el camino de siempre — histograma, embedding
  // y revisión de flyer incluidos.
  // Después lleva a la persona al primer dato obligatorio que falta.
  async function handleImportPost({ fields, photoFile }) {
    applyChatDraft(fields, { origin: "captura" });
    setFromCapture(true);
    // Los datos ya vienen del aviso: sin sugerencias aparte por la foto.
    sugerenciaPedidaRef.current = true;
    const next = { ...form, ...fields.form };
    const falta = [
      ["form-fotos", !photoFile && form.fotos.length === 0],
      // Sin zona en el aviso se conserva la ubicación que ya estaba (applyChatDraft).
      ["form-zona", !next.zona?.trim() && (form.lat == null || form.lng == null)],
      ["form-color", !next.color?.trim()],
    ].find(([, missing]) => missing);
    // Después del render con los datos nuevos. Solo scroll, sin foco: en el
    // celular el foco abre el teclado o el selector.
    setTimeout(() => document.getElementById(falta ? falta[0] : "form-fotos")?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    if (photoFile) await processPhotoFile(photoFile);
  }

  // Publica y busca coincidencias: lo comparten el formulario (handleSubmit)
  // y "Lo vi suelto" (handlePublishSighting). Con navigateFirst se pasa a la
  // pantalla de resultado con la animación ANTES de publicar (formulario); si
  // no, recién después (la hoja muestra su propio "publicando" y, si falla,
  // queda abierta con los datos). Si createReport falla, tira el error.
  async function publishAndMatch(draft, { puntos, navigateFirst = true }) {
    const opposite = draft.tipo === "perdida" ? "encontrada" : "perdida";

    if (navigateFirst) {
      goToTab("resultado");
      setScanning(true);
      setMatchResult(null);
      setPushSubState("idle");
    }

    const savedReport = await createReport(draft);
    if (navigateFirst) {
      await new Promise((r) => setTimeout(r, SUBMIT_PERCEIVED_DELAY_MS));
    } else {
      setPushSubState("idle");
      goToTab("resultado");
    }
    // Con los vectores de las fotos ya cargados (ver vectoresListos).
    const candidates = (await reportesParaComparar()).filter((r) => r.tipo === opposite && !r.resuelto);

    const scored = findMatches(savedReport, candidates, { limit: 6 });

    setMatchResult({ source: savedReport, results: scored, hadCandidates: candidates.length > 0 });
    rememberReportToken(savedReport.id, savedReport.pushToken);
    setReports((prev) => [savedReport, ...prev]);
    playSuccess();
    if ((isPushSupported() || needsIosInstallForPush()) && pushPermissionState() !== "denied") {
      setAlertOptIn({ reportId: savedReport.id, pushToken: savedReport.pushToken, tipo: savedReport.tipo });
    }
    if (user) {
      await awardPointsRemote(user.id, profile?.nickname || googleDisplayName || user.email, puntos, "reporte", savedReport.id);
      await loadLeaderboard();
    } else {
      pushToast("success", "Reporte publicado. Iniciá sesión con Google para sumar huellitas por tus aportes.");
    }
    return savedReport;
  }

  // "Lo vi suelto" (SightingSheet): mismo camino de publicación que el
  // formulario. Si falla, el error vuelve a la hoja, que queda abierta.
  async function handlePublishSighting(input) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      playTap();
      const draft = buildSightingDraft({
        ...input,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        nickname: nickname.trim(),
        userId: user?.id || null,
      });
      await publishAndMatch(draft, { puntos: draft.detalles.avistamiento ? PUNTOS_AVISTAMIENTO : PUNTOS_ENCONTRADA, navigateFirst: false });
      setSighting(null);
      try {
        window.gtag?.("event", "avistamiento_publicado", { tipo: draft.detalles.avistamiento ? "avistamiento" : "encontrada", desde_ficha: !!input.vistaDe });
      } catch {
        // sin analytics no pasa nada
      }
    } catch (err) {
      logError(err);
      throw new Error(describeSubmitError(err));
    } finally {
      submittingRef.current = false;
    }
  }

  // Formulario en blanco: después de publicar o con "Empezar de nuevo".
  // También borra el borrador guardado en el dispositivo.
  function resetReportForm() {
    setForm(emptyForm());
    setFromCapture(false);
    setAccesorioChips([]);
    setReaccionChips([]);
    setMarcaChips([]);
    setManchaUbicacion("");
    setManchaColor("");
    setDetalleLibre("");
    setGeoStatus("idle");
    setVisionStatus("idle");
    setWhatsappForceTouched(false);
    setAiSugeridos([]);
    setDupDescartado(null);
    setBorradorRecuperado(false);
    tocadosRef.current = new Set();
    sugerenciaPedidaRef.current = false;
    try {
      localStorage.removeItem(REPORT_DRAFT_KEY);
    } catch {
      // localStorage no disponible: no había borrador.
    }
  }

  // Reportes con los vectores de las fotos ya cargados (ver vectoresListos):
  // si todavía están llegando, espera; si fallaron, devuelve lo que hay.
  async function reportesParaComparar() {
    await vectoresRef.current.promise;
    return vectoresRef.current.rows ? mergeReportVectors(reportsRef.current, vectoresRef.current.rows) : reportsRef.current;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submittingRef.current) return;
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
    // Un pin en el mapa (o el GPS) alcanza como zona, aunque el texto haya
    // quedado vacío (ej. falló la búsqueda de la dirección).
    const zonaOk = !!form.zona.trim() || (form.lat != null && form.lng != null);
    if (!zonaOk || !form.color.trim()) {
      const msg = "Completá zona y color — son clave para el matching.";
      setFormError(msg);
      setFieldErrors({
        ...(!zonaOk ? { zona: msg } : {}),
        ...(!form.color.trim() ? { color: msg } : {}),
      });
      focusField(!zonaOk ? "form-zona" : "form-color");
      return;
    }
    // Sexo dejó de ser obligatorio (2026-10-27): vacío = no se sabe, igual
    // que "No sé" para el matching (ver contradiccionesFactor).
    // Con la pill de "contacto guardado" activa, el número ya fue validado
    // cuando se guardó — no hace falta volver a parsearlo. Si no, se usa el
    // último resultado que reportó PhoneInput (ver onParsed), que es la
    // misma fuente que ya está mostrando el ✓/error en pantalla — nunca se
    // vuelve a parsear "a ciegas" acá.
    const whatsappResult = whatsappUsingSaved && savedWhatsapp
      ? { isValid: true, digits: savedWhatsapp.replace(/\D/g, "") }
      : whatsappParsed;
    const whatsappHasText = !whatsappUsingSaved && form.contactoWhatsapp.trim().length > 0;
    if (!whatsappResult.isValid && !whatsappHasText && !form.contactoEmail.trim()) {
      const msg = "Dejá un WhatsApp o un email de contacto — así pueden avisarte si la reconocen.";
      setFormError(msg);
      setFieldErrors({ contacto: msg });
      focusField("form-contacto-whatsapp");
      return;
    }
    if (whatsappHasText && !whatsappResult.isValid) {
      const msg = "Revisá el WhatsApp que escribiste — no logramos interpretarlo bien.";
      setFormError(msg);
      setFieldErrors({ contacto: msg });
      // El PhoneInput ya muestra su propio mensaje específico (incompleto/
      // no interpretable) — esto solo lo fuerza a aparecer aunque la
      // persona nunca haya salido del campo (blur).
      setWhatsappForceTouched(true);
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
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const fotosDudosas = form.fotos.map((foto, i) => (foto.check?.dudosa ? i : -1)).filter((i) => i >= 0);
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
        // zona es NOT NULL en la base: con solo el pin y sin texto, se guarda
        // la ciudad si se pudo averiguar, o una leyenda genérica.
        zona: form.zona.trim() || form.ciudad.trim() || "Ubicación marcada en el mapa",
        ciudad: form.ciudad.trim(),
        provincia: form.provincia.trim(),
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
        detalles: {
          ...buildDetallesEstructurados({
            accesorios: accesorioChips,
            comportamientos: reaccionChips,
            marcaDistintiva: marcaChips,
            ubicacionMarca: manchaUbicacion,
            colorMarca: manchaColor,
          }),
          // Fotos que el chequeo marcó como flyer/captura/ilustración y la
          // persona igual dejó: quedan para revisar en el panel de admin y
          // no se usan al comparar fotos (ver marcarDudosas en matching.js).
          ...(fotosDudosas.length ? { fotos_dudosas: fotosDudosas } : {}),
        },
        contactoWhatsapp: whatsappResult.isValid ? whatsappResult.digits : "",
        contactoEmail: form.contactoEmail.trim(),
        avisosEmail: form.avisosEmail !== false,
        fotos: form.fotos.map((foto) => (foto.check?.dudosa ? { ...foto, dudosa: true } : foto)),
        nickname: nickname.trim(),
        userId: user?.id || null,
        resuelto: false,
        creadoEn: Date.now(),
      };

      await publishAndMatch(draft, { puntos: reportKind === "perdida" ? PUNTOS_PERDIDA : PUNTOS_ENCONTRADA });
      if (chatOriginRef.current) {
        try {
          window.gtag?.("event", "asistente_reporte_publicado", {
            segundos: Math.round((Date.now() - chatOriginRef.current.startedAt) / 1000),
          });
        } catch {
          // sin analytics no pasa nada
        }
        chatOriginRef.current = null;
        setChatPublishedToken((t) => t + 1);
      }
      resetReportForm();
      // Recordar el contacto DESPUÉS del reset de arriba (setForm(emptyForm()))
      // y no antes: applySavedWhatsapp mergea national/país en el form de
      // forma async (splitStoredWhatsapp) — si se llamara antes del reset,
      // el emptyForm() de esta misma función correría primero (es
      // síncrono) y pisaría ese merge en cuanto la promesa resolviera.
      // Ningún cambio para quien no dejó WhatsApp válido (whatsappResult
      // sigue siendo el de ANTES del reset, capturado más arriba).
      if (whatsappResult.isValid) {
        const e164 = `+${whatsappResult.digits}`;
        try {
          localStorage.setItem("felpus_saved_whatsapp", e164);
        } catch {
          // localStorage no disponible — no es bloqueante, simplemente no
          // se recuerda para la próxima vez.
        }
        applySavedWhatsapp(e164);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      logError(err);
      setFormError(describeSubmitError(err));
      goToTab("reportar");
    } finally {
      setScanning(false);
      setSubmitting(false);
      submittingRef.current = false;
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
    const candidates = (await reportesParaComparar()).filter((r) => r.id !== report.id && r.tipo === opposite && !r.resuelto);
    const scored = findMatches(report, candidates, { limit: 6 });
    let descartados = new Set();
    try {
      const res = await authedFetch(`/api/matches?reportId=${encodeURIComponent(report.id)}`);
      const data = await res.json().catch(() => ({}));
      descartados = new Set(
        (data?.matches || [])
          .filter((m) => m.estado === "descartado")
          .map((m) => (m.report_lost_id === report.id ? m.report_found_id : m.report_lost_id))
      );
    } catch {
      // sin la tabla matches todavía: se muestran todas
    }
    setCardMatches((prev) => ({ ...prev, [report.id]: scored.filter((m) => !descartados.has(m.report.id)).slice(0, 4) }));
  }

  function discardCardMatch(ownReport, otherReport) {
    recordMatchDecision(ownReport, otherReport, "descartado");
    setCardMatches((prev) => ({ ...prev, [ownReport.id]: (prev[ownReport.id] || []).filter((m) => m.report.id !== otherReport.id) }));
  }

  const FECHA_LIMITES_MS = { "24h": 24 * 3600 * 1000, "7d": 7 * 24 * 3600 * 1000, "30d": 30 * 24 * 3600 * 1000 };
  const normalizedQuery = normalizeText(debouncedSearchQuery).trim();
  const hasAdvancedFilters =
    filterTamano !== "todos" ||
    filterColor !== "todos" ||
    filterFecha !== "todos" ||
    filterRadioKm != null ||
    !!filterRaza.trim() ||
    filterSexo !== "todos";

  // Memoizados por la misma razón que filteredReports más abajo: reports
  // solo cambia cuando de verdad llega data nueva, no en cada render.
  const activeReports = useMemo(() => reports.filter((r) => !r.resuelto), [reports]);
  const resueltas = useMemo(() => reports.filter((r) => r.resuelto), [reports]);
  // También memoizado (antes no lo estaba, a pesar de derivar de `resueltas`
  // ya memoizado): sin esto, cada tecla escrita en cualquier input de todo
  // este componente gigante recreaba el array del carrusel de "Reencuentros
  // felices" con una referencia nueva, aunque los reencuentros en sí no
  // hubieran cambiado — mismo tipo de costo evitable que ya se documentó
  // acá abajo para filteredReports.
  const happyReunions = useMemo(
    () => [...resueltas].sort((a, b) => (b.resueltoEn || b.creadoEn) - (a.resueltoEn || a.creadoEn)).slice(0, 10),
    [resueltas]
  );
  // Franja de actividad de la comunidad en Inicio — números reales (no
  // simulados) derivados de los reportes ya cargados, para transmitir que
  // hay gente usando la app ahora mismo sin inventar datos. Memoizado por el
  // mismo motivo que lo de arriba.
  // Últimos 7 días (2026-10-24, a pedido): con 24 h el número quedaba en 0
  // o muy bajo muchos días y no reflejaba la actividad real.
  const last7dCount = useMemo(() => {
    const desde = Date.now() - 7 * 24 * 3600 * 1000;
    return reports.filter((r) => r.creadoEn >= desde).length;
  }, [reports]);
  // Números de Inicio: mientras baja el listado completo (pesado: trae los
  // embeddings de cada foto), se muestran los que ya vinieron en el HTML
  // (page.js → homeStats.js). Mismas definiciones, así no saltan.
  const usarStatsIniciales = !!initialStats && loadingReports && reports.length === 0;
  const homeStats = usarStatsIniciales
    ? initialStats
    : { activas: activeReports.length, ultimos7: last7dCount, reencuentros: resueltas.length };

  // Memoizado: sin esto, esta lista se recalculaba (con una referencia de
  // array NUEVA) en cada render de todo el componente, sin importar si algo
  // relevante había cambiado. Eso hacía que ReportsMap reconstruyera todos
  // sus marcadores todo el tiempo, no solo cuando la lista filtrada
  // realmente cambiaba — carísimo, y encima expuso un crash real cuando el
  // mapa estaba en un estado roto (ver ReportsMap.jsx).
  const normalizedRaza = normalizeText(filterRaza.trim());
  const filteredReports = useMemo(() => {
    // "resuelto" (Solo reencontradas, el filtro que activa la tarjeta
    // "Reencuentros" de Inicio) cambia la base de la lista: en vez de los
    // reportes activos, muestra solo los reencuentros confirmados.
    const soloResueltas = filterTipo === "resuelto";
    let list = (soloResueltas ? resueltas : activeReports).filter((r) => {
      if (!soloResueltas && filterTipo !== "todos" && r.tipo !== filterTipo) return false;
      if (filterEspecie !== "todos" && r.especie !== filterEspecie) return false;
      if (filterTamano !== "todos" && r.tamano !== filterTamano) return false;
      if (filterColor !== "todos" && r.color !== filterColor) return false;
      if (normalizedRaza && !normalizeText(r.raza || "").includes(normalizedRaza)) return false;
      if (filterSexo !== "todos" && r.sexo !== filterSexo) return false;
      if (filterFecha !== "todos" && Date.now() - r.creadoEn > FECHA_LIMITES_MS[filterFecha]) return false;
      if (normalizedQuery) {
        // ciudad/provincia: mismo campo estructurado que ahora completa la
        // línea de zona del flyer (ver composeZonaDisplay en flyer.js) —
        // buscar "Salta" debería encontrar un reporte cuya ciudad/provincia
        // sea Salta aunque esa palabra no aparezca en el texto de "zona".
        const haystack = normalizeText(
          [r.zona, r.ciudad, r.provincia, r.nombre, r.color, r.colorOtro, r.descripcion].filter(Boolean).join(" ")
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
    } else if (soloResueltas) {
      list = [...list].sort((a, b) => (b.resueltoEn || b.creadoEn) - (a.resueltoEn || a.creadoEn));
    } else {
      list = [...list].sort((a, b) => b.creadoEn - a.creadoEn);
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeReports,
    resueltas,
    filterTipo,
    filterEspecie,
    filterTamano,
    filterColor,
    normalizedRaza,
    filterSexo,
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
  }, [filterTipo, filterEspecie, filterTamano, filterColor, normalizedRaza, filterSexo, filterFecha, filterRadioKm, normalizedQuery, sortBy]);
  const visibleReports = filteredReports.slice(0, visibleCount);

  const myTier = getTier(myRank?.points || 0, C);

  const NAV_ITEMS = [
    { id: "inicio", label: "Inicio", icon: Home },
    { id: "explorar", label: "Explorar", icon: Search },
    { id: "reportar", label: "Reportar", icon: Plus, primary: true },
    { id: "ranking", label: "Colaboradores", icon: Crown },
  ];

  return (
    <div className="min-h-screen w-full" style={{ background: C.cream, fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
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
              {/* Sin modo noche (2026-10-19) el logo blanco nunca se veía,
                  pero el navegador lo descargaba igual (46 KB). Ahora un solo
                  logo, en WebP del tamaño justo (7 KB en vez de un PNG de
                  2419 px y 51 KB). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO_RED} alt="Felpus" width={185} height={108} className="h-9 w-auto object-contain" />
              {/* text-[var(--felpus-muted)] dark:text-[#B9ADA5] en vez de style={{color: C.muted}}:
                  igual que con el logo, un color elegido en JS según themeMode
                  no coincide entre el render del server (siempre asume tema
                  claro) y el del cliente (ya conoce el tema real), lo que
                  generaba una advertencia de hidratación acá. Con clases
                  "dark:" el color lo decide el CSS vía [data-theme], sin ese
                  riesgo. */}
              {/* Antes "hidden sm:block": el resumen de qué es Felpus quedaba
                  invisible en mobile — el único lugar donde SÍ se explicaba
                  el propósito de la app a un vistazo (sin depender de leer
                  todo el hero) desaparecía justamente en el viewport que
                  más tráfico recibe. Visible en todos los tamaños ahora. */}
              <p className="text-[12px] leading-snug mt-0.5 text-[var(--felpus-muted)] dark:text-[#B9ADA5]">
                Buscador inteligente de mascotas perdidas y encontradas
              </p>
            </div>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            {/* "Mi Felpus" — solo con sesión iniciada (perfil/guardados
                requieren cuenta, no tiene sentido para invitados). Mismo
                patrón que el ícono de admin: entrada en el header, no en la
                navegación inferior — agregar un 5to/6to ítem ahí desbalancearía
                el layout para quienes ni siquiera ven este botón. */}
            {user && (
              <button
                type="button"
                onClick={() => {
                  playTap();
                  goToTab("mifelpus");
                }}
                aria-label="Mi Felpus"
                title="Mi Felpus"
                className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                style={{ background: activeTab === "mifelpus" ? C.redSolid : C.cream }}
              >
                {myAvatarUrl ? (
                  <Image src={myAvatarUrl} alt="" unoptimized width={32} height={32} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-4 h-4" style={{ color: activeTab === "mifelpus" ? "#fff" : C.text }} />
                )}
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  playTap();
                  goToTab("admin");
                }}
                aria-label="Panel de administrador"
                title="Panel de administrador"
                className="w-10 h-10 rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                style={{ background: activeTab === "admin" ? C.orangeInkSolid : C.cream }}
              >
                <ShieldCheck className="w-4 h-4" style={{ color: activeTab === "admin" ? "#fff" : C.orangeInk }} />
              </button>
            )}
            {/* Modo noche quitado a pedido (2026-10-19): la web queda
                siempre en claro (ver ThemeProvider.jsx). */}
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
                  className="relative w-10 h-10 rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                  style={{ background: C.cream }}
                >
                  <Bell className="w-4 h-4" style={{ color: C.red }} />
                  {newMatchesCount > 0 && (
                    <span
                      className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-white text-[11px] font-bold flex items-center justify-center"
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
                              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-[var(--felpus-surface-subtle)] dark:hover:bg-[var(--felpus-dark-hover)] focus:outline-none focus-visible:bg-[var(--felpus-surface-subtle)] dark:focus-visible:bg-[var(--felpus-dark-hover)]"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <Image src={best.foto} alt="" width={44} height={44} loading="lazy" className="w-11 h-11 rounded-lg object-cover shrink-0 bg-[var(--felpus-surface-muted)] dark:bg-[var(--felpus-dark-muted-surface)]" />
                              <span className="flex-1 min-w-0">
                                <span className="block text-xs font-bold truncate" style={{ color: C.text }}>
                                  Tu {mine.tipo === "perdida" ? "reporte de perdida" : "reporte de encontrada"}
                                  {nombreReal(mine) ? ` (${nombreReal(mine)})` : ""}
                                </span>
                                <span className="block text-[12px] truncate" style={{ color: C.muted }}>
                                  Coincide con {petTitle(best).toLowerCase()} · {Math.round(score * 100)}%
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
              className="felpus-mono text-[12px] font-bold text-white rounded-full px-3 min-h-[40px] whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
              style={{ background: C.redSolid }}
            >
              {homeStats.activas} mascotas
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
              {myAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <Image src={myAvatarUrl} alt="" unoptimized width={32} height={32} className="w-8 h-8 rounded-full shrink-0" referrerPolicy="no-referrer" />
              ) : (
                <span
                  className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: C.redSolid }}
                >
                  {(profile?.nickname || googleDisplayName || "?").charAt(0).toUpperCase()}
                </span>
              )}
              <span className="flex-1 min-w-0">
                <span className="block text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>
                  Colaborador
                </span>
                <span className="block text-sm font-semibold truncate" style={{ color: C.text }}>
                  {profile?.nickname || googleDisplayName}
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
                <label
                  htmlFor="apodo-input"
                  className="block text-[11px] font-bold uppercase tracking-wide"
                  style={{ color: C.muted }}
                >
                  Elegí un apodo
                </label>
                <input
                  id="apodo-input"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={40}
                  // Auditoría integral (2026-08-09): decía "Para sumar
                  // puntos como colaborador" — para alguien SIN sesión (la
                  // mayoría en un momento de pánico por una mascota
                  // perdida), este es el único campo de identificación
                  // visible y handleSubmit lo exige primero de todos, pero
                  // el texto daba a entender que era opcional/solo para
                  // gamificación. Mismo texto que ya usa el mensaje de
                  // error de más abajo, para no decir dos cosas distintas.
                  placeholder="Así te reconocemos"
                  className="block w-full text-sm font-semibold outline-none bg-transparent min-w-0 py-1"
                  style={{ color: fieldErrors.apodo ? C.red : C.text }}
                />
                {fieldErrors.apodo && (
                  <span className="block text-[11px] font-semibold mt-0.5" style={{ color: C.red }}>{fieldErrors.apodo}</span>
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
              className="felpus-mono text-[12px] font-bold shrink-0 flex items-center gap-0.5"
              style={{ color: C.orangeInkDark }}
              title={`Racha de ${myRank.streak_days} ${myRank.streak_days === 1 ? "día" : "días"} seguidos`}
            >
              <Flame className="w-3.5 h-3.5" fill="currentColor" /> {myRank.streak_days}
            </span>
          )}
          {nickname.trim() && (
            <span
              className="felpus-mono text-[12px] font-extrabold shrink-0 px-2.5 py-1.5 rounded-full text-white shadow-sm"
              style={{ background: myTier.bg }}
            >
              🐾 {myRank?.points || 0} · {myTier.label}
            </span>
          )}
          {!authLoading && (
            <button
              onClick={user ? handleLogout : handleGoogleLogin}
              aria-label={user ? "Cerrar sesión" : "Iniciar sesión con Google"}
              title={user ? "Cerrar sesión" : "Iniciar sesión con Google"}
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border"
              style={{ borderColor: C.border, color: C.muted }}
            >
              {user ? <LogOut className="w-3.5 h-3.5" /> : <LogIn className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
        {!user && (
          <p className="text-[12px] leading-snug px-1" style={{ color: C.muted }}>
            Podés reportar mascotas como invitado con solo un apodo, pero para sumar huellitas y confirmar
            reencuentros necesitás{" "}
            <button onClick={handleGoogleLogin} className="font-bold underline py-1.5" style={{ color: C.text }}>
              iniciar sesión con Google
            </button>
            .
          </p>
        )}
      </div>

      <main className="px-4 py-4 pb-8">
        {/* INICIO */}
        {activeTab === "inicio" && (
          <div key="inicio" className="max-w-2xl mx-auto space-y-5 felpus-fadein">
            {reporteNovedades && (
              <div className="bg-white rounded-2xl border p-4 space-y-3 shadow-sm" style={{ borderColor: C.border }} role="status">
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-sm" style={{ color: C.text }}>
                    <span className="font-bold">
                      {reporteNovedades.tipo === "encontrada" ? "¿Pudiste devolver a " : "¿Hubo novedades de "}
                      {nombreReal(reporteNovedades) || petTitle(reporteNovedades).toLowerCase()}?
                    </span>{" "}
                    Tu reporte lleva {Math.max(1, Math.round((Date.now() - reporteNovedades.creadoEn) / 86400000))} días publicado.
                  </p>
                  <button
                    type="button"
                    onClick={() => descartarNovedades(reporteNovedades.id)}
                    aria-label="Ahora no"
                    className="shrink-0 w-9 h-9 -mt-1 -mr-1 rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                    style={{ color: C.muted }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      descartarNovedades(reporteNovedades.id);
                      openReportDetail(reporteNovedades);
                    }}
                    className="min-h-[44px] rounded-xl text-sm font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                    style={{ background: C.greenSolid }}
                  >
                    {reporteNovedades.tipo === "encontrada" ? "Ya volvió 🎉" : "Volvió a casa 🎉"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      descartarNovedades(reporteNovedades.id);
                      renewReport(reporteNovedades.id);
                    }}
                    className="min-h-[44px] rounded-xl border text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                    style={{ borderColor: C.border, color: C.text }}
                  >
                    Sigo buscando
                  </button>
                </div>
              </div>
            )}
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
                    unoptimized
                    className="object-cover"
                    style={{ objectPosition: "50% 35%" }}
                  />
                </div>
                <h2 className="felpus-display text-xl sm:text-2xl mb-2" style={{ color: C.text }}>
                  Cada mascota merece volver a casa
                </h2>
                <p className="text-sm leading-relaxed max-w-sm mx-auto" style={{ color: C.muted }}>
                  Subí una foto y Felpus busca coincidencias en toda la comunidad mediante Inteligencia Artificial.
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
                {/* "Lo vi suelto": quien solo vio una mascota en la calle no
                    tiene que pasar por el formulario completo (SightingSheet). */}
                <button
                  type="button"
                  onClick={() => {
                    playTap();
                    setSighting({ vistaDe: null });
                  }}
                  className="w-full mt-2 min-h-[48px] rounded-xl border text-sm font-bold flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                  style={{ borderColor: C.border, color: C.text, background: C.surface }}
                >
                  <Eye className="w-4 h-4" style={{ color: C.orangeInk }} aria-hidden="true" />
                  Vi una mascota suelta · avisá en 3 toques
                </button>
              </div>
            </div>

            {/* Franja de actividad — le da pulso a la app con datos reales
                (nada simulado): cuántos reportes hay activos ahora, cuántos
                se publicaron en las últimas 24hs, y cuántas mascotas ya
                volvieron a casa gracias a la comunidad. */}
            <div className="grid grid-cols-3 gap-2.5">
              {[
                {
                  value: homeStats.activas,
                  label: "Mascotas en búsqueda",
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
                  value: homeStats.ultimos7,
                  label: "Últimos 7 días",
                  color: C.orangeInk,
                  onClick: () => {
                    setFilterTipo("todos");
                    setFilterFecha("7d");
                    setExploreView("lista");
                    setShowResueltas(false);
                    goToTab("explorar");
                  },
                },
                {
                  value: homeStats.reencuentros,
                  label: "Reencuentros",
                  color: C.green,
                  onClick: () => {
                    setFilterTipo("resuelto");
                    setFilterFecha("todos");
                    setExploreView("lista");
                    setShowResueltas(false);
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
                  aria-label={`${s.value} — ${s.aria || s.label}`}
                  className="felpus-card-hover bg-white dark:bg-[var(--felpus-dark-card)] rounded-xl border shadow-sm p-3 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                  style={{ borderColor: C.border }}
                >
                  <p className="felpus-mono text-xl font-bold" style={{ color: s.color }} aria-hidden="true">
                    <AnimatedNumber value={s.value} />
                  </p>
                  <p className="text-[11px] font-semibold leading-tight mt-0.5" style={{ color: C.muted }} aria-hidden="true">
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
                  { icon: Heart, label: "Recibís las coincidencias", color: C.matchText },
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
                <p className="text-[12px] text-white/75">Huellitas por reportar y por confirmar reencuentros — mirá quién ayuda más.</p>
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
                        {petTitle(r)}
                      </p>
                      <p className="text-[12px] font-semibold mb-1.5" style={{ color: C.greenDark }}>
                        {r.resueltoEn ? `Volvió a casa ${timeAgo(r.resueltoEn)}` : "Volvió a casa"}
                      </p>
                      <p className="text-[12px] line-clamp-2" style={{ color: C.muted }}>
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

            <ImportPostCard onImport={handleImportPost} />

            {reportKind === "encontrada" && (
              <button
                type="button"
                onClick={() => setSighting({ vistaDe: null })}
                className="w-full min-h-[44px] rounded-xl px-3 text-[13px] font-semibold flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={{ background: C.surfaceMuted, color: C.text }}
              >
                <Eye className="w-4 h-4" style={{ color: C.orangeInk }} aria-hidden="true" />
                ¿Solo la viste suelta? Avisá en 3 toques
              </button>
            )}

            {borradorRecuperado && (
              <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-[12px]" style={{ background: C.surfaceMuted, color: C.text }} role="status">
                <span>Recuperamos lo que habías cargado{form.fotos.length ? "" : " (las fotos hay que volver a subirlas)"}.</span>
                <button
                  type="button"
                  onClick={resetReportForm}
                  className="shrink-0 min-h-[32px] px-2 font-bold underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50 rounded"
                >
                  Empezar de nuevo
                </button>
              </div>
            )}

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
                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold transition-colors duration-300"
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
                  <p className="text-[12px] mb-1.5" style={{ color: C.red }}>{fieldErrors.fotos}</p>
                )}
                {avisoFalta("fotos")}
                {/* Pedido del usuario (2026-08-10): evitar que se suban
                    carteles/flyers ya armados o imágenes generadas en vez de
                    fotos reales — no hay forma confiable de detectar esto
                    automáticamente sin arriesgar rechazar fotos reales (el
                    peor error posible acá), así que la primera capa es
                    simplemente pedirlo claro ANTES de que alguien elija un
                    archivo. El resto de las capas ya existían: denunciar
                    "Es falsa o engañosa" (ver REPORT_FLAG_REASONS en
                    matching.js) y el panel de admin. */}
                <p className="text-[12px] mb-1.5" style={{ color: C.muted }}>
                  Una foto real de la mascota (no un flyer ni una captura): es la que se compara para buscar coincidencias.
                </p>
                {form.fotos.length > 1 && (
                  <p className="text-[12px] mb-1.5" style={{ color: C.muted }}>
                    La primera es la principal (la que se ve en la tarjeta). Tocá la ☆ de otra foto para cambiarla.
                  </p>
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
                      {foto.check?.dudosa && (
                        <span
                          className="absolute bottom-1 left-1 right-1 text-[10px] font-bold text-white rounded-md px-1.5 py-0.5 text-center"
                          style={{ background: foto.keep ? "rgba(0,0,0,0.6)" : C.orangeInkSolid }}
                        >
                          {foto.keep ? "Para revisar" : "¿Foto real?"}
                        </span>
                      )}
                      {form.fotos.length > 1 &&
                        (i === 0 ? (
                          <span className="absolute top-1 left-1 text-[11px] font-bold text-white rounded-full px-2 py-0.5" style={{ background: C.redSolid }}>
                            Principal
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleMakeMainPhoto(i)}
                            aria-label={`Hacer principal la foto ${i + 1}`}
                            title="Hacer principal"
                            className="absolute top-1 left-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                          >
                            <Star className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        ))}
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
                      className="flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-xl h-24 cursor-pointer text-[12px] text-center transition-colors"
                      style={{ borderColor: C.border, color: C.muted }}
                    >
                      <Camera className="w-4 h-4" />
                      {form.fotos.length === 0 ? "Subir foto" : "Agregar otra"}
                    </label>
                  )}
                </div>
                {form.fotos.map((foto, i) =>
                  foto.check?.dudosa && !foto.keep ? (
                    <div
                      key={`dudosa-${foto.dataUrl.slice(-24)}`}
                      role="alert"
                      className="mt-2 rounded-xl border p-3"
                      style={{ borderColor: C.orangeInkSolid, background: C.brandTintBg }}
                    >
                      <p className="text-[13px] font-bold" style={{ color: C.text }}>
                        {form.fotos.length > 1 ? `La foto ${i + 1} parece` : "Parece"}{" "}
                        {foto.check.tipo === "texto"
                          ? "un flyer o una imagen con mucho texto"
                          : foto.check.tipo === "captura"
                          ? "una captura de pantalla"
                          : foto.check.tipo === "ilustracion"
                            ? "una ilustración o imagen armada"
                            : "un cartel o flyer"}
                        .
                      </p>
                      <p className="text-[12px] mt-0.5" style={{ color: C.muted }}>
                        Subí una foto real de la mascota: Felpus compara fotos para encontrar coincidencias, y un flyer no
                        sirve para eso. El flyer para compartir lo arma Felpus solo, con QR, al publicar.
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => handleReplaceDudosa(i)}
                          className="text-[12px] font-bold text-white rounded-lg px-3 py-2"
                          style={{ background: C.redSolid }}
                        >
                          Cambiar foto
                        </button>
                        <button
                          type="button"
                          onClick={() => handleKeepDudosa(i)}
                          className="text-[12px] font-semibold rounded-lg px-3 py-2 border"
                          style={{ borderColor: C.border, color: C.text, background: C.surface }}
                        >
                          Es una foto real, seguir
                        </button>
                      </div>
                    </div>
                  ) : null
                )}
                <p className="text-[12px] mt-1.5" style={{ color: C.muted }}>
                  Subí distintos ángulos o poses — ayuda a un matching más preciso.
                </p>
                {visionStatus === "analyzing" && (
                  <p className="text-[12px] mt-1.5 flex items-center gap-1.5" style={{ color: C.muted }}>
                    <Loader2 className="w-3 h-3 animate-spin" /> Analizando la foto con IA...
                  </p>
                )}
                {visionStatus === "ai" && (
                  <p className="text-[12px] mt-1.5 flex items-center gap-1.5" style={{ color: C.green }}>
                    <Check className="w-3 h-3" /> Análisis visual con IA activado
                  </p>
                )}
                {/* visionStatus "basic" (sin IA de imágenes, solo color) no
                    muestra nada a propósito: era un mensaje técnico que
                    no le servía a quien está reportando. */}
              </div>

              {/* Zona: movida acá, justo después de la foto (antes estaba
                  después de especie/tamaño/raza/sexo/nombre/color/edad/peso,
                  el campo #10 del formulario) — auditoría UX mobile: "Foto →
                  ubicación → esencial → publicar", y la ubicación es la
                  segunda señal más fuerte para el matching después de la
                  foto. Además, arrancar temprano el botón "Ubicación" (GPS)
                  significa que esa espera ya terminó (o está por terminar)
                  para cuando la persona llega al resto del formulario, en
                  vez de hacerla esperar al final. */}
              <div>
                <label htmlFor="form-zona" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>
                  Zona / barrio <span style={{ color: C.red }}>*</span>
                </label>
                <div className="flex gap-2">
                  <ZonaAutocomplete
                    id="form-zona"
                    value={form.zona}
                    onManualChange={(zona) =>
                      // Si tipea a mano (en vez de elegir una sugerencia),
                      // ciudad/provincia de una selección anterior quedarían
                      // desactualizadas respecto del texto nuevo — se limpian
                      // acá, igual que ya se hacía implícitamente antes de
                      // que existieran estos dos campos.
                      setForm((f) => ({ ...f, zona, ciudad: "", provincia: "" }))
                    }
                    onSelectPlace={(zona, lat, lng, ciudad, provincia) => {
                      // Las sugerencias no pasan por el maxLength del input
                      // (ese límite solo aplica al fallback de texto plano) —
                      // sin este recorte, una dirección larga puede superar el
                      // límite de 100 caracteres de la base y tirar abajo la
                      // publicación entera con un error genérico.
                      setForm((f) => ({
                        ...f,
                        zona: zona.slice(0, 100),
                        ciudad: (ciudad || "").slice(0, 80),
                        provincia: (provincia || "").slice(0, 80),
                        ...(lat != null && lng != null ? { lat, lng } : {}),
                      }));
                      if (lat != null && lng != null) setGeoStatus("done");
                    }}
                    maxLength={100}
                    placeholder="Ej: Tres Cerritos"
                    className="felpus-input flex-1 min-w-0 border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
                    style={{ borderColor: bordeCampo("zona"), color: C.text }}
                  />
                  <button
                    type="button"
                    onClick={handleUseLocation}
                    className="shrink-0 flex items-center gap-1.5 px-3 rounded-lg border text-xs font-semibold bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
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
                  <p className="text-[12px] mt-1" style={{ color: C.red }}>{fieldErrors.zona}</p>
                )}
                {avisoFalta("zona")}
                <p className="text-[12px] mt-1" style={{ color: C.muted }}>
                  Cuanto más precisa, mejor la búsqueda. Marcá dónde se perdió o se vio, no tu casa.
                </p>
                {geoStatus === "done" && (
                  <p className="text-[12px] mt-1" style={{ color: C.green }}>Ubicación capturada — mejora mucho la precisión del match.</p>
                )}
                {geoStatus === "error" && (
                  <p className="text-[12px] mt-1" style={{ color: C.muted }}>
                    {geoErrorMessage} Mientras tanto se usa solo la zona escrita.
                  </p>
                )}
                <div className="mt-2">
                  {showMapPicker ? (
                    <MapPicker
                      lat={form.lat}
                      lng={form.lng}
                      onChange={setUbicacionDesdeCoordenadas}
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

              {/* Sexo + Color: los dos campos obligatorios que quedaban,
                  uno al lado del otro para que se sientan como un solo paso
                  en vez de dos separados. */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="form-sexo" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>
                    Sexo
                  </label>
                  <select
                    id="form-sexo"
                    value={form.sexo}
                    onChange={(e) => setForm((f) => ({ ...f, sexo: e.target.value }))}
                    className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
                    style={{ borderColor: C.border, color: C.text }}
                  >
                    <option value="">Sin dato</option>
                    {SEXO_OPTIONS.map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="form-color" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>
                    Color <span style={{ color: C.red }}>*</span>
                  </label>
                  <select
                    id="form-color"
                    value={form.color}
                    onChange={(e) => {
                      marcarTocado("color");
                      setForm((f) => ({ ...f, color: e.target.value }));
                    }}
                    className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
                    style={{ borderColor: bordeCampo("color"), color: C.text }}
                  >
                    <option value="">Elegir color...</option>
                    {COLOR_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {avisoFalta("color")}
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
                    className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
                    style={{ borderColor: fieldErrors.colorOtro ? C.red : C.border, color: C.text }}
                  />
                  {fieldErrors.colorOtro && (
                    <p className="text-[12px] mt-1" style={{ color: C.red }}>{fieldErrors.colorOtro}</p>
                  )}
                </div>
              )}

              {/* Especie + Tamaño: no son parte del checklist (nunca
                  bloquean publicar) pero se quedan en el camino rápido —
                  son 2 toques sin escribir nada, y pesan de verdad en el
                  matching. A diferencia de raza/nombre/edad/peso/fecha, que
                  sí pasan a la sección opcional de abajo. */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="form-especie" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>Especie</label>
                  <select
                    id="form-especie"
                    value={form.especie}
                    onChange={(e) => {
                      marcarTocado("especie");
                      setForm((f) => ({ ...f, especie: e.target.value }));
                    }}
                    className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
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
                    onChange={(e) => {
                      marcarTocado("tamano");
                      setForm((f) => ({ ...f, tamano: e.target.value }));
                    }}
                    className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
                    style={{ borderColor: C.border, color: C.text }}
                  >
                    <option value="chico">Chico</option>
                    <option value="mediano">Mediano</option>
                    <option value="grande">Grande</option>
                  </select>
                </div>
              </div>
              {aiSugeridos.length > 0 && (
                <p className="text-[12px] -mt-2 flex items-center gap-1" style={{ color: C.muted }}>
                  <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: C.orangeInk }} aria-hidden="true" />
                  {`Sugerido por la foto: ${aiSugeridos.map((k) => ({ especie: "especie", color: "color", tamano: "tamaño", raza: "raza" })[k]).join(", ")}. Podés cambiarlo.`}
                </p>
              )}

              <div>
                <label id="form-contacto-label" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>
                  Contacto <span style={{ color: C.red }}>*</span>
                </label>
                <p className="text-[12px] mb-2" style={{ color: C.muted }}>
                  Para que puedan avisarte si la reconocen. Completá al menos uno.
                </p>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="form-contacto-whatsapp" className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>
                      WhatsApp
                    </label>
                    {whatsappUsingSaved ? (
                      // Reutiliza el contacto de la última publicación desde
                      // este dispositivo (ver el efecto de montaje más
                      // arriba) en vez de arrancar de un input vacío otra
                      // vez — mismo dato que ya se manda a la base con cada
                      // reporte, no expone nada nuevo.
                      <div
                        className="felpus-input flex items-center justify-between gap-2 border rounded-lg px-3 py-2"
                        style={{ borderColor: C.border }}
                      >
                        <span className="flex items-center gap-1.5 text-sm min-w-0" style={{ color: C.text }}>
                          <span className="truncate">{savedWhatsappDisplay || "..."}</span>
                          <Check className="w-3.5 h-3.5 shrink-0" style={{ color: C.green }} />
                        </span>
                        <button
                          type="button"
                          onClick={() => setWhatsappUsingSaved(false)}
                          className="shrink-0 text-xs font-bold underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40 rounded"
                          style={{ color: C.text }}
                        >
                          Cambiar
                        </button>
                      </div>
                    ) : (
                      <PhoneInput
                        id="form-contacto-whatsapp"
                        country={form.contactoWhatsappCountry}
                        onCountryChange={(code) => setForm((f) => ({ ...f, contactoWhatsappCountry: code }))}
                        value={form.contactoWhatsapp}
                        onChange={(text) => setForm((f) => ({ ...f, contactoWhatsapp: text }))}
                        onParsed={setWhatsappParsed}
                        forceTouched={whatsappForceTouched}
                      />
                    )}
                  </div>
                  <div>
                    <label htmlFor="form-contacto-email" className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>
                      Email
                    </label>
                    <input
                      id="form-contacto-email"
                      type="email"
                      aria-label="Email de contacto"
                      aria-describedby="form-contacto-label"
                      value={form.contactoEmail}
                      onChange={(e) => setForm((f) => ({ ...f, contactoEmail: e.target.value }))}
                      maxLength={120}
                      placeholder="tu@email.com"
                      className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
                      style={{ borderColor: fieldErrors.contacto ? C.red : C.border, color: C.text }}
                    />
                    {form.contactoEmail.trim() && (
                      <label className="flex items-start gap-2 mt-2 text-[12px] leading-snug cursor-pointer" style={{ color: C.text }}>
                        <input
                          type="checkbox"
                          checked={form.avisosEmail !== false}
                          onChange={(e) => setForm((f) => ({ ...f, avisosEmail: e.target.checked }))}
                          className="mt-0.5 w-4 h-4 shrink-0"
                        />
                        <span>
                          Avisarme por email solo si hay novedades: una coincidencia muy probable o, cada 30 días, &ldquo;¿hubo novedades?&rdquo;.
                        </span>
                      </label>
                    )}
                  </div>
                </div>
                {fieldErrors.contacto && (
                  <p className="text-[12px] mt-1.5" style={{ color: C.red }}>{fieldErrors.contacto}</p>
                )}
              </div>

              {/* A partir de acá: todo lo que no bloquea publicar (raza,
                  nombre, edad, peso, fecha, "Detalles para reconocerlo")
                  queda colapsado detrás de un solo toque — antes había que
                  scrollear estos 4 campos + 3 preguntas de chips + un
                  textarea, TODOS con el mismo peso visual que Foto/Zona/
                  Sexo/Color/Contacto, aunque el propio checklist de arriba
                  ya sabe que ninguno de ellos es necesario para publicar.
                  moreDetailsExpanded (ver más arriba) se abre solo si ya
                  hay algo cargado ahí adentro (ej. texto que llegó
                  precargado desde el share-target), para no esconder datos
                  que la persona ya escribió. */}
              {!moreDetailsExpanded && (
                <button
                  type="button"
                  onClick={() => setShowMoreDetails(true)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2.5 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                  style={{ borderColor: C.border, color: C.muted }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar más detalles (raza, edad, características...) — opcional
                </button>
              )}

              <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${moreDetailsExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden">
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="form-nombre" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>
                        {reportKind === "encontrada" ? "Nombre (si tiene chapita)" : "Nombre de la mascota"}
                      </label>
                      <input
                        id="form-nombre"
                        type="text"
                        value={form.nombre}
                        onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                        maxLength={60}
                        placeholder={reportKind === "encontrada" ? "Si no lo sabés, dejalo vacío" : "Ej: Luna"}
                        className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
                        style={{ borderColor: C.border, color: C.text }}
                      />
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
                          className="shrink-0 flex items-center gap-1 text-[12px] font-bold px-3 py-2 min-h-[36px] rounded-full border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
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
                        placeholder={
                          form.especie === "perro"
                            ? "Ej: Labrador, Caniche..."
                            : form.especie === "gato"
                              ? "Ej: Siamés, Persa..."
                              : "Opcional"
                        }
                        className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
                        style={{ borderColor: C.border, color: C.text }}
                      />
                      <p className="text-[12px] mt-1" style={{ color: C.muted }}>
                        {form.especie === "gato"
                          ? "En gatos la raza pesa poco en la búsqueda — \"No sé\" es una respuesta perfectamente válida, no te compliques."
                          : "Si no la sabés, dejalo en blanco o tocá \"No sé la raza\" — no es obligatorio."}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="form-edad" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>Edad aproximada</label>
                        <select
                          id="form-edad"
                          value={form.edad}
                          onChange={(e) => setForm((f) => ({ ...f, edad: e.target.value }))}
                          className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
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
                          className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
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
                      <label htmlFor="form-fecha" className="text-xs font-bold mb-1.5 block" style={{ color: C.text }}>{fechaLabel(reportKind)}</label>
                      <input
                        id="form-fecha"
                        type="date"
                        value={form.fecha}
                        onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                        className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
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
                    <div>
                      <p className="text-sm font-extrabold" style={{ color: C.text }}>Detalles para reconocerlo</p>
                      <p className="text-[12px] mt-0.5" style={{ color: C.muted }}>
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
                      <p className="text-[12px] mb-1.5" style={{ color: C.muted }}>Elegí una opción o contanos algo particular.</p>
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
                            <p className="text-[12px] font-bold mb-1.5" style={{ color: C.text }}>¿Dónde tiene la mancha?</p>
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
                                <p className="text-[12px] font-bold mb-1.5" style={{ color: C.text }}>¿De qué color? (opcional)</p>
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
                            onClick={toggleDictation}
                            aria-pressed={dictating}
                            aria-label={dictating ? "Dejar de dictar" : "Dictar por voz"}
                            className="shrink-0 flex items-center gap-1 text-[12px] font-bold px-3 py-2 min-h-[36px] rounded-full border disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                            style={dictating ? { background: C.redSolid, color: "#fff", borderColor: C.redSolid } : { color: C.text, borderColor: C.border, background: C.surface }}
                          >
                            {dictating ? <Square className="w-3 h-3" fill="currentColor" /> : <Mic className="w-3 h-3" />}
                            {dictating ? "Escuchando… tocá para terminar" : "Dictar"}
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
                        className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)] resize-none"
                        style={{ borderColor: C.border, color: C.text }}
                      />
                    </div>

                    {/* Vista previa — a diferencia de la versión anterior, sólo
                        aparece cuando hay algo propio que mostrar (no la base
                        automática sola), y es deliberadamente compacta: no debe
                        sentirse como "otro campo más" del formulario. */}
                    <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${hasMeaningfulDetails ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                      <div className="overflow-hidden">
                        <div className="rounded-lg px-3 py-2 text-[12px] border flex items-start gap-1.5" style={{ background: C.surfaceSubtle, borderColor: C.border, color: C.muted }}>
                          <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
                          <p>
                            <span className="font-bold" style={{ color: C.text }}>Vista previa: </span>
                            {form.descripcion}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Posible duplicado (duplicates.js): aviso, nunca un bloqueo —
                  Publicar sigue funcionando igual. */}
              {dupVisible && (
                <div className="rounded-xl border p-3 flex gap-3" style={{ borderColor: C.border, background: C.surfaceSubtle }} role="status">
                  {dupVisible.report.foto && (
                    <div className="relative w-14 h-14 rounded-lg overflow-hidden shrink-0" style={{ background: C.surfaceMuted }}>
                      <Image src={dupVisible.report.foto} alt={reportPhotoAlt(dupVisible.report)} fill sizes="56px" className="object-cover" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold" style={{ color: C.text }}>{duplicateMessage(dupVisible.kind).title}</p>
                    <p className="text-[12px] truncate" style={{ color: C.text }}>
                      {petTitle(dupVisible.report)} · {zonaConCiudad(dupVisible.report)}
                    </p>
                    <p className="text-[12px] leading-snug mt-0.5" style={{ color: C.muted }}>{duplicateMessage(dupVisible.kind).body}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => setDetailReport(dupVisible.report)}
                        className="min-h-[36px] px-3 rounded-lg text-[12px] font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                        style={{ background: C.emphasisBg }}
                      >
                        {dupVisible.propio ? "Ver mi reporte" : "Ver y aportar datos"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDupDescartado(dupVisible.report.id)}
                        className="min-h-[36px] px-3 rounded-lg border text-[12px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                        style={{ borderColor: C.border, color: C.text, background: C.surface }}
                      >
                        No es la misma
                      </button>
                    </div>
                  </div>
                </div>
              )}

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
              <p className="text-[11px] text-center -mt-2" style={{ color: C.muted }}>
                +{reportKind === "perdida" ? PUNTOS_PERDIDA : PUNTOS_ENCONTRADA} huellitas por este reporte · queda visible para todos.
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
                    <Image src={PAW_MAGNIFIER} alt="" fill unoptimized className="object-contain" />
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
                        +{matchResult.source.tipo === "perdida" ? PUNTOS_PERDIDA : PUNTOS_ENCONTRADA} huellitas
                      </span>
                      )
                    </p>
                  </div>
                  <ReportCard report={matchResult.source} onOpenDetail={openReportDetail} />
                  {isPushSupported() && pushSubState !== "active" && (
                    <button
                      type="button"
                      onClick={() => handleActivatePush(matchResult.source.id, matchResult.source.pushToken)}
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
                        style={{ borderColor: m.report.resuelto ? C.successBorder : C.border }}
                      >
                        <button
                          type="button"
                          onClick={() => openReportDetail(m.report)}
                          className="w-full flex items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40 rounded-xl"
                        >
                          <MatchScoreRing score={m.score} />
                          <Image src={m.report.foto} alt={reportPhotoAlt(m.report)} width={64} height={64} loading="lazy" className="w-16 h-16 rounded-xl object-cover bg-[var(--felpus-surface-muted)] dark:bg-[var(--felpus-dark-muted-surface)] shrink-0" />
                          <div className="min-w-0 flex-1">
                            {m.report.resuelto ? (
                              <Badge tipo={m.report.tipo} resuelto />
                            ) : (
                              <Badge tipo={m.report.tipo} />
                            )}
                            <p className="text-sm font-semibold mt-1 truncate" style={{ color: C.text }}>{petTitle(m.report)}</p>
                            <p className="text-[12px] flex items-center gap-1" style={{ color: C.muted }}>
                              <MapPin className="w-3 h-3" /> {zonaConCiudad(m.report)} · {m.distanceLabel}
                            </p>
                            <p className="text-[11px] font-semibold" style={{ color: scoreLabel(m.score, C).color }}>{scoreLabel(m.score, C).text}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 shrink-0" style={{ color: C.muted }} />
                        </button>
                        {/* Desglose: qué coincide y qué no, no solo el % —
                            ayuda a decidir sin tener que abrir el detalle.
                            No depende de ningún estado nuevo: matchBreakdown
                            es una función pura sobre los mismos dos reportes
                            que ya calcularon el score. */}
                        {/* "Ver comparación" cambia los chips por la tarjeta
                            completa (fotos, una fila por criterio y el %). */}
                        {comparingId === m.report.id ? (
                          <MatchScorecard source={matchResult.source} match={m} />
                        ) : (
                          <MatchBreakdownChips items={matchBreakdown(matchResult.source, m.report)} />
                        )}
                        {!m.report.resuelto && !matchResult.source.resuelto && (
                          <div className="mt-2 pt-2 border-t flex items-center flex-wrap gap-x-3 gap-y-1.5" style={{ borderColor: C.border }}>
                            {confirmingId === m.report.id ? (
                              <div className="flex items-center gap-2 w-full">
                                <span className="text-[12px] flex-1" style={{ color: C.muted }}>¿Es ella/él?</span>
                                <button
                                  onClick={() =>
                                    markResolvedAndReward({
                                      repObjs: [matchResult.source, m.report],
                                      bonusFor: [
                                        { userId: matchResult.source.userId, displayName: matchResult.source.nickname, reportId: matchResult.source.id },
                                        { userId: m.report.userId, displayName: m.report.nickname, reportId: m.report.id },
                                      ],
                                    })
                                  }
                                  disabled={resolvingId === matchResult.source.id}
                                  className="text-[12px] font-bold text-white rounded-lg px-3 py-2 disabled:opacity-60"
                                  style={{ background: C.greenSolid }}
                                >
                                  {resolvingId === matchResult.source.id ? "Confirmando…" : "Sí, confirmar"}
                                </button>
                                <button onClick={() => setConfirmingId(null)} className="text-[12px] font-semibold px-2 py-2" style={{ color: C.muted }}>
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <>
                                <button onClick={() => handleConfirmTrigger(matchResult.source, m.report.id)} className="text-[12px] font-bold flex items-center gap-1 min-h-[40px]" style={{ color: confirmButtonColor(matchResult.source) }}>
                                  {confirmButtonContent(matchResult.source, "¡Es ella/él! Confirmar reencuentro")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setComparingId((prev) => (prev === m.report.id ? null : m.report.id))}
                                  className="text-[12px] font-semibold flex items-center gap-1 min-h-[40px]"
                                  style={{ color: C.text }}
                                >
                                  <Images className="w-3 h-3" /> {comparingId === m.report.id ? "Ocultar comparación" : "Ver comparación"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => dismissMatch(m.report.id)}
                                  className="text-[12px] font-semibold flex items-center gap-1 min-h-[40px]"
                                  style={{ color: C.muted }}
                                >
                                  <X className="w-3 h-3" /> Descartar
                                </button>
                              </>
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

        {/* EXPLORAR — se queda montado (oculto por CSS) después de la primera
            visita en vez de destruirse al cambiar de pestaña, para no volver
            a facturar una carga de Google Maps por cada ida y vuelta a esta
            pestaña dentro de la misma sesión. Ver comentario de
            exploreVisited más arriba. */}
        {exploreVisited && (
          <div
            key="explorar"
            className={`max-w-2xl lg:max-w-6xl mx-auto space-y-4 felpus-fadein ${activeTab === "explorar" ? "" : "hidden"}`}
          >
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.muted }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por zona, nombre o color"
                aria-label="Buscar por zona, nombre, color o descripción"
                className="felpus-input w-full border rounded-lg pl-9 pr-3 py-2 text-sm bg-white dark:bg-[var(--felpus-dark-card)]"
                style={{ borderColor: C.border, color: C.text }}
              />
            </div>

            <div className="flex gap-2">
              <select
                value={filterTipo}
                onChange={(e) => setFilterTipo(e.target.value)}
                aria-label="Filtrar por tipo de reporte"
                className="felpus-input flex-1 min-w-0 border rounded-lg px-3 py-2 text-sm bg-white dark:bg-[var(--felpus-dark-card)]"
                style={{ borderColor: C.border, color: C.text }}
              >
                <option value="todos">Tipo: todos</option>
                <option value="perdida">Solo perdidas</option>
                <option value="encontrada">Solo encontradas</option>
                <option value="resuelto">Solo reencontradas</option>
              </select>
              <select
                value={filterEspecie}
                onChange={(e) => setFilterEspecie(e.target.value)}
                aria-label="Filtrar por especie"
                className="felpus-input flex-1 min-w-0 border rounded-lg px-3 py-2 text-sm bg-white dark:bg-[var(--felpus-dark-card)]"
                style={{ borderColor: C.border, color: C.text }}
              >
                <option value="todos">Especie: todas</option>
                <option value="perro">Perros</option>
                <option value="gato">Gatos</option>
                <option value="otro">Otros</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSortBy("recientes")}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 min-h-[40px] text-xs font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={sortBy === "recientes" ? { background: C.ink, color: C.cream, borderColor: C.ink } : { color: C.muted, borderColor: C.border, background: C.surface }}
              >
                Más recientes
              </button>
              <button
                onClick={() => (myLocation ? setSortBy("cercania") : handleLocateMe())}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 min-h-[40px] text-xs font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={sortBy === "cercania" ? { background: C.ink, color: C.cream, borderColor: C.ink } : { color: C.muted, borderColor: C.border, background: C.surface }}
              >
                {locatingMe ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
                Más cercanas
              </button>
            </div>

            {/* En desktop (lg+) la lista y el mapa se muestran lado a lado
                (ver más abajo), así que este toggle deja de tener sentido —
                aprovecha el espacio ancho en vez de forzar a elegir una vista. */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExploreView("lista")}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 min-h-[40px] text-xs font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={exploreView === "lista" ? { background: C.ink, color: C.cream, borderColor: C.ink } : { color: C.muted, borderColor: C.border, background: C.surface }}
              >
                Lista
              </button>
              <button
                type="button"
                onClick={() => {
                  // La grilla es "lo más cerca primero": pide la ubicación
                  // si todavía no la tiene (handleLocateMe ya ordena por
                  // cercanía al recibirla).
                  setExploreView("grilla");
                  if (myLocation) setSortBy("cercania");
                  else if (!locatingMe) handleLocateMe();
                }}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 min-h-[40px] text-xs font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={exploreView === "grilla" ? { background: C.ink, color: C.cream, borderColor: C.ink } : { color: C.muted, borderColor: C.border, background: C.surface }}
              >
                <LayoutGrid className="w-3.5 h-3.5" /> Grilla
              </button>
              <button
                type="button"
                onClick={() => setExploreView("mapa")}
                className="lg:hidden flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 min-h-[40px] text-xs font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={exploreView === "mapa" ? { background: C.ink, color: C.cream, borderColor: C.ink } : { color: C.muted, borderColor: C.border, background: C.surface }}
              >
                <MapPin className="w-3.5 h-3.5" /> Mapa
              </button>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(true)}
                className="flex items-center gap-1.5 text-xs font-semibold py-2 pr-2 min-h-[40px]"
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
                filterRaza={filterRaza}
                setFilterRaza={setFilterRaza}
                filterSexo={filterSexo}
                setFilterSexo={setFilterSexo}
                filterEspecie={filterEspecie}
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
                {filterTipo === "resuelto"
                  ? `${filteredReports.length} ${filteredReports.length === 1 ? "mascota reencontrada" : "mascotas reencontradas"}`
                  : `${filteredReports.length} ${filteredReports.length === 1 ? "reporte encontrado" : "reportes encontrados"}`}
              </p>
            )}

            {/* Desde lg (escritorio) la lista y el mapa se muestran siempre
                lado a lado — abajo de eso, cada columna respeta el toggle
                Lista/Mapa como antes. El mapa además solo se monta si está
                activo o si ya estamos en desktop, para no gastar llamadas a
                la API de Google en mobile cuando nunca se abre esa vista.
                Ese primer montaje en desktop es 1 sola carga facturable por
                sesión (no una por cada ida y vuelta a esta pestaña) gracias
                a exploreVisited, ver comentario donde se declara. */}
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-5 lg:items-start">
              <div className={exploreView === "mapa" ? "hidden lg:block" : ""}>
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
                    {filterTipo === "resuelto" ? (
                      <>
                        <p className="font-semibold" style={{ color: C.text }}>Todavía no hay reencuentros con estos filtros.</p>
                        <p className="mt-1">Probá con otros filtros.</p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold" style={{ color: C.text }}>Todavía no hay reportes por acá.</p>
                        <p className="mt-1">Probá con otros filtros, o sé la primera persona en publicar uno.</p>
                      </>
                    )}
                  </div>
                )}

            {exploreView === "grilla" && (
              <>
                {sortBy !== "cercania" && !locatingMe && (
                  <p className="text-[12px] mb-2" style={{ color: C.muted }}>
                    Sin tu ubicación se ordenan por las más recientes.{" "}
                    <button type="button" onClick={handleLocateMe} className="font-bold underline" style={{ color: C.text }}>
                      Usar mi ubicación
                    </button>
                  </p>
                )}
                <ReportGrid reports={visibleReports} onOpen={openReportDetail} />
              </>
            )}
            <div className={exploreView === "grilla" ? "hidden" : "space-y-3"}>
              {visibleReports.map((r) => r.resuelto ? (
                // Reencontrada (filtro "Solo reencontradas"): misma tarjeta que
                // la sección "Reencuentros felices", sin coincidencias ni
                // "Marcar como reencontrada", que ya no aplican.
                <ReportCard key={r.id} report={r} onOpenDetail={openReportDetail} />
              ) : (
                <ReportCard
                  key={r.id}
                  report={r}
                  onOpenDetail={openReportDetail}
                  saved={savedReportIds.has(r.id)}
                  onToggleSaved={r.userId === user?.id ? undefined : handleToggleSaved}
                >
                  <button
                    onClick={() => toggleCardMatches(r)}
                    className="w-full flex items-center justify-between px-3 py-2.5 border-t text-xs font-semibold"
                    style={matchToggleStyle(r)}
                  >
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      {matchToggleLabel(r)}
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
                          className="w-full text-left bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)] rounded-xl p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="scale-75 -m-2">
                              <MatchScoreRing score={m.score} />
                            </div>
                            <Image src={m.report.foto} alt={reportPhotoAlt(m.report)} width={40} height={40} loading="lazy" className="w-10 h-10 rounded-lg object-cover bg-white dark:bg-[var(--felpus-dark-card)]" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold truncate" style={{ color: C.text }}>{petTitle(m.report)} · {zonaConCiudad(m.report)}</p>
                              <p className="text-[11px]" style={{ color: C.muted }}>{m.distanceLabel}</p>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: C.muted }} />
                          </div>
                          <MatchBreakdownChips items={matchBreakdown(r, m.report)} />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: C.border }}>
                    {confirmingId === r.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] flex-1" style={{ color: C.muted }}>¿Confirmás el reencuentro?</span>
                        <button
                          onClick={() => markResolvedAndReward({ repObjs: [r], bonusFor: [{ userId: r.userId, displayName: r.nickname, reportId: r.id }] })}
                          disabled={resolvingId === r.id}
                          className="text-[12px] font-bold text-white rounded-lg px-3 py-2 disabled:opacity-60"
                          style={{ background: C.greenSolid }}
                        >
                          {resolvingId === r.id ? "Confirmando…" : "Sí, ya está en casa"}
                        </button>
                        <button onClick={() => setConfirmingId(null)} className="text-[12px] font-semibold px-2 py-2" style={{ color: C.muted }}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <button onClick={() => handleConfirmTrigger(r)} className="text-[12px] font-bold flex items-center gap-1 min-h-[40px]" style={{ color: confirmButtonColor(r) }}>
                          {confirmButtonContent(r, "Marcar como reencontrada")}
                        </button>
                        <ShareButton
                          report={r}
                          className="text-[12px] font-bold flex items-center gap-1 min-h-[40px]"
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
                      <p className="text-[12px]" style={{ color: C.muted }}>
                        Algunos reportes no tienen ubicación exacta marcada en el mapa y no aparecen acá — probá la
                        vista de lista para verlos todos.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Con "Solo reencontradas" la lista de arriba ya es esto mismo. */}
            {resueltas.length > 0 && filterTipo !== "resuelto" && (
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
            <h2 className="felpus-display text-2xl text-center pt-1" style={{ color: C.text }}>
              Colaboradores
            </h2>

            {user ? (
              <>
                <RankingMeCard
                  me={myRank}
                  name={profile?.nickname || myRank?.nickname || googleDisplayName || "Vos"}
                  avatarUrl={myAvatarUrl}
                  ubicacion={formatUbicacion(profile || myRank)}
                />
                {myRank ? (
                  <RankingStatTiles me={myRank} />
                ) : (
                  <p className="text-sm text-center px-2" style={{ color: C.muted }}>
                    Reportá una mascota o confirmá un reencuentro para sumar huellitas y aparecer en el ranking.
                  </p>
                )}
                {/* Solo con la migración 20261027_02 corrida (si no, null). */}
                {myReferrals && (
                  <InviteCard
                    link={referralLink(window.location.origin, user.id)}
                    referrals={myReferrals}
                    onCopied={() => pushToast("success", "Link copiado")}
                  />
                )}
                <PointsHistory history={pointsHistory} myPoints={myRank?.points} />
              </>
            ) : (
              <div className="text-sm bg-white dark:bg-[var(--felpus-dark-card)] rounded-3xl p-4 text-center border" style={{ color: C.muted, borderColor: C.border }}>
                <button onClick={handleGoogleLogin} className="font-bold underline py-2" style={{ color: C.red }}>
                  Iniciá sesión con Google
                </button>{" "}
                para ver tu posición y tus huellitas.
              </div>
            )}

            <div className="pt-2 px-1">
              <h3 className="text-lg font-bold" style={{ color: C.text }}>Ranking general</h3>
              <p className="text-[12px]" style={{ color: C.muted }}>
                Huellitas por reportar mascotas y, sobre todo, por confirmar reencuentros reales.
              </p>
            </div>

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
                <p className="font-semibold" style={{ color: C.text }}>Todavía nadie sumó huellitas.</p>
                <p className="mt-1">¡Sé la primera persona de la lista!</p>
              </div>
            )}

            <RankingList
              items={leaderboard}
              myId={user?.id}
              myAvatarUrl={myAvatarUrl}
              heartedIds={heartedIds}
              poppingHeartId={poppingHeartId}
              onSendHeart={handleSendHeart}
              onOpenProfile={(u, rank) => setProfileTarget({ u, rank })}
            />
            {profileTarget && (
              <ContributorSheet
                contributor={profileTarget.u}
                rank={profileTarget.rank}
                isMe={!!user && profileTarget.u.id === user.id}
                avatarUrl={profileTarget.u.avatar_url || (user && profileTarget.u.id === user.id ? myAvatarUrl : null)}
                onClose={() => setProfileTarget(null)}
                onSupport={(u, prefetched) => {
                  setProfileTarget(null);
                  setSupportTarget({ u, prefetched });
                }}
              />
            )}
            {supportTarget && (
              <SupportModal contributor={supportTarget.u} prefetched={supportTarget.prefetched} onClose={() => setSupportTarget(null)} />
            )}

            <div className="bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)] rounded-xl p-3.5 border text-[12px] space-y-1.5" style={{ borderColor: C.border, color: C.muted }}>
              <p className="font-bold text-xs mb-1" style={{ color: C.text }}>Cómo se suman huellitas</p>
              <p>+{PUNTOS_PERDIDA} huellitas · publicar una mascota perdida</p>
              <p>+{PUNTOS_ENCONTRADA} huellitas · publicar una mascota encontrada</p>
              <p>+{PUNTOS_REENCUENTRO} huellitas · confirmar un reencuentro real</p>
              <p>+{PUNTOS_BONO_ORIGINAL} huellitas · bono para quien reportó originalmente esa mascota</p>
              <p>+{PUNTOS_REFERIDO} huellitas · invitar a alguien que publica su primer reporte</p>
            </div>

            <div className="bg-[var(--felpus-surface-subtle)] rounded-xl p-3.5 border text-[12px]" style={{ borderColor: C.border, color: C.muted }}>
              <h3 className="font-bold text-xs mb-1.5" style={{ color: C.text }}>Cómo se ganan las insignias</h3>
              <ul className="space-y-1.5">
                {BADGES.map((b) => (
                  <li key={b.id} className="flex items-start gap-2">
                    <span aria-hidden="true">{b.icon}</span>
                    <span>
                      <span className="font-semibold" style={{ color: C.text }}>{b.label}</span> · {b.requisito}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2">Se ganan solas y no se pierden.</p>
            </div>

            {/* Donación — deliberadamente el último elemento de la pantalla,
                mismo tono discreto que el resto de esta sección (no es un
                banner llamativo, es un extra para quien ya está mirando el
                ranking de la comunidad). Link externo a Mercado Pago: la app
                no procesa el pago, solo abre la página en una pestaña nueva. */}
            <a
              href={DONATION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl p-3.5 border felpus-focus"
              style={{ borderColor: C.border, background: C.surface }}
            >
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{ background: C.emphasisBg }}
              >
                <Coffee className="w-4 h-4" style={{ color: C.orangeInk }} />
              </span>
              <span className="flex-1">
                <span className="block text-xs font-bold" style={{ color: C.text }}>
                  Felpus es gratis y sin publicidad
                </span>
                <span className="block text-[12px]" style={{ color: C.muted }}>
                  Si te sirvió, podés donar con Mercado Pago
                </span>
              </span>
              <ChevronRight className="w-4 h-4 shrink-0" style={{ color: C.muted }} />
            </a>
          </div>
        )}

        {/* Panel de administrador — no está en la navegación inferior a
            propósito (agregarla ahí desbalancearía el layout para las demás
            5000+ personas que no son admin). Se llega solo desde el ícono
            del header, visible únicamente para ADMIN_EMAIL. La barrera real
            no es esta condición de React (visual/UX), sino que cada RPC
            admin_* vuelve a chequear auth.email() del lado del servidor. */}
        {activeTab === "admin" && isAdmin && (
          <div className="max-w-2xl mx-auto px-4 pt-2 pb-8 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" style={{ color: C.orangeInk }} />
                <h2 className="felpus-display text-lg" style={{ color: C.text }}>Panel de administrador</h2>
              </div>
              {/* Descarga apodo/email/whatsapp de cada cuenta con login de
                  Google (admin_list_users en schema.sql) — no depende de
                  adminSection ni de loadAdminData, tiene su propio loading
                  (usersReportLoading) porque es un viaje de red aparte que
                  se puede pedir en cualquier momento. */}
              <button
                type="button"
                onClick={handleDownloadUsersReport}
                disabled={usersReportLoading}
                className="text-xs font-bold py-2 px-3 rounded-lg border flex items-center gap-1.5 disabled:opacity-60"
                style={{ color: C.text, borderColor: C.border, background: C.surface }}
              >
                {usersReportLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Informe de usuarios (CSV)
              </button>
            </div>

            <div className="flex gap-2">
              {[
                { id: "metricas", label: "Métricas" },
                { id: "denuncias", label: `Denuncias${adminFlags.length ? ` (${adminFlags.length})` : ""}` },
                { id: "reportes", label: "Reportes" },
                { id: "usuarios", label: "Usuarios" },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setAdminSection(s.id)}
                  className="flex-1 text-xs font-bold py-2 rounded-lg border"
                  style={
                    adminSection === s.id
                      ? { background: C.ink, color: C.cream, borderColor: C.ink }
                      : { color: C.text, borderColor: C.border, background: C.surface }
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>

            {adminLoading && (
              <div className="flex items-center justify-center gap-2 py-10 text-sm" style={{ color: C.muted }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
              </div>
            )}

            {!adminLoading && adminError && (
              <div
                className="rounded-xl p-3.5 border text-sm flex items-center justify-between gap-2 flex-wrap"
                style={{ borderColor: C.border, background: C.dangerBg, color: C.redDark }}
              >
                <span className="flex items-center gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" /> {adminError}</span>
                <button type="button" onClick={() => loadAdminData(true)} className="shrink-0 font-bold underline">
                  Reintentar
                </button>
              </div>
            )}

            {/* Antifraude (2026-10-26): señales por cuenta y banear. Carga sus
                propios datos al abrirse (ver AdminUsers). */}
            {adminSection === "usuarios" && (
              <AdminUsers
                onChanged={() => {
                  loadAdminData(true);
                  loadAll();
                }}
              />
            )}

            {!adminLoading && !adminError && adminSection === "metricas" && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Total reportes", adminMetrics?.total],
                  ["Perdidas", adminMetrics?.perdidas],
                  ["Encontradas", adminMetrics?.encontradas],
                  ["Reencontradas", adminMetrics?.resueltos],
                  ["Últimas 24h", adminMetrics?.last24h],
                  ["Últimos 7 días", adminMetrics?.last7d],
                  ["Colaboradores", adminMetrics?.contributors],
                  ["Ocultos por denuncia", adminMetrics?.ocultos],
                  ["Denuncias totales", adminMetrics?.flagsTotal],
                  ["Errores (24h)", adminMetrics?.errors24h],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl p-3 border" style={{ borderColor: C.border, background: C.surface }}>
                    <p className="text-[11px] uppercase font-bold" style={{ color: C.muted }}>{label}</p>
                    <p className="felpus-mono text-xl font-bold" style={{ color: C.text }}>{value ?? "–"}</p>
                  </div>
                ))}

                {/* Desgloses (especie/tamaño/sexo/edad/ubicación/raza) —
                    calculados en el cliente sobre adminAllReports, ver
                    computeAdminBreakdowns en matching.js. col-span-2 para
                    que cada tarjeta use todo el ancho de la grilla de 2
                    columnas de arriba, en vez de quedar apretada a la mitad. */}
                <div className="col-span-2">
                  <p className="text-xs font-bold mt-2 mb-2" style={{ color: C.text }}>
                    Desgloses ({adminBreakdowns.total} reporte{adminBreakdowns.total === 1 ? "" : "s"})
                  </p>
                </div>
                <div className="col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <AdminBreakdownCard title="Por especie" items={adminBreakdowns.porEspecie} />
                  <AdminBreakdownCard title="Por tamaño" items={adminBreakdowns.porTamano} />
                  <AdminBreakdownCard title="Por sexo" items={adminBreakdowns.porSexo} />
                  <AdminBreakdownCard title="Por edad" items={adminBreakdowns.porEdad} />
                  <AdminBreakdownCard title="Por provincia" items={adminBreakdowns.porProvincia} />
                  <AdminBreakdownCard title="Por ciudad" items={adminBreakdowns.porCiudad} />
                  <AdminBreakdownCard title="Razas más perdidas" items={adminBreakdowns.porRazaPerdida} />
                  <AdminBreakdownCard title="Razas más encontradas" items={adminBreakdowns.porRazaEncontrada} />
                </div>
              </div>
            )}

            {!adminLoading && !adminError && adminSection === "denuncias" && (
              adminFlags.length === 0 ? (
                <p className="text-sm text-center py-10" style={{ color: C.muted }}>No hay publicaciones denunciadas.</p>
              ) : (
                <div className="space-y-2">
                  {adminFlags.map((f) => (
                    <div
                      key={f.reportId}
                      role="button"
                      tabIndex={0}
                      onClick={() => openAdminFlaggedReportDetail(f.reportId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openAdminFlaggedReportDetail(f.reportId);
                        }
                      }}
                      // Mismo patrón que la fila de "Reportes" (ver más
                      // abajo): toda la tarjeta abre el detalle completo
                      // para poder ver la publicación denunciada antes de
                      // decidir, salvo la fila de botones de acción (tiene
                      // su propio stopPropagation).
                      className="rounded-xl p-3 border space-y-2 text-left cursor-pointer felpus-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                      style={{ borderColor: C.border, background: C.surface }}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-[var(--felpus-surface-muted)] dark:bg-[var(--felpus-dark-muted-surface)]">
                          <Image src={f.fotoUrl} alt="" fill sizes="48px" className="object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate" style={{ color: C.text }}>
                            {petTitle(f)}
                          </p>
                          <p className="text-xs truncate" style={{ color: C.muted }}>{zonaConCiudad(f)} · {f.tipo}</p>
                          <p className="text-[12px] mt-0.5 flex items-center gap-1" style={{ color: C.redDark }}>
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            {f.flagCount} denuncia{f.flagCount === 1 ? "" : "s"} · {f.distinctIps} IP{f.distinctIps === 1 ? "" : "s"} distinta{f.distinctIps === 1 ? "" : "s"}
                          </p>
                          <p className="text-[12px] mt-0.5 truncate" style={{ color: C.muted }}>
                            {f.reasons.map(reportFlagReasonLabel).join(" · ")}
                          </p>
                          {f.oculto && (
                            <span
                              className="inline-block mt-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: C.dangerBg, color: C.redDark }}
                            >
                              Oculta automáticamente
                            </span>
                          )}
                        </div>
                      </div>
                      {/* stopPropagation: sin esto, tocar cualquiera de
                          estos botones también dispara el onClick de la
                          tarjeta entera y abre el detalle por encima. */}
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleAdminToggleOculto({ id: f.reportId, oculto: f.oculto })}
                          disabled={adminBusyId === f.reportId}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg border disabled:opacity-60"
                          style={{ borderColor: C.border, color: C.text }}
                        >
                          {f.oculto ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          {f.oculto ? "Mostrar" : "Ocultar"}
                        </button>
                        {adminDeleteConfirmId === f.reportId ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleAdminDelete({ id: f.reportId, fotos: [{ url: f.fotoUrl }] })}
                              disabled={adminBusyId === f.reportId}
                              className="flex-1 text-xs font-bold py-2 rounded-lg text-white disabled:opacity-60 flex items-center justify-center"
                              style={{ background: C.redSolid }}
                            >
                              {adminBusyId === f.reportId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setAdminDeleteConfirmId(null)}
                              className="text-xs font-semibold px-2"
                              style={{ color: C.muted }}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setAdminDeleteConfirmId(f.reportId)}
                            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg text-white"
                            style={{ background: C.redSolid }}
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {!adminLoading && !adminError && adminSection === "reportes" && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={adminSearch}
                  onChange={(e) => setAdminSearch(e.target.value)}
                  placeholder="Buscar por nombre, zona, especie, color, apodo..."
                  className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
                  style={{ borderColor: C.border, color: C.text }}
                />
                <button
                  type="button"
                  onClick={() => setAdminSoloFotosDudosas((v) => !v)}
                  aria-pressed={adminSoloFotosDudosas}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold border"
                  style={
                    adminSoloFotosDudosas
                      ? { background: C.ink, color: C.cream, borderColor: C.ink }
                      : { color: C.muted, borderColor: C.border, background: C.surface }
                  }
                >
                  📷 Fotos para revisar ({adminFotosDudosasCount})
                </button>
                <p className="text-[12px]" style={{ color: C.muted }}>
                  {adminFilteredReports.length} de {adminAllReports.length} reportes
                  {adminFilteredReports.length > 200 ? " — mostrando los primeros 200" : ""}
                </p>
                {adminFilteredReports.slice(0, 200).map((r) => (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openReportDetail(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openReportDetail(r);
                      }
                    }}
                    // Toda la fila es clickeable para abrir el detalle
                    // completo (mismo DetailModal que ve cualquier usuario) —
                    // así se puede ver la publicación entera antes de decidir
                    // ocultarla o eliminarla, en vez de solo el nombre/zona
                    // recortados que entran en esta fila compacta. No es un
                    // <button> (los botones de Ocultar/Eliminar de al lado ya
                    // son <button> — anidar uno adentro de otro es HTML
                    // inválido), por eso lleva role="button" + manejo de
                    // teclado a mano.
                    className="rounded-xl p-3 border flex items-center gap-2.5 text-left cursor-pointer felpus-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                    style={{ borderColor: C.border, background: C.surface }}
                  >
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-[var(--felpus-surface-muted)] dark:bg-[var(--felpus-dark-muted-surface)]">
                      <Image src={r.foto} alt="" fill sizes="48px" className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: C.text }}>
                        {petTitle(r)}
                      </p>
                      <p className="text-xs truncate" style={{ color: C.muted }}>
                        {zonaConCiudad(r)} · {r.tipo}
                        {r.resuelto ? " · reencontrada" : ""}
                      </p>
                      {r.oculto && (
                        <span
                          className="inline-block mt-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: C.dangerBg, color: C.redDark }}
                        >
                          Oculta
                        </span>
                      )}
                      {tieneFotoDudosa(r) && (
                        <span
                          className="inline-block mt-1 ml-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: C.brandTintBg, color: C.orangeInk }}
                          title="Al publicar, la foto pareció un flyer, una captura o una ilustración"
                        >
                          📷 Foto para revisar
                        </span>
                      )}
                    </div>
                    {/* stopPropagation: sin esto, tocar Ocultar/Eliminar
                        también dispara el onClick de la fila entera y abre
                        el detalle por encima. */}
                    <div className="flex flex-col gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {adminDeleteConfirmId === r.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setAdminDeleteConfirmId(null)}
                            aria-label="Cancelar eliminación"
                            className="w-8 h-8 rounded-full flex items-center justify-center border"
                            style={{ borderColor: C.border }}
                          >
                            <X className="w-3.5 h-3.5" style={{ color: C.text }} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAdminDelete(r)}
                            disabled={adminBusyId === r.id}
                            aria-label="Confirmar eliminación"
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white disabled:opacity-60"
                            style={{ background: C.redSolid }}
                          >
                            {adminBusyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setAdminEditing(r)}
                            aria-label="Editar publicación"
                            title="Editar"
                            className="w-8 h-8 rounded-full flex items-center justify-center border"
                            style={{ borderColor: C.border }}
                          >
                            <Pencil className="w-3.5 h-3.5" style={{ color: C.text }} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAdminToggleOculto(r)}
                            disabled={adminBusyId === r.id}
                            aria-label={r.oculto ? "Mostrar publicación" : "Ocultar publicación"}
                            title={r.oculto ? "Mostrar" : "Ocultar"}
                            className="w-8 h-8 rounded-full flex items-center justify-center border disabled:opacity-60"
                            style={{ borderColor: C.border }}
                          >
                            {r.oculto ? <Eye className="w-3.5 h-3.5" style={{ color: C.text }} /> : <EyeOff className="w-3.5 h-3.5" style={{ color: C.text }} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => setAdminDeleteConfirmId(r.id)}
                            aria-label="Eliminar publicación"
                            className="w-8 h-8 rounded-full flex items-center justify-center border"
                            style={{ borderColor: C.border }}
                          >
                            <Trash2 className="w-3.5 h-3.5" style={{ color: C.redDark }} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* "Mi Felpus" — perfil personal + mascotas guardadas. Se llega
            desde el ícono del header (avatar/User), solo con sesión
            iniciada — invitados no tienen cuenta para guardar nada ni
            perfil que editar. */}
        {activeTab === "mifelpus" && user && (
          <div className="max-w-2xl mx-auto px-4 pt-2 pb-8 space-y-4">
            <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.surface }}>
              <div className="flex items-center gap-3">
                <div
                  className="w-14 h-14 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-lg font-bold text-white"
                  style={{ background: C.redSolid }}
                >
                  {myAvatarUrl ? (
                    <Image src={myAvatarUrl} alt="" unoptimized width={56} height={56} className="w-full h-full object-cover" />
                  ) : (
                    (profile?.nickname || googleDisplayName || user.email || "?")[0].toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold truncate" style={{ color: C.text }}>
                    {profile?.nickname || googleDisplayName || "Sin nombre"}
                  </p>
                  <p className="text-xs truncate" style={{ color: C.muted }}>{user.email}</p>
                  {profile?.whatsapp && <ProfileWhatsappLine value={profile.whatsapp} />}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMifelpusSection("perfil");
                  openEditProfile();
                }}
                className="mt-3 w-full flex items-center justify-center gap-1.5 border rounded-xl py-2 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                style={{ borderColor: C.border, color: C.text }}
              >
                <Pencil className="w-3.5 h-3.5" /> Editar perfil
              </button>
            </div>

            <div className="flex gap-2">
              {[
                { id: "reportes", label: "Mis reportes" },
                { id: "guardadas", label: `Guardadas${savedReportsList.length ? ` (${savedReportsList.length})` : ""}` },
                { id: "perfil", label: "Perfil" },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setMifelpusSection(s.id)}
                  className="flex-1 text-xs font-bold py-2 rounded-lg border"
                  style={
                    mifelpusSection === s.id
                      ? { background: C.ink, color: C.cream, borderColor: C.ink }
                      : { color: C.text, borderColor: C.border, background: C.surface }
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>

            {mifelpusSection === "reportes" && (
              <div className="space-y-3">
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {[
                    { id: "todas", label: "Todas" },
                    { id: "perdida", label: "Perdidas" },
                    { id: "encontrada", label: "Encontradas" },
                    { id: "resuelto", label: "Reencontradas" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setMifelpusFilter(f.id)}
                      className="shrink-0 text-[12px] font-bold px-2.5 py-1.5 rounded-full border"
                      style={
                        mifelpusFilter === f.id
                          ? { background: C.ink, color: C.cream, borderColor: C.ink }
                          : { color: C.text, borderColor: C.border, background: C.surface }
                      }
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {myReportsFiltered.length === 0 ? (
                  <div className="text-center py-10 space-y-3">
                    <p className="text-sm" style={{ color: C.muted }}>
                      {myReports.length === 0 ? "Todavía no publicaste ninguna mascota." : "No hay reportes con ese filtro."}
                    </p>
                    {myReports.length === 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setReportKind("perdida");
                          goToTab("reportar");
                        }}
                        className="rounded-xl px-4 py-2.5 text-sm font-bold text-white"
                        style={{ background: C.redSolid }}
                      >
                        Reportar mascota
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myReportsFiltered.map((r) => (
                      <ReportCard key={r.id} report={r} onOpenDetail={openReportDetail}>
                        {r.inactivo && !r.resuelto && (
                          <div className="px-3 py-2.5 border-t flex items-center justify-between gap-2 flex-wrap" style={{ borderColor: C.border }}>
                            <span className="text-[12px]" style={{ color: C.muted }}>
                              Pausamos las alertas de este reporte por inactividad.
                            </span>
                            <button
                              type="button"
                              onClick={() => renewReport(r.id)}
                              className="text-[12px] font-bold text-white rounded-lg px-2.5 py-1"
                              style={{ background: C.redSolid }}
                            >
                              Seguir buscando
                            </button>
                          </div>
                        )}
                        {!r.resuelto && (
                          <button
                            type="button"
                            onClick={() => toggleCardMatches(r)}
                            className="w-full flex items-center justify-between px-3 py-2.5 border-t text-xs font-semibold"
                            style={matchToggleStyle(r)}
                          >
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5" />
                              {matchToggleLabel(r)}
                            </span>
                            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expandedCard === r.id ? "rotate-90" : ""}`} />
                          </button>
                        )}
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
                              <div key={m.report.id} className="space-y-1">
                              <button
                                type="button"
                                onClick={() => openReportDetail(m.report)}
                                className="w-full text-left bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)] rounded-xl p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className="scale-75 -m-2">
                                    <MatchScoreRing score={m.score} />
                                  </div>
                                  <Image
                                    src={m.report.foto}
                                    alt={reportPhotoAlt(m.report)}
                                    width={40}
                                    height={40}
                                    loading="lazy"
                                    className="w-10 h-10 rounded-lg object-cover bg-white dark:bg-[var(--felpus-dark-card)]"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold truncate" style={{ color: C.text }}>
                                      {petTitle(m.report)} · {zonaConCiudad(m.report)}
                                    </p>
                                    <p className="text-[11px]" style={{ color: C.muted }}>{m.distanceLabel}</p>
                                  </div>
                                  <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: C.muted }} />
                                </div>
                                <MatchBreakdownChips items={matchBreakdown(r, m.report)} />
                              </button>
                              <div className="flex items-center gap-3 px-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    recordMatchDecision(r, m.report, "confirmado");
                                    handleConfirmTrigger(r);
                                  }}
                                  className="text-[12px] font-bold flex items-center gap-1 min-h-[40px]"
                                  style={{ color: C.successText }}
                                >
                                  <Check className="w-3 h-3" /> {r.tipo === "perdida" ? "Es mi mascota" : "Es el dueño"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => discardCardMatch(r, m.report)}
                                  className="text-[12px] font-semibold flex items-center gap-1 min-h-[40px]"
                                  style={{ color: C.muted }}
                                >
                                  <X className="w-3 h-3" /> No es
                                </button>
                              </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="px-3 pb-3 pt-1 border-t flex items-center justify-between gap-2 flex-wrap" style={{ borderColor: C.border }}>
                          {!r.resuelto &&
                            (confirmingId === r.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[12px]" style={{ color: C.muted }}>¿Confirmás?</span>
                                <button
                                  onClick={() => markResolvedAndReward({ repObjs: [r], bonusFor: [{ userId: r.userId, displayName: r.nickname, reportId: r.id }] })}
                                  disabled={resolvingId === r.id}
                                  className="text-[12px] font-bold text-white rounded-lg px-3 py-2 disabled:opacity-60"
                                  style={{ background: C.greenSolid }}
                                >
                                  {resolvingId === r.id ? "Confirmando…" : "Sí, ya está en casa"}
                                </button>
                                <button onClick={() => setConfirmingId(null)} className="text-[12px] font-semibold px-2 py-2" style={{ color: C.muted }}>
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => handleConfirmTrigger(r)} className="text-[12px] font-bold flex items-center gap-1 min-h-[40px]" style={{ color: confirmButtonColor(r) }}>
                                {confirmButtonContent(r, "Marcar como reencontrada")}
                              </button>
                            ))}
                          <ShareButton report={r} className="text-[12px] font-bold flex items-center gap-1 min-h-[40px]" style={{ color: C.text }}>
                            <Share2 className="w-3.5 h-3.5" /> Compartir
                          </ShareButton>
                          {myReportsDeleteConfirmId === r.id ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  handleDeleteReport(r);
                                  setMyReportsDeleteConfirmId(null);
                                }}
                                className="text-[12px] font-bold text-white rounded-lg px-2 py-1"
                                style={{ background: C.redSolid }}
                              >
                                Confirmar
                              </button>
                              <button type="button" onClick={() => setMyReportsDeleteConfirmId(null)} className="text-[12px] font-semibold" style={{ color: C.muted }}>
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setMyReportsDeleteConfirmId(r.id)}
                              className="text-[12px] font-bold flex items-center gap-1 min-h-[40px]"
                              style={{ color: C.redDark }}
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Eliminar
                            </button>
                          )}
                        </div>
                      </ReportCard>
                    ))}
                  </div>
                )}
              </div>
            )}

            {mifelpusSection === "guardadas" && (
              savedReportsList.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <p className="text-sm" style={{ color: C.muted }}>Todavía no guardaste ninguna mascota.</p>
                  <p className="text-xs" style={{ color: C.muted }}>Guardá reportes que quieras seguir o revisar más tarde.</p>
                  <button
                    type="button"
                    onClick={() => goToTab("explorar")}
                    className="rounded-xl px-4 py-2.5 text-sm font-bold text-white mt-2"
                    style={{ background: C.redSolid }}
                  >
                    Explorar mascotas
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedReportsList.map((r) => (
                    <ReportCard key={r.id} report={r} onOpenDetail={openReportDetail} saved onToggleSaved={handleToggleSaved}>
                      <div className="px-3 pb-3 pt-1 border-t flex items-center justify-between gap-2" style={{ borderColor: C.border }}>
                        <button
                          type="button"
                          onClick={() => handleToggleSaved(r)}
                          disabled={savedBusyId === r.id}
                          className="text-[12px] font-bold flex items-center gap-1 disabled:opacity-60"
                          style={{ color: C.redDark }}
                        >
                          <X className="w-3.5 h-3.5" /> Quitar de guardadas
                        </button>
                        <ShareButton report={r} className="text-[12px] font-bold flex items-center gap-1 min-h-[40px]" style={{ color: C.text }}>
                          <Share2 className="w-3.5 h-3.5" /> Compartir
                        </ShareButton>
                      </div>
                    </ReportCard>
                  ))}
                </div>
              )
            )}

            {mifelpusSection === "perfil" && (
              <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: C.border, background: C.surface }}>
                {profileLoading && (
                  <p className="flex items-center gap-2 text-sm py-4 justify-center" style={{ color: C.muted }}>
                    <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
                  </p>
                )}
                {!profileLoading && profileError && (
                  <div className="flex items-center justify-between gap-2 text-sm" style={{ color: C.redDark }}>
                    <span className="flex items-center gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" /> {profileError}</span>
                    <button type="button" onClick={loadProfile} className="font-bold underline shrink-0">Reintentar</button>
                  </div>
                )}
                {!profileLoading && !profileError && !editingProfile && (
                  <>
                    <div>
                      <p className="text-[11px] uppercase font-bold" style={{ color: C.muted }}>Nombre</p>
                      <p className="text-sm" style={{ color: C.text }}>{profile?.nickname || googleDisplayName || "Sin nombre"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase font-bold" style={{ color: C.muted }}>Email</p>
                      <p className="text-sm" style={{ color: C.text }}>{user.email}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase font-bold" style={{ color: C.muted }}>De dónde sos</p>
                      <p className="text-sm" style={{ color: formatUbicacion(profile, { conPais: true }) ? C.text : C.muted }}>
                        {formatUbicacion(profile, { conPais: true }) || "No agregaste tu ciudad."}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase font-bold" style={{ color: C.muted }}>WhatsApp</p>
                      {profile?.whatsapp ? <ProfileWhatsappLine value={profile.whatsapp} textClassName="text-sm" /> : (
                        <p className="text-sm" style={{ color: C.muted }}>No agregaste un WhatsApp de perfil.</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[11px] uppercase font-bold" style={{ color: C.muted }}>Apoyos</p>
                      <p className="text-sm" style={{ color: myRank?.acepta_apoyos ? C.text : C.muted }}>
                        {myRank?.acepta_apoyos
                          ? "Activados: aparecés con el botón “Apoyar” en Colaboradores."
                          : "Desactivados. Podés activarlos en Editar perfil."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={openEditProfile}
                      className="w-full flex items-center justify-center gap-1.5 border rounded-xl py-2.5 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                      style={{ borderColor: C.border, color: C.text }}
                    >
                      <Pencil className="w-3.5 h-3.5" /> Editar perfil
                    </button>
                  </>
                )}
                {editingProfile && (
                  <>
                    <div className="flex items-center gap-3">
                      <Avatar
                        url={avatarDraft || (avatarRemoved ? null : profile?.avatar_url || googleAvatar)}
                        name={profileNameDraft || googleDisplayName}
                        size={64}
                        rounded="rounded-2xl"
                      />
                      <div className="flex flex-col items-start gap-1">
                        <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickAvatar} />
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          className="flex items-center gap-1.5 border rounded-lg px-3 py-2 text-[13px] font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40"
                          style={{ borderColor: C.border, color: C.text }}
                        >
                          <Camera className="w-3.5 h-3.5" /> {avatarDraft || profile?.avatar_url ? "Cambiar foto" : "Subir foto"}
                        </button>
                        {(avatarDraft || (profile?.avatar_url && !avatarRemoved)) && (
                          <button
                            type="button"
                            onClick={() => {
                              setAvatarDraft(null);
                              setAvatarRemoved(true);
                            }}
                            className="text-[12px] font-semibold px-1"
                            style={{ color: C.muted }}
                          >
                            Quitar foto
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label htmlFor="profile-nombre" className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>Nombre</label>
                      <input
                        id="profile-nombre"
                        type="text"
                        value={profileNameDraft}
                        onChange={(e) => setProfileNameDraft(e.target.value)}
                        maxLength={40}
                        className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
                        style={{ borderColor: C.border, color: C.text }}
                      />
                    </div>
                    <fieldset className="space-y-2">
                      <legend className="text-[12px] font-semibold mb-1" style={{ color: C.muted }}>De dónde sos (opcional)</legend>
                      <select
                        aria-label="País"
                        value={PAISES.includes(paisDraft) ? paisDraft : "Otro"}
                        onChange={(e) => {
                          setPaisDraft(e.target.value === "Otro" ? "" : e.target.value);
                          setProvinciaDraft("");
                        }}
                        className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
                        style={{ borderColor: C.border, color: C.text }}
                      >
                        {PAISES.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                      {!PAISES.includes(paisDraft) && (
                        <input
                          type="text"
                          aria-label="Escribí tu país"
                          placeholder="País"
                          value={paisDraft}
                          onChange={(e) => setPaisDraft(e.target.value)}
                          maxLength={UBICACION_MAX.pais}
                          className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
                          style={{ borderColor: C.border, color: C.text }}
                        />
                      )}
                      {paisDraft === "Argentina" ? (
                        <select
                          aria-label="Provincia"
                          value={provinciaDraft}
                          onChange={(e) => setProvinciaDraft(e.target.value)}
                          className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
                          style={{ borderColor: C.border, color: provinciaDraft ? C.text : C.muted }}
                        >
                          <option value="">Provincia</option>
                          {PROVINCIAS_AR.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          aria-label="Provincia o estado"
                          placeholder="Provincia o estado"
                          value={provinciaDraft}
                          onChange={(e) => setProvinciaDraft(e.target.value)}
                          maxLength={UBICACION_MAX.provincia}
                          className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
                          style={{ borderColor: C.border, color: C.text }}
                        />
                      )}
                      <input
                        type="text"
                        aria-label="Ciudad"
                        placeholder="Ciudad"
                        value={ciudadDraft}
                        onChange={(e) => setCiudadDraft(e.target.value)}
                        maxLength={UBICACION_MAX.ciudad}
                        className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
                        style={{ borderColor: C.border, color: C.text }}
                      />
                      <p className="text-[12px]" style={{ color: C.muted }}>Se muestra en el ranking de colaboradores.</p>
                    </fieldset>
                    <div>
                      <label htmlFor="profile-whatsapp" className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>
                        WhatsApp (opcional)
                      </label>
                      <PhoneInput
                        id="profile-whatsapp"
                        country={profilePhoneCountry}
                        onCountryChange={setProfilePhoneCountry}
                        value={profilePhoneText}
                        onChange={setProfilePhoneText}
                        onParsed={setProfilePhoneParsed}
                      />
                      <p className="text-[12px] mt-1" style={{ color: C.muted }}>
                        Se usa como contacto por defecto al publicar una mascota.
                      </p>
                    </div>
                    {supportDraft && (
                      <fieldset className="rounded-xl border p-3 space-y-2" style={{ borderColor: C.border }}>
                        <legend className="px-1 text-[12px] font-semibold" style={{ color: C.muted }}>Apoyos (opcional)</legend>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={supportDraft.acepta}
                            onChange={(e) => setSupportDraft((d) => ({ ...d, acepta: e.target.checked }))}
                            className="mt-0.5 w-5 h-5 accent-[var(--felpus-focus)]"
                          />
                          <span className="text-sm" style={{ color: C.text }}>
                            Aceptar apoyos de la comunidad
                            <span className="block text-[12px]" style={{ color: C.muted }}>
                              Aparecés con el botón “Apoyar” en Colaboradores y quien quiera te puede transferir. Es por
                              fuera de Felpus: no cobramos nada y no da ventajas en la app.
                            </span>
                          </span>
                        </label>
                        {supportDraft.acepta && (
                          <div>
                            <label htmlFor="profile-alias" className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>
                              Alias o CBU/CVU
                            </label>
                            <input
                              id="profile-alias"
                              type="text"
                              value={supportDraft.alias}
                              onChange={(e) => setSupportDraft((d) => ({ ...d, alias: e.target.value }))}
                              maxLength={30}
                              placeholder="mi.alias.mp"
                              autoCapitalize="none"
                              autoComplete="off"
                              className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
                              style={{ borderColor: C.border, color: C.text }}
                            />
                            <p className="text-[12px] mt-1" style={{ color: C.muted }}>
                              Ojo: al transferir, el banco le muestra a la otra persona el nombre del titular del alias.
                            </p>
                          </div>
                        )}
                        {supportDraft.acepta && (
                          <div>
                            <label htmlFor="profile-link-cobro" className="text-[12px] font-semibold mb-1 block" style={{ color: C.muted }}>
                              Link de cobro (opcional)
                            </label>
                            <input
                              id="profile-link-cobro"
                              type="url"
                              inputMode="url"
                              value={supportDraft.link || ""}
                              onChange={(e) => setSupportDraft((d) => ({ ...d, link: e.target.value }))}
                              maxLength={200}
                              placeholder="link.mercadopago.com.ar/tunombre"
                              autoCapitalize="none"
                              autoComplete="off"
                              className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)] dark:bg-[var(--felpus-dark-hover)]"
                              style={{ borderColor: C.border, color: C.text }}
                            />
                            <p className="text-[12px] mt-1" style={{ color: C.muted }}>
                              Tu link de pago de Mercado Pago (con monto libre) o tu página de Cafecito. Así te pueden
                              colaborar con un toque desde el botón “Colaborar”.
                            </p>
                          </div>
                        )}
                      </fieldset>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleSaveProfile}
                        disabled={profileSaving}
                        className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60 flex items-center justify-center gap-1.5"
                        style={{ background: C.redSolid }}
                      >
                        {profileSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingProfile(false)}
                        disabled={profileSaving}
                        className="text-sm font-semibold px-3 disabled:opacity-60"
                        style={{ color: C.muted }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Navegación inferior — más redondeada y con más peso visual propio,
          en vez del Material Design genérico de antes (esquinas superiores
          grandes, sombra flotante, íconos más grandes). */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[var(--felpus-dark-muted-surface)] rounded-t-[28px] flex items-stretch justify-around z-40 px-2"
        style={{
          // +6px abajo (2026-10-22): en iPhone la barra se veía muy baja,
          // pegada al borde de la pantalla.
          paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))",
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
                className="flex flex-col items-center justify-center -mt-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50 rounded-2xl"
                aria-label="Reportar mascota"
              >
                <span
                  className="felpus-cta w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg border-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
                  style={{ background: C.redSolid, borderColor: C.cream }}
                >
                  <item.icon className="w-7 h-7" />
                </span>
                <span className="text-[11px] font-bold mt-1" style={{ color: isActive ? C.red : C.muted }}>
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
              className="flex flex-col items-center justify-center gap-1 py-3.5 px-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50 rounded-xl"
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <span
                className="flex items-center justify-center w-11 h-8 rounded-full transition-all duration-300"
                style={{ background: isActive ? C.brandTintBg : "transparent", transform: isActive ? "scale(1)" : "scale(0.9)" }}
              >
                <item.icon className="w-6 h-6 transition-colors duration-200" style={{ color: isActive ? C.red : C.muted }} />
              </span>
              <span className="text-[11px] font-bold" style={{ color: isActive ? C.red : C.muted }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <ToastStack toasts={toasts} />

      {adminEditing && (
        <AdminEditReport
          report={adminEditing}
          onClose={() => setAdminEditing(null)}
          onSaved={() => {
            setAdminEditing(null);
            pushToast("success", "Publicación actualizada.");
            loadAdminData(true);
            loadAll();
          }}
        />
      )}

      {alertOptIn && (
        <AlertOptInModal
          tipo={alertOptIn.tipo}
          iosNeedsInstall={needsIosInstallForPush()}
          busy={pushSubState === "loading"}
          onClose={() => setAlertOptIn(null)}
          onAccept={async () => {
            await handleActivatePush(alertOptIn.reportId, alertOptIn.pushToken);
            setAlertOptIn(null);
          }}
        />
      )}
      <FelpusAssistant
        section={activeTab}
        openReport={detailReport ? { id: detailReport.id } : null}
        onApplyDraft={applyChatDraft}
        onOpenReport={(id) => {
          const found = reports.find((r) => r.id === id);
          if (found) openReportDetail(found);
          else window.location.assign(`/r/${encodeURIComponent(id)}`);
        }}
        onNavigate={(tab) => {
          if (tab === "reportar") setReportKind("perdida");
          goToTab(tab);
        }}
        publishedToken={chatPublishedToken}
        openToken={chatOpenToken}
      />

      {sighting && (
        <SightingSheet
          vistaDe={sighting.vistaDe}
          savedWhatsapp={savedWhatsapp || ""}
          defaultCountry={form.contactoWhatsappCountry || "AR"}
          onPublish={handlePublishSighting}
          onClose={() => setSighting(null)}
        />
      )}

      <DetailModal
        report={detailReport}
        contactStatus={contactStatus}
        onRetryContact={retryFetchContact}
        onClose={() => {
          setDetailReport(null);
          setConfirmingId(null);
        }}
        onResolve={() => detailReport && handleConfirmTrigger(detailReport)}
        confirming={confirmingId === detailReport?.id}
        resolving={!!detailReport && resolvingId === detailReport.id}
        isOwner={!!detailReport && detailReport.userId === user?.id}
        onConfirm={() =>
          markResolvedAndReward({
            repObjs: [detailReport],
            bonusFor: [{ userId: detailReport?.userId, displayName: detailReport?.nickname, reportId: detailReport?.id }],
          })
        }
        onCancelConfirm={() => setConfirmingId(null)}
        isLoggedIn={!!user}
        onDelete={handleDeleteReport}
        onFlagReport={handleFlagReport}
        onSawIt={(r) => {
          setDetailReport(null);
          setSighting({ vistaDe: r });
        }}
        saved={!!detailReport && savedReportIds.has(detailReport.id)}
        onToggleSaved={handleToggleSaved}
        onAskAssistant={() => setChatOpenToken((t) => t + 1)}
      />

      <footer className="max-w-2xl mx-auto px-4 pb-28 pt-2 space-y-1.5">
        <SocialLinks className="pb-1" />
        <p className="text-[12px] font-semibold flex items-center gap-1 justify-center" style={{ color: C.greenDark }}>
          <PartyPopper className="w-3.5 h-3.5" /> {homeStats.reencuentros} {homeStats.reencuentros === 1 ? "reencuentro" : "reencuentros"} gracias a la comunidad
        </p>
        <p className="text-[12px] leading-snug flex items-start gap-1 justify-center text-center" style={{ color: C.muted }}>
          <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> Herramienta comunitaria: no reemplaza la denuncia ante autoridades o refugios.
        </p>
        {/* Enlaces legales — únicos dos links de "salida" de la SPA (todo el
            resto navega con goToTab(), sin cambiar de ruta), por eso van acá
            en vez de ocupar un lugar en la bottom nav de 4 ítems. */}
        <p className="text-[12px] flex flex-wrap items-center gap-x-3 justify-center pt-0.5" style={{ color: C.muted }}>
          {/* Link interno a la página local de SEO (/mascotas-perdidas/salta):
              sin un enlace desde el home, Google la descubre solo por el
              sitemap y le da mucho menos peso. */}
          <Link href="/mascotas-perdidas/salta" className="inline-block py-2.5 whitespace-nowrap underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40 rounded">
            Mascotas perdidas en Salta
          </Link>
          <Link href="/privacidad" className="inline-block py-2.5 whitespace-nowrap underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40 rounded">
            Política de Privacidad
          </Link>
          <Link href="/terminos" className="inline-block py-2.5 whitespace-nowrap underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40 rounded">
            Términos y Condiciones
          </Link>
          {/* Requisito de Google Play: la eliminación de cuenta tiene que
              poder pedirse desde adentro de la app. */}
          <Link href="/eliminar-cuenta" className="inline-block py-2.5 whitespace-nowrap underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/40 rounded">
            Eliminar mi cuenta
          </Link>
        </p>
      </footer>
    </div>
  );
}
