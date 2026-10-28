import AvisoRespuesta from "../../components/felpus/AvisoRespuesta";

export const metadata = {
  title: "Tu reporte",
  description: "Contanos si hubo novedades de tu reporte en Felpus.",
  robots: { index: false, follow: false },
};

// Página de los botones de los mails de aviso (emailAvisos.js): ?t=<token
// firmado>&accion=volvio|sigo|no_busco|baja. Nunca cambia nada al abrirse:
// la persona confirma y recién ahí se manda (POST /api/aviso).
export default async function AvisoPage({ searchParams }) {
  const params = (await searchParams) || {};
  const t = typeof params.t === "string" ? params.t.slice(0, 200) : "";
  const accion = typeof params.accion === "string" ? params.accion : "";
  return <AvisoRespuesta token={t} accionInicial={accion} />;
}
