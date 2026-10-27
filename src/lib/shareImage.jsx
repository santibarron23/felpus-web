// Imágenes para compartir un reporte (2026-10-27), generadas en el servidor
// con next/og:
//   - "og"    1200x630: la vista previa de WhatsApp, Facebook, X, Telegram…
//             (foto a la izquierda, resumen a la derecha, para que se
//             reconozca la mascota aunque la vista previa sea chica).
//   - "story" 1080x1920: para historias de Instagram/WhatsApp/Facebook
//             (cartel vertical con la foto grande y espacio abajo para el
//             sticker de enlace).
// El texto sale de shareCardData (shareCard.js).
/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text -- JSX para next/og (satori), no para el navegador. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { shareCardData } from "./shareCard";

export const OG_SIZE = { width: 1200, height: 630 };
export const STORY_SIZE = { width: 1080, height: 1920 };

const INK = "#382C25";
const MUTED = "#776C64";
const CREAM = "#F8F1E8";

let assetsPromise = null;
function loadAssets() {
  if (!assetsPromise) {
    const dir = join(process.cwd(), "assets");
    const file = (p) => readFile(join(dir, p));
    const png = async (p) => `data:image/png;base64,${(await file(p)).toString("base64")}`;
    assetsPromise = Promise.all([
      file("fonts/baloo-2-latin-800-normal.woff"),
      file("fonts/inter-latin-500-normal.woff"),
      file("fonts/inter-latin-700-normal.woff"),
      png("og/icon-red.png"),
      png("og/word-red.png"),
      png("og/icon-white.png"),
    ]).then(([baloo, inter500, inter700, iconRed, wordRed, iconWhite]) => ({
      fonts: [
        { name: "Baloo", data: baloo, weight: 800, style: "normal" },
        { name: "Inter", data: inter500, weight: 500, style: "normal" },
        { name: "Inter", data: inter700, weight: 700, style: "normal" },
      ],
      iconRed,
      wordRed,
      iconWhite,
    }));
    assetsPromise.catch(() => {
      assetsPromise = null;
    });
  }
  return assetsPromise;
}

// La foto se baja acá (no con <img src=url> dentro de next/og) para:
// aceptar solo fotos del bucket de Felpus (nada de pedirle al servidor URLs
// arbitrarias), cortar a los 5 s y 6 MB, y si algo falla, dibujar el cartel
// sin foto en vez de romper la vista previa.
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
export function isFelpusPhotoUrl(url) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.origin === new URL(base).origin && u.pathname.startsWith("/storage/v1/object/public/felpus-photos/");
  } catch {
    return false;
  }
}

