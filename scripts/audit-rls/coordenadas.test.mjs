// Migración 20261029_01 (coordenadas aproximadas) probada en el Postgres
// local (PGlite) con replica.sql, sin tocar producción: la clave pública
// deja de leer lat/lng exactos (ni directo ni filtrando/ordenando por
// ellos), lee lat_aprox/lng_aprox, y publicar/editar sigue andando.
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const MIGS = path.join(DIR, "..", "..", "supabase", "migrations");
const REPLICA = fs.readFileSync(path.join(DIR, "replica.sql"), "utf8");
const HARDENING = fs.readFileSync(path.join(MIGS, "20261023_02_endurecimiento_permisos.sql"), "utf8");
const MIGRATION = fs.readFileSync(path.join(MIGS, "20261029_01_coordenadas_aproximadas.sql"), "utf8");

const A = { role: "authenticated", sub: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", email: "a@example.com" };
const ANON = { role: "anon" };
const SERVICE = { role: "service_role" };

// Un punto de Salta y otro cerca del ecuador (celdas más anchas).
const SEED = `
insert into auth.users (id, email) values ('${A.sub}', '${A.email}');
insert into reports (id, tipo, especie, zona, descripcion, user_id, lat, lng) values
  ('rep-a', 'perdida', 'perro', 'Centro', 'de A', '${A.sub}', -24.7811544, -65.4028022),
  ('rep-n', 'encontrada', 'gato', 'Norte', 'invitado', null, -0.5017, -65.1013),
  ('rep-sin', 'encontrada', 'perro', 'Sur', 'sin mapa', null, null, null);
`;

async function attempt(db, who, sql) {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${who.role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.email', $2, true)", [
      who.sub || "",
      who.email || "",
    ]);
    const results = await db.exec(sql);
    const last = results[results.length - 1] || { rows: [] };
    return { ok: true, rows: last.rows || [], affected: results.reduce((n, x) => n + (x.affectedRows || 0), 0) };
  } catch (e) {
    return { ok: false, error: e.message, rows: [] };
  } finally {
    await db.exec("rollback");
  }
}

function metros(lat1, lng1, lat2, lng2) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

describe("migración 20261029_01: coordenadas aproximadas", () => {
  let db;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(REPLICA);
    await db.exec(SEED);
    await db.exec(HARDENING);
    await db.exec(MIGRATION);
  }, 60_000);

  for (const who of [ANON, A]) {
    const quien = who === ANON ? "anon" : "usuario logueado";

    it(`${quien} no lee lat/lng exactos`, async () => {
      expect((await attempt(db, who, "select lat from reports")).ok).toBe(false);
      expect((await attempt(db, who, "select lng from reports")).ok).toBe(false);
      expect((await attempt(db, who, "select location from reports")).ok).toBe(false);
    });

    it(`${quien} no los encuentra filtrando ni ordenando`, async () => {
      expect((await attempt(db, who, "select id from reports where lat > -24.79")).ok).toBe(false);
      expect((await attempt(db, who, "select id from reports order by lng")).ok).toBe(false);
    });

    it(`${quien} lee el listado con las aproximadas`, async () => {
      const r = await attempt(db, who, "select id, zona, lat_aprox, lng_aprox, foto_url from reports order by id");
      expect(r.ok).toBe(true);
      expect(r.rows.length).toBe(3);
    });
  }

  it("las aproximadas caen en la grilla y a menos de 320 m del punto real", async () => {
    const r = await attempt(db, SERVICE, "select id, lat, lng, lat_aprox, lng_aprox from reports order by id");
    const conPunto = r.rows.filter((x) => x.lat != null);
    expect(conPunto.length).toBe(2);
    for (const x of conPunto) {
      expect(Math.abs(x.lat_aprox / 0.004 - Math.round(x.lat_aprox / 0.004))).toBeLessThan(1e-6);
      expect(x.lat_aprox).not.toBe(x.lat);
      expect(metros(x.lat, x.lng, x.lat_aprox, x.lng_aprox)).toBeLessThan(320);
    }
    expect(r.rows.find((x) => x.id === "rep-sin").lat_aprox).toBeNull();
  });

  it("el servidor sigue publicando con lat/lng y la base calcula las aproximadas", async () => {
    const r = await attempt(
      db,
      SERVICE,
      "insert into reports (id, tipo, especie, zona, descripcion, lat, lng) values ('nuevo', 'perdida', 'perro', 'X', 'x', -24.7999, -65.4111) returning lat_aprox, lng_aprox"
    );
    expect(r.ok).toBe(true);
    expect(r.rows[0].lat_aprox).toBeCloseTo(-24.8, 6);
    expect(r.rows[0].lng_aprox).toBeCloseTo(-65.412, 6);
  });

  it("nadie escribe las aproximadas a mano", async () => {
    expect((await attempt(db, SERVICE, "update reports set lat_aprox = 0 where id = 'rep-a'")).ok).toBe(false);
  });

  it("el dueño sigue pudiendo corregir la ubicación de su reporte", async () => {
    const r = await attempt(db, A, "update reports set lat = -24.70, lng = -65.40 where id = 'rep-a'");
    expect(r.ok).toBe(true);
    expect(r.affected).toBe(1);
  });
});
