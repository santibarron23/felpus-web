import { C } from "../lib/theme";

export default function manifest() {
  return {
    name: "Felpus — Buscador de mascotas perdidas y encontradas",
    short_name: "Felpus",
    description: "Reportá y buscá mascotas perdidas o encontradas cerca tuyo.",
    start_url: "/",
    display: "standalone",
    // Antes "#FBF7F0" (un crema más claro que el fondo real de la página) —
    // en Android eso se ve como un splash screen que "parpadea" a un tono
    // distinto apenas carga la app. Ahora coincide exactamente con C.cream,
    // el fondo real, así la transición es invisible.
    background_color: C.cream,
    theme_color: C.red,
    icons: [
      // El ícono viejo (icon_c.png, 220x210) no era cuadrado y era chico —
      // Chrome/Android exige al menos un ícono cuadrado de 192px (y prefiere
      // 512px) para ofrecer "Instalar app"; sin esto el banner de
      // instalación no aparece aunque el resto del manifest esté bien.
      { src: "/assets/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/assets/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/assets/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/assets/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Hace que Felpus aparezca como destino en el selector nativo de
    // "Compartir" del celular cuando alguien comparte una foto desde la
    // galería/cámara/otra app — así puede reportarla como "Encontrada" sin
    // volver a subir la foto a mano. Solo aparece en apps instaladas
    // (Android/Chrome); el POST lo intercepta el service worker (ver
    // sw.js), nunca llega al servidor.
    share_target: {
      action: "/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        files: [{ name: "photo", accept: ["image/*"] }],
      },
    },
  };
}
