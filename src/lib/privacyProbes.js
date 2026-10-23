// Lecturas que la clave anónima (pública: va en el JS del sitio) NUNCA tiene
// que poder hacer. /api/health las prueba cada 30 minutos con esa misma
// clave; si alguna anda, responde 503 y salud.yml avisa por email. Así una
// migración o un cambio de permisos que vuelva a abrir datos personales se
// detecta en minutos, no cuando alguien de afuera lo encuentra (como el
// WhatsApp de perfil en contributors, 2026-10-23).
export const PRIVACY_PROBES = [
  { name: "reports.contacto_whatsapp", method: "GET", path: "/rest/v1/reports?select=contacto_whatsapp&limit=1" },
  { name: "reports.contacto_email", method: "GET", path: "/rest/v1/reports?select=contacto_email&limit=1" },
  { name: "reports.push_subscription", method: "GET", path: "/rest/v1/reports?select=push_subscription&limit=1" },
  { name: "contributors.whatsapp", method: "GET", path: "/rest/v1/contributors?select=whatsapp&limit=1" },
  {
    name: "storage: listar felpus-photos",
    method: "POST",
    path: "/storage/v1/object/list/felpus-photos",
    body: { prefix: "", limit: 1 },
  },
];

// Una lectura "se filtró" si respondió 2xx con al menos un elemento. Un 4xx
// (permiso denegado) o una lista vacía es lo esperado.
export function probeLeaked(status, body) {
  if (status < 200 || status >= 300) return false;
  return Array.isArray(body) ? body.length > 0 : body != null;
}

export async function runPrivacyProbes(url, anonKey, fetchImpl = fetch) {
  const leaks = [];
  for (const probe of PRIVACY_PROBES) {
    try {
      const res = await fetchImpl(`${url}${probe.path}`, {
        method: probe.method,
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
        body: probe.body ? JSON.stringify(probe.body) : undefined,
        cache: "no-store",
      });
      const body = await res.json().catch(() => null);
      if (probeLeaked(res.status, body)) leaks.push(probe.name);
    } catch {
      // Sin conexión no es una filtración: el chequeo del listado ya cubre
      // que Supabase responda.
    }
  }
  return leaks;
}
