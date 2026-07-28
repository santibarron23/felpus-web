// Genera un flyer/póster imprimible (PNG) para un reporte, 100% en el
// cliente con <canvas> — sin backend ni librerías nuevas. Pensado para
// imprimir y pegar en el barrio, que sigue siendo un método real de
// recuperación (es el feature más citado de PawBoost en la comparativa).

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

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let currentY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, currentY);
  return currentY;
}

export async function buildFlyerBlob(report, colorText) {
  const W = 800;
  const H = 1050;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const isLost = report.tipo === "perdida";
  const bandColor = isLost ? "#D31C22" : "#E36525";

  ctx.fillStyle = "#FBF7F0";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = bandColor;
  ctx.fillRect(0, 0, W, 130);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "bold 46px Arial, sans-serif";
  ctx.fillText(isLost ? "MASCOTA PERDIDA" : "MASCOTA ENCONTRADA", W / 2, 80);

  const photoSize = 480;
  const px = (W - photoSize) / 2;
  const py = 170;
  try {
    const img = await loadImageEl(report.foto);
    ctx.save();
    roundRectPath(ctx, px, py, photoSize, photoSize, 20);
    ctx.clip();
    drawImageCover(ctx, img, px, py, photoSize);
    ctx.restore();
  } catch {
    ctx.fillStyle = "#F0E7D8";
    roundRectPath(ctx, px, py, photoSize, photoSize, 20);
    ctx.fill();
  }
  ctx.strokeStyle = "#EFE3D2";
  ctx.lineWidth = 4;
  roundRectPath(ctx, px, py, photoSize, photoSize, 20);
  ctx.stroke();

  let y = py + photoSize + 55;
  ctx.fillStyle = "#2B1B12";
  ctx.font = "bold 40px Arial, sans-serif";
  const titulo = report.nombre || (report.especie === "gato" ? "Gato sin nombre" : report.especie === "perro" ? "Perro sin nombre" : "Mascota sin nombre");
  ctx.fillText(titulo, W / 2, y);

  y += 44;
  ctx.font = "28px Arial, sans-serif";
  ctx.fillStyle = "#6B5643";
  ctx.fillText(`${colorText} · ${report.tamano}`, W / 2, y);

  y += 46;
  ctx.font = "bold 30px Arial, sans-serif";
  ctx.fillStyle = "#2B1B12";
  ctx.fillText(`Zona: ${report.zona}`, W / 2, y);

  y += 44;
  ctx.font = "24px Arial, sans-serif";
  ctx.fillStyle = "#6B5643";
  y = wrapText(ctx, report.descripcion || "", W / 2 - 300, y, 600, 32);

  y += 40;
  ctx.font = "bold 30px Arial, sans-serif";
  ctx.fillStyle = bandColor;
  if (report.contactoWhatsapp) {
    ctx.fillText(`WhatsApp: ${report.contactoWhatsapp}`, W / 2, y);
    y += 40;
  }
  if (report.contactoEmail) {
    ctx.fillText(report.contactoEmail, W / 2, y);
    y += 40;
  }

  ctx.font = "22px Arial, sans-serif";
  ctx.fillStyle = "#6B5643";
  ctx.fillText("Publicado en Felpus", W / 2, H - 30);

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
