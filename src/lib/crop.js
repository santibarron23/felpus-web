// Recorte de fotos (2026-10-29): cuentas del rectángulo de recorte, sin DOM.
// El rectángulo se guarda en fracciones de la imagen ({ x, y, w, h } entre
// 0 y 1), así no depende del tamaño en pantalla. Lo usa PhotoCropper.jsx.
export const MIN_LADO = 0.15;
export const RECTO_COMPLETO = { x: 0, y: 0, w: 1, h: 1 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Arrastrar el rectángulo entero: no se sale de la imagen.
export function moverRect(r, dx, dy) {
  return { ...r, x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h) };
}

// Arrastrar una esquina ("nw", "ne", "sw", "se"): la esquina opuesta queda
// fija, sin achicarse por debajo de MIN_LADO ni salirse de la imagen.
export function redimensionarRect(r, esquina, dx, dy) {
  let x1 = r.x;
  let y1 = r.y;
  let x2 = r.x + r.w;
  let y2 = r.y + r.h;
  if (esquina.includes("w")) x1 = clamp(x1 + dx, 0, x2 - MIN_LADO);
  if (esquina.includes("e")) x2 = clamp(x2 + dx, x1 + MIN_LADO, 1);
  if (esquina.includes("n")) y1 = clamp(y1 + dy, 0, y2 - MIN_LADO);
  if (esquina.includes("s")) y2 = clamp(y2 + dy, y1 + MIN_LADO, 1);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// Teclado: flechas mueven; con Shift agrandan o achican (desde la esquina
// de abajo a la derecha). null si la tecla no es una flecha.
export function rectConTecla(r, key, shift, paso = 0.02) {
  const d = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[key];
  if (!d) return null;
  return shift ? redimensionarRect(r, "se", d[0], d[1]) : moverRect(r, d[0], d[1]);
}

// Rectángulo en píxeles de la imagen original, redondeado y dentro de ella.
export function rectEnPixeles(r, ancho, alto) {
  const sx = Math.round(clamp(r.x, 0, 1) * ancho);
  const sy = Math.round(clamp(r.y, 0, 1) * alto);
  const sw = Math.max(1, Math.min(ancho - sx, Math.round(r.w * ancho)));
  const sh = Math.max(1, Math.min(alto - sy, Math.round(r.h * alto)));
  return { sx, sy, sw, sh };
}

// ¿El recorte deja la foto igual? (para no reprocesar por nada)
export function esCompleto(r) {
  return r.x <= 0.001 && r.y <= 0.001 && r.w >= 0.999 && r.h >= 0.999;
}
