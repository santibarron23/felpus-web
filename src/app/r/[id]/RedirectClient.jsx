"use client";

import { useEffect } from "react";
import { useTheme } from "../../../components/felpus/ThemeProvider";

// Los crawlers de redes sociales (Facebook, WhatsApp, X, Slack, etc.) piden
// esta URL sin ejecutar JavaScript, así que solo leen las meta etiquetas que
// arma generateMetadata() en page.js — nunca llegan a ver este componente ni
// disparan el redirect. Las personas reales sí lo ejecutan, y caen
// directo en la publicación abierta dentro de la app (?r= ya lo maneja
// FelpusMatcher).
export default function RedirectClient({ id }) {
  const C = useTheme();
  useEffect(() => {
    window.location.replace(`/?r=${encodeURIComponent(id)}`);
  }, [id]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center" style={{ background: C.cream, color: C.muted }}>
      <p className="text-sm">Abriendo la publicación en Felpus…</p>
    </div>
  );
}
