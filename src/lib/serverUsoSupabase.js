// Aviso temprano de uso de Supabase (2026-11-02, a pedido): el 31/10 hubo
// un pico de ~6,9 GB de logs en un día (lo normal es casi nada) y no se
// pudo averiguar la causa porque el plan gratis guarda el detalle de los
// logs solo un día. Esto cuenta cada hora cuántos eventos de log generó cada
// servicio (lo mismo que Supabase cobra como "Log Ingestion") y, si se
// dispara, le avisa al admin (serverAdminAlerts.js) con las rutas más
// pedidas de esa hora, mientras el detalle todavía existe.
//
// Usa la Management API de Supabase (GET /v1/projects/{ref}/analytics/
// endpoints/logs, SQL de ClickHouse sobre la tabla `logs`), con un token
// personal (SUPABASE_ACCESS_TOKEN) que solo necesita el permiso
// analytics_logs_read. Sin token no hace nada. Límite de la API: 30
// pedidos por minuto; esto hace 1 o 2 por hora.
export const VENTANA_MIN = 60;
// Lo normal (02/11) ronda unos cientos de pedidos por hora; el 31/10 fueron
// del orden de cientos de miles. 20.000 eventos en una hora es ~30 veces lo
// normal. Se puede cambiar con USO_ALERTA_EVENTOS_HORA.
export const UMBRAL_EVENTOS_HORA = 20_000;

const SQL_POR_FUENTE = "select source, count() as n from logs group by source order by n desc limit 20";
const SQL_TOP_RUTAS = `select log_attributes['request.method'] as metodo, log_attributes['request.path'] as ruta,
  log_attributes['response.status_code'] as estado, count() as n
from logs where source = 'edge_logs'
group by metodo, ruta, estado order by n desc limit 8`;

export function projectRef(supabaseUrl) {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

// Filas de la API ({ result: [...] }) → [{ fuente, n }] ordenado. Tolera
// que n venga como texto.
export function contarPorFuente(data) {
  const filas = Array.isArray(data?.result) ? data.result : [];
  return filas
    .map((f) => ({ fuente: String(f?.source ?? "?"), n: Number(f?.n) || 0 }))
    .filter((f) => f.n > 0)
    .sort((a, b) => b.n - a.n);
}

export function topRutas(data) {
  const filas = Array.isArray(data?.result) ? data.result : [];
  return filas.map((f) => ({
    metodo: String(f?.metodo || ""),
    ruta: String(f?.ruta || "").slice(0, 120),
    estado: String(f?.estado || ""),
    n: Number(f?.n) || 0,
  }));
}

export function evaluarUso(porFuente, umbral = UMBRAL_EVENTOS_HORA) {
  const total = porFuente.reduce((s, f) => s + f.n, 0);
  return { total, alto: total >= umbral };
}

// Texto de la alerta: total, por servicio y rutas más pedidas.
export function detalleAlerta({ total, porFuente, rutas, umbral }) {
  const fuentes = porFuente.map((f) => `${f.fuente}: ${f.n.toLocaleString("es-AR")}`).join(", ");
  const top = rutas.length
    ? ` Rutas más pedidas: ${rutas.map((r) => `${r.metodo} ${r.ruta} (${r.estado}) ×${r.n.toLocaleString("es-AR")}`).join("; ")}.`
    : "";
  return `En la última hora Supabase registró ${total.toLocaleString("es-AR")} eventos de log (el aviso salta desde ${umbral.toLocaleString("es-AR")}). Por servicio: ${fuentes}.${top} El detalle de los logs se borra en un día: miralo hoy en Supabase → Logs.`;
}

// Consulta la API de logs. Devuelve el JSON o tira con un mensaje claro.
async function consultarLogs({ ref, token, sql, desde, hasta, fetchImpl }) {
  const params = new URLSearchParams({ sql, iso_timestamp_start: desde.toISOString(), iso_timestamp_end: hasta.toISOString() });
  const res = await fetchImpl(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Management API ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(`Management API: ${typeof data.error === "string" ? data.error : JSON.stringify(data.error).slice(0, 200)}`);
  return data;
}

// Revisa la última hora. { configurado: false } sin token; si no, el
// conteo, si es alto y (si lo es) las rutas más pedidas y la alerta armada.
export async function revisarUso({ env = process.env, now = Date.now(), fetchImpl = fetch } = {}) {
  const token = env.SUPABASE_ACCESS_TOKEN;
  const ref = projectRef(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!token || !ref) return { configurado: false };
  const umbral = Number(env.USO_ALERTA_EVENTOS_HORA) || UMBRAL_EVENTOS_HORA;
  const hasta = new Date(now);
  const desde = new Date(now - VENTANA_MIN * 60_000);
  const porFuente = contarPorFuente(await consultarLogs({ ref, token, sql: SQL_POR_FUENTE, desde, hasta, fetchImpl }));
  const { total, alto } = evaluarUso(porFuente, umbral);
  if (!alto) return { configurado: true, total, umbral, porFuente, alto };
  // Solo cuando hay pico: qué se pidió (si falla, la alerta sale igual).
  const rutas = await consultarLogs({ ref, token, sql: SQL_TOP_RUTAS, desde, hasta, fetchImpl })
    .then(topRutas)
    .catch(() => []);
  return {
    configurado: true,
    total,
    umbral,
    porFuente,
    rutas,
    alto,
    alerta: {
      firma: "uso:logs",
      titulo: "Pico de uso en Supabase",
      detalle: detalleAlerta({ total, porFuente, rutas, umbral }),
    },
  };
}
