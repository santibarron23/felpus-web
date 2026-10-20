import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { REPORT_LIST_ALL_COLUMNS } from "./reportColumns";

// reports tiene el SELECT revocado para anon/authenticated y habilitado POR
// COLUMNA. Si el listado pide una columna que ninguna migración habilitó,
// Supabase rechaza la consulta entera (42501) y el sitio muestra 0 mascotas
// — pasó el 2026-10-20 con "inactivo". Este test lee schema.sql y todas las
// migraciones y exige que cada columna pedida tenga su grant para anon Y
// authenticated. Si falla: agregá en una migración nueva
//   grant select (<columna>) on public.reports to anon, authenticated;
const SUPABASE_DIR = path.join(__dirname, "..", "..", "supabase");

function sqlFiles() {
  const files = [path.join(SUPABASE_DIR, "schema.sql")];
  const migrations = path.join(SUPABASE_DIR, "migrations");
  if (fs.existsSync(migrations)) {
    for (const f of fs.readdirSync(migrations).sort()) {
      if (f.endsWith(".sql")) files.push(path.join(migrations, f));
    }
  }
  return files;
}

export function grantedReportColumns(sqlTexts) {
  const granted = { anon: new Set(), authenticated: new Set() };
  const re = /grant\s+select\s*\(([^)]*)\)\s*on\s+(?:table\s+)?(?:public\.)?reports\s+to\s+([^;]+);/gi;
  for (const text of sqlTexts) {
    // Sin comentarios, para no contar un grant de ejemplo en un "--".
    const clean = text.replace(/--[^\n]*/g, "");
    for (const m of clean.matchAll(re)) {
      const cols = m[1].split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
      const roles = m[2].split(",").map((r) => r.trim().toLowerCase());
      for (const role of Object.keys(granted)) {
        if (roles.includes(role)) cols.forEach((c) => granted[role].add(c));
      }
    }
  }
  return granted;
}

describe("permisos de lectura de reports", () => {
  const granted = grantedReportColumns(sqlFiles().map((f) => fs.readFileSync(f, "utf8")));

  for (const role of ["anon", "authenticated"]) {
    it(`toda columna que pide el listado tiene grant select para ${role}`, () => {
      const missing = REPORT_LIST_ALL_COLUMNS.filter((c) => !granted[role].has(c));
      expect(missing).toEqual([]);
    });
  }

  it("detecta una columna sin grant (el caso de inactivo)", () => {
    const g = grantedReportColumns(["grant select (id, tipo) on reports to anon, authenticated;"]);
    expect(["id", "tipo", "inactivo"].filter((c) => !g.anon.has(c))).toEqual(["inactivo"]);
  });

  it("ignora grants comentados", () => {
    const g = grantedReportColumns(["-- grant select (inactivo) on reports to anon, authenticated;"]);
    expect(g.anon.has("inactivo")).toBe(false);
  });
});
