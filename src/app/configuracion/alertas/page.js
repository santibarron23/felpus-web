import AlertSettings from "../../../components/felpus/AlertSettings";

export const metadata = {
  title: "Alertas de tu zona",
  description: "Configurá la zona, las especies y el tipo de reportes de los que Felpus te avisa al instante.",
  robots: { index: false, follow: false },
};

function coord(value, limit) {
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

// ?lat=&lng= viene del botón "Vigilar esta zona" del mapa de Explorar.
export default async function AlertasPage({ searchParams }) {
  const params = (await searchParams) || {};
  const lat = coord(params.lat, 90);
  const lng = coord(params.lng, 180);
  return <AlertSettings initialLat={lat != null && lng != null ? lat : null} initialLng={lat != null && lng != null ? lng : null} />;
}
