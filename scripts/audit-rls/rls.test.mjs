// Pruebas de permisos y RLS de Felpus en un Postgres local (PGlite), sin
// tocar producción. Carga replica.sql (el estado real de producción leído
// del catálogo el 2026-10-23), siembra usuarios y reportes de prueba, y
// corre cada escenario como anon / usuario A / usuario B / admin:
//   - "antes": documenta qué permite HOY producción,
//   - "después": con la migración 20261023_02 aplicada.
// Cada escenario corre dentro de una transacción que se deshace, así que
// ninguno afecta a los demás.
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..", "..");
const REPLICA = fs.readFileSync(path.join(DIR, "replica.sql"), "utf8");
const ROLLBACK = fs.readFileSync(path.join(DIR, "rollback_20261023_02.sql"), "utf8");
const MIGRATION = fs.readFileSync(path.join(ROOT, "supabase", "migrations", "20261023_02_endurecimiento_permisos.sql"), "utf8");

const A = { role: "authenticated", sub: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", email: "a@example.com" };
const B = { role: "authenticated", sub: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", email: "b@example.com" };
const ADMIN = { role: "authenticated", sub: "cccccccc-cccc-cccc-cccc-cccccccccccc", email: "santiagobarronlf@gmail.com" };
const ANON = { role: "anon" };
const SERVICE = { role: "service_role" };

const SEED = `
insert into auth.users (id, email) values ('${A.sub}', '${A.email}'), ('${B.sub}', '${B.email}'), ('${ADMIN.sub}', '${ADMIN.email}');
insert into reports (id, tipo, especie, zona, descripcion, contacto_whatsapp, contacto_email, user_id) values
  ('rep-a', 'perdida', 'perro', 'Centro', 'de A', '+5493870000001', 'a@example.com', '${A.sub}'),
  ('rep-b', 'encontrada', 'perro', 'Centro', 'de B', '+5493870000002', null, '${B.sub}'),
  ('rep-guest', 'encontrada', 'gato', 'Centro', 'invitado', '+5493870000003', null, null);
insert into reports (id, tipo, especie, zona, descripcion, contacto_whatsapp, user_id, oculto) values
  ('rep-oculto', 'perdida', 'perro', 'Centro', 'moderado', '+5493870000009', '${B.sub}', true);
insert into contributors (id, nickname, whatsapp, points) values ('${A.sub}', 'Ana', '+5493870000001', 10), ('${B.sub}', 'Beto', null, 5);
insert into saved_reports (user_id, report_id) values ('${A.sub}', 'rep-b');
insert into matches (report_lost_id, report_found_id, score) values ('rep-a', 'rep-b', 0.8), ('rep-a', 'rep-guest', 0.5);
insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('${A.sub}', 'https://push.example/a', 'k', 's');
insert into alert_zones (user_id, center, radius_m, active) values ('${A.sub}', 'POINT(-65.4 -24.7)', 2000, true);
insert into error_logs (message) values ('error interno');
insert into storage.objects (bucket_id, name, owner) values ('felpus-photos', 'rep-a-0-${A.sub}.jpg', '${A.sub}');
`;

async function makeDb(withMigration, withRollback = false) {
  const db = new PGlite();
  await db.exec(REPLICA);
  await db.exec(SEED);
  if (withMigration) await db.exec(MIGRATION);
  if (withRollback) await db.exec(ROLLBACK);
  return db;
}

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
    const affected = results.reduce((n, x) => n + (x.affectedRows || 0), 0);
    return { ok: true, rows: last.rows || [], affected };
  } catch (e) {
    return { ok: false, error: e.message, rows: [], affected: 0 };
  } finally {
    await db.exec("rollback");
  }
}

const allowed = (r) => r.ok && (r.rows.length > 0 || r.affected > 0);
const denied = (r) => !r.ok || (r.rows.length === 0 && r.affected === 0);

