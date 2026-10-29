# Migraciones de Supabase

Se corren a mano en Supabase → SQL Editor, en orden por nombre, **recién
después de que el dueño del proyecto vea el SQL y dé el OK**. Nunca hacen
DROP de nada que ya exista ni borran datos.

## Regla: cada migración va también al final de `schema.sql`

`schema.sql` es lo que se pega entero para armar (o rearmar) la base. Si le
falta una migración, correrlo **deshace** lo que esa migración arregló. Pasó el
2026-10-28: volvió la policy que dejaba listar el bucket de fotos con la clave
pública y se perdió el permiso de `inactivo` (`/api/health` en 503).

Por eso, al crear una migración, copiala completa al final de `schema.sql`
precedida por la línea `-- >>> migración <archivo>.sql`.
`src/lib/schemaSync.test.js` frena el CI si falta.

**Ojo con el SQL Editor de Supabase:** puede abrir por defecto una consulta
guardada vieja. Antes de pegar una migración, borrá todo el contenido del
editor.

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

## Regla: datos personales nunca legibles con la clave pública

La clave `anon` de Supabase es **pública por diseño** (va en el JS del
sitio, cualquiera la ve). Por eso la seguridad depende de qué deja leer.
Nunca legibles con ella: contacto de reportes, `contributors.whatsapp`,
tokens de push, el listado del bucket de fotos y, desde `20261029_01`, las
coordenadas exactas de los reportes (`lat`/`lng`, `location`): el listado
público usa `lat_aprox`/`lng_aprox`.

- `contributors` tiene el SELECT **por columna**, sin `whatsapp`
  (migración `20261023_01`). En el código, usá `CONTRIBUTOR_PUBLIC_COLUMNS`
  (nunca `select("*")`); el WhatsApp propio se lee con `get_my_whatsapp()`.
- `src/lib/contributorsGrants.test.js` y `src/lib/secrets.test.js` lo frenan
  en el CI; gitleaks (en `ci.yml`) frena claves reales en commits.
- `/api/health` prueba cada 30 minutos esas lecturas con la clave pública
  (`src/lib/privacyProbes.js`); si alguna anda, salud.yml te avisa por email.
- La clave `service_role` va **solo** en Vercel (sin `NEXT_PUBLIC_`) y en
  `.env.local` (que no está en git). Si alguna vez llega a un commit, a un
  chat o a una captura: rotarla en Supabase → Settings → API Keys.
