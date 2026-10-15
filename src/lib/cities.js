// Páginas locales de SEO (/mascotas-perdidas/<slug>) — 2026-10-15, para
// conseguir alcance orgánico en Salta. El home es una SPA 100% cliente y
// /r/<id> redirige por JS, así que hasta ahora Google no tenía NINGUNA
// página con texto real que respondiera a "perro perdido en Salta" o
// "mascotas perdidas Salta". Cada ciudad es solo datos: sumar otra es
// agregar una entrada acá (la ruta, el sitemap y el JSON-LD la toman solos).
//
// `match` son los términos que identifican un reporte de esa ciudad: se
// busca en ciudad, provincia y zona (texto libre) con ilike, porque los
// reportes viejos no tienen ciudad/provincia estructuradas (ver schema.sql).
export const CITIES = {
  salta: {
    slug: "salta",
    name: "Salta",
    region: "Salta",
    match: ["salta"],
    geo: { lat: -24.7821, lng: -65.4232 },
    // Barrios y localidades del Gran Salta: aparecen como texto visible
    // (búsquedas tipo "perro perdido Tres Cerritos") y como areaServed.
    barrios: [
      "Centro",
      "Tres Cerritos",
      "Grand Bourg",
      "Castañares",
      "Limache",
      "Parque La Vega",
      "Villa Las Rosas",
      "Santa Ana",
      "El Tribuno",
      "Solidaridad",
      "Bancario",
      "Ciudad del Milagro",
      "Villa Mitre",
      "Villa Cristina",
      "El Huaico",
      "Portezuelo",
      "San Lorenzo",
      "Vaqueros",
      "Cerrillos",
      "La Caldera",
    ],
  },
};

export function getCity(slug) {
  return Object.prototype.hasOwnProperty.call(CITIES, slug) ? CITIES[slug] : null;
}

// Filtro PostgREST: or=(ciudad.ilike.*salta*,provincia.ilike.*salta*,...).
// Los términos vienen de CITIES (constantes del código, nunca de la URL),
// así que no hace falta escapar nada para PostgREST.
export function cityOrFilter(city) {
  const parts = [];
  for (const term of city.match) {
    for (const col of ["ciudad", "provincia", "zona"]) parts.push(`${col}.ilike.*${term}*`);
  }
  return `(${parts.join(",")})`;
}

export function cityFaqs(city) {
  const n = city.name;
  return [
    {
      q: `¿Qué hago si perdí a mi perro o gato en ${n}?`,
      a: `Publicalo en Felpus cuanto antes con una foto clara y la zona exacta donde lo viste por última vez. Felpus compara tu reporte con todas las mascotas encontradas en ${n} por foto, descripción y distancia, y te avisa si aparece una coincidencia. Después recorré el barrio, avisá a las veterinarias cercanas y compartí el flyer que genera Felpus en los grupos de vecinos.`,
    },
    {
      q: `Encontré un perro en la calle en ${n}, ¿cómo ubico a su familia?`,
      a: `Sacale una foto y publicalo como "Encontrada" en Felpus indicando dónde lo encontraste. Si alguien ya reportó esa mascota como perdida, Felpus muestra la coincidencia a los dos. Revisá también si tiene collar o chapita y llevalo a una veterinaria para ver si tiene microchip.`,
    },
    {
      q: "¿Publicar en Felpus cuesta algo?",
      a: "No. Publicar, buscar coincidencias y contactar a quien reportó es gratis. Ni siquiera hace falta crear una cuenta para reportar.",
    },
    {
      q: `¿Felpus funciona en todos los barrios de ${n}?`,
      a: `Sí. Podés marcar el punto exacto en el mapa en cualquier barrio de ${n} y alrededores (${city.barrios.slice(0, 5).join(", ")} y más). La búsqueda prioriza las mascotas reportadas más cerca tuyo.`,
    },
    {
      q: "¿Cómo aumento las chances de reencontrar a mi mascota?",
      a: "Actuá rápido: las primeras 48 horas son las más importantes. Usá varias fotos donde se vean manchas o rasgos únicos, describí collar, tamaño y comportamiento, y compartí el link de tu reporte por WhatsApp e Instagram: cada vez que alguien lo comparte, más vecinos de tu zona lo ven.",
    },
  ];
}
