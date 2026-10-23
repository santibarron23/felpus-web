import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { CONTRIBUTOR_PUBLIC_COLUMNS } from "./store";

// contributors tiene el SELECT revocado y habilitado POR COLUMNA, sin
// whatsapp (migración 20261023_01: el WhatsApp de perfil se podía leer en
// bloque con la clave pública). Estos tests frenan en el CI de cada PR:
//  - pedir una columna sin grant (el ranking quedaría vacío),
//  - volver a habilitar whatsapp para lectura pública,
//  - volver a pedir select("*") sobre contributors.
const ROOT = path.join(__dirname, "..", "..");
const SUPABASE_DIR = path.join(ROOT, "supabase");

function sqlTexts() {
  const files = [path.join(SUPABASE_DIR, "schema.sql")];
  const dir = path.join(SUPABASE_DIR, "migrations");
  for (const f of fs.readdirSync(dir).sort()) if (f.endsWith(".sql")) files.push(path.join(dir, f));
  return files.map((f) => fs.readFileSync(f, "utf8").replace(/--[^\n]*/g, ""));
}

// Recorre los grant/revoke de SELECT sobre contributors EN ORDEN: un
// "revoke select on contributors" (tabla entera) borra lo habilitado antes.
export function selectableContributorColumns(texts) {
  const roles = { anon: new Set(), authenticated: new Set() };
  const re =
    /(grant|revoke)\s+select\s*(?:\(([^)]*)\))?\s*on\s+(?:table\s+)?(?:public\.)?contributors\s+(?:to|from)\s+([^;]+);/gi;
  for (const text of texts) {
    for (const m of text.matchAll(re)) {
      const [, verb, cols, who] = m;
      const targets = who.split(",").map((r) => r.trim().toLowerCase());
      for (const role of Object.keys(roles)) {
        if (!targets.includes(role)) continue;
        if (verb.toLowerCase() === "revoke" && !cols) roles[role] = new Set();
        else if (verb.toLowerCase() === "grant" && !cols) roles[role] = new Set(["*"]);
        else {
          const list = cols.split(",").map((c) => c.trim().toLowerCase());
          list.forEach((c) => (verb.toLowerCase() === "grant" ? roles[role].add(c) : roles[role].delete(c)));
        }
      }
    }
  }
  return roles;
}

describe("permisos de lectura de contributors", () => {
  const roles = selectableContributorColumns(sqlTexts());
  const pedidas = CONTRIBUTOR_PUBLIC_COLUMNS.split(",");

  for (const role of ["anon", "authenticated"]) {
    it(`toda columna que pide el sitio tiene grant select para ${role}`, () => {
      expect(pedidas.filter((c) => !roles[role].has(c))).toEqual([]);
    });
    it(`whatsapp NO es legible para ${role}`, () => {
      expect(roles[role].has("whatsapp") || roles[role].has("*")).toBe(false);
    });
  }

  it("el sitio nunca pide whatsapp en las columnas públicas", () => {
    expect(pedidas).not.toContain("whatsapp");
  });

  it('store.js no hace select("*") sobre contributors', () => {
    const store = fs.readFileSync(path.join(ROOT, "src", "lib", "store.js"), "utf8");
    expect(store).not.toMatch(/from\(CONTRIBUTORS_TABLE\)\s*\.select\(\s*["']\*["']/);
  });

  it("un revoke de tabla entera borra los grants anteriores", () => {
    const r = selectableContributorColumns([
      "grant select on contributors to anon;",
      "revoke select on contributors from anon;",
      "grant select (id) on contributors to anon;",
    ]);
    expect([...r.anon]).toEqual(["id"]);
  });
});
