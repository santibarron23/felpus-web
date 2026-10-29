// Respuestas fijas del Asistente Felpus: se resuelven en el navegador, sin
// llamar a la IA (costo cero, respuesta instantánea), y son además el
// respaldo cuando el servicio de IA no está disponible. Mismo contenido que
// el prompt de src/lib/chatbot.js — si cambia una funcionalidad, actualizar
// los dos.

export const ASSISTANT_NAME = "Asistente Felpus";

export const GREETING =
  "¡Hola! 🐾 Soy el asistente de Felpus. Estoy acá para ayudarte a encontrar a tu mascota o reunir a una mascota encontrada con su familia. ¿Qué necesitás hacer?";

// Accesos rápidos de la bienvenida. `send` = texto que se manda al
// asistente como si la persona lo hubiera escrito; `faq` = abre el menú de
// ayuda local (sin IA).
export const QUICK_ACTIONS = [
  // draftPatch: se anota en el borrador al instante, así la siguiente
  // pregunta del asistente ya trae sus botones (perro/gato…).
  { id: "perdi", label: "🐶 Perdí a mi mascota", send: "Perdí a mi mascota", draftPatch: { tipo: "perdida" } },
  { id: "encontre", label: "🐱 Encontré una mascota", send: "Encontré una mascota", draftPatch: { tipo: "encontrada" } },
  // search: abre opciones de búsqueda para tocar, sin llamar a la IA.
  { id: "buscar", label: "🔎 Quiero buscar una mascota", search: true },
  { id: "ayuda", label: "💬 Necesito ayuda", faq: true },
];

// Sugerencias según la sección desde la que se abre el chat.
export function contextualSuggestions(section, { hasOpenReport = false } = {}) {
  if (hasOpenReport) {
    return [{ id: "ficha", label: "📄 Explicame esta publicación", send: "Explicame esta publicación y qué puedo hacer desde acá" }];
  }
  if (section === "reportar") {
    return [{ id: "ayuda-reporte", label: "📝 Ayudame a completar el reporte", send: "Ayudame a completar el reporte" }];
  }
  if (section === "explorar") {
    return [{ id: "buscar-palabras", label: "🔎 Buscar con mis palabras", send: "Quiero buscar una mascota" }];
  }
  return [];
}

export const FAQ_TOPICS = [
  {
    id: "publicar",
    label: "¿Cómo publico?",
    answer:
      "Tocá el botón rojo \"Reportar\" de la barra de abajo, elegí \"Perdí\" o \"Encontré\" y completá: hasta 3 fotos, la zona (con \"Usar mi ubicación\" o el mapa), sexo, color y un contacto (WhatsApp o email). Es gratis y podés publicar como invitado, sin cuenta. También podés contarme todo acá y te lo dejo armado.",
    action: { id: "ir-reportar", label: "Ir a Reportar" },
  },
  {
    id: "perdi",
    label: "Perdí a mi mascota, ¿qué hago?",
    answer:
      "Publicala cuanto antes: las primeras 48 horas son clave. Usá fotos donde se vean sus rasgos, recorré el barrio a pie llamándola en horarios tranquilos, avisá a veterinarias, negocios y vecinos de la zona, y compartí el link del reporte en grupos vecinales de Facebook y WhatsApp. En Salta, en verano conviene buscar temprano o al atardecer.",
  },
  {
    id: "encontre",
    label: "Encontré una mascota, ¿qué hago?",
    answer:
      "Si es seguro, retenela y dale agua. Fijate si tiene chapita o collar con datos; en una veterinaria pueden ver si tiene microchip. Después publicala como \"Encontrada\" con una foto y la zona. Si no podés retenerla, igual sacale una foto y publicá dónde la viste. Si está herida, llevala a una veterinaria lo antes posible.",
  },
  {
    id: "coincidencias",
    label: "¿Cómo funcionan las coincidencias?",
    answer:
      "Felpus compara cada reporte con los del tipo opuesto (perdidas con encontradas) por foto, color, tamaño, sexo, raza, señas, zona y fecha, y te muestra las posibles coincidencias. Son posibles, no seguras: abrí cada una y comparala con calma. Si aparece una nueva, te avisamos por email o notificación.",
  },
  {
    id: "privacidad",
    label: "Privacidad y contacto",
    answer:
      "Tu contacto no aparece en los listados: se muestra recién al abrir tu publicación, con un límite de consultas para evitar abusos, y se borra cuando confirmás el reencuentro. Te recomendamos marcar una zona aproximada en el mapa, no la puerta de tu casa.",
  },
  {
    id: "seguridad",
    label: "¿Cómo contacto de forma segura?",
    answer:
      "Pedí que te cuenten una seña de la mascota que no se vea en la foto. No mandes plata por adelantado, aunque te la pidan para el traslado o como recompensa. Para encontrarte, elegí un lugar público y de día, y si podés andá acompañado. Si una publicación te parece una estafa, denunciala desde la ficha.",
  },
  {
    id: "cuenta",
    label: "Iniciar sesión y mis publicaciones",
    answer:
      "Se entra con Google, desde \"iniciar sesión con Google\" en Inicio. No hace falta para publicar, pero con cuenta sumás huellitas, guardás publicaciones, ves las tuyas en \"Mi Felpus\", podés eliminarlas y confirmar el reencuentro.",
  },
  {
    id: "reencuentro",
    label: "Ya la encontré, ¿cómo lo marco?",
    answer:
      "¡Qué alegría! Si publicaste con tu cuenta de Google, abrí tu publicación y confirmá el reencuentro: el reporte deja de aparecer como activo y se borra el contacto. Si publicaste como invitado, no se puede marcar desde la app.",
  },
];

