import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const alt = "Felpus — Buscador inteligente de mascotas perdidas y encontradas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// El font-loading por defecto de next/og resuelve una ruta de archivo interna
// a su fuente Noto Sans embebida, y esa resolución rompe en Windows cuando la
// carpeta del proyecto tiene espacios/paréntesis (como en dev local acá). El
// patrón documentado por Vercel para evitar ese código interno por completo
// es traer una fuente propia — acá pedimos Montserrat (la misma que usan los
// flyers) directo de Google Fonts al momento de generar la imagen.
async function loadGoogleFont(family, weight) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`;
  const css = await (await fetch(cssUrl)).text();
  const match = css.match(/src: url\(([^)]+)\) format\('(?:truetype|opentype)'\)/);
  if (!match) throw new Error(`No se pudo resolver la fuente ${family} ${weight}`);
  const res = await fetch(match[1]);
  return res.arrayBuffer();
}

export default async function OpengraphImage() {
  const [iconData, montserratBold] = await Promise.all([
    readFile(join(process.cwd(), "public/assets/icon_c.png")),
    loadGoogleFont("Montserrat", 800),
  ]);
  const iconSrc = `data:image/png;base64,${iconData.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#D31C22",
          fontFamily: "Montserrat",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconSrc} width={150} height={143} alt="" />
        <div style={{ display: "flex", fontSize: 104, fontWeight: 800, color: "#ffffff", marginTop: 20, letterSpacing: -2 }}>
          Felpus
        </div>
        <div style={{ display: "flex", fontSize: 34, color: "rgba(255,255,255,0.88)", marginTop: 14, maxWidth: 860, textAlign: "center" }}>
          Ayudemos a reencontrar mascotas con sus humanos
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Montserrat", data: montserratBold, weight: 800, style: "normal" }],
    }
  );
}
