// Prueba de la migración 20261104_01_limites_anti_abuso.sql (y su rollback)
// en la réplica local de producción (replica.sql, PGlite). No toca
// producción. Cada escenario corre en una transacción que se deshace.
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..", "..");
const REPLICA = fs.readFileSync(path.join(DIR, "replica.sql"), "utf8");
const MIGRATION = fs.readFileSync(path.join(ROOT, "supabase", "migrations", "20261104_01_limites_anti_abuso.sql"), "utf8");
const ROLLBACK = fs.readFileSync(path.join(DIR, "rollback_20261104_01.sql"), "utf8");

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SEED = `
insert into auth.users (id, email) values ('${A}', 'a@example.com');
insert into reports (id, tipo, especie, zona, contacto_whatsapp, contacto_email, user_id, oculto) values
  ('rep-1', 'perdida', 'perro', 'Centro', '+5493870000001', null, null, false),
  ('rep-2', 'perdida', 'perro', 'Centro', '+5493870000002', null, null, false),
  ('rep-oculto', 'perdida', 'perro', 'Centro', '+5493870000009', null, null, true),
  ('rep-sin', 'encontrada', 'gato', 'Centro', null, null, null, false);
insert into reports (id, tipo, especie, zona, contacto_whatsapp)
  select 'r-' || g, 'perdida', 'perro', 'Centro', '+54938700' || lpad(g::text, 5, '0') from generate_series(1, 200) g;
`;

async function makeDb({ rollback = false } = {}) {
  const db = new PGlite();
  await db.exec(REPLICA);
  await db.exec(SEED);
  await db.exec(MIGRATION);
  if (rollback) await db.exec(ROLLBACK);
  return db;
}

