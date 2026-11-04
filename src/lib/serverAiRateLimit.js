// Límite para las rutas que cuestan: IA (/api/chat, /api/import-post) y
// vectores/chequeo de fotos (/api/embed, /api/photo-check).
//
// 1. Primero un respaldo en memoria por IP (frena ráfagas sin ir a la base).
// 2. Después el cupo real en la base: felpus_limite (migración 20261104_01),
//    por IP (bloque /64 en IPv6) y un tope GLOBAL por día, que es el que
//    pone techo al costo aunque alguien rote IPs. La IP la determina Vercel,
//    no quien llama.
// 3. Si felpus_limite no existe todavía, la función vieja (check_chat_rate_limit
//    o check_embed_rate_limit), como antes.
// 4. Si la base no responde: en las de IA (failClosed) solo pasa un cupo
//    chico por instancia, en vez de dejar pasar todo como antes; en las de
//    fotos se deja pasar (no cuestan plata y no deben trabar la publicación).
import { avisarTopeGlobal, clavesLimite, consultarLimite, ipParaLimite, makeWindowLimiter } from "./serverRateLimit";

async function rpcViejo(name, ip, env, fetchImpl) {
  const res = await fetchImpl(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ client_ip: ip }),
  });
  if (res.status === 404) return null; // función inexistente
  if (!res.ok) return undefined; // error de la base
  return (await res.json()) !== false;
}

// Compatibilidad: respaldo en memoria por IP (por minuto).
export function makeMemoryRateLimit(maxPerMinute) {
  return makeWindowLimiter({ max: maxPerMinute, windowMs: 60_000 });
}

export function makeAiRateLimit({
  maxPerMinute = 10,
  bucket = "ia",
  legacy = ["check_chat_rate_limit", "check_embed_rate_limit"],
  failClosed = true,
  instanceMaxPerMinute = 20,
  env = process.env,
  fetchImpl = (...args) => fetch(...args),
} = {}) {
  const porIp = makeWindowLimiter({ max: maxPerMinute, windowMs: 60_000 });
  const porInstancia = makeWindowLimiter({ max: instanceMaxPerMinute, windowMs: 60_000 });
  const sinBase = () => (failClosed ? porInstancia("todo") : true);

  return async function checkRateLimit(ip) {
    const red = ipParaLimite(ip);
    if (!porIp(red)) return false;
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return sinBase();

    const r = await consultarLimite(bucket, clavesLimite({ ip }), { env, fetchImpl });
    if (r.estado === "ok") return true;
    if (r.estado === "limite") {
      if (r.tipo === "global") await avisarTopeGlobal(bucket, env);
      return false;
    }
    if (r.estado === "error") return sinBase();

    // Sin la migración 20261104_01: límite viejo por IP.
    try {
      for (const name of legacy) {
        const ok = await rpcViejo(name, red, env, fetchImpl);
        if (ok === null) continue;
        if (ok === undefined) return sinBase();
        return ok;
      }
    } catch {
      // Cae al de abajo.
    }
    return sinBase();
  };
}
