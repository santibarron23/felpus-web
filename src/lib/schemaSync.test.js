import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// schema.sql se pega entero en el SQL Editor de Supabase. Si le falta una
// migración, correrlo deshace lo que esa migración arregló — pasó el
// 2026-10-28: volvió la policy que dejaba listar el bucket de fotos con la
// clave pública y se perdió el grant de "inactivo" (el sitio quedó con
// /api/health en 503). Este test exige que cada archivo de
// supabase/migrations esté marcado (e incluido) en schema.sql.
const SUPABASE_DIR = path.join(process.cwd(), "supabase");
const schema = fs.readFileSync(path.join(SUPABASE_DIR, "schema.sql"), "utf8").replace(/\r\n/g, "\n");
const migraciones = fs
  .readdirSync(path.join(SUPABASE_DIR, "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

describe("schema.sql incluye todas las migraciones", () => {
  it.each(migraciones)("%s", (f) => {
    const marca = `-- >>> migración ${f}`;
    expect(schema.includes(marca), `Agregá ${f} al final de supabase/schema.sql con la línea "${marca}"`).toBe(true);
  });

  it("las marcadas como incluidas completas tienen todo su contenido", () => {
    for (const f of migraciones) {
      if (schema.includes(`-- >>> migración ${f}: ya incluida`)) continue;
      const body = fs.readFileSync(path.join(SUPABASE_DIR, "migrations", f), "utf8").replace(/\r\n/g, "\n").trim();
      expect(schema.includes(body), `El contenido de ${f} no coincide con el de schema.sql`).toBe(true);
    }
  });

  it("schema.sql no vuelve a abrir el listado del bucket de fotos", () => {
    expect(schema).not.toMatch(/create policy "felpus_photos_public_read"/);
  });
});
