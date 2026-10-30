// Consejos después de publicar (2026-10-30). Se muestran SOLO con el aviso
// ya publicado (pantalla de confirmación y Mi Felpus), nunca en el
// formulario. Reglas fijas sobre los datos del reporte: sin IA.
//
// Todos los textos viven acá para poder corregirlos en un solo lugar. Tono:
// cercano, frases cortas, nada de promesas ni datos que no podamos respaldar.
//
// Contextos (contextoDe): buscando (perdida), resguardo (encontrada: la tiene
// quien publicó), avistamiento (la vio en la calle, ver sighting.js) y
// reencuentro (resuelto).
//
// La respuesta a la pregunta opcional se guarda en `detalles` (ver
// /api/reports/edit): sale_de_casa (gatos) y ante_desconocidos (perros).
// Para perros también se usa lo que ya se marcó en el formulario
// (detalles.comportamientos, ver REACCION_OPTIONS en matching.js), así no se
// pregunta dos veces lo mismo.
import { isSighting } from "./sighting";

export const PREGUNTAS = {
  gato: {
    clave: "sale_de_casa",
    texto: "¿Tu gato suele salir de casa?",
    opciones: [
      { id: "interior", label: "No, vive adentro" },
      { id: "exterior", label: "Sí, suele salir" },
      { id: "no_se", label: "No lo sé" },
    ],
  },
  perro: {
    clave: "ante_desconocidos",
    texto: "¿Cómo reacciona tu perro con desconocidos?",
    opciones: [
      { id: "sociable", label: "Es sociable" },
      { id: "miedoso", label: "Es miedoso o desconfiado" },
      { id: "no_se", label: "No lo sé" },
    ],
  },
};

// Lo único que /api/reports/edit acepta guardar en `detalles` desde acá.
export function respuestaValida(clave, valor) {
  return Object.values(PREGUNTAS).some((p) => p.clave === clave && p.opciones.some((o) => o.id === valor));
}

