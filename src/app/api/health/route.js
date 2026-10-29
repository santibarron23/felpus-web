import { REPORT_LIST_ALL_COLUMNS, missingCoordAprox, withLegacyCoords } from "../../../lib/reportColumns";
import { runPrivacyProbes } from "../../../lib/privacyProbes";
import { alertarAdmin } from "../../../lib/serverAdminAlerts";

// Chequeo de salud (lo llama .github/workflows/salud.yml cada 30 minutos):
// hace EXACTAMENTE la consulta del listado público con la clave anónima, el
// mismo rol que usa cualquier visitante. Si Supabase la rechaza (por ejemplo
// una columna sin "grant select", como pasó el 2026-10-20) o no hay
// reportes, responde 503 y el workflow falla, y GitHub te avisa por email.
// No devuelve datos de ningún reporte: solo si anduvo y cuántos hay.
// También prueba que esa clave NO pueda leer datos personales (contacto,
// WhatsApp de perfil, listado de fotos — ver lib/privacyProbes.js): si
// alguna lectura anda, responde 503 con el nombre de la filtración.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cada falla le avisa además al admin por email y push (serverAdminAlerts.js),
// una vez cada 30 minutos por tipo: así se entera aunque no mire GitHub.
const ALERTA = {
  listado: "El listado de reportes no carga",
  vacio: "El listado de reportes volvió vacío",
  filtracion: "Datos privados legibles con la clave pública",
  permisos: "Permisos de la base desactualizados",
  conexion: "Sin conexión con Supabase",
};

export async function GET() {
  const res = await chequear();
  if (res.status === 503) {
    const body = await res.clone().json().catch(() => ({}));
    const tipo = body.tipo || "conexion";
    await alertarAdmin({
      firma: `salud:${tipo}`,
      titulo: `felpus.com: ${ALERTA[tipo] || "falla el chequeo de salud"}`,
      detalle: `El chequeo de /api/health falló: ${JSON.stringify({ ...body, tipo: undefined }).slice(0, 400)}`,
    });
  }
  return res;
}

async function chequear() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return Response.json({ ok: false, error: "Supabase no configurado." }, { status: 503 });
  try {
    const listado = (cols) =>
      fetch(`${url}/rest/v1/reports?select=${cols.join(",")}&limit=1`, {
        headers: { apikey: anon, Authorization: `Bearer ${anon}`, Prefer: "count=exact", Range: "0-0" },
        cache: "no-store",
      });
    // Igual que fetchReports: sin la migración 20261029_01 todavía no existe
    // lat_aprox y el sitio usa lat/lng (ver reportColumns.js).
    let res = await listado(REPORT_LIST_ALL_COLUMNS);
    let coordsAprox = true;
    if (!res.ok && missingCoordAprox(await res.clone().json().catch(() => null))) {
      coordsAprox = false;
      res = await listado(withLegacyCoords(REPORT_LIST_ALL_COLUMNS));
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return Response.json(
        { ok: false, tipo: "listado", status: res.status, code: body?.code || null, error: body?.message || "Supabase rechazó el listado." },
        { status: 503 }
      );
    }
    const total = Number(res.headers.get("content-range")?.split("/")[1]);
    if (!Number.isFinite(total) || total === 0) {
      return Response.json({ ok: false, tipo: "vacio", error: "El listado volvió vacío." }, { status: 503 });
    }
    // Las coordenadas exactas solo se exigen privadas una vez corrida la
    // migración (antes, el sitio todavía las necesita).
    const leaks = await runPrivacyProbes(url, anon, fetch, { coordsAprox });
    if (leaks.length) {
      return Response.json({ ok: false, tipo: "filtracion", error: "Datos privados legibles con la clave pública.", leaks }, { status: 503 });
    }
    // Permisos que la app necesita (o que no deberían estar), según la base
    // misma: felpus_permisos_faltantes() (migración 20261028_02). Se agregó
    // después de que correr un schema.sql viejo dejara a los colaboradores
    // sin poder guardar el perfil. Sin la función (404), se saltea.
    const perm = await fetch(`${url}/rest/v1/rpc/felpus_permisos_faltantes`, {
      method: "POST",
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    if (perm.ok) {
      const faltan = await perm.json().catch(() => []);
      if (Array.isArray(faltan) && faltan.length) {
        return Response.json({ ok: false, tipo: "permisos", error: "Permisos de la base desactualizados.", permisos: faltan }, { status: 503 });
      }
    }
    return Response.json({ ok: true, reports: total });
  } catch (e) {
    return Response.json({ ok: false, tipo: "conexion", error: e?.message || "Sin conexión con Supabase." }, { status: 503 });
  }
}
