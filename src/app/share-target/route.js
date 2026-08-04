// Red de seguridad: el navegador solo invoca el share target desde una PWA
// ya instalada, lo que en la práctica implica que el service worker (ver
// public/sw.js) está activo y va a interceptar este POST antes de que
// llegue acá — esta ruta normalmente nunca se ejecuta. Pero si por algún
// motivo el SW no estuviera controlando la página todavía (ej. justo
// después de instalar, antes de que termine de activarse), el navegador
// manda el POST directo al servidor — sin esto, sería un 404 y la persona
// se queda en una pantalla rota. Acá no se puede recuperar la foto (no hay
// forma de pasar un archivo por un redirect), así que se degrada con
// gracia: manda a la app avisando que hay que volver a elegir la foto.
export async function POST(request) {
  return Response.redirect(new URL("/?shareTarget=missed", request.url), 303);
}
