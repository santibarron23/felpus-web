// Digital Asset Links: le prueba a Android que la app de Play Store
// (Trusted Web Activity, ver docs/PLAY_STORE.md) y felpus.com son del mismo
// dueño. Sin esto la app igual abre, pero muestra una barra de dirección de
// Chrome arriba, como si fuera una pestaña del navegador.
//
// Las huellas SHA-256 del certificado salen de Play Console (Configuración
// de la app → Integridad de la app → Firma de apps) recién después de crear
// la app, por eso no están escritas acá: se cargan en Vercel como variable
// de entorno ANDROID_SHA256_CERT_FINGERPRINTS (varias separadas por coma:
// la de "clave de firma de apps" de Google y la de "clave de carga"/la que
// generó PWABuilder) y se redeploya. Sin la variable devuelve [] — JSON
// válido que no vincula nada, así no rompe ni habilita nada por error.
const PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME || "com.felpus.app";

export function GET() {
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS || "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));

  const body = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: { namespace: "android_app", package_name: PACKAGE_NAME, sha256_cert_fingerprints: fingerprints },
        },
      ]
    : [];

  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
