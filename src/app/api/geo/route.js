// Ubicación APROXIMADA (nivel ciudad) de quien visita, a partir de los
// headers que Vercel ya agrega a cada pedido según la IP de conexión. Sirve
// para que los mapas arranquen en la ciudad de la persona aunque no dé
// permiso de GPS (antes caían siempre en Buenos Aires). No se guarda nada ni
// se llama a ningún servicio externo: solo se le devuelve a la propia
// persona lo que su pedido ya trae.
export const runtime = "nodejs";

export function approxLocationFromHeaders(headers) {
  const lat = Number(headers.get("x-vercel-ip-latitude"));
  const lng = Number(headers.get("x-vercel-ip-longitude"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

export async function GET(request) {
  const loc = approxLocationFromHeaders(request.headers);
  return Response.json(loc ? { ...loc, approximate: true } : { lat: null, lng: null }, {
    // Es distinto para cada visitante: nunca cachearlo en un CDN compartido.
    headers: { "Cache-Control": "private, no-store" },
  });
}
