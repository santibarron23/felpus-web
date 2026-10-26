# Revisión de seguridad general — Felpus (2026-10-26)

Código revisado: `origin/main` en `327a56f` (PR #57). Rama con los arreglos:
`seguridad-revision-2026-10`. Esta revisión parte de la auditoría de la base
del 2026-10-23 (`AUDITORIA_SEGURIDAD_2026-10-23.md`): lo que esa auditoría ya
cerró se volvió a verificar y no se repite acá.

Alcance: las 18 rutas de `src/app/api`, `supabase/schema.sql` y las
migraciones, headers/CSP (`next.config.mjs`), variables `NEXT_PUBLIC_*`,
fotos y uploads, XSS en el contenido de los usuarios (descripción, nombre,
zona, OG, JSON-LD), dependencias (`npm audit`) y una prueba **solo de
lectura** con la anon key contra producción.

## Resumen

| # | Hallazgo | Severidad | Estado |
|---|----------|-----------|--------|
| A1 | La migración `20261023_02` **sigue sin correrse en producción**: el bucket de fotos todavía acepta SVG/HTML de 8 MB sin login, y siguen abiertos los permisos de tablas internas y el TRUNCATE | **Alta** | 🔴 Correr la migración (SQL ya listo) |
| M1 | `award_points`: cualquier usuario logueado puede cambiarle el **nombre público del ranking** a cualquier otra persona | **Media** | 🟡 SQL propuesto (`20261026_01`, probado en la réplica) |
| M2 | SSRF a ciegas: el servidor manda pedidos POST a **cualquier URL https** que se registre como suscripción push | **Media** | ✅ Corregido en la rama |
| B1 | El navegador elige `resuelto_en` y `resuelto_por_user_id` (fecha y autor del reencuentro); habilita el bono de M1 y facilita inflar puntos | Baja | 🟡 SQL propuesto (`20261026_01`) |
| B2 | Con un UPDATE directo, el dueño esquiva la validación de `/api/create-report` (foto externa, embeddings, contacto sin validar) | Baja | 🟡 SQL propuesto abajo (decisión) |
| B3 | report-contact, flag-report y subscribe-push devolvían mensajes internos de Postgres | Baja | ✅ Corregido en la rama |
| B4 | Sigue habilitado el registro con email y contraseña en Supabase Auth (M1 del 23/10) | Baja | 🔴 Manual en Supabase |
| B5 | El CSP permitía imágenes y conexiones a **cualquier** proyecto de Supabase | Baja | ✅ Corregido en la rama |
| B6 | `npm audit`: 5 moderadas, todas en dependencias de desarrollo | Baja | ✅ vitest actualizado; quedan 3 (tailwind 3) |
| B7 | Los rate limits de `/api/embed` y `/api/photo-check` dejan pasar todo si falla Supabase | Info | Aceptado (decisión de diseño documentada) |

**Sin hallazgos críticos.**

## Hallazgos

### A1 — La migración del 23/10 no llegó a producción (Alta)

- **Dónde:** `supabase/migrations/20261023_02_endurecimiento_permisos.sql:22-38`
  (bucket) y `:91-111` (permisos).
- **Evidencia (solo lectura, anon key, 2026-10-26):** `GET /rest/v1/error_logs`,
  `chat_requests`, `points_events`, `heart_sends`, `report_flags` y `matches`
  responden `200 []`. Con la migración aplicada responderían `401 permission
  denied` (la sección 3b/3c hace `revoke all ... from anon`). Es la misma
  situación que la auditoría anterior describió como M10: la migración
  `20261022_02` (bucket) ya se había quedado sin correr.
- **Explotación concreta:** sin login, con la anon key pública del sitio:
  `POST https://woqckndwnxdqcwbrvluj.supabase.co/storage/v1/object/felpus-photos/promo.html`
  con una página de phishing ("Felpus: confirmá tu cuenta"), o un `.svg` con
  JavaScript. Queda publicada en una URL pública del proyecto de Felpus,
  sirve para estafas que usan el nombre de Felpus y además consume
  almacenamiento (8 MB por archivo, sin límite de cantidad). No se probó en
  producción para no crear archivos; está demostrado en la réplica local
  (`scripts/audit-rls/rls.test.mjs`).
- **Arreglo:** correr `20261023_02_endurecimiento_permisos.sql` en Supabase →
  SQL Editor (no toca datos; rollback probado en
  `scripts/audit-rls/rollback_20261023_02.sql`). Después:
  ```sql
  select has_table_privilege('anon', 'public.error_logs', 'select'); -- tiene que dar false
  ```
  Para que no vuelva a pasar, anotá en `supabase/migrations/README.md` la
  fecha en que corrés cada migración.

### M1 — Cambiar el nombre de otra persona en el ranking (Media)

- **Dónde:** `supabase/schema.sql:631-647` (rama `bono-reporte-original`) y
  `:661-673` (`nickname = coalesce(p_display_name, ...)`).
- **Problema:** el "bono" se le acredita a **otra** persona (`p_user_id`), pero
  el `p_display_name` que manda quien llama se guarda como el nickname de
  esa otra persona. Los `user_id` de reportes y del ranking son públicos.
- **Explotación concreta:** Mallory (logueada con Google) publica un reporte
  "encontrada" y lo marca resuelto con un UPDATE directo (`resuelto = true,
  resuelto_por_user_id = <su id>`, ver B1). Después llama
  `rpc('award_points', { p_user_id: <id de Ana>, p_display_name: 'texto ofensivo',
  p_delta: 20, p_reason: 'bono-reporte-original', p_source_id: <reporte "perdida" de Ana> })`.
  El nombre público de Ana en el ranking pasa a ser ese texto. Se repite
  contra cualquier persona con un reporte del tipo opuesto (tope: 40 llamadas
  por día por cuenta, y puede usar varias cuentas).
- **Arreglo propuesto (no aplicado):** sección 1 de
  `supabase/migrations/20261026_01_puntos_y_reencuentro.sql`: el nombre
  recibido solo se usa para la fila propia; para otra persona se conserva
  el suyo (o, si todavía no tiene fila, el nickname de su reporte). Probado
  en la réplica: `scripts/audit-rls/puntos.test.mjs` (6 pruebas: el ataque
  funciona hoy, queda bloqueado con la migración y el flujo normal de la app
  sigue andando).

### M2 — SSRF a ciegas por las suscripciones push (Media) ✅

- **Dónde (antes):** `src/lib/alerts.js:193` (`normalizePushSubscription`
  aceptaba cualquier `https://`), `src/app/api/subscribe-push/route.js:49`
  (guardaba el objeto sin validar) y `src/lib/alertsServer.js:137`
  (`toWebPushSub` mandaba a cualquier endpoint).
- **Explotación concreta:** con una cuenta logueada,
  `POST /api/push/subscribe` con `{"subscription":{"endpoint":"https://servicio-de-un-tercero.com/webhook","keys":{...}}}`
  y una zona de alertas en el centro de Salta. Cada reporte nuevo en la zona
  hace que el servidor de Felpus (IPs de Vercel) le mande un POST a esa URL.
  Sirve para usar a Felpus como intermediario contra servicios de terceros o
  para confirmar desde afuera cuándo se publica un reporte. Lo mismo vale
  para invitados por `/api/subscribe-push` con su propio `push_token`. Es "a
  ciegas" (el atacante no ve la respuesta) y solo por https, por eso es Media
  y no Alta.
- **Arreglo (en la rama):** `isAllowedPushEndpoint` en `src/lib/alerts.js:197`
  solo acepta los servicios de push reales de los navegadores (FCM, Mozilla,
  Apple, Windows), sin puerto ni usuario. Se aplica al guardar (las dos rutas)
  **y** al enviar (`alertsServer.js:141`), así que las filas viejas con
  endpoints raros dejan de usarse. Tests en `src/lib/alerts.test.js`.
- **Para revisar (solo lectura):**
  ```sql
  select count(*) from push_subscriptions
  where endpoint !~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/';
  ```
  Si da más de 0, alguien registró endpoints que no son de un navegador.

### B1 — Fecha y autor del reencuentro elegidos por el navegador (Baja)

- **Dónde:** `supabase/schema.sql:1544-1550` (`grant update (... resuelto_por_user_id, resuelto_en ...)`).
- **Problema:** `award_points` confía en `resuelto_en > now() - 10 minutes` y
  en `resuelto_por_user_id = auth.uid()`, pero el dueño los puede escribir
  con cualquier valor. Además, cualquiera puede publicar y marcar resueltos
  sus propios reportes: hasta 65 puntos por reporte (`reporte` +
  `reencuentro`), con tope de 8 reportes por hora y 40 llamadas de puntos
  por día por cuenta, así que el ranking se puede inflar.
- **Arreglo propuesto (no aplicado):** sección 2 de `20261026_01`: un trigger
  pone `resuelto_en = now()` y `resuelto_por_user_id = auth.uid()` cuando
  `anon`/`authenticated` marcan resuelto, e ignora cambios manuales después.
  `resolveReports` (`src/lib/store.js:455`) ya manda esos valores, así que
  la app no cambia. **Decisión pendiente** (no incluida): para cortar del
  todo lo de inflar puntos, dar los 50 de `reencuentro` solo si hay una
  coincidencia confirmada (`matches.estado = 'confirmado'`).

### B2 — El UPDATE directo esquiva la validación del formulario (Baja)

- **Dónde:** `supabase/schema.sql:1544-1550`. `/api/create-report` valida las
  fotos, el contacto y los embeddings (`src/lib/reportRow.js`), pero el
  dueño puede editar su reporte directo con la anon key y su sesión.
- **Explotación concreta:** el dueño hace `update reports set foto_url = 'https://otro-sitio/imagen.jpg'`:
  al compartir `/r/<id>` por WhatsApp/Facebook, la vista previa (`og:image`,
  `src/app/r/[id]/page.js:66`) muestra una imagen de cualquier sitio. También
  puede cargar embeddings inventados para aparecer como coincidencia de
  todos. Solo afecta sus propios reportes.
- **Arreglo propuesto (decisión, no aplicado):**
  ```sql
  alter table public.reports add constraint reports_foto_url_propia check (
    foto_url is null
    or foto_url like 'https://woqckndwnxdqcwbrvluj.supabase.co/storage/v1/object/public/felpus-photos/%'
  ) not valid;
  ```
  La solución completa es pasar la edición a una ruta `/api` que reutilice
  `sanitizeReportRow` y sacar esas columnas del `grant update`.

### B3 — Mensajes internos de Postgres en las respuestas (Baja) ✅

- **Dónde (antes):** `report-contact/route.js:73`, `flag-report/route.js:67`,
  `subscribe-push/route.js:116` devolvían `errBody.message` de cualquier error.
- **Explotación:** `POST /api/flag-report` con un `reportId` raro o durante
  un cambio de schema devuelve textos como `Could not find the function
  public.flag_report(...)` o nombres de tipos y columnas: sirve para mapear
  la base.
- **Arreglo (en la rama):** `publicRpcError` (`src/lib/httpGuards.js`) solo
  deja pasar los `RAISE EXCEPTION` pensados para la persona (400 + `P0001`);
  el resto muestra un mensaje genérico y el detalle va al log. Además se
  valida el formato de `reportId` en las tres rutas.

### B4 — Registro con email y contraseña habilitado (Baja)

`GET /auth/v1/settings` (público) muestra `email: true` y `disable_signup:
false`. La app solo usa Google. **Arreglo:** Supabase → Authentication →
Providers → Email → desactivar.

### B5 — CSP abierto a cualquier proyecto de Supabase (Baja) ✅

`next.config.mjs` tenía `https://*.supabase.co` en `img-src` y `connect-src`.
Si alguna vez entrara un script, podría mandar la sesión o los contactos que
se ven en pantalla a un proyecto de Supabase del atacante sin que el CSP lo
frene. **Arreglo (en la rama):** solo el host del propio proyecto (si falta
la variable en el build, queda el comodín de antes). Sigue habiendo
`'unsafe-inline'` en `script-src`: sacarlo exige nonces en todo el sitio
(cambio grande, fuera de esta rama). No se encontró ningún XSS que lo
aproveche (ver abajo).

### B6 — Dependencias (Baja)

`npm audit` daba 5 moderadas, **ninguna en producción**:
- `vitest`/`@vitest/mocker` (GHSA-qxg6-89mg-rqv8, GHSA-xp26-3454-mjgp):
  actualizado a 4.1.12 en la rama.
- `postcss-selector-parser` (GHSA-rj75-hqrm-r3gf), vía `tailwindcss` 3: solo
  corre en el build con CSS propio; el arreglo exige migrar a Tailwind 4. Se
  acepta el riesgo.

`next` 15.5.28 y `web-push` 3.6.7 sin avisos.

### B7 — Rate limits que fallan abiertos (Info)

`src/app/api/embed/route.js:42` y `photo-check/route.js:31`: si la RPC del
límite falla, dejan pasar el pedido (decisión documentada para no romper la
carga de fotos). `/api/chat` tiene además un límite en memoria. Si algún día
el costo de cómputo importa, conviene agregar ese mismo respaldo en memoria.

## Verificado sin hallazgos

- **Producción con la anon key (solo lectura):** contacto de reportes,
  `push_token`, `push_subscription` y `contributors.whatsapp` → `permission
  denied`; `push_subscriptions`, `alert_zones`, `saved_reports`, etc. →
  vacías; listado de buckets vacío; las RPC `admin_*` y `get_my_whatsapp` →
  denegadas; las de servicio no son visibles para anon; `/api/dev/test-push`
  → 404; `/api/health` → `ok`.
- **Headers en felpus.com:** CSP, HSTS con preload, `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy` y `Permissions-Policy` presentes.
- **Rutas API:** todas las que escriben exigen `Content-Type: application/json`
  (contra CSRF con formularios); las de usuario verifican la sesión contra
  Supabase Auth; los webhooks comparan secretos en tiempo constante;
  `user_id` nunca sale del cliente; los filtros de PostgREST usan ids
  validados por regex o `URLSearchParams`.
- **XSS:** no hay `innerHTML` ni `eval`; el JSON-LD escapa `<`
  (`src/lib/jsonLd.js`); React escapa nombre, zona y descripción; los emails
  de coincidencia escapan HTML; los links de WhatsApp/mail empiezan con
  `https://wa.me/` y `mailto:` (no admiten `javascript:`).
- **Secretos:** las variables `NEXT_PUBLIC_*` son solo datos públicos (URL y
  anon key de Supabase, key de Maps restringida a felpus.com, client ID de
  Google, VAPID pública y GA). Ninguna clave privada se usa en archivos
  `"use client"`; `.env.local` no está en git.
- **Asistente (`/api/chat`):** el modelo solo lee con la anon key (no ve
  contactos) y no escribe en la base; historial, contexto e imagen se
  validan; tiene rate limit en la base y en memoria.

## Cambios en la rama `seguridad-revision-2026-10`

| Archivo | Qué |
|---|---|
| `src/lib/alerts.js`, `src/lib/alertsServer.js` | Lista cerrada de servicios de push al guardar y al enviar (M2) |
| `src/app/api/subscribe-push/route.js` | Valida la suscripción y guarda solo endpoint + claves (M2); valida `reportId` y no expone errores internos (B3) |
| `src/app/api/report-contact/route.js`, `flag-report/route.js` | Errores genéricos y validación de `reportId` (B3) |
| `src/lib/httpGuards.js` | `publicRpcError` (B3) |
| `next.config.mjs` | CSP solo con el proyecto propio de Supabase (B5) |
| `package.json`, `package-lock.json` | vitest 4.1.12 (B6) |
| `supabase/migrations/20261026_01_puntos_y_reencuentro.sql` | **Propuesta, no aplicada** (M1, B1) |
| `scripts/audit-rls/puntos.test.mjs` | Prueba M1/B1 en la réplica local |
| tests | `alerts.test.js`, `httpGuards.test.js` |

`npm test`: 672 OK. `npm run lint`: sin errores. `next build`: OK.

## Qué tenés que hacer vos, en orden

1. **Correr `20261023_02_endurecimiento_permisos.sql`** en Supabase (A1). Es lo más importante.
2. Abrir y mergear la PR de esta rama (M2, B3, B5, B6).
3. Si estás de acuerdo, correr `20261026_01_puntos_y_reencuentro.sql` (M1, B1), **después** del paso 1.
4. Desactivar el registro con email en Supabase Auth (B4).
5. Decidir sobre B2 (foto solo del bucket propio) y sobre los puntos por reencuentro (B1).
