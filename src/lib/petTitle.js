// Título de una mascota cuando el reporte no tiene nombre. Antes cada
// pantalla inventaba el suyo ("Perro sin nombre", "Perrito/a", "perro sin
// nombre" en minúscula) y un perro ENCONTRADO aparecía como "sin nombre",
// que suena a dato faltante cuando en realidad nadie sabe cómo se llama.
const ESPECIE = { perro: "Perro", gato: "Gato" };

export function petTitle(report) {
  const nombre = (report?.nombre || "").trim();
  if (nombre) return nombre;
  const base = ESPECIE[report?.especie] || "Mascota";
  if (report?.resuelto) return `${base} reencontrad${base === "Mascota" ? "a" : "o"}`;
  if (report?.tipo === "encontrada") return `${base} encontrad${base === "Mascota" ? "a" : "o"}`;
  return `${base} sin nombre`;
}
