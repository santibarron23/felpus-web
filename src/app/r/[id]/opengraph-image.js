import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchReportForShare } from "../../../lib/reportOg";
import { renderShareImage, OG_SIZE } from "../../../lib/shareImage";

// Vista previa al compartir /r/<id> en WhatsApp, Facebook, X, Telegram…
// (2026-10-27): un cartel con la foto y el resumen del reporte (ver
// shareImage.jsx), en vez de la foto sola.
export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/jpeg";
export const alt = "Mascota publicada en Felpus";

export default async function Image({ params }) {
  const { id } = await params;
  const report = await fetchReportForShare(id);
  // Reporte borrado, oculto o id inválido: la imagen general de Felpus.
  if (!report) {
    const png = await readFile(join(process.cwd(), "public", "og-image.png"));
    return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300, s-maxage=3600" } });
  }
  return renderShareImage(report, "og");
}
