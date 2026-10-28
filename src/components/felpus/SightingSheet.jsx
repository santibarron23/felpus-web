"use client";

// "Lo vi suelto" (2026-10-27): reporte express para quien ve una mascota en
// la calle — foto, dónde y listo. Es la palanca más grande para sumar
// reportes de "encontrada", que hoy son 1 de cada 5 (y sin ellos el
// matching de las perdidas no tiene contra qué comparar).
//
// - La foto se procesa igual que en el formulario (resizeImageFile,
//   histograma, embedding DINOv2, revisión de flyer) y la IA (Gemini, modo
//   "foto") sugiere especie y color.
// - Si la persona solo la vio, el contacto es opcional (avistamiento, ver
//   sighting.js); si la tiene con ella, es una encontrada común.
// - Desde la ficha de una perdida ("La vi"), llega con especie/color/tamaño
//   de ese reporte y queda vinculada a él.
// Publicar va por el mismo camino que el formulario (onPublish).
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, Loader2, LocateFixed, Map as MapIcon, Sparkles, X } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useFocusTrap } from "./useFocusTrap";
import PhoneInput from "./PhoneInput";
import FullscreenMapPicker from "../FullscreenMapPicker";
import { COLOR_OPTIONS, resizeImageFile, computeHistogram, getImageEmbedding } from "../../lib/matching";

const MAX_FOTO_MB = 15; // igual que el formulario (FelpusMatcher)
import { checkPhotoKind } from "../../lib/photoCheckClient";
import { importPost } from "../../lib/postImportClient";
import { reverseGeocode } from "../../lib/osmMap";
import { requestLocation, geolocationErrorMessage } from "../../lib/geolocation";
import { CITIES } from "../../lib/cities";
import { petTitle } from "../../lib/petTitle";
import { sightingMissing } from "../../lib/sighting";
import { logError } from "../../lib/log";

