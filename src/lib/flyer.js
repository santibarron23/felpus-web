// Genera un flyer/póster imprimible (PNG) para un reporte, 100% en el
// cliente con <canvas> — sin backend ni librerías nuevas más que `qrcode`
// (pura JS, sin dependencias nativas). Pensado para imprimir y pegar en el
// barrio, que sigue siendo un método real de recuperación (es el feature
// más citado de PawBoost en la comparativa).

import QRCode from "qrcode";

const LOGO_ICON_SRC = "/assets/icon_c.png";
const FONT_FAMILY = "'Montserrat', Arial, sans-serif";

async function ensureFontsLoaded() {
  if (typeof document === "undefined" || !document.fonts) return;
  const specs = ["400 16px Montserrat", "600 16px Montserrat", "700 16px Montserrat", "800 16px Montserrat"];
  await Promise.all(specs.map((spec) => document.fonts.load(spec).catch(() => {})));
}

function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Dibuja "cover" (como object-fit: cover) dentro de un cuadro x,y,size,size.
function drawImageCover(ctx, img, x, y, size) {
  const ratio = Math.max(size / img.width, size / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  const dx = x + (size - w) / 2;
  const dy = y + (size - h) / 2;
  ctx.drawImage(img, dx, dy, w, h);
}

// Exportadas (acá y más abajo) aunque solo las use este archivo: son la
// parte de flyer.js que es lógica pura (texto adentro, texto/estructura
// afuera), sin canvas ni DOM — separarlas así es lo que permite testearlas
// directamente en flyer.test.js sin tener que mockear un <canvas>.
export function capitalize(text) {
  const s = String(text || "");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// --- Texto con "resaltado" (palabras clave en negrita/color), envuelto en líneas ---

export function tokenizeWords(text) {
  return String(text || "").split(/\s+/).filter(Boolean);
}

export function stripPunct(word) {
  return word.replace(/^[¿¡"'“”(]+|[.,;:!?)"'”]+$/g, "");
}

const HIGHLIGHT_WORDS = new Set([
  "negro", "negra", "blanco", "blanca", "marrón", "marron", "gris", "dorado", "dorada",
  "atigrado", "atigrada", "manchado", "manchada", "bicolor", "abundante", "abundantes",
  "dócil", "docil", "amigable", "tranquilo", "tranquila", "agresivo", "agresiva",
  "franja", "melena", "collar", "correa", "cojea", "herida", "asustadizo", "asustadiza",
  "cicatriz", "chip", "microchip", "esterilizada", "esterilizado", "cariñoso", "cariñosa",
  "juguetón", "juguetona", "triangulares", "semierguidas", "erguidas", "caídas", "hocico",
  "nariz", "manso", "mansa", "arisco", "arisca", "chapita", "vacunado", "vacunada",
]);

export function tokensFromSentence(sentence) {
  return tokenizeWords(sentence).map((w) => ({ text: w, bold: HIGHLIGHT_WORDS.has(stripPunct(w).toLowerCase()) }));
}

export function tokensFromParts(plainPrefix, boldValue, plainSuffix = "") {
  const tokens = [];
  tokenizeWords(plainPrefix).forEach((w) => tokens.push({ text: w, bold: false }));
  tokenizeWords(boldValue).forEach((w) => tokens.push({ text: w, bold: true }));
  tokenizeWords(plainSuffix).forEach((w) => tokens.push({ text: w, bold: false }));
  return tokens;
}

function wrapTokens(ctx, tokens, maxWidth, regularFont, boldFont) {
  ctx.font = regularFont;
  const spaceWidth = ctx.measureText(" ").width;
  const lines = [];
  let current = [];
  let currentWidth = 0;
  tokens.forEach((tok) => {
    ctx.font = tok.bold ? boldFont : regularFont;
    const w = ctx.measureText(tok.text).width;
    const addWidth = current.length ? spaceWidth + w : w;
    if (currentWidth + addWidth > maxWidth && current.length) {
      lines.push(current);
      current = [tok];
      currentWidth = w;
    } else {
      current.push(tok);
      currentWidth += addWidth;
    }
  });
  if (current.length) lines.push(current);
  return lines;
}

function drawTokenLines(ctx, lines, x, y, lineHeight, regularFont, boldFont, regularColor, boldColor) {
  ctx.textAlign = "left";
  ctx.font = regularFont;
  const spaceWidth = ctx.measureText(" ").width;
  lines.forEach((line, i) => {
    let cx = x;
    const ty = y + i * lineHeight;
    line.forEach((tok) => {
      ctx.font = tok.bold ? boldFont : regularFont;
      ctx.fillStyle = tok.bold ? boldColor : regularColor;
      ctx.fillText(tok.text, cx, ty);
      cx += ctx.measureText(tok.text).width + spaceWidth;
    });
  });
}

function fitFontSize(ctx, text, maxWidth, startSize, minSize, weight = "800") {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

// --- Íconos vectoriales simples, dibujados a mano (sin dependencias) ---

function iconCircleBg(ctx, cx, cy, r, color) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function iconPin(ctx, cx, cy, r, fg) {
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.55);
  ctx.bezierCurveTo(cx - r * 0.55, cy + r * 0.05, cx - r * 0.42, cy - r * 0.55, cx, cy - r * 0.55);
  ctx.bezierCurveTo(cx + r * 0.42, cy - r * 0.55, cx + r * 0.55, cy + r * 0.05, cx, cy + r * 0.55);
  ctx.closePath();
  ctx.fill();
}

function iconPaw(ctx, cx, cy, r, fg) {
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.18, r * 0.38, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  const toes = [
    [-r * 0.42, -r * 0.28, r * 0.17],
    [-r * 0.15, -r * 0.5, r * 0.18],
    [r * 0.15, -r * 0.5, r * 0.18],
    [r * 0.42, -r * 0.28, r * 0.17],
  ];
  toes.forEach(([dx, dy, tr]) => {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, tr, 0, Math.PI * 2);
    ctx.fill();
  });
}

function iconGender(ctx, cx, cy, r, fg, sexo) {
  ctx.strokeStyle = fg;
  ctx.fillStyle = fg;
  ctx.lineWidth = Math.max(2.5, r * 0.14);
  ctx.lineCap = "round";
  const isMacho = sexo === "Macho";
  const circR = r * 0.34;
  if (isMacho) {
    const ccx = cx - r * 0.12;
    const ccy = cy + r * 0.12;
    ctx.beginPath();
    ctx.arc(ccx, ccy, circR, 0, Math.PI * 2);
    ctx.stroke();
    const angle = -Math.PI / 4;
    const startX = ccx + Math.cos(angle) * circR;
    const startY = ccy + Math.sin(angle) * circR;
    const endX = cx + r * 0.5;
    const endY = cy - r * 0.5;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - r * 0.28, endY);
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX, endY + r * 0.28);
    ctx.stroke();
  } else {
    const ccy = cy - r * 0.14;
    ctx.beginPath();
    ctx.arc(cx, ccy, circR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, ccy + circR);
    ctx.lineTo(cx, cy + r * 0.55);
    ctx.moveTo(cx - r * 0.22, cy + r * 0.32);
    ctx.lineTo(cx + r * 0.22, cy + r * 0.32);
    ctx.stroke();
  }
}

function iconCalendar(ctx, cx, cy, r, fg) {
  ctx.strokeStyle = fg;
  ctx.fillStyle = fg;
  ctx.lineWidth = Math.max(2, r * 0.1);
  const w = r * 1.15;
  const h = r * 1.0;
  const x = cx - w / 2;
  const y = cy - h / 2 + r * 0.08;
  roundRectPath(ctx, x, y, w, h, r * 0.16);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.32);
  ctx.lineTo(x + w, y + h * 0.32);
  ctx.stroke();
  ctx.lineWidth = Math.max(2.5, r * 0.14);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.28, y - r * 0.1);
  ctx.lineTo(x + w * 0.28, y + r * 0.14);
  ctx.moveTo(x + w * 0.72, y - r * 0.1);
  ctx.lineTo(x + w * 0.72, y + r * 0.14);
  ctx.stroke();
}

