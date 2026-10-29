// Calibración del aviso de "foto movida" (src/lib/photoQuality.js).
//
// Mide cada foto de una carpeta con EL MISMO código que corre en el celular
// (photoAnalysis, dibujando en un canvas de Chromium) e imprime un CSV
// ordenado de menos a más nítida. Las fotos de producción ya están
// procesadas igual que antes de subir (1000 px, JPEG 0,85, marca de agua),
// así que se pueden usar tal cual se bajan del bucket público.
//
// Uso: node scripts/calibrar-fotos-movidas.mjs <carpeta-con-fotos> [salida.csv]
//
// Para calibrar, mirar a ojo las fotos de arriba del CSV (las menos
// nítidas) y elegir un corte por debajo de la primera que se ve bien.
// Calibración 2026-10-29: ver el comentario de BLUR_THRESHOLD.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "@playwright/test";

const [dir, out] = process.argv.slice(2);
if (!dir) {
  console.error("Uso: node scripts/calibrar-fotos-movidas.mjs <carpeta-con-fotos> [salida.csv]");
  process.exit(1);
}
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lib = fs.readFileSync(path.join(ROOT, "src", "lib", "photoQuality.js"), "utf8").replace(/^export /gm, "");

const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.addScriptTag({ content: lib });

const rows = [];
for (const f of files) {
  const buf = fs.readFileSync(path.join(dir, f));
  const mime = /\.png$/i.test(f) ? "image/png" : /\.webp$/i.test(f) ? "image/webp" : "image/jpeg";
  const r = await page.evaluate((url) => photoAnalysis(url), `data:${mime};base64,${buf.toString("base64")}`);
  rows.push({ f, lum: r?.luminance ?? null, sharp: r?.sharpness ?? null });
}
await browser.close();

rows.sort((a, b) => (a.sharp ?? -1) - (b.sharp ?? -1));
const csv = ["archivo,brillo,nitidez", ...rows.map((r) => `${r.f},${r.lum?.toFixed(1)},${r.sharp?.toFixed(1)}`)].join("\n");
if (out) fs.writeFileSync(out, csv);
console.log(csv);