// Corre `fn` como `role` dentro de una transacción que se deshace.
async function as(db, role, fn) {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}`);
    return await fn();
  } finally {
    await db.exec("rollback");
  }
}

async function limite(db, bucket, claves, ref = null) {
  const r = await db.query("select public.felpus_limite($1, $2, $3) as l", [bucket, claves, ref]);
  return r.rows[0].l;
}

async function tryQuery(db, sql) {
  try {
    await db.query(sql);
    return "ok";
  } catch (e) {
    return e.message;
  }
}

describe("migración 20261104_01 (límites) en la réplica", () => {
  let db;
  beforeAll(async () => {
    db = await makeDb();
  });

  it("la clave pública no lee ni escribe las tablas de cupos ni llama a las funciones", async () => {
    for (const role of ["anon", "authenticated"]) {
      await as(db, role, async () => {
        for (const sql of [
          "select * from limites_config",
          "select * from limites_uso",
          "insert into limites_uso (bucket, clave) values ('ia', 'global')",
          "update limites_config set maximo = 999999",
          "select public.felpus_limite('ia', array['global'])",
          "select * from public.obtener_contacto_reporte('rep-1', array['ip:1.1.1.1'])",
        ]) {
          await db.exec("savepoint s");
          expect(await tryQuery(db, sql), `${role}: ${sql}`).toMatch(/permission denied/);
          await db.exec("rollback to savepoint s");
        }
      });
    }
  });

  it("publicar: 8 por hora por IP, el 9.º se frena y no se registra", async () => {
    await as(db, "service_role", async () => {
      for (let i = 0; i < 8; i++) expect(await limite(db, "reporte", ["ip:200.1.1.1", "global"])).toBeNull();
      expect(await limite(db, "reporte", ["ip:200.1.1.1", "global"])).toBe("ip");
      // Otra IP sigue pudiendo.
      expect(await limite(db, "reporte", ["ip:200.1.1.2", "global"])).toBeNull();
      const { rows } = await db.query("select count(*)::int as n from limites_uso where clave = 'global'");
      expect(rows[0].n).toBe(9);
    });
  });

  it("publicar: tope diario por IP aunque haya pasado la hora", async () => {
    await as(db, "service_role", async () => {
      await db.exec("insert into limites_uso (bucket, clave, creado_en) select 'reporte', 'ip:200.9.9.9', now() - interval '3 hours' from generate_series(1, 20)");
      expect(await limite(db, "reporte", ["ip:200.9.9.9", "global"])).toBe("ip");
    });
  });

  it("publicar con sesión: cuenta por usuario y la IP compartida tiene más margen", async () => {
    await as(db, "service_role", async () => {
      for (let i = 0; i < 8; i++) expect(await limite(db, "reporte", [`user:${A}`, "ipc:200.2.2.2", "global"])).toBeNull();
      expect(await limite(db, "reporte", [`user:${A}`, "ipc:200.2.2.2", "global"])).toBe("user");
      // Otra persona desde la misma IP (CGNAT del celular) todavía puede.
      expect(await limite(db, "reporte", ["user:otro", "ipc:200.2.2.2", "global"])).toBeNull();
    });
  });

  it("tope global por hora: frena aunque cada IP sea distinta", async () => {
    await as(db, "service_role", async () => {
      for (let i = 0; i < 120; i++) expect(await limite(db, "reporte", [`ip:10.0.${Math.floor(i / 8)}.${i % 8}`, "global"])).toBeNull();
      expect(await limite(db, "reporte", ["ip:10.9.9.9", "global"])).toBe("global");
    });
  });

  it("los cupos se pueden ajustar sin tocar código", async () => {
    await db.exec("begin");
    try {
      await db.exec("update limites_config set maximo = 1 where bucket = 'ia' and tipo = 'global'");
      await db.exec("set local role service_role");
      expect(await limite(db, "ia", ["ip:1.1.1.1", "global"])).toBeNull();
      expect(await limite(db, "ia", ["ip:1.1.1.2", "global"])).toBe("global");
    } finally {
      await db.exec("rollback");
    }
  });

  it("IA: 8 por minuto por IP; vencido el minuto, el cupo diario sigue contando", async () => {
    await as(db, "service_role", async () => {
      for (let i = 0; i < 8; i++) expect(await limite(db, "ia", ["ip:3.3.3.3", "global"])).toBeNull();
      expect(await limite(db, "ia", ["ip:3.3.3.3", "global"])).toBe("ip");
      await db.exec("update limites_uso set creado_en = now() - interval '2 minutes' where clave = 'ip:3.3.3.3'");
      expect(await limite(db, "ia", ["ip:3.3.3.3", "global"])).toBeNull();
      await db.exec("insert into limites_uso (bucket, clave, creado_en) select 'ia', 'ip:3.3.3.3', now() - interval '1 hour' from generate_series(1, 80)");
      expect(await limite(db, "ia", ["ip:3.3.3.3", "global"])).toBe("ip");
    });
  });

  it("contacto: devuelve el contacto y reabrir el mismo aviso no gasta cupo", async () => {
    await as(db, "service_role", async () => {
      for (let i = 0; i < 40; i++) {
        const { rows } = await db.query("select * from public.obtener_contacto_reporte('rep-1', array['ip:4.4.4.4', 'global'])");
        expect(rows).toEqual([{ contacto_whatsapp: "+5493870000001", contacto_email: null, limite: null }]);
      }
      const { rows } = await db.query("select count(*)::int as n from limites_uso where clave = 'ip:4.4.4.4'");
      expect(rows[0].n).toBe(1);
    });
  });

  it("contacto: 30 avisos distintos por hora por IP, el siguiente sale sin datos", async () => {
    await as(db, "service_role", async () => {
      for (let i = 1; i <= 30; i++) {
        const { rows } = await db.query(`select * from public.obtener_contacto_reporte('r-${i}', array['ip:5.5.5.5', 'global'])`);
        expect(rows[0].limite).toBeNull();
        expect(rows[0].contacto_whatsapp).toBeTruthy();
      }
      const { rows } = await db.query("select * from public.obtener_contacto_reporte('r-31', array['ip:5.5.5.5', 'global'])");
      expect(rows).toEqual([{ contacto_whatsapp: null, contacto_email: null, limite: "ip" }]);
      // Uno ya visto sigue andando (no gasta cupo).
      const again = await db.query("select * from public.obtener_contacto_reporte('r-1', array['ip:5.5.5.5', 'global'])");
      expect(again.rows[0].contacto_whatsapp).toBeTruthy();
    });
  });

  it("contacto: ni ocultos, ni inexistentes, ni avisos sin contacto gastan cupo", async () => {
    await as(db, "service_role", async () => {
      for (const id of ["rep-oculto", "no-existe", "rep-sin"]) {
        const { rows } = await db.query(`select * from public.obtener_contacto_reporte('${id}', array['ip:6.6.6.6', 'global'])`);
        expect(rows).toEqual([]);
      }
      const { rows } = await db.query("select count(*)::int as n from limites_uso");
      expect(rows[0].n).toBe(0);
    });
  });

  it("la función vieja get_report_contact sigue andando (respaldo)", async () => {
    await as(db, "service_role", async () => {
      const { rows } = await db.query("select * from public.get_report_contact('rep-1')");
      expect(rows[0].contacto_whatsapp).toBe("+5493870000001");
    });
  });

  it("la migración se puede correr dos veces sin error ni duplicar cupos", async () => {
    const db2 = await makeDb();
    await db2.exec(MIGRATION);
    const { rows } = await db2.query("select count(*)::int as n from limites_config");
    expect(rows[0].n).toBe(21);
  });
});

describe("rollback de 20261104_01", () => {
  it("saca tablas y funciones nuevas y deja andando la función vieja", async () => {
    const db = await makeDb({ rollback: true });
    const { rows } = await db.query(
      "select count(*)::int as n from pg_proc where proname in ('felpus_limite', 'obtener_contacto_reporte')"
    );
    expect(rows[0].n).toBe(0);
    const t = await db.query("select to_regclass('public.limites_uso') as a, to_regclass('public.limites_config') as b");
    expect(t.rows[0]).toEqual({ a: null, b: null });
    await as(db, "service_role", async () => {
      const r = await db.query("select * from public.get_report_contact('rep-1')");
      expect(r.rows[0].contacto_whatsapp).toBe("+5493870000001");
    });
  });
});
