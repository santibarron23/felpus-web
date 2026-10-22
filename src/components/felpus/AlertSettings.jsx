"use client";

// /configuracion/alertas (PLAN-alertas.md, Fase 2 y 4): zona de alerta del
// usuario (centro + radio + especies + tipos), pausa general y
// notificaciones de este dispositivo. El permiso del navegador se pide SOLO
// al tocar un botón. Si la persona lo rechazó, no se insiste: se explica cómo
// activarlo desde el navegador.
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Bell, BellOff, Check, Loader2, LogIn } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "./useAuth";
import { IosInstallSteps } from "./InstallBanner";
import {
  authedFetch,
  hasDeviceSubscription,
  isPushSupported,
  needsIosInstallForPush,
  pushPermissionState,
  subscribeUserPush,
  unsubscribeUserPush,
} from "../../lib/push";
import { CITIES } from "../../lib/cities";

const MapPicker = dynamic(() => import("../MapPicker"), { ssr: false });

const RADII = [
  { value: 1000, label: "1 km" },
  { value: 3000, label: "3 km" },
  { value: 5000, label: "5 km" },
  { value: 10000, label: "10 km" },
];
const SPECIES = [
  { value: "perro", label: "Perros" },
  { value: "gato", label: "Gatos" },
  { value: "otro", label: "Otros" },
];
const TYPES = [
  { value: "perdida", label: "Perdidas" },
  { value: "encontrada", label: "Encontradas" },
];

// Clave comparable del formulario: mismo punto, radio, especies, tipos y pausa.
function zoneKey(point, radius, species, types, paused) {
  if (!point) return null;
  return JSON.stringify([point.lat, point.lng, radius, [...species].sort(), [...types].sort(), paused]);
}

