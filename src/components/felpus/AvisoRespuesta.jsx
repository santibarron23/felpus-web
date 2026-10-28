"use client";

// Respuesta a un mail de aviso (2026-10-28, ver emailAvisos.js). Llega con
// un token firmado y, si se tocó un botón del mail, la acción elegida. Nada
// cambia hasta que la persona confirma acá: algunos correos abren los links
// solos para revisarlos.
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { useTheme } from "./ThemeProvider";

const ACCIONES = ["volvio", "sigo", "no_busco", "baja"];

function textos(info) {
  const perdida = info?.tipo !== "encontrada";
  const n = info?.nombre || "tu mascota";
  return {
    volvio: {
      boton: perdida ? `${capital(n)} volvió a casa 🎉` : "Ya volvió con su familia 🎉",
      confirmar: perdida ? `¿Confirmás que ${n} volvió a casa? El reporte se cierra y tu contacto se borra.` : `¿Confirmás que ${n} ya volvió con su familia? El reporte se cierra y tu contacto se borra.`,
      hecho: "¡Qué alegría! Cerramos el reporte. Gracias por avisar: así la comunidad sabe que funcionó.",
    },
    sigo: {
      boton: "Sigo buscando",
      confirmar: "Tu reporte sigue activo y con alertas un mes más.",
      hecho: "Listo: tu reporte sigue activo un mes más. Te volvemos a preguntar en 30 días.",
    },
    no_busco: {
      boton: perdida ? "Ya no busco" : "Ya no está conmigo",
      confirmar: "El reporte deja de mandar alertas. Lo podés renovar cuando quieras desde Felpus.",
      hecho: "Listo: el reporte dejó de mandar alertas. Si cambia algo, lo renovás desde Felpus.",
    },
    baja: {
      boton: "No quiero más avisos por email",
      confirmar: "No te vamos a escribir más por este reporte.",
      hecho: "Listo: no te vamos a mandar más mails por este reporte.",
    },
  };
}

function capital(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export default function AvisoRespuesta({ token, accionInicial }) {
  const C = useTheme();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [elegida, setElegida] = useState(ACCIONES.includes(accionInicial) ? accionInicial : null);
  const [estado, setEstado] = useState("cargando"); // cargando | listo | enviando | hecho
  const [hecha, setHecha] = useState(null);

  useEffect(() => {
    if (!token) {
      setError("Falta el link del mail.");
      setEstado("listo");
      return;
    }
    fetch(`/api/aviso?t=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || "No pudimos cargar el reporte.");
        setInfo(body);
      })
      .catch((e) => setError(e.message))
      .finally(() => setEstado("listo"));
  }, [token]);

  async function confirmar() {
    setEstado("enviando");
    setError("");
    try {
      const r = await fetch("/api/aviso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token, accion: elegida }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "No pudimos guardar tu respuesta.");
      setHecha(body.estado === "resuelto" && elegida !== "volvio" ? "ya_resuelto" : elegida);
      setEstado("hecho");
    } catch (e) {
      setError(e.message);
      setEstado("listo");
    }
  }

  const t = textos(info);
  const cerrado = info && info.estado === "resuelto";

  return (
    <main className="min-h-screen px-4 py-5" style={{ background: C.cream, color: C.text }}>
      <div className="max-w-md mx-auto space-y-4">
        <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold py-2.5 -my-2.5" style={{ color: C.muted }}>
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Ir a Felpus
        </Link>

        <section className="bg-white rounded-2xl border p-5 space-y-4" style={{ borderColor: C.border }}>
          {estado === "cargando" && (
            <p className="flex items-center gap-2 text-sm" style={{ color: C.muted }}>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Cargando tu reporte…
            </p>
          )}

          {estado !== "cargando" && !info && (
            <>
              <h1 className="felpus-display text-xl">No pudimos abrir este link</h1>
              <p className="text-sm" style={{ color: C.muted }}>
                {error || "El link no es válido."} Podés actualizar tu reporte desde Felpus.
              </p>
            </>
          )}

          {info && estado === "hecho" && (
            <div className="space-y-3" role="status">
              <p className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: C.successBg, color: C.green }}>
                <Check className="w-5 h-5" aria-hidden="true" />
              </p>
              <h1 className="felpus-display text-xl">¡Gracias!</h1>
              <p className="text-sm leading-relaxed">
                {hecha === "ya_resuelto" ? "Este reporte ya estaba cerrado como reencuentro." : t[hecha].hecho}
              </p>
            </div>
          )}

          {info && estado !== "hecho" && (
            <>
              <h1 className="felpus-display text-xl">
                {cerrado ? "Este reporte ya está cerrado" : info.tipo === "encontrada" ? `¿Pudiste devolver a ${info.nombre}?` : `¿Hubo novedades de ${info.nombre}?`}
              </h1>

              {elegida ? (
                <div className="space-y-3">
                  <p className="text-sm leading-relaxed">{t[elegida].confirmar}</p>
                  <button
                    type="button"
                    onClick={confirmar}
                    disabled={estado === "enviando"}
                    className="w-full min-h-[48px] rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                    style={{ background: elegida === "volvio" ? C.greenSolid : C.emphasisBg }}
                  >
                    {estado === "enviando" && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                    Confirmar
                  </button>
                  <button type="button" onClick={() => setElegida(null)} className="w-full min-h-[44px] text-sm font-semibold underline" style={{ color: C.muted }}>
                    Elegir otra opción
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {(cerrado ? ["baja"] : ["volvio", "sigo", "no_busco"]).map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setElegida(a)}
                      className="w-full min-h-[48px] rounded-xl border text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
                      style={a === "volvio" ? { background: C.greenSolid, color: "#fff", borderColor: C.greenSolid } : { borderColor: C.border, color: C.text }}
                    >
                      {t[a].boton}
                    </button>
                  ))}
                  {!cerrado && info.avisos && (
                    <button type="button" onClick={() => setElegida("baja")} className="w-full min-h-[44px] text-xs underline" style={{ color: C.muted }}>
                      No quiero más avisos por email
                    </button>
                  )}
                </div>
              )}

              {error && (
                <p className="text-xs rounded-lg p-2.5" style={{ background: C.dangerBg, color: C.dangerText }} role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