function iconScale(ctx, cx, cy, r, fg) {
  ctx.strokeStyle = fg;
  ctx.fillStyle = fg;
  ctx.lineWidth = Math.max(2.5, r * 0.13);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.55);
  ctx.lineTo(cx, cy + r * 0.5);
  ctx.moveTo(cx - r * 0.55, cy - r * 0.3);
  ctx.lineTo(cx + r * 0.55, cy - r * 0.3);
  ctx.moveTo(cx - r * 0.35, cy + r * 0.5);
  ctx.lineTo(cx + r * 0.35, cy + r * 0.5);
  ctx.stroke();
  [-r * 0.55, r * 0.55].forEach((dx) => {
    ctx.beginPath();
    ctx.arc(cx + dx, cy - r * 0.05, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  });
}

function iconChat(ctx, cx, cy, r, fg, bg) {
  ctx.fillStyle = fg;
  roundRectPath(ctx, cx - r * 0.6, cy - r * 0.5, r * 1.2, r * 0.85, r * 0.22);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.25, cy + r * 0.32);
  ctx.lineTo(cx - r * 0.42, cy + r * 0.58);
  ctx.lineTo(cx - r * 0.02, cy + r * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = bg;
  [-0.22, 0, 0.22].forEach((dx) => {
    ctx.beginPath();
    ctx.arc(cx + dx * r, cy - r * 0.08, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  });
}

function iconFace(ctx, cx, cy, r, fg) {
  ctx.strokeStyle = fg;
  ctx.fillStyle = fg;
  ctx.lineWidth = Math.max(2.5, r * 0.13);
  ctx.lineCap = "round";
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.arc(cx + side * r * 0.28, cy - r * 0.12, r * 0.09, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.05, r * 0.4, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}

function iconHeartGlyph(ctx, cx, cy, r, fg) {
  ctx.fillStyle = fg;
  const s = r * 1.15;
  const top = cy - s * 0.42;
  ctx.beginPath();
  ctx.moveTo(cx, top + s * 0.3);
  ctx.bezierCurveTo(cx, top, cx - s * 0.5, top, cx - s * 0.5, top + s * 0.3);
  ctx.bezierCurveTo(cx - s * 0.5, top + s * 0.58, cx, top + s * 0.68, cx, top + s * 0.95);
  ctx.bezierCurveTo(cx, top + s * 0.68, cx + s * 0.5, top + s * 0.58, cx + s * 0.5, top + s * 0.3);
  ctx.bezierCurveTo(cx + s * 0.5, top, cx, top, cx, top + s * 0.3);
  ctx.fill();
}

function iconPhone(ctx, cx, cy, r, fg) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-30 * Math.PI) / 180);
  ctx.fillStyle = fg;
  roundRectPath(ctx, -r * 0.22, -r * 0.62, r * 0.44, r * 1.24, r * 0.2);
  ctx.fill();
  ctx.restore();
}

