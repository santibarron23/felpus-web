import { fetchReportForShare } from "../../../../lib/reportOg";
import { renderShareImage } from "../../../../lib/shareImage";

// Imagen vertical (1080x1920) para subir a historias de Instagram, WhatsApp
// o Facebook (2026-10-27). La pide el botón "Historia" del menú de
// compartir y la pasa a la hoja nativa del celular.
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const { id } = await params;
  const report = await fetchReportForShare(id);
  if (!report) return new Response("No encontrado", { status: 404 });
  return renderShareImage(report, "story");
}
