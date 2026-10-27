// Límite por IP para las rutas que llaman a un modelo de IA (/api/chat e
// /api/import-post). Extraído de /api/chat para no duplicarlo.
//
// Rate limit real (en la base, vía RPC con service_role — misma razón que
// /api/embed: la IP la determina Vercel, no quien llama). Ver
// check_chat_rate_limit en supabase/schema.sql (8 por minuto, 80 por día,
// compartido entre las dos rutas: es el cupo de "IA" de cada IP). Si esa
// función todavía no existe (no se corrió la migración), se usa la de
// /api/embed como respaldo, para que nunca quede sin límite.
async function rpcRateLimit(name, ip) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ client_ip: ip }),
  });
  if (res.status === 404) return null; // función inexistente
  if (!res.ok) return true;
  return (await res.json()) !== false;
}

// Respaldo en memoria por instancia: no reemplaza al de la base (cada cold
// start arranca de cero), pero frena una ráfaga aunque Supabase falle.
export function makeMemoryRateLimit(maxPerMinute) {
  const hits = new Map();
  return function memoryRateLimit(ip, now = Date.now()) {
    const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
    if (recent.length >= maxPerMinute) return false;
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 5000) hits.clear();
    return true;
  };
}

export function makeAiRateLimit({ maxPerMinute = 10 } = {}) {
  const memoryRateLimit = makeMemoryRateLimit(maxPerMinute);
  return async function checkRateLimit(ip) {
    if (!ip) return true;
    if (!memoryRateLimit(ip)) return false;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return true;
    try {
      const chat = await rpcRateLimit("check_chat_rate_limit", ip);
      if (chat !== null) return chat;
      const embed = await rpcRateLimit("check_embed_rate_limit", ip);
      return embed !== false;
    } catch {
      // Mismo criterio que el resto de las rutas: un problema de infra ajeno
      // no tumba la función (el límite en memoria sigue activo).
      return true;
    }
  };
}