async function loadPhoto(url) {
  if (!isFelpusPhotoUrl(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0].trim();
    // next/og (satori) dibuja JPEG y PNG; la app siempre sube JPEG.
    if (type !== "image/jpeg" && type !== "image/png") return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_PHOTO_BYTES) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function PinIcon({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function CalendarIcon({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

// Sin foto (o si no se pudo bajar): el ícono de Felpus sobre el color del
// estado, así igual se ve prolijo.
function PhotoOrPlaceholder({ photo, accent, iconWhite, width, height, radius = 0 }) {
  if (photo) {
    return <img src={photo} width={width} height={height} style={{ width, height, objectFit: "cover", borderRadius: radius }} />;
  }
  return (
    <div style={{ width, height, borderRadius: radius, background: accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <img src={iconWhite} width={Math.round(width * 0.35)} height={Math.round(width * 0.35 * 0.91)} />
    </div>
  );
}

function Badge({ text, accent, fontSize, padX, padY }) {
  return (
    <div style={{ display: "flex" }}>
      <div
        style={{
          display: "flex",
          background: accent,
          color: "white",
          fontFamily: "Baloo",
          fontWeight: 800,
          fontSize,
          letterSpacing: 2,
          lineHeight: 1,
          padding: `${padY}px ${padX}px`,
          paddingTop: padY + Math.round(fontSize * 0.12),
          borderRadius: 999,
        }}
      >
        {text}
      </div>
    </div>
  );
}

function OgCard({ d, photo, a }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: CREAM, fontFamily: "Inter" }}>
      <PhotoOrPlaceholder photo={photo} accent={d.accent} iconWhite={a.iconWhite} width={600} height={630} />
      <div style={{ width: 600, height: 630, display: "flex", flexDirection: "column", padding: "44px 48px 36px", borderTop: `14px solid ${d.accent}` }}>
        <Badge text={d.badge} accent={d.accent} fontSize={34} padX={26} padY={10} />
        <div style={{ display: "flex", marginTop: 26, fontFamily: "Baloo", fontWeight: 800, fontSize: d.title.length > 24 ? 50 : 62, lineHeight: 1.05, color: INK }}>
          {d.title}
        </div>
        {d.subtitle && <div style={{ display: "flex", marginTop: 10, fontSize: 28, fontWeight: 500, color: MUTED, lineHeight: 1.25 }}>{d.subtitle}</div>}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 22, gap: 12 }}>
          {d.zona && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 30, fontWeight: 700, color: INK }}>
              <PinIcon size={32} color={d.accent} />
              <span style={{ display: "flex", flex: 1 }}>{d.zona}</span>
            </div>
          )}
          {d.cuando && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 26, fontWeight: 500, color: MUTED }}>
              <CalendarIcon size={28} color={MUTED} />
              {d.cuando}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "2px solid #E9DED2", paddingTop: 20 }}>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: d.accent, maxWidth: 330 }}>{d.cta}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src={a.iconRed} width={50} height={46} />
            <img src={a.wordRed} width={138} height={42} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StoryCard({ d, photo, a }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", background: CREAM, fontFamily: "Inter", padding: "96px 60px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <img src={a.iconRed} width={76} height={69} />
        <img src={a.wordRed} width={210} height={64} />
      </div>
      <div style={{ display: "flex", marginTop: 44 }}>
        <Badge text={d.badge} accent={d.accent} fontSize={76} padX={52} padY={18} />
      </div>
      <div style={{ display: "flex", marginTop: 40, padding: 12, borderRadius: 48, background: d.accent }}>
        <PhotoOrPlaceholder photo={photo} accent={d.accent} iconWhite={a.iconWhite} width={936} height={780} radius={36} />
      </div>
      <div style={{ display: "flex", marginTop: 36, maxWidth: 960, fontFamily: "Baloo", fontWeight: 800, fontSize: d.title.length > 24 ? 70 : 92, lineHeight: 1.15, color: INK, textAlign: "center", justifyContent: "center" }}>
        {d.title}
      </div>
      {d.subtitle && <div style={{ display: "flex", marginTop: 14, maxWidth: 960, fontSize: 38, fontWeight: 500, color: MUTED, textAlign: "center", justifyContent: "center" }}>{d.subtitle}</div>}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 26, gap: 14 }}>
        {d.zona && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, maxWidth: 960, fontSize: 42, fontWeight: 700, color: INK, textAlign: "center" }}>
            <PinIcon size={44} color={d.accent} />
            <span style={{ display: "flex", maxWidth: 880 }}>{d.zona}</span>
          </div>
        )}
        {d.cuando && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 38, fontWeight: 500, color: MUTED }}>
            <CalendarIcon size={40} color={MUTED} />
            {d.cuando}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flex: 1 }} />
      {/* Franja de abajo: el CTA, y aire para que la persona ponga el
          sticker de enlace de Instagram sin tapar nada. */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 1080, background: d.accent, marginTop: 36, padding: "40px 60px 170px", gap: 10 }}>
        <div style={{ display: "flex", fontFamily: "Baloo", fontWeight: 800, fontSize: 54, color: "white", textAlign: "center" }}>{d.cta}</div>
        <div style={{ display: "flex", fontSize: 32, fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>Compartí: cada historia suma</div>
      </div>
    </div>
  );
}

export async function renderShareImage(report, format = "og") {
  const size = format === "story" ? STORY_SIZE : OG_SIZE;
  const [a, photo] = await Promise.all([loadAssets(), report && !report.oculto ? loadPhoto(report.foto_url) : null]);
  const d = shareCardData(report || {});
  const Card = format === "story" ? StoryCard : OgCard;
  const png = Buffer.from(await new ImageResponse(<Card d={d} photo={photo} a={a} />, { ...size, fonts: a.fonts }).arrayBuffer());
  // JPEG, no el PNG de next/og: con la foto, el PNG pesa 500 KB a 1 MB y
  // WhatsApp no muestra vistas previas de más de ~300 KB.
  let body = png;
  let type = "image/png";
  try {
    // Import dinámico: sharp es un módulo async y, importado arriba, volvía
    // async a las rutas que usan este archivo (Next rechaza su config).
    const { default: sharp } = await import("sharp");
    body = await sharp(png).jpeg({ quality: format === "story" ? 86 : 80, mozjpeg: true }).toBuffer();
    type = "image/jpeg";
  } catch {
    // Si sharp no está disponible, queda el PNG.
  }
  return new Response(body, { headers: { "Content-Type": type, "Cache-Control": SHARE_IMAGE_CACHE } });
}

export const SHARE_IMAGE_CACHE = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