function drawHeart(ctx, cx, cy, size, color) {
  ctx.fillStyle = color;
  const top = cy - size * 0.35;
  ctx.beginPath();
  ctx.moveTo(cx, top + size * 0.32);
  ctx.bezierCurveTo(cx, top, cx - size * 0.5, top, cx - size * 0.5, top + size * 0.32);
  ctx.bezierCurveTo(cx - size * 0.5, top + size * 0.62, cx, top + size * 0.72, cx, top + size);
  ctx.bezierCurveTo(cx, top + size * 0.72, cx + size * 0.5, top + size * 0.62, cx + size * 0.5, top + size * 0.32);
  ctx.bezierCurveTo(cx + size * 0.5, top, cx, top, cx, top + size * 0.32);
  ctx.fill();
}

function drawIcon(ctx, type, cx, cy, r, fg, bg, extra) {
  switch (type) {
    case "pin":
      iconPin(ctx, cx, cy, r, fg);
      break;
    case "paw":
      iconPaw(ctx, cx, cy, r, fg);
      break;
    case "gender":
      iconGender(ctx, cx, cy, r, fg, extra);
      break;
    case "calendar":
      iconCalendar(ctx, cx, cy, r, fg);
      break;
    case "scale":
      iconScale(ctx, cx, cy, r, fg);
      break;
    case "chat":
      iconChat(ctx, cx, cy, r, fg, bg);
      break;
    case "face":
      iconFace(ctx, cx, cy, r, fg);
      break;
    case "heart":
      iconHeartGlyph(ctx, cx, cy, r, fg);
      break;
    case "phone":
      iconPhone(ctx, cx, cy, r, fg);
      break;
    default:
      break;
  }
}