const TEXTOS = {
  compartir: {
    titulo: "Compartí el aviso",
    texto: "Mandalo a grupos del barrio y de mascotas de tu zona. Es lo que más ayuda.",
  },
  vecinos: {
    titulo: "Avisá a vecinos y comercios",
    texto: "Mostrales la foto en kioscos, verdulerías, veterinarias y a quien pase mucho tiempo en la cuadra.",
  },
  veterinarias: {
    titulo: "Consultá veterinarias y refugios cercanos",
    texto: "Quien encuentra una mascota suele llevarla ahí para ver si tiene chip o dueño.",
  },
  carteles: {
    titulo: "Pegá carteles cerca de donde se perdió",
    texto: "Usá el flyer de tu aviso: tiene la foto y un código para llegar directo al reporte.",
  },
  notificaciones: {
    titulo: "Activá las notificaciones",
    texto: "Felpus compara tu aviso con cada mascota encontrada que se publica y te avisa si se parece.",
  },
  dinero: {
    titulo: "Cuidado con pedidos de dinero",
    texto: "Nadie tiene que cobrarte por devolverla. No mandes plata ni códigos que te lleguen por mensaje.",
  },
  // Gato que vive adentro
  escondites: {
    titulo: "Buscá muy cerca de casa",
    texto: "Los gatos que no salen suelen esconderse a pocos metros: debajo de autos, en patios, garajes, techos y plantas.",
  },
  silencio: {
    titulo: "Buscá en momentos tranquilos",
    texto: "De noche o temprano, con una linterna: el reflejo de los ojos ayuda a verlo. Llamalo en voz baja.",
  },
  encerrado: {
    titulo: "Preguntá si quedó encerrado",
    texto: "Pedí a los vecinos que revisen garajes, depósitos y sótanos: a veces se meten y quedan atrapados.",
  },
  revisar_de_nuevo: {
    titulo: "Volvé a revisar donde ya buscaste",
    texto: "Un gato asustado puede quedarse quieto y en silencio durante horas.",
  },
  // Gato que sale
  recorridos: {
    titulo: "Recorré sus caminos de siempre",
    texto: "Techos, patios y cuadras por donde suele andar.",
  },
  ampliar: {
    titulo: "Ampliá la búsqueda de a poco",
    texto: "Empezá por tu cuadra y sumá manzanas día a día.",
  },
  anotar_avistamientos: {
    titulo: "Anotá cada vez que alguien lo vea",
    texto: "Lugar y hora: con varios datos se entiende mejor hacia dónde se mueve.",
  },
  // Perros
  plazas: {
    titulo: "Preguntá en plazas, parques y comercios",
    texto: "Un perro sociable se acerca a la gente: puede que alguien lo esté cuidando.",
  },
  no_perseguir_perro: {
    titulo: "Pedí que no lo persigan",
    texto: "Un perro asustado se aleja más si lo corren. Si alguien lo ve, que te avise dónde estaba y hacia dónde iba.",
  },
  // Otras especies
  refugios_cercanos: {
    titulo: "Revisá rincones protegidos cerca",
    texto: "Patios, plantas, huecos y lugares tranquilos donde pueda haberse refugiado.",
  },
  // Resguardo (quien la tiene)
  segura: {
    titulo: "Mantenela segura y tranquila",
    texto: "Un lugar cerrado, con agua y sin ruidos fuertes.",
  },
  identificacion: {
    titulo: "Fijate si tiene identificación",
    texto: "Una chapita o un collar con teléfono puede ser el camino más corto a su familia.",
  },
  microchip: {
    titulo: "Consultá por microchip",
    texto: "En una veterinaria pueden revisar si tiene chip con datos de su familia.",
  },
  separada: {
    titulo: "Al principio, separada de tus mascotas",
    texto: "No sabés si está vacunada o sana, y el cambio la puede tener estresada.",
  },
  verificar_reclamo: {
    titulo: "Verificá a quien la reclame",
    texto: "Pedí fotos anteriores o algún detalle que no esté en el aviso antes de entregarla.",
  },
  // Avistamiento (quien la vio)
  no_perseguir: {
    titulo: "No la persigas",
    texto: "Si está asustada, correrla la aleja más y la puede poner en peligro.",
  },
  si_la_volves_a_ver: {
    titulo: "Si la volvés a ver, anotá hora y dirección",
    texto: "Dónde estaba y hacia dónde iba: es lo que más le sirve a quien la busca.",
  },
  compartir_avistamiento: {
    titulo: "Compartí el aviso en el barrio",
    texto: "Así su familia tiene más chances de enterarse de que la vieron.",
  },
  // Reencuentro
  veterinario: {
    titulo: "Llevala a una revisión",
    texto: "Un control veterinario ayuda a detectar golpes, parásitos o deshidratación.",
  },
  chapita: {
    titulo: "Poné una chapita con tu teléfono",
    texto: "Es lo primero que mira quien encuentra una mascota.",
  },
  chip_prevencion: {
    titulo: "Pensá en el microchip",
    texto: "Si algún día se pierde de nuevo, cualquier veterinaria puede leerlo.",
  },
  por_donde_salio: {
    titulo: "Revisá por dónde salió",
    texto: "Puertas, rejas, ventanas o paredones: arreglarlo evita que se repita.",
  },
  gracias: {
    titulo: "¡Gracias por ayudar!",
    texto: "Si podés, compartí cómo se reencontraron: anima a otras personas a usar Felpus.",
  },
};

// Textos por id, para la lista de revisión y los tests.
export const CONSEJOS = TEXTOS;