// Lo que la app NECESITA poder hacer: tiene que seguir andando con la migración.
const APP = [
  ["visitante lista reportes públicos", ANON, "select id, zona, lat, lng, foto_url from reports"],
  ["visitante ve el ranking", ANON, "select id, nickname, points from contributors"],
  ["dueño edita su reporte", A, "update reports set descripcion = 'editado' where id = 'rep-a'"],
  ["dueño marca su reporte como resuelto", A, "update reports set resuelto = true, resuelto_en = now() where id = 'rep-a'"],
  ["dueño borra su reporte", A, "delete from reports where id = 'rep-a'"],
  ["usuario guarda una mascota", A, `insert into saved_reports (user_id, report_id) values ('${A.sub}', 'rep-guest')`],
  ["usuario ve sus guardadas", A, "select * from saved_reports"],
  ["usuario quita una guardada", A, "delete from saved_reports where report_id = 'rep-b'"],
  ["usuario edita su perfil", A, `update contributors set nickname = 'Ana M', whatsapp = '+549387' where id = '${A.sub}'`],
  ["usuario nuevo crea su perfil", ADMIN, `insert into contributors (id, nickname) values ('${ADMIN.sub}', 'Admin')`],
  // Lo que manda updateProfile (store.js): upsert SIN whatsapp + update aparte.
  ["usuario cambia nombre/foto (upsert sin whatsapp)", A, `insert into contributors (id, nickname) values ('${A.sub}', 'Ana Nueva') on conflict (id) do update set nickname = excluded.nickname`],
  ["usuario cambia su WhatsApp (update sin leerlo)", A, `update contributors set whatsapp = '+5493871111111' where id = '${A.sub}'`],
  ["usuario lee su WhatsApp", A, "select public.get_my_whatsapp() as w where public.get_my_whatsapp() is not null"],
  ["dueño ve coincidencias de su reporte", A, "select * from matches"],
  ["usuario manda un corazón", A, `select public.send_heart('${B.sub}')`],
  ["admin oculta un reporte", ADMIN, "select public.admin_set_oculto('rep-b', true) is null as ok"],
  ["servidor obtiene contacto de un reporte", SERVICE, "select * from public.get_report_contact('rep-a') where contacto_whatsapp is not null"],
  ["invitado sube una foto de reporte", ANON, "insert into storage.objects (bucket_id, name) values ('felpus-photos', '1791980986984-abcdef-0-2b1c3d4e-0000-4000-8000-000000000000.jpg')"],
  ["usuario sube su avatar", A, `insert into storage.objects (bucket_id, name, owner) values ('felpus-photos', 'avatars/${A.sub}/avatar-2b1c3d4e-0000-4000-8000-000000000000.jpg', '${A.sub}')`],
  ["dueño lista/borra su foto", A, "delete from storage.objects where owner = auth.uid()"],
];

// Ataques: [nombre, quién, sql, ¿hoy producción lo frena?]
const ATTACKS = [
  ["anon lee contacto de reportes", ANON, "select contacto_whatsapp, contacto_email from reports", true],
  ["anon lee push_token", ANON, "select push_token from reports", true],
  ["anon lee WhatsApp de perfiles", ANON, "select whatsapp from contributors", true],
  ["anon publica directo en la tabla", ANON, "insert into reports (id, tipo, especie) values ('x', 'perdida', 'perro')", true],
  ["usuario B edita el reporte de A (IDOR)", B, "update reports set descripcion = 'hackeado' where id = 'rep-a'", true],
  ["usuario B borra el reporte de A (IDOR)", B, "delete from reports where id = 'rep-a'", true],
  ["usuario B se apropia del reporte de A", B, `update reports set user_id = '${B.sub}' where id = 'rep-a'`, true],
  ["usuario B se apropia de un reporte de invitado", B, `update reports set user_id = '${B.sub}' where id = 'rep-guest'`, true],
  ["usuario A le pasa su reporte a otro", A, `update reports set user_id = '${B.sub}' where id = 'rep-a'`, true],
  ["usuario des-oculta un reporte moderado", B, "update reports set oculto = false where id = 'rep-oculto'", true],
  ["usuario ve guardadas de otro", B, "select * from saved_reports", true],
  ["usuario borra guardadas de otro", B, `delete from saved_reports where user_id = '${A.sub}'`, true],
  ["usuario B edita el perfil de A", B, `update contributors set nickname = 'x' where id = '${A.sub}'`, true],
  ["usuario se suma puntos a mano", A, `update contributors set points = 9999 where id = '${A.sub}'`, true],
  ["usuario lee el WhatsApp de otro vía RPC", B, "select public.get_my_whatsapp() as w where public.get_my_whatsapp() is not null", true],
  ["usuario ve coincidencias ajenas", B, "select * from matches where report_found_id = 'rep-guest'", true],
  ["usuario ve suscripciones push ajenas", B, "select * from push_subscriptions", true],
  ["usuario ve zonas de alerta ajenas", B, "select * from alert_zones", true],
  ["usuario no admin borra un reporte", B, "select public.admin_delete_report('rep-a')", true],
  ["usuario no admin oculta un reporte", B, "select public.admin_set_oculto('rep-a', true)", true],
  ["anon llama al contacto directo", ANON, "select * from public.get_report_contact('rep-a')", true],
  ["anon lee logs de errores", ANON, "select * from error_logs", true],
  ["anon lista las fotos del bucket", ANON, "select name from storage.objects", true],
  ["usuario B lista fotos de A", B, "select name from storage.objects", true],
  ["usuario B borra fotos de A", B, "delete from storage.objects", true],
  // Hallazgos (producción HOY no los frena):
  ["anon sube un SVG (puede llevar JavaScript)", ANON, "insert into storage.objects (bucket_id, name) values ('felpus-photos', 'x.svg')", false],
  ["anon sube un archivo con cualquier nombre", ANON, "insert into storage.objects (bucket_id, name) values ('felpus-photos', 'phishing/login.html')", false],
  ["usuario B sube un avatar en la carpeta de A", B, `insert into storage.objects (bucket_id, name, owner) values ('felpus-photos', 'avatars/${A.sub}/avatar-2b1c3d4e-0000-4000-8000-000000000000.jpg', '${B.sub}')`, false],
  ["servidor entrega contacto de un reporte moderado", SERVICE, "select * from public.get_report_contact('rep-oculto') where contacto_whatsapp is not null", false],
  ["anon vacía la tabla de reportes (TRUNCATE ignora RLS)", ANON, "truncate reports; select 1", false],
  ["usuario vacía el ranking (TRUNCATE ignora RLS)", A, "truncate contributors; select 1", false],
];