export function faqById(id) {
  return FAQ_TOPICS.find((t) => t.id === id) || null;
}

// Respuesta local cuando la IA no responde. `kind` viene del código de error
// de /api/chat.
export function fallbackReply(kind) {
  if (kind === "rate_limit") {
    return "Recibí muchos mensajes seguidos desde tu conexión. Esperá un ratito y seguimos. Mientras tanto, podés publicar desde el formulario o mirar las preguntas frecuentes.";
  }
  if (kind === "unavailable") {
    return "El asistente inteligente no está disponible en este momento. Igual podés publicar con el formulario de siempre, buscar en Explorar o mirar las preguntas frecuentes.";
  }
  return "No pude responder ahora (problema de conexión). Probá de nuevo en un momento, o seguí con el formulario o Explorar.";
}

export const FALLBACK_ACTIONS = [
  { id: "ir-reportar", label: "Ir a Reportar" },
  { id: "ir-explorar", label: "Ir a Explorar" },
  { id: "abrir-faq", label: "Preguntas frecuentes" },
];

// Botones de respuesta rápida: cuando el asistente pregunta un dato del
// borrador (la "clave" que devuelve /api/chat como `pending`, ver
// missingFields en chatbot.js), la app muestra estas opciones para tocar en
// vez de escribir. `send` es el texto que se manda como si la persona lo
// hubiera escrito; `skip` marca el dato como salteado (no se vuelve a
// preguntar); `action` dispara algo del chat en vez de mandar texto.
export const QUICK_REPLIES = {
  tipo: [
    { label: "😢 La perdí", send: "La perdí" },
    { label: "🙌 La encontré", send: "La encontré" },
  ],
  especie: [
    { label: "🐶 Perro", send: "Es un perro" },
    { label: "🐱 Gato", send: "Es un gato" },
  ],
  zona: [{ label: "📍 Usar mi ubicación actual", action: "ubicacion" }],
  color: [
    { label: "Negro", send: "Es de color negro" },
    { label: "Blanco", send: "Es de color blanco" },
    { label: "Marrón", send: "Es de color marrón" },
    { label: "Gris", send: "Es de color gris" },
    { label: "Dorado / beige", send: "Es de color dorado o beige" },
    { label: "Atigrado", send: "Es atigrado" },
    { label: "Manchado / bicolor", send: "Es manchado, de dos colores" },
  ],
  sexo: [
    { label: "Macho", send: "Es macho" },
    { label: "Hembra", send: "Es hembra" },
    { label: "No sé", send: "No sé si es macho o hembra" },
  ],
  nombre: [{ label: "No tiene nombre / no sé", send: "No sé el nombre", skip: "nombre" }],
  tamano: [
    { label: "Chico", send: "Es chico" },
    { label: "Mediano", send: "Es mediano" },
    { label: "Grande", send: "Es grande" },
    { label: "No sé", send: "No sé el tamaño", skip: "tamano" },
  ],
  foto: [
    { label: "📷 Adjuntar foto", action: "foto" },
    { label: "Ahora no", send: "Ahora no tengo foto", skip: "foto" },
  ],
  senas: [
    { label: "Collar", send: "Tiene collar" },
    { label: "Arnés", send: "Tiene arnés" },
    { label: "Chapita", send: "Tiene chapita identificatoria" },
    { label: "Mancha particular", send: "Tiene una mancha particular" },
    { label: "Cicatriz", send: "Tiene una cicatriz" },
    { label: "Nada en especial", send: "No tiene collar ni señas particulares", skip: "senas" },
  ],
  // Búsqueda: cada botón ya es una consulta completa para buscar_reportes.
  buscar: [
    { label: "🐶 Perros encontrados", send: "Mostrame los perros encontrados de los últimos 30 días" },
    { label: "🐱 Gatos encontrados", send: "Mostrame los gatos encontrados de los últimos 30 días" },
    { label: "🐶 Perros perdidos", send: "Mostrame los perros perdidos de los últimos 30 días" },
    { label: "🐱 Gatos perdidos", send: "Mostrame los gatos perdidos de los últimos 30 días" },
    { label: "📅 Todo lo de esta semana", send: "Mostrame todos los reportes de esta semana" },
  ],
  fecha: [
    { label: "Hoy", send: "Fue hoy" },
    { label: "Ayer", send: "Fue ayer" },
    { label: "No sé", send: "No sé la fecha exacta", skip: "fecha" },
  ],
};