function toggle(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function AlertSettings({ initialLat = null, initialLng = null }) {
  const C = useTheme();
  const { user, authLoading, signInWithGoogle } = useAuth(() => {});
  const [loaded, setLoaded] = useState(false);
  const [point, setPoint] = useState(initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : null);
  const [radius, setRadius] = useState(3000);
  const [species, setSpecies] = useState(["perro", "gato"]);
  const [types, setTypes] = useState(["perdida", "encontrada"]);
  const [paused, setPaused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { tone: "ok" | "error", text }
  const [permission, setPermission] = useState("default");
  const [deviceOn, setDeviceOn] = useState(false);
  // Foto de lo último guardado (o cargado del servidor). Mientras el
  // formulario sea igual, el botón queda verde "Zona guardada"; al tocar
  // cualquier cosa vuelve a rojo "Guardar cambios" (2026-10-22: después de
  // guardar no quedaba claro que se había guardado, el aviso salía al pie).
  const [savedKey, setSavedKey] = useState(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const iosNeedsInstall = typeof window !== "undefined" && needsIosInstallForPush();

  useEffect(() => {
    setPermission(pushPermissionState());
    hasDeviceSubscription().then(setDeviceOn);
  }, []);

  const loadZone = useCallback(async () => {
    try {
      const res = await authedFetch("/api/alerts/zone");
      const data = await res.json().catch(() => ({}));
      const z = data?.zone;
      if (z) {
        // Si vino un pin desde "Vigilar esta zona", ese gana sobre el guardado.
        if (initialLat == null) setPoint({ lat: z.lat, lng: z.lng });
        setRadius(z.radius_m);
        setSpecies(z.species);
        setTypes(z.report_types);
        setPaused(!z.active);
        if (initialLat == null) {
          setSavedKey(zoneKey({ lat: z.lat, lng: z.lng }, z.radius_m, z.species, z.report_types, !z.active));
        }
      }
    } finally {
      setLoaded(true);
    }
  }, [initialLat]);

  useEffect(() => {
    if (user) loadZone();
  }, [user, loadZone]);

  async function activateDevice() {
    setDeviceBusy(true);
    setMessage(null);
    try {
      await subscribeUserPush();
      setDeviceOn(true);
      setMessage({ tone: "ok", text: "Listo: este dispositivo va a recibir tus alertas." });
    } catch (e) {
      setMessage({ tone: "error", text: e?.message || "No pudimos activar las notificaciones." });
    } finally {
      setPermission(pushPermissionState());
      setDeviceBusy(false);
    }
  }

  async function deactivateDevice() {
    setDeviceBusy(true);
    try {
      await unsubscribeUserPush();
      setDeviceOn(false);
      setMessage({ tone: "ok", text: "Este dispositivo ya no va a recibir notificaciones." });
    } finally {
      setDeviceBusy(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    setMessage(null);
    if (!point) {
      setMessage({ tone: "error", zone: true, text: "Marcá en el mapa el centro de la zona que querés vigilar." });
      return;
    }
    setSaving(true);
    try {
      const res = await authedFetch("/api/alerts/zone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: point.lat, lng: point.lng, radius_m: radius, species, report_types: types, active: !paused }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No pudimos guardar tu zona.");
      setSavedKey(zoneKey(point, radius, species, types, paused));
      setMessage({
        tone: "ok",
        zone: true,
        text: paused
          ? "Guardado. Tus alertas están en pausa."
          : deviceOn
            ? "Guardado. Te vamos a avisar cuando haya reportes en tu zona."
            : "Guardado. Activá las notificaciones en este dispositivo para recibir los avisos.",
      });
    } catch (err) {
      setMessage({ tone: "error", zone: true, text: err.message });
    } finally {
      setSaving(false);
    }
  }

  const isSaved = !!savedKey && savedKey === zoneKey(point, radius, species, types, paused);
  const card = "rounded-2xl border p-4 space-y-3";
  const cardStyle = { background: C.surface, borderColor: C.border };
  const chip = (on) => ({
    borderColor: on ? C.red : C.border,
    background: on ? C.brandTintBg : C.surface,
    color: on ? C.redDark : C.text,
  });

  return (
    <main className="min-h-screen px-4 py-5" style={{ background: C.cream, color: C.text }}>
      <div className="max-w-xl mx-auto space-y-4">
        <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold py-2.5 -my-2.5" style={{ color: C.muted }}>
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Volver a Felpus
        </Link>
        <header>
          <h1 className="felpus-display text-2xl" style={{ color: C.text }}>
            Alertas de tu zona
          </h1>
          <p className="text-sm mt-1" style={{ color: C.muted }}>
            Te avisamos al instante cuando alguien reporta una mascota perdida o encontrada cerca tuyo, o si aparece una
            parecida a la tuya. Tu ubicación nunca se muestra a nadie.
          </p>
        </header>

        {authLoading ? (
          <p className="text-sm flex items-center gap-2" style={{ color: C.muted }}>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Cargando…
          </p>
        ) : !user ? (
          <section className={card} style={cardStyle} aria-labelledby="login-title">
            <h2 id="login-title" className="font-bold text-base">
              Iniciá sesión para configurar tus alertas
            </h2>
            <p className="text-sm" style={{ color: C.muted }}>
              Las alertas de zona se guardan en tu cuenta de Google, así te llegan en todos tus dispositivos.
            </p>
            <button
              type="button"
              onClick={signInWithGoogle}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              style={{ background: C.ink }}
            >
              <LogIn className="w-4 h-4" aria-hidden="true" /> Iniciar sesión con Google
            </button>
          </section>
        ) : (
          <>
            <form onSubmit={save} className={card} style={cardStyle} aria-labelledby="zona-title">
              <h2 id="zona-title" className="font-bold text-base">
                Tu zona
              </h2>
              <div>
                <p className="text-xs font-semibold mb-1.5" style={{ color: C.muted }}>
                  Tocá el mapa para marcar el centro y confirmá.
                </p>
                <MapPicker
                  lat={point?.lat ?? null}
                  lng={point?.lng ?? null}
                  defaultCenter={CITIES.salta.geo}
                  radiusM={radius}
                  onChange={(lat, lng) => setPoint({ lat, lng })}
                  fallbackActions
                  defaultCenterLabel={CITIES.salta.name}
                />
              </div>

              <fieldset>
                <legend className="text-sm font-bold mb-1.5">Radio</legend>
                <div className="flex flex-wrap gap-2">
                  {RADII.map((r) => (
                    <label key={r.value} className="cursor-pointer">
                      <input type="radio" name="radio" value={r.value} checked={radius === r.value} onChange={() => setRadius(r.value)} className="sr-only peer" />
                      <span className="inline-block rounded-full border px-3.5 py-1.5 text-sm font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--felpus-focus)]/50" style={chip(radius === r.value)}>
                        {r.label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-sm font-bold mb-1.5">Especies</legend>
                <div className="flex flex-wrap gap-2">
                  {SPECIES.map((sp) => (
                    <label key={sp.value} className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold cursor-pointer" style={chip(species.includes(sp.value))}>
                      <input type="checkbox" checked={species.includes(sp.value)} onChange={() => setSpecies((l) => toggle(l, sp.value))} className="accent-[var(--felpus-focus)]" />
                      {sp.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-sm font-bold mb-1.5">Avisarme de</legend>
                <div className="flex flex-wrap gap-2">
                  {TYPES.map((t) => (
                    <label key={t.value} className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold cursor-pointer" style={chip(types.includes(t.value))}>
                      <input type="checkbox" checked={types.includes(t.value)} onChange={() => setTypes((l) => toggle(l, t.value))} className="accent-[var(--felpus-focus)]" />
                      {t.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 cursor-pointer" style={{ borderColor: C.border }}>
                <span className="text-sm font-semibold">Pausar todas las alertas</span>
                <input type="checkbox" role="switch" aria-checked={paused} checked={paused} onChange={(e) => setPaused(e.target.checked)} className="w-5 h-5 accent-[var(--felpus-focus)]" />
              </label>

              <button
                type="submit"
                disabled={saving || !loaded}
                className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60 flex items-center justify-center gap-1.5 transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                style={{ background: isSaved ? C.greenSolid : C.redSolid }}
              >
                {saving ? (
                  "Guardando…"
                ) : isSaved ? (
                  <>
                    <Check className="w-4 h-4" aria-hidden="true" /> Zona guardada
                  </>
                ) : savedKey ? (
                  "Guardar cambios"
                ) : (
                  "Guardar mi zona"
                )}
              </button>
              {message?.zone && (
                <p role="status" className="text-[13px] font-semibold text-center -mt-1" style={{ color: message.tone === "error" ? C.dangerText : C.successText }}>
                  {message.text}
                </p>
              )}
            </form>

            <section className={card} style={cardStyle} aria-labelledby="dispositivo-title">
              <h2 id="dispositivo-title" className="font-bold text-base">
                Notificaciones en este dispositivo
              </h2>
              {!isPushSupported() && !iosNeedsInstall ? (
                <p className="text-sm" style={{ color: C.muted }}>
                  Este navegador no permite notificaciones. Probá con Chrome en Android o instalando Felpus.
                </p>
              ) : iosNeedsInstall ? (
                <div className="space-y-2">
                  <p className="text-sm" style={{ color: C.muted }}>
                    En iPhone, las notificaciones funcionan con Felpus instalada en el inicio:
                  </p>
                  <IosInstallSteps C={C} />
                </div>
              ) : deviceOn ? (
                <button
                  type="button"
                  onClick={deactivateDevice}
                  disabled={deviceBusy}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold border disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                  style={{ borderColor: C.border, color: C.text }}
                >
                  <BellOff className="w-4 h-4" aria-hidden="true" /> Desactivar notificaciones en este dispositivo
                </button>
              ) : permission === "denied" ? (
                <p className="text-sm" style={{ color: C.muted }}>
                  Bloqueaste las notificaciones para Felpus. Si querés activarlas, tocá el candado junto a la dirección del
                  sitio, permití &quot;Notificaciones&quot; y volvé a esta página.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={activateDevice}
                  disabled={deviceBusy}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                  style={{ background: C.ink }}
                >
                  {deviceBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Bell className="w-4 h-4" aria-hidden="true" />}
                  Activar notificaciones en este dispositivo
                </button>
              )}
            </section>

            <p role="status" aria-live="polite" className="text-sm font-semibold min-h-[1.25rem]" style={{ color: message?.tone === "error" ? C.dangerText : C.successText }}>
              {message && !message.zone ? message.text : ""}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
