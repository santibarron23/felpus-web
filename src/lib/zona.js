// Zona de un reporte con la ciudad entre paréntesis (2026-10-21, a pedido):
// "Tres Cerritos (Salta)". La zona es texto libre, así que no se repite la
// ciudad si ya está escrita en la zona ("Vaqueros" con ciudad Vaqueros, o
// "Centro de Salta"). Los reportes viejos no tienen ciudad: queda la zona sola.
function plain(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function zonaConCiudad(report) {
  const zona = String(report?.zona || "").trim();
  const ciudad = String(report?.ciudad || "").trim();
  if (!ciudad) return zona;
  if (!zona) return ciudad;
  if (plain(zona).includes(plain(ciudad))) return zona;
  return `${zona} (${ciudad})`;
}