const ORDEN = {
  gato_interior: ["escondites", "silencio", "encerrado", "revisar_de_nuevo", "vecinos", "carteles", "compartir", "veterinarias", "notificaciones", "dinero"],
  gato_exterior: ["recorridos", "vecinos", "ampliar", "anotar_avistamientos", "compartir", "carteles", "veterinarias", "notificaciones", "dinero"],
  // Sin respuesta: primero lo de cerca (vale para cualquier gato), después lo de afuera.
  gato: ["escondites", "vecinos", "silencio", "recorridos", "compartir", "encerrado", "carteles", "veterinarias", "ampliar", "notificaciones", "dinero"],
  perro_sociable: ["plazas", "veterinarias", "compartir", "vecinos", "carteles", "notificaciones", "dinero"],
  perro_miedoso: ["no_perseguir_perro", "anotar_avistamientos", "compartir", "vecinos", "carteles", "veterinarias", "notificaciones", "dinero"],
  perro: ["compartir", "veterinarias", "no_perseguir_perro", "plazas", "vecinos", "carteles", "notificaciones", "dinero"],
  otro: ["compartir", "vecinos", "refugios_cercanos", "veterinarias", "carteles", "notificaciones", "dinero"],
  resguardo: ["identificacion", "microchip", "segura", "separada", "verificar_reclamo", "compartir", "dinero"],
  avistamiento: ["no_perseguir", "si_la_volves_a_ver", "compartir_avistamiento"],
  reencuentro_perdida: ["veterinario", "chapita", "chip_prevencion", "por_donde_salio"],
  reencuentro_encontrada: ["gracias"],
};

export function contextoDe(report) {
  if (report?.resuelto) return "reencuentro";
  if (report?.tipo === "perdida") return "buscando";
  return isSighting(report) ? "avistamiento" : "resguardo";
}

// Comportamientos del formulario que ya responden la pregunta del perro.
const REACCION_SOCIABLE = ["se_acerca", "se_deja_agarrar"];
const REACCION_MIEDOSO = ["miedoso", "puede_escapar", "ladra_gruñe"];

// sociable | miedoso | no_se | null (sin dato).
export function perfilPerro(report) {
  const d = report?.detalles || {};
  if (d.ante_desconocidos) return d.ante_desconocidos;
  const com = Array.isArray(d.comportamientos) ? d.comportamientos : [];
  // Si marcó las dos cosas, gana la prudencia: no perseguir.
  if (com.some((c) => REACCION_MIEDOSO.includes(c))) return "miedoso";
  if (com.some((c) => REACCION_SOCIABLE.includes(c))) return "sociable";
  return null;
}

function claveOrden(report, contexto) {
  if (contexto === "reencuentro") return report?.tipo === "perdida" ? "reencuentro_perdida" : "reencuentro_encontrada";
  if (contexto === "resguardo" || contexto === "avistamiento") return contexto;
  const especie = report?.especie;
  if (especie === "gato") {
    const s = report?.detalles?.sale_de_casa;
    return s === "interior" || s === "exterior" ? `gato_${s}` : "gato";
  }
  if (especie === "perro") {
    const p = perfilPerro(report);
    return p === "sociable" || p === "miedoso" ? `perro_${p}` : "perro";
  }
  return "otro";
}

// Lista ordenada por prioridad: [{ id, titulo, texto }].
export function getConsejos(report, contexto = contextoDe(report)) {
  return ORDEN[claveOrden(report, contexto)].map((id) => ({ id, ...TEXTOS[id] }));
}

// La pregunta opcional, solo si sirve: perdida activa de gato o perro que
// todavía no tiene la respuesta (ni deducible del formulario, en perros).
export function preguntaPara(report) {
  if (!report || report.resuelto || report.tipo !== "perdida") return null;
  const p = PREGUNTAS[report.especie];
  if (!p) return null;
  if (report.especie === "gato" && report.detalles?.sale_de_casa) return null;
  if (report.especie === "perro" && perfilPerro(report)) return null;
  return p;
}

export function tituloConsejos(report) {
  const ctx = contextoDe(report);
  if (ctx === "buscando") return "Consejos para tu búsqueda";
  if (ctx === "reencuentro") return report?.tipo === "perdida" ? "Consejos para después del reencuentro" : "Consejos";
  return "Consejos para el reencuentro";
}
