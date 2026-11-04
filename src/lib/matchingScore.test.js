import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// El puntaje de coincidencias (pesos, umbrales, reglas) corre solo en el
// servidor desde 2026-11-04: ningún archivo que llegue al navegador puede
// importarlo, ni directa ni indirectamente. Si esto falla, el algoritmo
// vuelve a quedar a la vista en el JS público de felpus.com.
const SRC = path.join(process.cwd(), "src");
const SOLO_SERVIDOR = ["lib/matchingScore.js", "lib/chatbotSearch.js", "lib/serverCoincidencias.js", "lib/serverImpacto.js"].map((f) =>
  path.join(SRC, f)
);

function archivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return p.includes(`${path.sep}api`) ? [] : archivos(p);
    return /\.(jsx?|mjs)$/.test(d.name) && !/\.test\./.test(d.name) ? [p] : [];
  });
}

function resolver(desde, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(desde), spec);
  for (const c of [base, `${base}.js`, `${base}.jsx`, path.join(base, "index.js")]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function importsDe(file) {
  const txt = fs.readFileSync(file, "utf8");
  const specs = [...txt.matchAll(/(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] || m[2]);
  return specs.map((s) => resolver(file, s)).filter(Boolean);
}

// Entradas del navegador: componentes y páginas (no las rutas /api).
const entradas = [...archivos(path.join(SRC, "components")), ...archivos(path.join(SRC, "app")).filter((f) => !f.includes(`${path.sep}api${path.sep}`))];

describe("el puntaje de coincidencias no llega al navegador", () => {
  it("ningún componente ni página lo alcanza por imports", () => {
    const visto = new Set();
    const caminos = [];
    const pila = entradas.map((e) => [e, [e]]);
    while (pila.length) {
      const [f, camino] = pila.pop();
      if (visto.has(f)) continue;
      visto.add(f);
      if (SOLO_SERVIDOR.includes(f)) {
        caminos.push(camino.map((c) => path.relative(SRC, c)).join(" -> "));
        continue;
      }
      for (const dep of importsDe(f)) pila.push([dep, [...camino, dep]]);
    }
    expect(caminos).toEqual([]);
  });

  it("el chequeo encuentra imports reales (no está vacío)", () => {
    expect(entradas.length).toBeGreaterThan(20);
    expect(importsDe(path.join(SRC, "components", "FelpusMatcher.jsx")).length).toBeGreaterThan(10);
  });
});