export function especieLabel(especie) {
  if (especie === "gato") return "Gato";
  if (especie === "perro") return "Perro";
  return "Mascota";
}

// Cada oración de la descripción libre se ilustra con un ícono relacionado
// a lo que dice, no siempre el mismo — "se perdió en la entrada de..." usa
// un pin de ubicación, "tiene la nariz negra" usa un ícono de cara, "es muy
// dócil" un corazón, y el resto cae en el globo de texto genérico. Es un
// heurístico simple por palabras clave, no NLP real, pero cubre bien el
// vocabulario típico de estas descripciones.
const ICON_KEYWORD_CATEGORIES = [
  {
    icon: "pin",
    words: [
      "perdio", "perdió", "encontro", "encontró", "encontrado", "entrada", "zona", "cerca",
      "cuadra", "calle", "avenida", "esquina", "barrio", "plaza", "parque", "estacion",
      "estación", "salio", "salió", "escapo", "escapó", "cerca de", "altura",
    ],
  },
  {
    icon: "face",
    words: ["cabeza", "hocico", "nariz", "orejas", "oreja", "ojos", "ojo", "franja", "cara", "bigotes"],
  },
  {
    icon: "heart",
    words: [
      "docil", "dócil", "amigable", "tranquilo", "tranquila", "agresivo", "agresiva",
      "jugueton", "juguetón", "juguetona", "cariñoso", "cariñosa", "carinoso", "carinosa",
      "manso", "mansa", "arisco", "arisca", "asustadizo", "asustadiza", "querida", "querido", "familia",
    ],
  },
];

