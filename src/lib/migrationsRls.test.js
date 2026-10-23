import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Toda tabla nueva del esquema public tiene que nacer con RLS. Sin RLS, la
// API de Supabase la deja leer y escribir a cualquiera que tenga la clave
// pública (va en el JS del sitio). Este test corre en el CI de cada PR y
// revisa schema.sql y todas las migraciones.
const SUPABASE_DIR = path.join(__dirname, "..", "..", "supabase");

function sqlFiles() {
  const dir = path.join(SUPABASE_DIR, "migrations");
  return [path.join(SUPABASE_DIR, "schema.sql"), ...fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => path.join(dir, f))];
}

export function tablesWithoutRls(texts) {
  const created = new Set();
  const withRls = new Set();
  for (const raw of texts) {
    const text = raw.replace(/--[^\n]*/g, "").toLowerCase();
    for (const m of text.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?("?[a-z_][a-z0-9_]*"?)\s*\(/g)) {
      created.add(m[1].replace(/"/g, ""));
    }
    for (const m of text.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?("?[a-z_][a-z0-9_]*"?)\s+enable\s+row\s+level\s+security/g)) {
      withRls.add(m[1].replace(/"/g, ""));
    }
  }
  return [...created].filter((t) => !withRls.has(t)).sort();
}

describe("RLS en todas las tablas", () => {
  it("cada create table de public tiene su enable row level security", () => {
    expect(tablesWithoutRls(sqlFiles().map((f) => fs.readFileSync(f, "utf8")))).toEqual([]);
  });

  it("detecta una tabla sin RLS", () => {
    expect(tablesWithoutRls(["create table public.nueva (id int);"])).toEqual(["nueva"]);
    expect(tablesWithoutRls(["create table nueva (id int); alter table nueva enable row level security;"])).toEqual([]);
  });

  it("ignora tablas de otros esquemas", () => {
    expect(tablesWithoutRls(["create table auth.x (id int);"])).toEqual([]);
  });
});
