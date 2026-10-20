// Mensaje para cada error de la Web Speech API (botón "Dictar" del
// formulario). Antes cualquier falla mostraba el mismo "no pudimos escuchar
// bien", incluso cuando el problema real era el permiso del micrófono — que
// es justo lo que la persona tiene que saber para poder arreglarlo.
// Devuelve null cuando no hay nada que avisar (la persona lo frenó).
export function dictationErrorMessage(code) {
  if (code === "aborted") return null;
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "Felpus no tiene permiso para usar el micrófono. Tocá el candado junto a la dirección del sitio, permití \"Micrófono\" y probá de nuevo.";
  }
  if (code === "no-speech") return "No escuchamos nada. Tocá \"Dictar\" y hablá cerca del celular.";
  if (code === "audio-capture") return "No encontramos un micrófono disponible en este dispositivo.";
  if (code === "network") return "El dictado necesita conexión a internet. Revisá tu conexión o escribí a mano.";
  if (code === "language-not-supported") return "Tu navegador no permite dictar en español. Podés escribirlo a mano.";
  return "No pudimos escuchar bien. Probá de nuevo o escribí a mano.";
}
