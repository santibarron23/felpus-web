export default function manifest() {
  return {
    name: "Felpus — Buscador de mascotas perdidas y encontradas",
    short_name: "Felpus",
    description: "Reportá y buscá mascotas perdidas o encontradas cerca tuyo.",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF7F0",
    theme_color: "#D31C22",
    icons: [
      {
        src: "/assets/icon_c.png",
        sizes: "220x210",
        type: "image/png",
      },
    ],
  };
}
