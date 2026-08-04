// Paleta — tonos de texto verificados contra ratio AA (>=4.5:1 sobre blanco/crema)
//
// Estructura, de abajo hacia arriba:
//   1. Marca + estado: rojo (marca / CTA / "Perdida"), naranja ("Encontrada"),
//      verde ("Reencontrada"/éxito). Deliberadamente NO se tocaron estos
//      significados: ya son el lenguaje visual que la gente aprendió al usar
//      la app (rojo = urgencia, verde = resuelto), cambiarlos sin necesidad
//      rompería ese aprendizaje sin ninguna ganancia real.
//   2. Neutros cálidos: en vez de grises fríos genéricos de SaaS, se usa una
//      escala de marrones/cremas — es una decisión de marca consciente
//      (Felpus quiere transmitir calidez y cercanía, no un panel de control
//      corporativo) y ya pasa AA en todos sus usos como texto.
//   3. Tokens de superficie (surface/surfaceSubtle/surfaceMuted) y de tinte
//      semántico (successBg/dangerBg/brandTintBg): antes cada componente
//      inventaba su propio crema/gris casi-igual a mano (más de 10 variantes
//      de un mismo "blanco cálido" dispersas en JSX: #FBF7F0, #F6F1E7,
//      #F6EEE1... y tres rosados casi idénticos para fondos de error/CTA).
//      Consolidados acá para que exista una sola fuente de verdad.
//   4. Nivel de colaborador (tierBronze/Silver/Gold/Legendary): ver comentario
//      junto a esos tokens — a propósito es una familia de colores separada
//      de la de arriba.
export const C = {
  // --- Marca / estado ---
  red: "#D31C22",
  redDark: "#AB1017",
  // OJO con el fondo antes de usar este tono para texto/ícono: da 3.38:1
  // sobre blanco y 2.96:1 sobre crema (falla AA, mínimo 4.5:1) — en esos
  // casos usar orangeInk (abajo). Pero da 4.90:1 sobre `ink` (fondo oscuro
  // de toasts), donde orangeInk en cambio cae a 3.16:1 y falla. Es decir: no
  // es "nunca para texto", es "el naranja correcto depende de si el fondo es
  // claro (orangeInk) u oscuro (orange)" — mismo patrón que usan Stripe/
  // GitHub con acentos que cambian de tono según la superficie.
  orange: "#E4661E",
  // Antes #E36525 — medido con la fórmula real de contraste WCAG (no solo a
  // ojo): daba 3.41:1 sobre blanco, por debajo del mínimo de 4.5:1 para
  // texto normal (afecta el badge "Encontrada", el toggle Perdida/Encontrada
  // y el aro de % de coincidencia). Este tono da 5.24:1 sobre blanco y
  // 4.59:1 sobre el crema de fondo — mismo naranja, un poco más profundo.
  orangeInk: "#B14F1D",
  orangeInkDark: "#8F3C0E",
  green: "#2E7048",
  greenDark: "#235A38",

  // red/orangeInk/green de arriba están calibrados para texto/ícono LEGIBLE
  // (por eso en CD, más abajo, se aclaran — un rojo apto para texto sobre
  // fondo oscuro es más claro que uno apto para texto sobre fondo claro).
  // Pero también se usan como RELLENO SÓLIDO de botones/badges con texto
  // blanco encima (los botones "Perdí"/"Encontré", el botón de confirmar
  // reencuentro, avatares de colaboradores...) — ahí el requisito es el
  // opuesto: necesitan quedarse SATURADOS y OSCUROS para que el blanco se
  // lea bien encima, en los dos temas. Por eso estos 3 "Solid" son iguales
  // en C y en CD: son la marca en su tono "de verdad", no la variante de
  // texto. Ver theme.js CD para la contraparte con las mismas notas.
  redSolid: "#D31C22",
  orangeInkSolid: "#B14F1D",
  greenSolid: "#2E7048",

  // --- Neutros cálidos ---
  ink: "#2B1B12",
  text: "#3A2A1C",
  muted: "#6B5643",
  cream: "#F6EFE4", // fondo de página
  border: "#EFE3D2", // bordes y separadores
  surface: "#FFFFFF", // tarjetas y paneles
  surfaceSubtle: "#FBF7F0", // inputs, hovers, paneles sutiles
  surfaceMuted: "#F0E7D8", // skeletons, tracks de progreso, placeholders de imagen

  // --- Tinte semántico (fondo + texto ya verificados AA entre sí) ---
  successBg: "#EAF3EC",
  successText: "#235A38", // = greenDark, 7.15:1 sobre successBg
  successBorder: "#CFE3D6",
  dangerBg: "#FBEAEA",
  dangerText: "#AB1017", // = redDark, 6.41:1 sobre dangerBg
  brandTintBg: "#FBEAE2", // tarjetas CTA y chips activos con tinte de marca (antes también existía como "#FBE4DC", un rosado casi idéntico usado solo para el chip activo — se unificó en un solo valor)
  redRing: "rgba(211, 28, 34, 0.2)", // anillo de pulso alrededor de avatares/CTAs — reemplaza el literal suelto "#D31C2233"

  // Ícono de racha (flame): a propósito NO es tierGold ni orangeInk — esos
  // dos ya tienen trabajo asignado (nivel "Rescatista" y estado "Encontrada"
  // respectivamente). Un dorado más claro y vivo, solo para el ícono de
  // fuego de la racha diaria.
  streak: "#FFD08A",

  // --- Toast (notificación flotante) ---
  // A propósito son los ÚNICOS 3 tokens con el mismo valor en C y en CD (ver
  // más abajo) — no son "claro/oscuro según el tema", son "siempre esta
  // chapita oscura con texto blanco", como las notificaciones de iOS/
  // Discord, que no cambian con el tema de la app. Antes el toast reusaba
  // C.ink/C.redDark/C.orange (calibrados para ser texto legible SOBRE un
  // fondo, no para ser ELLOS MISMOS un fondo fijo) — funcionaba de casualidad
  // en modo claro, pero en modo oscuro C.ink pasa a ser casi blanco y el
  // toast de éxito se habría vuelto una chapita blanca casi invisible.
  toastSuccessBg: "#2B1B12",
  toastErrorBg: "#AB1017",
  toastAccent: "#E4661E", // el "+10 puntos" dentro del toast — ya medido contra este fondo fijo (4.90:1)
  // Mismo valor que toastSuccessBg — token aparte porque se usa fuera de
  // toasts (el botón "Publicar y buscar coincidencias", el banner "Mayores
  // colaboradores", "Ver N resultados"): botones de acento oscuro que deben
  // seguir leyéndose como "el botón oscuro distintivo" en los dos temas, no
  // invertirse a blanco-sobre-blanco en modo oscuro.
  emphasisBg: "#2B1B12",

  // --- Nivel de colaborador (gamificación) ---
  // A propósito NO reutiliza red/orange/green de arriba: esos colores ya
  // significan "Perdida/Encontrada/Reencontrada" en el resto de la app. Antes
  // el ranking sí los reutilizaba (getTier en matching.js) y el resultado era
  // una insignia "Leyenda Felpus" en el mismo rojo que un cartel de mascota
  // perdida — dos significados opuestos (alarma vs. logro) compitiendo por
  // el mismo color. Se reemplaza por una escala de medallas independiente
  // (bronce/plata/oro/violeta "legendario"), un patrón de gamificación ya
  // universalmente reconocible (Duolingo, videojuegos) que no colisiona con
  // ningún otro estado de la app. Las 4 pasan AA como texto sobre blanco/
  // crema y como fondo con texto blanco encima.
  tierBronze: "#8C6239",
  tierSilver: "#5B6B80",
  tierGold: "#7A6306",
  tierLegendary: "#6D46B8",
  // Variantes de texto de los tiers de arriba: en modo claro son literalmente
  // los mismos valores (ya pasan AA sobre blanco/crema como texto). Existen
  // como tokens separados solo porque en modo oscuro SÍ divergen — ver CD
  // más abajo para el porqué.
  tierBronzeText: "#8C6239",
  tierSilverText: "#5B6B80",
  tierGoldText: "#7A6306",
  tierLegendaryText: "#6D46B8",
};

