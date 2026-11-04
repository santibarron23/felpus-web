// ¿La sesión es la del admin? Solo decide si se MUESTRA el panel de admin
// en el navegador. La barrera real está en la base (auth.email() en cada
// función admin_*) y en las rutas /api/admin/* (getAuthUser + ADMIN_EMAIL).
//
// Protección de código (2026-11-04): antes el email del admin iba escrito
// tal cual en el JS público del sitio (cualquiera lo leía con "ver código
// fuente": un blanco fácil para phishing). Ahora el navegador solo conoce su
// huella SHA-256 y la compara con la del email de la sesión.
export const ADMIN_EMAIL_SHA256 = "2e890b28eabf1f0cf45b95f90e4b70e7be4d10c5e5e07e22654de27a5f6001e3";

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function esEmailAdmin(email) {
  if (typeof email !== "string" || !email || !globalThis.crypto?.subtle) return false;
  try {
    return (await sha256Hex(email.trim().toLowerCase())) === ADMIN_EMAIL_SHA256;
  } catch {
    return false;
  }
}
