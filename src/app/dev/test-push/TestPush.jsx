"use client";

import { useState } from "react";
import { useAuth } from "../../../components/felpus/useAuth";
import AlertOptInModal from "../../../components/felpus/AlertOptInModal";
import AdminEditReport from "../../../components/felpus/AdminEditReport";
import { authedFetch, needsIosInstallForPush, pushPermissionState, subscribeUserPush } from "../../../lib/push";

// Publicación de ejemplo para ver el editor del admin sin tocar datos reales
// (guardar desde acá falla con "No autorizado" salvo con la sesión del admin).
const SAMPLE_REPORT = {
  id: "ejemplo-dev",
  tipo: "perdida",
  especie: "perro",
  nombre: "Ejemplo",
  color: "Negro",
  tamano: "mediano",
  zona: "Tres Cerritos",
  ciudad: "Salta",
  fecha: "2026-10-20",
  descripcion: "Publicación de prueba.",
  fotos: [{ url: "/assets/mascot_hero.webp" }, { url: "/assets/icon-512.png" }, { url: "/assets/logo_square_red.png" }],
};

export default function TestPush() {
  const { user, authLoading, signInWithGoogle } = useAuth(() => {});
  const [log, setLog] = useState([]);
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(false);
  const add = (line) => setLog((l) => [...l, line]);

  async function subscribe() {
    try {
      await subscribeUserPush();
      add(`Dispositivo suscripto (permiso: ${pushPermissionState()}).`);
    } catch (e) {
      add(`Error al suscribir: ${e.message}`);
    }
  }

  async function send() {
    const res = await authedFetch("/api/dev/test-push", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    add(res.ok ? `Enviado a ${data.sent} de ${data.devices} dispositivos.` : `Error: ${data.error || res.status}`);
  }

  return (
    <main className="max-w-md mx-auto p-6 space-y-4 text-sm">
      <h1 className="text-xl font-bold">Prueba de notificaciones (solo desarrollo)</h1>
      {authLoading ? (
        <p>Cargando…</p>
      ) : !user ? (
        <button type="button" onClick={signInWithGoogle} className="rounded-lg border px-4 py-2 font-semibold">
          Iniciar sesión con Google
        </button>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={subscribe} className="rounded-lg border px-4 py-2 font-semibold">
            1. Suscribir este dispositivo
          </button>
          <button type="button" onClick={send} className="rounded-lg border px-4 py-2 font-semibold">
            2. Mandarme un push
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => setModal("perdida")} className="rounded-lg border px-4 py-2 font-semibold">
          Ver aviso (perdida)
        </button>
        <button type="button" onClick={() => setModal("encontrada")} className="rounded-lg border px-4 py-2 font-semibold">
          Ver aviso (encontrada)
        </button>
      </div>
      <button type="button" onClick={() => setEditing(true)} className="rounded-lg border px-4 py-2 font-semibold">
        Ver editor de admin
      </button>
      {editing && <AdminEditReport report={SAMPLE_REPORT} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
      {modal && (
        <AlertOptInModal
          tipo={modal}
          iosNeedsInstall={needsIosInstallForPush()}
          busy={false}
          onClose={() => setModal(null)}
          onAccept={() => {
            add("Tocaste «Sí, avisame».");
            setModal(null);
          }}
        />
      )}
      <ul className="space-y-1" aria-live="polite">
        {log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </main>
  );
}
