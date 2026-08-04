"use client";

// Red de seguridad de último recurso: si el error ocurre en el layout raíz
// mismo (no en una página), error.js no lo puede atajar — Next.js exige que
// esto reemplace TODO el árbol, <html>/<body> incluidos. Por eso va sin
// ThemeProvider, sin Mascot, sin nada que dependa del resto de la app: si
// algo ahí es lo que se rompió, no queremos que este mismo archivo se
// rompa también. Deliberadamente simple y con estilos inline, no clases de
// Tailwind (si el problema fuera de build/CSS, esto igual debe verse bien).
import { useEffect } from "react";
import { logError } from "../lib/log";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    logError("Error no capturado en el layout raíz", error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <div
          style={{
            minHeight: "100vh",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            textAlign: "center",
            background: "#F6EFE4",
            color: "#3A2A1C",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Felpus no pudo cargar</h1>
            <p style={{ fontSize: 14, color: "#6B5643", maxWidth: 360 }}>
              Algo se rompió de nuestro lado. Probá recargar la página.
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            style={{
              borderRadius: 12,
              padding: "10px 16px",
              fontSize: 14,
              fontWeight: 700,
              color: "#fff",
              background: "#D31C22",
              border: "none",
              cursor: "pointer",
            }}
          >
            Intentar de nuevo
          </button>
        </div>
      </body>
    </html>
  );
}
