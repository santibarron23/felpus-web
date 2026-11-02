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

// Texto para ubicar en el mapa la zona escrita en el formulario (2026-11-02):
// "Tres Cerritos, Salta, Salta". Sin zona escrita, "" (no se busca solo la
// ciudad: el mapa ya arranca en la ubicación de la persona o en Salta).
export function textoZonaFormulario(form) {
  const zona = String(form?.zona || "").trim();
  if (!zona) return "";
  const partes = [zona];
  for (const extra of [form?.ciudad, form?.provincia]) {
    const t = String(extra || "").trim();
    if (t && !partes.some((p) => plain(p).includes(plain(t)))) partes.push(t);
  }
  return partes.join(", ");
}
