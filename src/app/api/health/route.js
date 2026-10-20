import { REPORT_LIST_ALL_COLUMNS } from "../../../lib/reportColumns";

// Chequeo de salud (lo llama .github/workflows/salud.yml cada 30 minutos):
// hace EXACTAMENTE la consulta del listado público con la clave anónima, el
// mismo rol que usa cualquier visitante. Si Supabase la rechaza (por ejemplo
// una columna sin "grant select", como pasó el 2026-10-20) o no hay
// reportes, responde 503 y el workflow falla, y GitHub te avisa por email.
// No devuelve datos de ningún reporte: solo si anduvo y cuántos hay.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return Response.json({ ok: false, error: "Supabase no configurado." }, { status: 503 });
  try {
    const res = await fetch(`${url}/rest/v1/reports?select=${REPORT_LIST_ALL_COLUMNS.join(",")}&limit=1`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, Prefer: "count=exact", Range: "0-0" },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return Response.json(
        { ok: false, status: res.status, code: body?.code || null, error: body?.message || "Supabase rechazó el listado." },
        { status: 503 }
      );
    }
    const total = Number(res.headers.get("content-range")?.split("/")[1]);
    if (!Number.isFinite(total) || total === 0) {
      return Response.json({ ok: false, error: "El listado volvió vacío." }, { status: 503 });
    }
    return Response.json({ ok: true, reports: total });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || "Sin conexión con Supabase." }, { status: 503 });
  }
}
