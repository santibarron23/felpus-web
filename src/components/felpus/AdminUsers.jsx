"use client";

// Panel de admin → Usuarios (2026-10-26): reglas antifraude.
// Muestra cada cuenta con sus señales (denuncias a sus reportes, reportes
// ocultos, reportes en las últimas 24 h, denuncias a su alias de apoyos), un
// puntaje de riesgo para ordenar, y deja banear / desbanear. Ver
// admin_user_signals y admin_set_baneado en la migración 20261026_02.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { adminFetchUserSignals, adminMarkSupportReviewed, adminSetBaneado } from "../../lib/store";
import { userRisk, BAN_REASONS } from "../../lib/antifraude";

export default function AdminUsers({ onChanged }) {
  const C = useTheme();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("sospechosos"); // sospechosos | baneados | todos
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [banningId, setBanningId] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setUsers(await adminFetchUserSignals());
    } catch (e) {
      setError(e?.message || "No se pudieron cargar los usuarios.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users || [])
      .map((u) => ({ ...u, risk: userRisk(u) }))
      .filter((u) => (filter === "baneados" ? u.baneado : filter === "sospechosos" ? !u.baneado && u.risk.score > 0 : true))
      .filter((u) => !q || [u.email, u.nickname].some((v) => (v || "").toLowerCase().includes(q)))
      .sort((a, b) => b.risk.score - a.risk.score);
  }, [users, filter, search]);

  async function setBan(u, baneado, motivo) {
    setBusyId(u.id);
    try {
      await adminSetBaneado(u.id, baneado, motivo);
      setBanningId(null);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e?.message || "No se pudo actualizar la cuenta.");
    } finally {
      setBusyId(null);
    }
  }

  async function markReviewed(u) {
    setBusyId(u.id);
    try {
      await adminMarkSupportReviewed(u.id);
      await load();
    } catch (e) {
      setError(e?.message || "No se pudo marcar como revisado.");
    } finally {
      setBusyId(null);
    }
  }

  const counts = useMemo(() => {
    const list = (users || []).map((u) => ({ ...u, risk: userRisk(u) }));
    return { sospechosos: list.filter((u) => !u.baneado && u.risk.score > 0).length, baneados: list.filter((u) => u.baneado).length, todos: list.length };
  }, [users]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border p-3 text-[12px] space-y-1" style={{ borderColor: C.border, background: C.surfaceSubtle, color: C.muted }}>
        <p className="font-bold text-xs" style={{ color: C.text }}>Reglas automáticas</p>
        <p>• Un reporte con 3 denuncias de personas distintas se oculta solo.</p>
        <p>• Un alias de apoyos con 3 denuncias deja de mostrarse hasta que lo marques como revisado.</p>
        <p>• Una cuenta baneada no puede publicar, no aparece en el ranking, no recibe apoyos y se ocultan todos sus reportes.</p>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {[
          { id: "sospechosos", label: `Sospechosos (${counts.sospechosos})` },
          { id: "baneados", label: `Baneados (${counts.baneados})` },
          { id: "todos", label: `Todos (${counts.todos})` },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold border"
            style={filter === f.id ? { background: C.ink, color: C.cream, borderColor: C.ink } : { color: C.muted, borderColor: C.border, background: C.surface }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por email o apodo"
        aria-label="Buscar usuarios"
        className="felpus-input w-full border rounded-lg px-3 py-2 text-sm bg-[var(--felpus-surface-subtle)]"
        style={{ borderColor: C.border, color: C.text }}
      />

      {error && <p className="text-sm" style={{ color: C.redDark }} role="alert">{error}</p>}
      {!users && !error && (
        <p className="flex items-center gap-2 text-sm py-6 justify-center" style={{ color: C.muted }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando usuarios…
        </p>
      )}
      {users && rows.length === 0 && (
        <p className="text-sm text-center py-6" style={{ color: C.muted }}>
          {filter === "sospechosos" ? "No hay cuentas con señales de fraude. 🎉" : "No hay cuentas en esta lista."}
        </p>
      )}

      {rows.slice(0, 200).map((u) => (
        <div key={u.id} className="rounded-xl border p-3 space-y-2" style={{ borderColor: u.baneado ? C.redSolid : C.border, background: C.surface }}>
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: C.text }}>
                {u.nickname || "Sin apodo"} <span className="font-normal" style={{ color: C.muted }}>· {u.points} huellitas</span>
              </p>
              <p className="text-[12px] truncate" style={{ color: C.muted }}>{u.email}</p>
            </div>
            {u.baneado ? (
              <span className="text-[11px] font-bold px-2 py-1 rounded-full" style={{ background: C.dangerBg, color: C.redDark }}>Baneada</span>
            ) : u.risk.score > 0 ? (
              <span
                className="text-[11px] font-bold px-2 py-1 rounded-full"
                style={u.risk.level === "alto" ? { background: C.dangerBg, color: C.redDark } : { background: C.brandTintBg, color: C.orangeInk }}
              >
                Riesgo {u.risk.level}
              </span>
            ) : null}
          </div>

          {u.risk.reasons.length > 0 && (
            <ul className="text-[12px] space-y-0.5" style={{ color: C.text }}>
              {u.risk.reasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          )}
          {u.baneado && u.baneado_motivo && (
            <p className="text-[12px]" style={{ color: C.muted }}>Motivo: {u.baneado_motivo}</p>
          )}
          <p className="text-[11px]" style={{ color: C.muted }}>
            {u.reportes_total} {u.reportes_total === 1 ? "reporte" : "reportes"}
            {u.acepta_apoyos ? " · acepta apoyos" : ""}
          </p>

          {banningId === u.id ? (
            <div className="space-y-1.5">
              <p className="text-[12px] font-semibold" style={{ color: C.text }}>Motivo del baneo (se ocultan todos sus reportes):</p>
              {BAN_REASONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={busyId === u.id}
                  onClick={() => setBan(u, true, m)}
                  className="w-full text-left text-[13px] rounded-lg border px-3 py-2 disabled:opacity-60"
                  style={{ borderColor: C.border, color: C.text }}
                >
                  {m}
                </button>
              ))}
              <button type="button" onClick={() => setBanningId(null)} className="text-[12px] font-semibold px-1" style={{ color: C.muted }}>
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {u.baneado ? (
                <button
                  type="button"
                  disabled={busyId === u.id}
                  onClick={() => setBan(u, false)}
                  className="flex items-center gap-1 text-[12px] font-bold rounded-lg border px-3 py-1.5 disabled:opacity-60"
                  style={{ borderColor: C.border, color: C.text }}
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Desbanear
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busyId === u.id}
                  onClick={() => setBanningId(u.id)}
                  className="flex items-center gap-1 text-[12px] font-bold rounded-lg px-3 py-1.5 text-white disabled:opacity-60"
                  style={{ background: C.redSolid }}
                >
                  <Ban className="w-3.5 h-3.5" /> Banear
                </button>
              )}
              {u.denuncias_alias > 0 && (
                <button
                  type="button"
                  disabled={busyId === u.id}
                  onClick={() => markReviewed(u)}
                  className="flex items-center gap-1 text-[12px] font-bold rounded-lg border px-3 py-1.5 disabled:opacity-60"
                  style={{ borderColor: C.border, color: C.text }}
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> Alias revisado
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
