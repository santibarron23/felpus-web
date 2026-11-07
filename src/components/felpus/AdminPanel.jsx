"use client";

// Panel de administrador (pestaña "admin" de FelpusMatcher). Vive en su propio
// archivo y se carga con next/dynamic (2026-11-07): antes viajaba dentro del
// JS de la home para todos los visitantes, aunque solo lo usa el admin.
// Todo el estado sigue en FelpusMatcher (loadAdminData lo llena al abrir la
// pestaña); acá llegan los valores y handlers por props.
import { useState } from "react";
import Image from "next/image";
import { ShieldCheck, Loader2, Download, AlertCircle, AlertTriangle, Eye, EyeOff, Trash2, X, Check, Pencil } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import AdminUsers from "./AdminUsers";
import ImpactPanel from "./ImpactPanel";
import { reportFlagReasonLabel } from "../../lib/matching";
import { petTitle } from "../../lib/petTitle";
import { zonaConCiudad } from "../../lib/zona";
import { authedFetch } from "../../lib/push";

// Una tarjeta de desglose del panel de admin (ver computeAdminBreakdowns en
// matching.js): título + lista de barras horizontales, cada una con
// etiqueta, cantidad y porcentaje. Componente a nivel de módulo con su propio useTheme(), no recibe
// C por prop.
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

export default function AdminPanel({
  handleDownloadUsersReport,
  usersReportLoading,
  adminFlags,
  adminSection,
  setAdminSection,
  adminLoading,
  adminError,
  loadAdminData,
  loadAll,
  adminImpact,
  adminMetrics,
  adminBreakdowns,
  openAdminFlaggedReportDetail,
  handleAdminToggleOculto,
  adminBusyId,
  adminDeleteConfirmId,
  setAdminDeleteConfirmId,
  handleAdminDelete,
  adminSearch,
  setAdminSearch,
  adminSoloFotosDudosas,
  setAdminSoloFotosDudosas,
  adminFotosDudosasCount,
  adminFilteredReports,
  adminAllReports,
  openReportDetail,
  tieneFotoDudosa,
  setAdminEditing,
}) {
  const C = useTheme();
  const [alertaPrueba, setAlertaPrueba] = useState(null); // null | "enviando" | mensaje
  const [usoSupabase, setUsoSupabase] = useState(null); // null | "revisando" | mensaje
  return (
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

      <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
        {[
          { id: "impacto", label: "Impacto" },
          { id: "metricas", label: "Métricas" },
          { id: "denuncias", label: `Denuncias${adminFlags.length ? ` (${adminFlags.length})` : ""}` },
          { id: "reportes", label: "Reportes" },
          { id: "usuarios", label: "Usuarios" },
        ].map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setAdminSection(s.id)}
            className="flex-1 shrink-0 whitespace-nowrap px-2.5 text-xs font-bold py-2 rounded-lg border"
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

      {!adminLoading && !adminError && adminSection === "impacto" && <ImpactPanel metrics={adminImpact} />}

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

          {/* Alertas al admin (serverAdminAlerts.js): probar que el email y el
              push lleguen. */}
          <div className="col-span-2 rounded-xl p-3 border space-y-2" style={{ borderColor: C.border, background: C.surface }}>
            <p className="text-[13px] font-bold" style={{ color: C.text }}>Alertas de la plataforma</p>
            <p className="text-[12px] leading-snug" style={{ color: C.muted }}>
              Te avisamos por email y por notificación (en los dispositivos donde activaste notificaciones con esta cuenta)
              si el listado no carga, si alguien no puede publicar o si varias personas tienen el mismo error.
            </p>
            <button
              type="button"
              disabled={alertaPrueba === "enviando"}
              onClick={async () => {
                setAlertaPrueba("enviando");
                try {
                  const res = await authedFetch("/api/admin/alerta-prueba", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
                  const data = await res.json().catch(() => ({}));
                  setAlertaPrueba(
                    data.enviada
                      ? `Enviada por ${data.canales.join(" y ")}.`
                      : data.motivo === "silencio"
                        ? "Ya mandaste una hace menos de 30 minutos."
                        : "No salió: revisá RESEND_API_KEY y las claves VAPID en Vercel."
                  );
                } catch {
                  setAlertaPrueba("No se pudo mandar. Probá de nuevo.");
                }
              }}
              className="min-h-[44px] px-3 rounded-lg border text-[13px] font-bold disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              style={{ borderColor: C.border, color: C.text }}
            >
              {alertaPrueba === "enviando" ? "Enviando…" : "Mandarme una alerta de prueba"}
            </button>
            {alertaPrueba && alertaPrueba !== "enviando" && (
              <p className="text-[12px]" style={{ color: C.text }} role="status">{alertaPrueba}</p>
            )}
            {/* Uso de Supabase (serverUsoSupabase.js): cada hora se
                revisa solo; esto lo muestra ahora y confirma el token. */}
            <button
              type="button"
              disabled={usoSupabase === "revisando"}
              onClick={async () => {
                setUsoSupabase("revisando");
                try {
                  const res = await authedFetch("/api/admin/uso", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
                  const d = await res.json().catch(() => ({}));
                  setUsoSupabase(
                    d.configurado === false
                      ? "Falta configurar SUPABASE_ACCESS_TOKEN en Vercel."
                      : d.error
                        ? `No se pudo consultar: ${d.error}. Revisá el token (permiso analytics_logs_read).`
                        : `Última hora: ${Number(d.total).toLocaleString("es-AR")} eventos de log (aviso desde ${Number(d.umbral).toLocaleString("es-AR")}). ${(d.porFuente || []).map((f) => `${f.fuente}: ${f.n.toLocaleString("es-AR")}`).join(", ")}`
                  );
                } catch {
                  setUsoSupabase("No se pudo consultar. Probá de nuevo.");
                }
              }}
              className="min-h-[44px] px-3 rounded-lg border text-[13px] font-bold disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--felpus-focus)]/50"
              style={{ borderColor: C.border, color: C.text }}
            >
              {usoSupabase === "revisando" ? "Revisando…" : "Revisar uso de Supabase ahora"}
            </button>
            {usoSupabase && usoSupabase !== "revisando" && (
              <p className="text-[12px]" style={{ color: C.text }} role="status">{usoSupabase}</p>
            )}
          </div>

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
  );
}
