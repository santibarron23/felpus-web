// Cupos contra ataques automatizados (revisión de seguridad 2026-11-04):
// publicar, ver contactos, IA y vectores de fotos. El conteo vive en la base
// (felpus_limite, migración 20261104_01) para que lo compartan todas las
// instancias del servidor y sea atómico. Si esa función todavía no existe,
// cada ruta usa su límite viejo de respaldo.
//
// Claves de cupo:
//   ip:<ip>     visitante sin sesión
//   user:<id>   cuenta con sesión (verificada contra Supabase Auth)
//   ipc:<ip>    IP de alguien con sesión: más margen, para que varias personas
//               detrás de la misma IP (datos móviles, wifi de una veterinaria)
//               no se frenen entre sí
//   global      todo el sitio: tope diario de costo aunque se roten IPs

// Una conexión IPv6 de casa o de celular suele recibir un bloque /64 entero
// (2^64 direcciones): contar por dirección exacta dejaba rotar sin límite.
// Se cuenta por bloque /64. IPv4 queda igual.
export function ipParaLimite(ip) {
  const raw = String(ip || "").trim().toLowerCase();
  if (!raw.includes(":")) return raw || "sin-ip";
  const mapped = raw.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return mapped[1];
  const sinZona = raw.split("%")[0];
  const [izq, der = ""] = sinZona.split("::");
  const a = izq ? izq.split(":") : [];
  const b = sinZona.includes("::") && der ? der.split(":") : [];
  const relleno = sinZona.includes("::") ? Array(Math.max(0, 8 - a.length - b.length)).fill("0") : [];
  const grupos = [...a, ...relleno, ...b].slice(0, 4).map((g) => (g.replace(/^0+(?=.)/, "") || "0"));
  while (grupos.length < 4) grupos.push("0");
  return `${grupos.join(":")}::/64`;
}

export function clavesLimite({ ip, userId = null }) {
  const red = ipParaLimite(ip);
  return userId ? [`user:${userId}`, `ipc:${red}`, "global"] : [`ip:${red}`, "global"];
}

// -> { estado: "ok" } | { estado: "limite", tipo } | { estado: "sin_funcion" } | { estado: "error" }
export async function consultarLimite(bucket, claves, { ref = null, env = process.env, fetchImpl = fetch } = {}) {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { estado: "error" };
  try {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/felpus_limite`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_bucket: bucket, p_claves: claves, p_ref: ref }),
    });
    if (res.status === 404) return { estado: "sin_funcion" };
    if (!res.ok) return { estado: "error" };
    const tipo = await res.json();
    return tipo ? { estado: "limite", tipo: String(tipo) } : { estado: "ok" };
  } catch {
    return { estado: "error" };
  }
}

// Respaldo en memoria por instancia (cada arranque en frío empieza de cero):
// no reemplaza al de la base, pero frena una ráfaga si la base falla.
export function makeWindowLimiter({ max, windowMs, maxKeys = 5000 }) {
  const hits = new Map();
  return function permitir(key, now = Date.now()) {
    const recientes = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recientes.length >= max) {
      hits.set(key, recientes);
      return false;
    }
    recientes.push(now);
    hits.set(key, recientes);
    if (hits.size > maxKeys) hits.clear();
    return true;
  };
}

// Si se llega al tope global, algo raro pasa (o se hizo viral): aviso al
// admin, como mucho uno cada 30 minutos por tipo (ver serverAdminAlerts.js).
// Import diferido: serverAdminAlerts trae web-push, que no hace falta cargar
// en cada pedido.
const NOMBRES = { reporte: "publicaciones", contacto: "consultas de contacto", ia: "pedidos a la IA", embed: "análisis de fotos", foto: "subidas de fotos" };
const ultimoAviso = new Map();
export async function avisarTopeGlobal(bucket, env = process.env, now = Date.now()) {
  // Mientras dure el tope, cada pedido frenado llegaría acá: uno cada 10
  // minutos por instancia alcanza (la base además silencia 30 minutos).
  if (now - (ultimoAviso.get(bucket) || 0) < 10 * 60_000) return;
  ultimoAviso.set(bucket, now);
  try {
    const { alertarAdmin } = await import("./serverAdminAlerts");
    await alertarAdmin(
      {
        firma: `limite-global:${bucket}`,
        titulo: `Felpus llegó al tope diario de ${NOMBRES[bucket] || bucket}`,
        detalle: `Se frenaron pedidos de "${bucket}" por el tope global (tabla limites_config). Si es tráfico real, subí el cupo; si no, puede ser un ataque automatizado.`,
      },
      env
    );
  } catch {
    // El aviso nunca rompe la respuesta.
  }
}