export default function SightingSheet({ vistaDe = null, savedWhatsapp = "", defaultCountry = "AR", onPublish, onClose }) {
  const C = useTheme();
  const panelRef = useRef(null);
  const fileRef = useRef(null);
  const [mapOpen, setMapOpen] = useState(false);
  useFocusTrap(!mapOpen, panelRef, onClose);

  const [foto, setFoto] = useState(null); // { dataUrl, hist, embedding, check }
  const [fotoBusy, setFotoBusy] = useState(false);
  const [loc, setLoc] = useState(null); // { lat, lng }
  const [lugar, setLugar] = useState({ zona: "", ciudad: "", provincia: "" });
  const [geo, setGeo] = useState({ status: "idle", error: "" });
  const [conmigo, setConmigo] = useState(false);
  const [especie, setEspecie] = useState(vistaDe?.especie === "perro" || vistaDe?.especie === "gato" ? vistaDe.especie : "");
  const [color, setColor] = useState(vistaDe?.color || "");
  const [tamano, setTamano] = useState(vistaDe?.tamano || "");
  const [raza, setRaza] = useState("");
  const [sugerido, setSugerido] = useState(false);
  const [usarGuardado, setUsarGuardado] = useState(!!savedWhatsapp);
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState(defaultCountry);
  const [parsed, setParsed] = useState({ isValid: false, digits: "" });
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  // Lo que eligió la persona no lo pisa la sugerencia de la IA.
  const tocados = useRef(new Set(vistaDe ? ["especie", "color", "tamano"] : []));

  const whatsappDigits = usarGuardado && savedWhatsapp ? savedWhatsapp.replace(/\D/g, "") : parsed.isValid ? parsed.digits : "";
  const phoneInvalido = !usarGuardado && phone.trim() && !parsed.isValid;
  const faltan = sightingMissing({ fotos: foto ? [foto] : [], lat: loc?.lat, lng: loc?.lng, zona: lugar.zona, especie, conmigo, whatsappOk: !!whatsappDigits });

  async function handleFoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) return setError("Ese archivo no es una imagen.");
    if (file.size > MAX_FOTO_MB * 1024 * 1024) return setError(`La foto pesa demasiado (máx. ${MAX_FOTO_MB} MB).`);
    setFotoBusy(true);
    try {
      const dataUrl = await resizeImageFile(file);
      const hist = await computeHistogram(dataUrl);
      setFoto({ dataUrl, hist, embedding: null, check: null });
      setFotoBusy(false);
      // En paralelo y sin frenar nada: embedding, revisión de flyer y
      // sugerencia de la IA. Se aplican solo si sigue siendo la misma foto.
      const same = (f) => f && f.dataUrl === dataUrl;
      getImageEmbedding(dataUrl).then((embedding) => setFoto((f) => (same(f) ? { ...f, embedding } : f)));
      checkPhotoKind(dataUrl).then((check) => check && setFoto((f) => (same(f) ? { ...f, check } : f)));
      importPost({ image: dataUrl, modo: "foto" }).then((res) => {
        const s = res.ok ? res.sugerencia : null;
        if (!s) return;
        let aplico = false;
        if ((s.especie === "perro" || s.especie === "gato") && !tocados.current.has("especie")) {
          setEspecie(s.especie);
          aplico = true;
        }
        if (s.color && !tocados.current.has("color")) {
          setColor(s.color);
          aplico = true;
        }
        if (s.tamano && !tocados.current.has("tamano")) setTamano(s.tamano);
        if (s.raza) setRaza(s.raza);
        if (aplico) setSugerido(true);
      });
    } catch (err) {
      logError("No se pudo procesar la foto del avistamiento", err);
      setError("No pudimos procesar esa foto. Probá con otra.");
      setFotoBusy(false);
    }
  }

  function setPunto(lat, lng) {
    setLoc({ lat, lng });
    setGeo({ status: "done", error: "" });
    reverseGeocode(lat, lng)
      .then((place) => {
        if (place) setLugar({ zona: (place.zona || "").slice(0, 100), ciudad: (place.ciudad || "").slice(0, 80), provincia: (place.provincia || "").slice(0, 80) });
      })
      .catch((e) => logError("No se pudo geocodificar el avistamiento", e));
  }

  function usarUbicacion() {
    setGeo({ status: "locating", error: "" });
    requestLocation(
      ({ lat, lng }) => setPunto(lat, lng),
      (err) => setGeo({ status: "error", error: geolocationErrorMessage(err) })
    );
  }

  function elegir(setter, key, value) {
    tocados.current.add(key);
    setter(value);
  }

  async function publicar() {
    if (faltan.length || publishing) return;
    setPublishing(true);
    setError("");
    try {
      await onPublish({
        especie,
        color,
        tamano,
        raza,
        conmigo,
        zona: lugar.zona,
        ciudad: lugar.ciudad,
        provincia: lugar.provincia,
        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
        fotos: [{ dataUrl: foto.dataUrl, hist: foto.hist, embedding: foto.embedding, ...(foto.check?.dudosa ? { dudosa: true } : {}) }],
        fotosDudosas: foto.check?.dudosa ? [0] : [],
        contactoWhatsapp: whatsappDigits,
        vistaDe: vistaDe?.id || null,
      });
    } catch (err) {
      setError(err?.message || "No pudimos publicar. Probá de nuevo.");
      setPublishing(false);
    }
  }

  const paso = "text-xs font-bold mb-1.5 flex items-center gap-1.5";
  const num = (n, ok) => (
    <span
      className="w-5 h-5 rounded-full text-[11px] flex items-center justify-center shrink-0"
      style={ok ? { background: C.greenSolid, color: "#fff" } : { background: C.surfaceMuted, color: C.text }}
      aria-hidden="true"
    >
      {ok ? <Check className="w-3 h-3" /> : n}
    </span>
  );
  const chip = (activo) =>
    activo
      ? { background: C.ink, color: C.cream, borderColor: C.ink }
      : { background: C.surface, color: C.text, borderColor: C.border };

  const sheet = (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sighting-title"
        className="felpus-fadein w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl border flex flex-col"
        style={{ background: C.surface, borderColor: C.border, maxHeight: "94dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-2 px-4 pt-4 pb-2">
          <div className="flex-1 min-w-0">
            <h2 id="sighting-title" className="font-bold text-lg leading-snug" style={{ color: C.text }}>
              {vistaDe ? `¿Viste a ${petTitle(vistaDe)}?` : "Vi una mascota suelta"}
            </h2>
            <p className="text-[12px]" style={{ color: C.muted }}>
              {vistaDe ? "Avisá dónde: le llega a quien la busca." : "Foto y lugar alcanzan. Felpus la compara con las perdidas."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-10 h-10 -mr-2 -mt-1 rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
            style={{ color: C.text }}
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="px-4 pb-2 space-y-4 overflow-y-auto">
          {/* 1. Foto */}
          <div>
            <p className={paso} style={{ color: C.text }}>{num(1, !!foto)} Foto</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={fotoBusy}
              className="w-full rounded-xl border-2 border-dashed overflow-hidden flex items-center justify-center gap-2 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              style={{ borderColor: foto ? C.green : C.border, color: C.text, background: C.surfaceSubtle, minHeight: foto ? 0 : 96 }}
            >
              {foto ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL local, sin optimizar
                <img src={foto.dataUrl} alt="Foto elegida (tocá para cambiarla)" className="w-full max-h-48 object-cover" />
              ) : fotoBusy ? (
                <Loader2 className="w-5 h-5 animate-spin" aria-label="Procesando la foto" />
              ) : (
                <>
                  <Camera className="w-5 h-5" aria-hidden="true" /> Sacar o elegir foto
                </>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFoto} aria-label="Foto de la mascota" />
          </div>

          {/* 2. Dónde */}
          <div>
            <p className={paso} style={{ color: C.text }}>{num(2, !!loc)} Dónde la viste</p>
            {loc ? (
              <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm" style={{ background: C.successBg, color: C.successText }}>
                <span className="min-w-0 truncate">{[lugar.zona, lugar.ciudad].filter(Boolean).join(", ") || "Punto marcado"}</span>
                <button type="button" onClick={() => setMapOpen(true)} className="shrink-0 text-xs font-bold underline min-h-[32px]">
                  Ajustar
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={usarUbicacion}
                  disabled={geo.status === "locating"}
                  className="min-h-[48px] rounded-xl text-sm font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                  style={{ background: C.emphasisBg }}
                >
                  {geo.status === "locating" ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" aria-hidden="true" />}
                  Estoy acá
                </button>
                <button
                  type="button"
                  onClick={() => setMapOpen(true)}
                  className="min-h-[48px] rounded-xl border text-sm font-bold flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                  style={{ borderColor: C.border, color: C.text }}
                >
                  <MapIcon className="w-4 h-4" aria-hidden="true" /> En el mapa
                </button>
              </div>
            )}
            {geo.status === "error" && (
              <p className="text-[12px] mt-1" style={{ color: C.redDark }}>
                {geo.error} Podés marcarlo en el mapa.
              </p>
            )}
          </div>

          {/* 3. Qué es */}
          <div>
            <p className={paso} style={{ color: C.text }}>{num(3, especie === "perro" || especie === "gato")} ¿Perro o gato?</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["perro", "Perro"],
                ["gato", "Gato"],
              ].map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={especie === v}
                  onClick={() => elegir(setEspecie, "especie", v)}
                  className="min-h-[44px] rounded-xl border text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                  style={chip(especie === v)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label htmlFor="sighting-color" className="sr-only">Color</label>
            <select
              id="sighting-color"
              value={color}
              onChange={(e) => elegir(setColor, "color", e.target.value)}
              className="felpus-input w-full mt-2 border rounded-lg px-3 py-2.5 text-sm"
              style={{ borderColor: C.border, color: C.text, background: C.surfaceSubtle }}
            >
              <option value="">Color (opcional)</option>
              {COLOR_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {sugerido && (
              <p className="text-[12px] mt-1 flex items-center gap-1" style={{ color: C.muted }}>
                <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: C.orangeInk }} aria-hidden="true" /> Sugerido por la foto. Podés cambiarlo.
              </p>
            )}
          </div>

          {/* 4. ¿La tenés? + contacto */}
          <div>
            <p className={paso} style={{ color: C.text }}>¿La tenés con vos?</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                [false, "No, solo la vi"],
                [true, "Sí, la tengo"],
              ].map(([v, label]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={conmigo === v}
                  onClick={() => setConmigo(v)}
                  className="min-h-[44px] rounded-xl border text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                  style={chip(conmigo === v)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-2">
              <p className="text-[12px] mb-1" style={{ color: C.muted }}>
                {conmigo ? "Tu WhatsApp, para que te contacten:" : "Tu WhatsApp (opcional), por si quieren preguntarte algo:"}
              </p>
              {savedWhatsapp && usarGuardado ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.border, color: C.text }}>
                  <span>Usar el que ya dejaste</span>
                  <button type="button" onClick={() => setUsarGuardado(false)} className="text-xs font-bold underline min-h-[32px]">
                    Cambiar
                  </button>
                </div>
              ) : (
                <PhoneInput
                  id="sighting-whatsapp"
                  country={country}
                  onCountryChange={setCountry}
                  value={phone}
                  onChange={setPhone}
                  onParsed={setParsed}
                />
              )}
            </div>
          </div>
        </div>

        <footer className="px-4 pt-2 border-t space-y-1.5" style={{ borderColor: C.border, paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}>
          {error && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ color: C.redDark, background: C.dangerBg }} role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={publicar}
            disabled={!!faltan.length || publishing || phoneInvalido}
            className="w-full min-h-[48px] rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
            style={{ background: C.orangeInkSolid }}
          >
            {publishing && <Loader2 className="w-4 h-4 animate-spin" />}
            {conmigo ? "Publicar y buscar a su familia" : "Avisar y buscar coincidencias"}
          </button>
          <p className="text-[11px] text-center" style={{ color: C.muted }} aria-live="polite">
            {faltan.length ? `Falta: ${faltan.join(", ")}.` : phoneInvalido ? "Revisá el WhatsApp o dejalo vacío." : "Se publica con la zona aproximada, no el punto exacto."}
          </p>
        </footer>
      </section>
    </div>
  );

  return (
    <>
      {createPortal(sheet, document.body)}
      {mapOpen &&
        createPortal(
          <FullscreenMapPicker
            center={loc || CITIES.salta.geo}
            zoom={loc ? 17 : 13}
            onConfirm={(lat, lng) => {
              setMapOpen(false);
              setPunto(lat, lng);
            }}
            onClose={() => setMapOpen(false)}
          />,
          document.body
        )}
    </>
  );
}