// --- Paleta oscura ---
// Mismo criterio de contraste que C (AA real, medido, no a ojo), pero NO es
// "invertir el brillo y listo": varios tonos de C que pasan AA sobre blanco
// fallan sobre fondo oscuro y viceversa — el mismo fenómeno que ya se
// documentó arriba para `orange` (necesita un tono distinto según si el
// fondo es claro u oscuro). Por eso red/redDark/orange/orangeInk/green/
// greenDark tienen acá valores más claros y vivos que en C: son los mismos
// "personajes" (marca, encontrada, éxito) pero recalibrados para verse bien
// sobre un fondo casi negro en vez de casi blanco.
//
// Caso especial — tierXxx: el círculo/pill de avatar con texto blanco
// encima NO cambia entre temas (es un campo de color autocontenido, no le
// importa qué hay alrededor) — se mantiene igual que en C. Pero el mismo
// tono usado como texto plano sobre una tarjeta oscura sí necesita ser más
// claro, o cae por debajo de 4.5:1. De ahí que tierXxxText SÍ diverja acá
// mientras tierXxx (el de fondo) se mantiene igual — no son "el mismo color
// con alias distinto", cumplen roles de contraste distintos.
export const CD = {
  red: "#FF5B4D",
  redDark: "#FF8A7A",
  orange: "#FFA35C",
  orangeInk: "#E8934A",
  orangeInkDark: "#F0A868",
  green: "#5FCB86",
  greenDark: "#8AD9A6",

  // Idénticos a C — ver la nota junto a estos 3 en C, arriba: son el relleno
  // sólido de botones/badges, no el texto, así que no se aclaran con el tema.
  redSolid: "#D31C22",
  orangeInkSolid: "#B14F1D",
  greenSolid: "#2E7048",

  ink: "#F5ECDF",
  text: "#EADFCE",
  muted: "#B39B80",
  cream: "#1C140D",
  border: "#84693F",
  surface: "#25190F",
  surfaceSubtle: "#2D2015",
  surfaceMuted: "#3A2A1B",

  successBg: "#1C2E22",
  successText: "#8AD9A6",
  successBorder: "#4F7057",
  dangerBg: "#33201C",
  dangerText: "#FF8A7A",
  brandTintBg: "#33231A",
  redRing: "rgba(255, 91, 77, 0.25)",

  streak: "#FFD08A", // ya es clarísimo — funciona igual sobre fondo oscuro

  // Idénticos a C — ver nota junto a estos 3 tokens en C, arriba.
  toastSuccessBg: "#2B1B12",
  toastErrorBg: "#AB1017",
  toastAccent: "#E4661E",
  emphasisBg: "#2B1B12",

  tierBronze: "#8C6239", // sin cambios — ver nota arriba
  tierSilver: "#5B6B80",
  tierGold: "#7A6306",
  tierLegendary: "#6D46B8",
  tierBronzeText: "#C79865",
  tierSilverText: "#9AA8B8",
  tierGoldText: "#D9B94A",
  tierLegendaryText: "#B497E8",
};

export function displayColor(report) {
  return report.color === "Otro color" && report.colorOtro ? report.colorOtro : report.color;
}
