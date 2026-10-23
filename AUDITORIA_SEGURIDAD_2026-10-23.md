# Auditoría de seguridad de la base de datos — Felpus (2026-10-23)

Alcance: base Supabase de producción (`woqckndwnxdqcwbrvluj`), Storage, Auth
y las 18 rutas de servidor de `src/app/api`. Método: lectura del catálogo
real de Postgres (no solo los archivos del repo), revisión de código,
pruebas controladas en producción como visitante anónimo (solo lecturas y
escrituras diseñadas para fallar), y pruebas como usuarios autenticados en
una **réplica local** con los mismos permisos (no se crearon cuentas ni
datos en producción).

## Resumen

| # | Hallazgo | Severidad | Estado |
|---|----------|-----------|--------|
| H0 | WhatsApp de perfiles legible por cualquiera + listado de todas las fotos | **Alta** | ✅ Corregido hoy (PR #51 + migración 20261023_01, aplicada) |
| H1 | El bucket de fotos acepta cualquier archivo (SVG con JS, HTML, 8 MB, cualquier nombre) sin login, y subir a la carpeta de avatar de otro usuario | **Media** | 🟡 Corrección lista — falta tu autorización (migración 20261023_02) |
| H2 | `/api/create-report` inserta con la clave de servicio columnas que el formulario nunca manda (asignación masiva) | **Media** | 🟡 Corregido en código (rama `auditoria-seguridad-db`) |
| H3 | Toda tabla nueva queda abierta por defecto a `anon`/`authenticated` | **Media** (prevención) | 🟡 Migración 20261023_02 + test en CI |
| H4 | `get_report_contact` entrega el contacto de reportes ocultados por moderación | Baja | 🟡 Migración 20261023_02 |
| H5 | `/api/create-report` devuelve mensajes internos de Postgres | Baja | 🟡 Corregido en código |
| H6 | Privilegios de más: `TRUNCATE` (ignora RLS), INSERT/UPDATE/DELETE en tablas internas | Baja | 🟡 Migración 20261023_02 |

**Sin hallazgos** (comprobado): la clave `service_role` no está en el
navegador ni en git; contacto de reportes, `push_token` y WhatsApp no son
legibles; ningún usuario puede editar, borrar ni apropiarse de reportes
ajenos; las funciones de admin rechazan a no-admins; RLS activo en las 26
tablas.

## 1. Inventario auditado (estado real de producción)

**Tablas (26, todas con RLS activo):** public: `reports`, `contributors`,
`saved_reports`, `matches`, `push_subscriptions`, `alert_zones`,
`heart_sends`, `points_award_log`, `points_events`, `report_flags`,
`flag_submissions`, `notifications_log`, `report_submissions`,
`contact_requests`, `embed_requests`, `chat_requests`, `error_logs`,
`error_log_submissions`. storage: `objects`, `buckets` y 6 internas.
**Vistas:** ninguna. **GraphQL:** desactivado. **Esquemas expuestos por la
API:** solo `public` y `graphql_public` (comprobado).

**Policies RLS revisadas (17):**

| Tabla | Policy | Op. | Condición | Evaluación |
|---|---|---|---|---|
| reports | reports_select_all | SELECT | `oculto is distinct from true` | OK: público a propósito, columnas limitadas por grant |
| reports | reports_insert_own_or_guest | INSERT | `user_id is null or = auth.uid()` | OK: además INSERT revocado; publica solo el servidor |
| reports | reports_update_owner / delete_owner | UPDATE/DELETE | `auth.uid() = user_id` | OK: `user_id` no es editable (sin grant) |
| contributors | contributors_select_all | SELECT | `true` | OK: ranking público, sin `whatsapp` desde H0 |
| contributors | insert_own / update_own | INSERT/UPDATE | `auth.uid()::text = id` | OK: puntos/rachas sin grant (solo por RPC) |
| saved_reports | select/insert/delete_own | — | `auth.uid() = user_id` | OK |
| push_subscriptions, alert_zones | *_own | ALL | `auth.uid() = user_id` | OK |
| matches | matches_owner_read | SELECT | dueño de alguno de los dos reportes | OK |
| storage.objects | felpus_photos_public_insert | INSERT | solo `bucket_id` | **H1** |
| storage.objects | owner_read / owner_delete / admin_delete | SELECT/DELETE | dueño o admin | OK (owner_read es de H0) |

Las otras 12 tablas no tienen policies: con RLS activo eso significa
**acceso denegado** para anon/authenticated (comprobado: devuelven `[]`).
Las usan solo el servidor o funciones `SECURITY DEFINER`.

**Funciones (20):** las 15 `SECURITY DEFINER` invocables tienen
`search_path` fijo. Admin (`admin_*`): verifican `auth.email()` del JWT
(firmado por Supabase, no manipulable desde el navegador) y anon no tiene
EXECUTE. `award_points`, `bump_streak`, `send_heart`, `get_my_whatsapp`:
validan `auth.uid()`. `get_report_contact`, `flag_report`,
`subscribe_report_push`, rate limits y alertas: solo `service_role`.

## 2. Hallazgos comprobados

### H1 — Bucket de fotos abierto a cualquier archivo (Media)
- **Problema:** cualquiera, sin login, puede subir al bucket público
  archivos SVG (pueden ejecutar JavaScript al abrirse), HTML u otros, de
  hasta 8 MB y con cualquier nombre; un usuario puede subir un archivo en
  `avatars/<id de otro>/`. Sirve para alojar phishing o malware con la URL
  de Supabase de Felpus y para gastar el almacenamiento.
- **Causa:** la migración `20261022_02_bucket_fotos_seguro.sql` (PR #50) se
  mergeó pero **nunca se corrió** en producción (el catálogo muestra la
  policy vieja y `image/svg+xml` permitido).
- **Evidencia:** catálogo (`felpus_photos_public_insert` = solo
  `bucket_id`; bucket 8 MB con SVG) + réplica local (3 escenarios).
- **Corrección:** sección 1 de `20261023_02` (misma lógica que PR #50; el
  código de la app ya sube solo JPG/PNG/WebP con ese formato de nombre).

### H2 — Asignación masiva en `/api/create-report` (Media)
- **Problema:** el servidor insertaba con la clave de servicio el objeto
  completo que mandaba el navegador. Alguien podía publicar con
  `creado_en` en 2099 (primero en el listado para siempre), elegir su
  `push_token`, marcar `resuelto_por_user_id` de otro, o poner fotos y
  embeddings arbitrarios (contaminar el matching o mostrar imágenes de
  otro sitio).
- **Evidencia:** revisión de código; **no** se explotó en producción para
  no crear reportes falsos. Probado con tests unitarios.
- **Corrección:** `src/lib/reportRow.js` — lista cerrada de 28 columnas
  (las que arma el formulario), validación de id, tipo, coordenadas,
  vectores y que las fotos vengan del bucket propio. Verificado contra los
  86 reportes reales: ninguno quedaría rechazado.

### H3 — Permisos por defecto abiertos (Media, prevención)
- **Problema:** Supabase da todos los permisos a `anon`/`authenticated`
  sobre cada tabla nueva. Una tabla creada sin `enable row level security`
  queda legible y editable por cualquiera con la clave pública.
- **Corrección:** `alter default privileges ... revoke` (lo nuevo arranca
  cerrado) + `src/lib/migrationsRls.test.js` (el CI falla si una migración
  crea una tabla sin RLS).

### H4 — Contacto de reportes moderados (Baja)
`get_report_contact` devolvía WhatsApp/email aunque el reporte estuviera
ocultado por moderación. Corregido en la sección 2 de `20261023_02`.

### H5 — Mensajes internos de Postgres (Baja)
Prueba en vivo: `/api/create-report` respondió `null value in column
"tipo" of relation "reports" violates not-null constraint`. Ahora responde
un mensaje genérico; el detalle queda en el log del servidor.

### H6 — Privilegios de más (Baja, defensa en profundidad)
`anon`/`authenticated` tenían `TRUNCATE` en todas las tablas (TRUNCATE
**ignora RLS**; en la réplica, anon vació `reports`) e INSERT/UPDATE/DELETE
en tablas internas. **No explotable por la API** (PostgREST no ofrece
TRUNCATE; las escrituras quedan frenadas por RLS — comprobado), pero la
seguridad dependía de una sola capa. Sección 3 de `20261023_02`.

## 3. Riesgos no comprobados / para revisión manual

| # | Riesgo | Sev. | Qué hacer |
|---|--------|------|-----------|
| M1 | Supabase Auth tiene habilitado **registro con email y contraseña**, aunque la app solo usa Google: se pueden crear cuentas por API (con confirmación por email) | Baja | Supabase → Authentication → Providers → Email → desactivar |
| M2 | `reports.user_id` y `resuelto_por_user_id` son públicos: permiten agrupar reportes de una misma cuenta y vincularlos al perfil del ranking. No sirven para autenticarse | Baja | Refactor: "mis publicaciones" por RPC y quitar esas columnas del SELECT público |
| M3 | `lat`/`lng` exactas son públicas (las usa el mapa) y pueden ser el domicilio de quien reporta | Decisión | Redondear las coordenadas públicas a ~100 m |
| M4 | El contacto de cualquier reporte se puede pedir (es la función), con límite de 30/hora por IP; con muchas IPs se podría recolectar | Baja | Captcha (Turnstile) o exigir login para ver el contacto |
| M5 | Los rate limits usan la IP de `x-forwarded-for`; en Vercel la fija la plataforma, pero no se verificó empíricamente | Baja | — |
| M6 | `/api/push/subscribe` reasigna una suscripción a quien conozca su `endpoint` (URL secreta del navegador, no expuesta) | Baja | — |
| M7 | El admin se define por email fijo en código y SQL | Baja | Pasar a un claim `app_metadata.role = admin` |
| M8 | `net.http_*` (pg_net) es ejecutable por anon, pero el esquema `net` no está expuesto por la API (comprobado, PGRST106) | Info | — |
| M9 | Backups: la organización está en plan Free; no se verificó si hay copias descargables | **Revisar** | Supabase → Database → Backups, o `supabase db dump` antes de cada migración |
| M10 | Una migración mergeada (20261022_02) nunca llegó a producción y nadie se enteró | Media (proceso) | Registrar en `supabase/migrations/README.md` qué migración se corrió y cuándo |

## 4. Pruebas realizadas

**En producción, como visitante anónimo** (sin crear ni modificar nada;
salida completa en `scripts/audit-rls/pruebas-anonimas-produccion.txt`):
- 22 lecturas de columnas/tablas sensibles → todas denegadas o vacías.
- 17 funciones RPC (admin, contacto, puntos, alertas) → todas `permission denied`.
- 8 escrituras (inserts inválidos, updates de 0 filas) → todas denegadas.
- Storage (listar bucket, carpetas, buckets) → vacío. Auth admin → 401.
- 14 rutas de `/api` sin login / con token falso / sin secreto → 401/403/404.
- Verificado después: la prueba no dejó ninguna fila creada.

**En la réplica local** (`scripts/audit-rls/`, Postgres 16 vía PGlite, con
las policies, grants y funciones copiados del catálogo de producción):
- 18 operaciones que la app necesita (publicar foto, editar/borrar lo
  propio, guardados, perfil, corazones, admin, contacto) — 31 ataques
  (IDOR/BOLA sobre reportes, perfiles, guardados, coincidencias, push,
  alertas, fotos; escalamiento a admin; robo de reportes de invitados;
  TRUNCATE; subidas maliciosas).
- Tres pasadas: **producción hoy** (documenta H1, H4, H6), **con la
  migración** (los 31 ataques bloqueados, las 18 operaciones siguen
  andando, tabla nueva cerrada, bucket 2 MB sin SVG) y **migración +
  rollback** (vuelve exactamente al estado de hoy). 149 pruebas, todas OK.
- Control negativo: desactivando una parte de la migración, el test falla.

**Inyección SQL:** las rutas arman filtros de PostgREST con ids validados
por regex (`^[A-Za-z0-9-]{1,64}$`) o `URLSearchParams`; las funciones SQL
no usan SQL dinámico (`execute`). No se encontró inyección.

**Suite completa:** 603 tests OK, lint OK, build OK.

## 5. Cambios (rama `auditoria-seguridad-db`)

| Archivo | Qué |
|---|---|
| `src/lib/reportRow.js` (+ test) | Lista cerrada de columnas y validación al publicar (H2) |
| `src/app/api/create-report/route.js` | Usa `reportRow.js`; error genérico (H2, H5) |
| `supabase/migrations/20261023_02_endurecimiento_permisos.sql` | H1, H3, H4, H6 |
| `scripts/audit-rls/replica.sql`, `rls.test.mjs` | Réplica de producción + 149 pruebas de permisos (corren en el CI) |
| `scripts/audit-rls/rollback_20261023_02.sql` | Vuelve atrás la migración (probado) |
| `src/lib/migrationsRls.test.js` | CI: toda tabla nueva con RLS |
| `package.json` | `@electric-sql/pglite` (solo desarrollo, para las pruebas) |

## 6. Qué necesita autorización

1. **Mergear la PR** (código: H2, H5, tests).
2. **Correr `20261023_02_endurecimiento_permisos.sql` en producción.**
   Solo cambia permisos, una policy, la config del bucket y una función;
   no toca datos. Copia de respaldo: el estado previo de permisos está
   capturado y `scripts/audit-rls/rollback_20261023_02.sql` lo restaura
   (probado). Recomendado además: verificar M9 (backups) antes.
3. **Manual en Supabase:** desactivar el provider Email (M1) si no se usa.
