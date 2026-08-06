let identityLoadingPromise = null;

// Carga el script de Google Identity Services (accounts.google.com/gsi/client)
// una sola vez y lo comparte — mismo patrón que loadGoogleMaps() en
// googleMaps.js. Lo usa useAuth.js para el login con Google vía ID token:
// a diferencia del flujo clásico con redirect (signInWithOAuth), que rebota
// por el dominio propio del proyecto de Supabase (ej. "xxxx.supabase.co" —
// lo que ve el usuario en la pantalla "Elige una cuenta" de Google), este
// SDK corre 100% embebido en la propia página, así que ese mismo cartel
// termina mostrando el origen real (felpus.com) en vez del de Supabase. Ver
// PENDIENTE_DECISION.md para el motivo completo y los pasos de configuración
// que esto requiere (variable de entorno + Supabase Dashboard).
export function loadGoogleIdentity() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (identityLoadingPromise) return identityLoadingPromise;
  identityLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.id) resolve(window.google.accounts.id);
      else reject(new Error("Google Identity Services no expuso window.google.accounts.id"));
    };
    script.onerror = () => {
      // Mismo motivo que en loadGoogleMaps(): sin este reset, un fallo de
      // carga puntual (bloqueador de anuncios, corte de red) dejaría la
      // promesa cacheada como rechazada para siempre en esta sesión de la
      // SPA — useAuth.js necesita poder reintentar más adelante.
      identityLoadingPromise = null;
      reject(new Error("No se pudo cargar el script de Google Identity Services."));
    };
    document.head.appendChild(script);
  });
  return identityLoadingPromise;
}

// Nonce de un solo uso para el intercambio de ID token con
// supabase.auth.signInWithIdToken(): se genera un valor aleatorio, se manda
// su hash SHA-256 a Google (parámetro "nonce" de accounts.id.initialize(),
// que Google copia dentro del claim "nonce" del ID token firmado), y se
// manda el valor SIN hashear a Supabase, que hashea de nuevo internamente y
// compara contra ese claim — así Supabase puede verificar que el token que
// recibió es el que efectivamente pedimos nosotros en este intento, y no
// uno capturado/reutilizado de otro contexto. Patrón documentado por
// Supabase para este flujo (Sign in with Google, ID token), no una
// invención propia — ver
// https://supabase.com/docs/guides/auth/social-login/auth-google
export async function generateNonce() {
  const rawBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = btoa(String.fromCharCode(...rawBytes));
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  const hashedNonce = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { nonce, hashedNonce };
}
