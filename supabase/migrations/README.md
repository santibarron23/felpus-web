# Migraciones de Supabase

Se corren a mano en Supabase → SQL Editor, en orden por nombre, **recién
después de que el dueño del proyecto vea el SQL y dé el OK**. Nunca hacen
DROP de nada que ya exista ni borran datos.

## Regla: columna nueva en `reports` que lea el sitio

`reports` NO tiene el SELECT abierto: para `anon` y `authenticated` está
habilitado **columna por columna** (ver `schema.sql`), para que nadie pueda
leer en bloque el contacto ni los tokens de push.

Por eso, si una columna nueva se agrega a `src/lib/reportColumns.js` (lo que
pide el listado de Explorar/mapa), la migración **tiene** que incluir:

```sql
grant select (<columna>) on public.reports to anon, authenticated;
```

Sin eso, Supabase rechaza la consulta entera y el sitio muestra **0
mascotas**. Pasó el 2026-10-20 con `inactivo`.

Qué lo frena hoy, en tres capas:

1. **Antes de mergear:** `src/lib/reportGrants.test.js` corre en el CI de cada
   PR y falla si alguna columna de `reportColumns.js` no tiene su grant en
   `schema.sql` o en estas migraciones.
2. **Si igual llega a producción:** `fetchReports` reintenta sin la columna
   opcional más nueva, así el sitio sigue mostrando reportes.
3. **Para enterarte:** `.github/workflows/salud.yml` consulta
   `https://felpus.com/api/health` cada 30 minutos y después de cada merge.
   Si el listado falla o vuelve vacío, el workflow queda en rojo y GitHub te
   avisa por email.

## Después de correr una migración

Abrí felpus.com y fijate que el contador de mascotas no esté en 0, o abrí
`https://felpus.com/api/health`: tiene que decir `"ok": true`.
