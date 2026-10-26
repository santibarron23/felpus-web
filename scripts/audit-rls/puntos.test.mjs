// Revisión de seguridad (2026-10-26): award_points y los datos del
// reencuentro, en la misma réplica local que rls.test.mjs (PGlite, sin tocar
// producción). "antes" = award_points tal como está en schema.sql hoy;
// "después" = con la migración propuesta 20261026_01.
import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..", "..");
const read = (...p) => fs.readFileSync(path.join(...p), "utf8");
const REPLICA = read(DIR, "replica.sql");
const MIGRATION_0223 = read(ROOT, "supabase", "migrations", "20261023_02_endurecimiento_permisos.sql");
const MIGRATION_1026 = read(ROOT, "supabase", "migrations", "20261026_01_puntos_y_reencuentro.sql");
const SCHEMA = read(ROOT, "supabase", "schema.sql");
const AWARD_POINTS_TODAY = SCHEMA.slice(
  SCHEMA.indexOf("create or replace function public.award_points"),
  SCHEMA.indexOf("grant execute on function public.award_points(text, text, integer, text, text) to authenticated;") +
    "grant execute on function public.award_points(text, text, integer, text, text) to authenticated;".length
);

const A = { sub: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", email: "a@example.com" };
const B = { sub: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", email: "b@example.com" };

const SEED = `
insert into auth.users (id, email) values ('${A.sub}', '${A.email}'), ('${B.sub}', '${B.email}');
insert into reports (id, tipo, especie, zona, descripcion, user_id, nickname) values
  ('rep-a', 'perdida', 'perro', 'Centro', 'de A', '${A.sub}', 'Ana'),
  ('rep-b', 'encontrada', 'perro', 'Centro', 'de B', '${B.sub}', 'Beto');
insert into contributors (id, nickname, points) values ('${A.sub}', 'Ana', 10), ('${B.sub}', 'Beto', 5);
`;

async function makeDb(withProposal) {
  const db = new PGlite();
  await db.exec(REPLICA);
  await db.exec(SEED);
  await db.exec(MIGRATION_0223);
  await db.exec(AWARD_POINTS_TODAY);
  if (withProposal) await db.exec(MIGRATION_1026);
  return db;
}

// Corre `sql` como un usuario logueado y devuelve el resultado de `check`
// (leído como superusuario, dentro de la misma transacción).
async function asUser(db, who, sql, check) {
  await db.exec("begin");
  try {
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.email', $2, true)", [who.sub, who.email]);
    let error = null;
    try {
      await db.exec(sql);
    } catch (e) {
      error = e.message;
    }
    await db.exec("reset role");
    const { rows } = await db.query(check);
    return { error, rows };
  } finally {
    await db.exec("rollback");
  }
}

// B marca su propio reporte como reencontrado (con datos inventados) y pide
// el "bono" para A mandando un nombre propio.
const ATTACK = `
update reports set resuelto = true, resuelto_por_user_id = '${B.sub}', resuelto_en = '2099-01-01' where id = 'rep-b';
select award_points('${A.sub}', 'NOMBRE TRUCHO', 20, 'bono-reporte-original', 'rep-a');
`;

describe("award_points / reencuentro — hoy (sin la migración propuesta)", () => {
  it("B le cambia el nombre público a A en el ranking", async () => {
    const db = await makeDb(false);
    const r = await asUser(db, B, ATTACK, `select nickname from contributors where id = '${A.sub}'`);
    expect(r.error).toBeNull();
    expect(r.rows[0].nickname).toBe("NOMBRE TRUCHO");
  });

  it("el dueño elige la fecha del reencuentro", async () => {
    const db = await makeDb(false);
    const r = await asUser(db, B, ATTACK, "select resuelto_en from reports where id = 'rep-b'");
    expect(new Date(r.rows[0].resuelto_en).getUTCFullYear()).toBe(2099);
  });
});

describe("award_points / reencuentro — con 20261026_01", () => {
  it("el bono suma puntos pero no toca el nombre de otra persona", async () => {
    const db = await makeDb(true);
    const r = await asUser(db, B, ATTACK, `select nickname, points from contributors where id = '${A.sub}'`);
    expect(r.error).toBeNull();
    expect(r.rows[0]).toEqual({ nickname: "Ana", points: 30 });
  });

  it("la fecha y el resolvedor los pone la base", async () => {
    const db = await makeDb(true);
    const r = await asUser(db, B, ATTACK, "select resuelto_en, resuelto_por_user_id from reports where id = 'rep-b'");
    expect(new Date(r.rows[0].resuelto_en).getUTCFullYear()).toBeLessThan(2099);
    expect(r.rows[0].resuelto_por_user_id).toBe(B.sub);
  });

  it("editar un reporte ya resuelto no cambia los datos del reencuentro", async () => {
    const db = await makeDb(true);
    await db.exec("update reports set resuelto = true, resuelto_en = '2026-10-01', resuelto_por_user_id = null where id = 'rep-a'");
    const r = await asUser(
      db,
      A,
      `update reports set descripcion = 'editado', resuelto_en = '2099-01-01', resuelto_por_user_id = '${B.sub}' where id = 'rep-a'`,
      "select descripcion, resuelto_en, resuelto_por_user_id from reports where id = 'rep-a'"
    );
    expect(r.rows[0].descripcion).toBe("editado");
    expect(new Date(r.rows[0].resuelto_en).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(r.rows[0].resuelto_por_user_id).toBeNull();
  });

  it("lo que hace la app sigue andando: resolver lo propio, sumarse puntos y elegir el propio nombre", async () => {
    const db = await makeDb(true);
    const r = await asUser(
      db,
      A,
      `update reports set resuelto = true, resuelto_por = 'Ana', resuelto_por_user_id = '${A.sub}', resuelto_en = now(),
         contacto_whatsapp = null, contacto_email = null where id = 'rep-a';
       select award_points('${A.sub}', 'Ana Nueva', 50, 'reencuentro', 'rep-a');`,
      `select c.nickname, c.points, c.reencuentros, r.resuelto, r.resuelto_por_user_id
         from contributors c, reports r where c.id = '${A.sub}' and r.id = 'rep-a'`
    );
    expect(r.error).toBeNull();
    expect(r.rows[0]).toEqual({ nickname: "Ana Nueva", points: 60, reencuentros: 1, resuelto: true, resuelto_por_user_id: A.sub });
  });
});