describe("permisos de la base — producción hoy (réplica)", () => {
  let db;
  beforeAll(async () => {
    db = await makeDb(false);
  }, 60_000);

  for (const [name, who, sql] of APP) {
    it(`la app puede: ${name}`, async () => {
      const r = await attempt(db, who, sql);
      expect(allowed(r), r.error || "sin filas").toBe(true);
    });
  }
  for (const [name, who, sql, blockedToday] of ATTACKS) {
    it(`${blockedToday ? "bloqueado" : "HALLAZGO, hoy permitido"}: ${name}`, async () => {
      const r = await attempt(db, who, sql);
      expect(denied(r)).toBe(blockedToday);
    });
  }
});

describe("permisos de la base — con la migración 20261023_02", () => {
  let db;
  beforeAll(async () => {
    db = await makeDb(true);
  }, 60_000);

  for (const [name, who, sql] of APP) {
    it(`la app sigue pudiendo: ${name}`, async () => {
      const r = await attempt(db, who, sql);
      expect(allowed(r), r.error || "sin filas").toBe(true);
    });
  }
  for (const [name, who, sql] of ATTACKS) {
    it(`bloqueado: ${name}`, async () => {
      const r = await attempt(db, who, sql);
      expect(denied(r), JSON.stringify(r.rows)).toBe(true);
    });
  }

  // Bug del 2026-10-23: con whatsapp adentro del upsert, Postgres exige
  // poder LEER esa columna (ON CONFLICT DO UPDATE) y rechaza todo el
  // guardado del perfil. Por eso updateProfile no lo manda en el upsert.
  it("un upsert de perfil CON whatsapp falla (la app no debe mandarlo así)", async () => {
    const r = await attempt(
      db,
      A,
      `insert into contributors (id, nickname, whatsapp) values ('${A.sub}', 'Ana', null) on conflict (id) do update set nickname = excluded.nickname, whatsapp = excluded.whatsapp`
    );
    expect(r.ok).toBe(false);
  });

  it("una tabla nueva arranca cerrada para anon y authenticated", async () => {
    await db.exec("create table public.tabla_nueva (id int); insert into public.tabla_nueva values (1);");
    for (const who of [ANON, A]) {
      const r = await attempt(db, who, "select * from public.tabla_nueva");
      expect(r.ok).toBe(false);
    }
  });

  it("los límites del bucket quedan en 2 MB y sin SVG", async () => {
    const r = await db.query("select file_size_limit, allowed_mime_types from storage.buckets where id = 'felpus-photos'");
    expect(r.rows[0].file_size_limit).toBe(2097152);
    expect(r.rows[0].allowed_mime_types).not.toContain("image/svg+xml");
  });
});

describe("rollback: migración + rollback deja todo como hoy", () => {
  let db;
  beforeAll(async () => {
    db = await makeDb(true, true);
  }, 60_000);

  for (const [name, who, sql] of APP) {
    it(`la app puede: ${name}`, async () => {
      expect(allowed(await attempt(db, who, sql))).toBe(true);
    });
  }
  for (const [name, who, sql, blockedToday] of ATTACKS) {
    it(`igual que hoy: ${name}`, async () => {
      expect(denied(await attempt(db, who, sql))).toBe(blockedToday);
    });
  }
});