export function normalizeForMatch(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function classifySentenceIcon(sentence) {
  const norm = normalizeForMatch(sentence);
  for (const category of ICON_KEYWORD_CATEGORIES) {
    if (category.words.some((w) => norm.includes(normalizeForMatch(w)))) return category.icon;
  }
  return "chat";
}

export function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Arma la línea de zona del flyer: arranca del texto libre que ya existía
// (report.zona) y, si hay ciudad/provincia estructuradas (ver
// ZonaAutocomplete.jsx — solo se completan cuando la persona elige una
// sugerencia del autocompletado, no cuando tipea a mano), las agrega —
// salvo que ya estén repetidas dentro de lo que se acumuló hasta ahí (ej.
// si la zona elegida ya dice "Salta" y la provincia también es "Salta", no
// queda duplicado). Reportes viejos o con zona tipeada a mano (sin
// ciudad/provincia) dan exactamente el mismo texto que antes de que
// existieran estos dos campos.
export function composeZonaDisplay(report) {
  const parts = [];
  const seenNorm = [];
  [report?.zona, report?.ciudad, report?.provincia].forEach((raw) => {
    const part = String(raw || "").trim();
    if (!part) return;
    const norm = normalizeForMatch(part);
    if (seenNorm.some((s) => s.includes(norm) || norm.includes(s))) return;
    parts.push(part);
    seenNorm.push(norm);
  });
  return parts.join(", ");
}

export function reportPublicUrl(report) {
  if (typeof window === "undefined") return "";
  // Misma URL canónica que usa ShareButton (/r/[id]) — antes este QR apuntaba
  // a /?r=<id>, una ruta distinta que no lleva la preview con foto real.
  return `${window.location.origin}/r/${encodeURIComponent(report.id)}`;
}

export async function buildFlyerBlob(report, colorText) {
  const W = 800;
  const MARGIN = 48;
  const CONTENT_W = W - MARGIN * 2;
  const isLost = report.tipo === "perdida";
  const accent = isLost ? "#D31C22" : "#E36525";
  const cream = "#FBF7F0";
  const ink = "#2B1B12";
  const muted = "#6B5643";
  const line = "#EFE3D2";
  await ensureFontsLoaded();
  const REG = `24px ${FONT_FAMILY}`;
  const BOLD = `700 24px ${FONT_FAMILY}`;

  const measure = document.createElement("canvas").getContext("2d");
  const titulo = report.nombre || `${especieLabel(report.especie)} sin nombre`;
  const tamanoCap = capitalize(report.tamano);

  // --- Filas de datos (íconos + oraciones cortas con la palabra clave resaltada) ---
  const rowDefs = [];
  rowDefs.push({
    icon: "paw",
    tokens: tokensFromParts(`${especieLabel(report.especie)} de tamaño`, tamanoCap, `, color ${colorText}.`),
  });
  if (report.sexo && report.sexo !== "No sé") {
    rowDefs.push({ icon: "gender", extra: report.sexo, tokens: tokensFromParts("Sexo:", report.sexo, ".") });
  }
  if (report.edad && report.edad !== "No sé") {
    rowDefs.push({ icon: "calendar", tokens: tokensFromParts("Edad aproximada:", report.edad, ".") });
  }
  if (report.peso && report.peso !== "No sé") {
    rowDefs.push({ icon: "scale", tokens: tokensFromParts("Peso aproximado:", report.peso, ".") });
  }
  splitSentences(report.descripcion).forEach((sentence) => {
    rowDefs.push({ icon: classifySentenceIcon(sentence), tokens: tokensFromSentence(sentence) });
  });

  const ROW_LINE_H = 30;
  const ROW_PAD_V = 22;
  const iconR = 22;
  const rowTextX = MARGIN + 20 + iconR * 2 + 18;
  const rowTextMaxWidth = W - MARGIN - 20 - rowTextX;
  const preparedRows = rowDefs.map((r) => {
    const lines = wrapTokens(measure, r.tokens, rowTextMaxWidth, REG, BOLD);
    return { ...r, lines, blockH: Math.max(1, lines.length) * ROW_LINE_H + ROW_PAD_V };
  });
  const rowsBlockHeight = preparedRows.reduce((sum, r) => sum + r.blockH, 0);

  const hasContact = Boolean(report.contactoWhatsapp || report.contactoEmail);
  const publicUrl = reportPublicUrl(report);

  // --- Altura total del canvas, calculada en base al contenido real ---
  const photoSize = Math.round(CONTENT_W * 0.62);
  let contentHeight = 0;
  contentHeight += 40; // padding superior
  contentHeight += 54 + 26; // logo
  contentHeight += 118; // banda de título (una línea + divisor corazón)
  contentHeight += 24;
  contentHeight += photoSize;
  contentHeight += 30;
  contentHeight += 44; // nombre
  contentHeight += 34; // color · tamaño
  contentHeight += 26;
  contentHeight += 2; // divisor
  contentHeight += 26;
  contentHeight += 40; // zona
  contentHeight += 20;
  contentHeight += 20 + rowsBlockHeight + 20; // contenedor con borde de las filas
  contentHeight += 26;
  if (hasContact) contentHeight += 150 + 26;
  contentHeight += 140; // footer con QR (más grande que antes, ver qrSize)

  const H = Math.round(contentHeight);

  // Lienzo final fijo en 9:16 (ocupa la pantalla completa en mobile y entra
  // prolijo en una hoja A4 al imprimir, con margen blanco arriba/abajo o a
  // los costados en vez de recortar contenido). El contenido se dibuja en el
  // espacio lógico de W×H (como antes) y luego se escala/centra para entrar
  // en el marco fijo — si la descripción es larga y no entra, se achica en
  // vez de desbordar.
  const FRAME_W = 1080;
  const FRAME_H = Math.round((FRAME_W * 16) / 9);
  const baseScale = FRAME_W / W;
  const availableLogicalH = FRAME_H / baseScale;
  const fitScale = Math.min(1, availableLogicalH / H);
  const totalScale = baseScale * fitScale;

  const canvas = document.createElement("canvas");
  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = cream;
  ctx.fillRect(0, 0, FRAME_W, FRAME_H);

  const drawnW = W * totalScale;
  const drawnH = H * totalScale;
  ctx.save();
  ctx.translate((FRAME_W - drawnW) / 2, (FRAME_H - drawnH) / 2);
  ctx.scale(totalScale, totalScale);

  let y = 40;

  // Logo
  try {
    const logo = await loadImageEl(LOGO_ICON_SRC);
    const logoH = 44;
    const logoW = (logo.width / logo.height) * logoH;
    ctx.font = `800 32px ${FONT_FAMILY}`;
    const wordmarkWidth = ctx.measureText("Felpus").width;
    const groupWidth = logoW + 12 + wordmarkWidth;
    const startX = (W - groupWidth) / 2;
    ctx.drawImage(logo, startX, y, logoW, logoH);
    ctx.fillStyle = accent;
    ctx.textAlign = "left";
    ctx.fillText("Felpus", startX + logoW + 12, y + logoH - 10);
  } catch {
    ctx.fillStyle = accent;
    ctx.textAlign = "center";
    ctx.font = `800 32px ${FONT_FAMILY}`;
    ctx.fillText("Felpus", W / 2, y + 34);
  }
  y += 54 + 26;

  // Banda de título (una sola línea, tamaño automático)
  const bandH = 118;
  roundRectPath(ctx, MARGIN, y, CONTENT_W, bandH, 22);
  ctx.fillStyle = accent;
  ctx.fill();
  const titleText = isLost ? "MASCOTA PERDIDA" : "MASCOTA ENCONTRADA";
  const titleSize = fitFontSize(ctx, titleText, CONTENT_W - 64, 46, 26);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = `800 ${titleSize}px ${FONT_FAMILY}`;
  ctx.fillText(titleText, W / 2, y + 56);

  // Divisor decorativo: línea — corazón — línea
  const dividerY = y + 88;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 70, dividerY);
  ctx.lineTo(W / 2 - 16, dividerY);
  ctx.moveTo(W / 2 + 16, dividerY);
  ctx.lineTo(W / 2 + 70, dividerY);
  ctx.stroke();
  drawHeart(ctx, W / 2, dividerY - 8, 16, "#ffffff");
  y += bandH + 24;

  // Foto
  const px = (W - photoSize) / 2;
  try {
    const img = await loadImageEl(report.foto);
    ctx.save();
    roundRectPath(ctx, px, y, photoSize, photoSize, 24);
    ctx.clip();
    drawImageCover(ctx, img, px, y, photoSize);
    ctx.restore();
  } catch {
    ctx.fillStyle = "#F0E7D8";
    roundRectPath(ctx, px, y, photoSize, photoSize, 24);
    ctx.fill();
  }
  ctx.strokeStyle = line;
  ctx.lineWidth = 4;
  roundRectPath(ctx, px, y, photoSize, photoSize, 24);
  ctx.stroke();
  y += photoSize + 30;

  // Nombre
  ctx.fillStyle = accent;
  ctx.font = `800 38px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.fillText(titulo.toUpperCase(), W / 2, y + 32);
  y += 44;

  ctx.fillStyle = muted;
  ctx.font = `24px ${FONT_FAMILY}`;
  ctx.fillText(`${colorText}${report.tamano ? ` · ${tamanoCap}` : ""}`, W / 2, y + 20);
  y += 34 + 26;

  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, y);
  ctx.lineTo(W - MARGIN, y);
  ctx.stroke();
  y += 26;

  // Zona (fila centrada con ícono) — incluye ciudad/provincia cuando están
  // disponibles (ver composeZonaDisplay), así que el texto puede ser más
  // largo que antes: se achica con fitFontSize si no entra en una línea, en
  // vez de desbordar el margen del flyer.
  const zonaText = `ZONA: ${composeZonaDisplay(report).toUpperCase()}`;
  const zonaFontSize = fitFontSize(ctx, zonaText, CONTENT_W - 80, 24, 14);
  ctx.font = `800 ${zonaFontSize}px ${FONT_FAMILY}`;
  const zonaTextWidth = ctx.measureText(zonaText).width;
  const zonaIconR = 18;
  const zonaGroupWidth = zonaIconR * 2 + 12 + zonaTextWidth;
  const zonaStartX = (W - zonaGroupWidth) / 2;
  iconCircleBg(ctx, zonaStartX + zonaIconR, y + zonaIconR, zonaIconR, accent);
  iconPin(ctx, zonaStartX + zonaIconR, y + zonaIconR, zonaIconR * 0.62, "#ffffff");
  ctx.fillStyle = ink;
  ctx.textAlign = "left";
  ctx.fillText(zonaText, zonaStartX + zonaIconR * 2 + 12, y + zonaIconR + 8);
  y += 40 + 20;

  // Contenedor con borde para las filas de datos
  const containerTop = y;
  const containerH = 20 + rowsBlockHeight + 20;
  roundRectPath(ctx, MARGIN, containerTop, CONTENT_W, containerH, 18);
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.stroke();
  y += 20;

  preparedRows.forEach((r, idx) => {
    const iconCy = y + r.blockH / 2 - ((r.lines.length - 1) * ROW_LINE_H) / 2;
    iconCircleBg(ctx, MARGIN + 20 + iconR, iconCy, iconR, accent);
    drawIcon(ctx, r.icon, MARGIN + 20 + iconR, iconCy, iconR * 0.62, "#ffffff", accent, r.extra);
    const textTop = y + (r.blockH - r.lines.length * ROW_LINE_H) / 2 + ROW_LINE_H - 8;
    drawTokenLines(ctx, r.lines, rowTextX, textTop, ROW_LINE_H, REG, BOLD, muted, accent);
    y += r.blockH;
    if (idx < preparedRows.length - 1) {
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rowTextX, y);
      ctx.lineTo(W - MARGIN - 20, y);
      ctx.stroke();
    }
  });
  y = containerTop + containerH + 26;

  // Banda de contacto
  if (hasContact) {
    const bandH2 = 150;
    roundRectPath(ctx, MARGIN, y, CONTENT_W, bandH2, 20);
    ctx.fillStyle = accent;
    ctx.fill();

    const iconCx = MARGIN + 50;
    const iconCy2 = y + 50;
    iconCircleBg(ctx, iconCx, iconCy2, 26, "#ffffff");
    // Antes un teléfono rotado — un globo de chat se lee más directo como
    // "contacto" (WhatsApp/mensaje), en vez de asumir que siempre es una
    // llamada. bg="#ffffff" (igual que el círculo de fondo) para que los
    // puntitos del globo queden como "recorte", no como un color suelto.
    drawIcon(ctx, "chat", iconCx, iconCy2, 18, accent, "#ffffff");

    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 18px ${FONT_FAMILY}`;
    const label = (isLost ? "SI LA VISTE, CONTACTANOS" : "SI RECONOCÉS A ESTA MASCOTA, CONTACTANOS");
    const labelWords = label.split(" ");
    let labelLine = "";
    const labelLines = [];
    labelWords.forEach((w) => {
      const test = labelLine ? `${labelLine} ${w}` : w;
      if (ctx.measureText(test).width > CONTENT_W - 100 - 20 && labelLine) {
        labelLines.push(labelLine);
        labelLine = w;
      } else {
        labelLine = test;
      }
    });
    if (labelLine) labelLines.push(labelLine);
    labelLines.forEach((ln, i) => ctx.fillText(ln, iconCx + 44, y + 34 + i * 22));

    const contactValue = report.contactoWhatsapp || report.contactoEmail;
    const valueFontSize = contactValue.length > 24 ? 24 : 32;
    ctx.font = `800 ${valueFontSize}px ${FONT_FAMILY}`;
    ctx.fillText(contactValue, iconCx + 44, y + 34 + labelLines.length * 22 + 30);

    y += bandH2 + 26;
  }

  // Footer: texto de marca + código QR discreto a la publicación
  const footerTop = y;
  ctx.textAlign = "left";
  ctx.fillStyle = muted;
  ctx.font = `20px ${FONT_FAMILY}`;
  ctx.fillText("Publicada en", MARGIN, footerTop + 26);
  ctx.fillStyle = accent;
  ctx.font = `800 22px ${FONT_FAMILY}`;
  ctx.fillText("Felpus", MARGIN, footerTop + 54);

  if (publicUrl) {
    try {
      const qrCanvas = document.createElement("canvas");
      await QRCode.toCanvas(qrCanvas, publicUrl, {
        width: 160,
        margin: 0,
        errorCorrectionLevel: "M",
        color: { dark: accent, light: "#00000000" },
      });
      const qrSize = 96; // antes 68 — más grande para que se pueda escanear con margen (ver contentHeight arriba)
      const qrX = W - MARGIN - qrSize;
      const qrY = footerTop - 4;
      ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
      ctx.fillStyle = muted;
      ctx.font = `13px ${FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.fillText("Ver publicación", qrX + qrSize / 2, qrY + qrSize + 18);
    } catch {
      // Si falla la generación del QR, el flyer se genera igual sin él.
    }
  }

  ctx.restore();

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export async function downloadFlyer(report, colorText) {
  const blob = await buildFlyerBlob(report, colorText);
  if (!blob) throw new Error("No se pudo generar la imagen del flyer.");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `felpus-flyer-${report.id}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
