// JSON.stringify() no escapa "<" — dentro de un <script type="application/
// ld+json">...</script> renderizado con dangerouslySetInnerHTML, eso importa
// de verdad: el parser de HTML busca la secuencia literal "</script>" para
// cerrar el tag, sin que le importe si "está adentro" de un string JSON
// desde el punto de vista de JS. Un valor con "</script><script>...</script>"
// (nombre/zona/descripción de un reporte son texto libre que cualquiera
// controla al publicarlo) cierra el script de structured data antes de
// tiempo y deja que el markup/script que sigue se parsee como HTML real —
// ejecutando JS arbitrario en la página de cualquiera que abra el link
// público /r/<id> (el que se comparte por WhatsApp/redes). Reemplazar "<"
// por su escape unicode neutraliza esto sin cambiar el JSON en sí (<
// es indistinguible de "<" para JSON.parse).
export function safeJsonLdString(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
