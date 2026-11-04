# Revisión de seguridad — 2026-11-04

Dos frentes: (1) quién puede leer datos personales en Supabase y (2) límites
contra ataques automatizados. Código revisado: `origin/main` en `621b68a`.
Rama con los arreglos: `seguridad-rls-ratelimit-2026-11`.

No se escribió nada en producción. En producción solo se hicieron lecturas
con la clave pública (anon) y llamadas a funciones por GET, que PostgREST
corre en modo solo lectura.

## Resumen

| # | Nivel | Qué | Estado |
|---|---|---|---|
| A1 | Alto | Cualquiera con una conexión IPv6 oculta cualquier aviso con 3 denuncias | Arreglado en código |
| A2 | Alto | Teléfonos y emails: una sola IP se lleva todos los contactos en un día | Arreglado (código + migración) |
| A3 | Alto | IA (asistente y lectura de capturas): sin tope de costo diario, y sin límite si la base falla | Arreglado (código + migración) |
| A4 | Alto | Publicación masiva: ráfaga en paralelo, sin tope diario ni global; cada aviso falso dispara push y emails a gente real | Arreglado (código + migración) |
| M1 | Medio | Vectores y chequeo de fotos sin tope diario | Arreglado (código + migración) |
| M2 | Medio | Bucket de fotos: subir archivos sin login no tiene límite (se puede llenar el espacio) | Propuesto, sin cambiar |
| M3 | Medio | `20261026_01` (award_points pisa el nombre de otro) sin poder verificarse con la clave pública | Verificar a mano |
| B1 | Bajo | Teléfonos y emails escritos dentro de la descripción pública | Propuesto |
| B2 | Bajo | `user_id` público en `reports` | Aceptado (por diseño) |
| B3 | Bajo | Los mensajes de límite decían el motivo ("desde esta conexión") | Arreglado |

No encontré ningún hallazgo **crítico**: en producción ningún dato
personal se puede leer con la clave pública (detalle abajo).

---

## 1. Supabase: qué se puede leer en producción (comprobado hoy)

Probado con la clave pública, solo lecturas:

- **Las 22 tablas** con `select=*`: todas responden *permission denied*
  (42501), incluidas `push_subscriptions`, `alert_zones`, `matches`,
  `notifications_log`, `referrals`, `support_flags`, `admin_alertas` y las
  de límites. Las migraciones `20261023_01` y `20261023_02` **están
  aplicadas** (antes `error_logs`, `matches`, etc. devolvían 200).
- **`reports`**: `contacto_whatsapp`, `contacto_email`, `push_token`,
  `push_subscription`, `lat`, `lng`, `location`, `avisos_email` y
  `actividad_en` → denegadas. Tampoco se puede filtrar por ellas
  (`?lat=gt.…`, `?contacto_whatsapp=like.…` → 42501). Solo se leen
  `lat_aprox`/`lng_aprox` (grilla de ~445 m). Los avisos ocultos no aparecen.
- **`contributors`**: `whatsapp`, `alias_pago`, `link_cobro` y
  `baneado_motivo` → denegadas.
- **Funciones**: las 33 sensibles (contacto, zonas de alerta, admin, puntos,
  push, apoyos, límites) → *permission denied for function*. Las de trigger
  no se exponen. `felpus_permisos_faltantes()` devuelve `[]` (no falta ni
  sobra ningún permiso de los que vigila).
- **Storage**: listar `felpus-photos` (raíz y `avatars/`) → lista vacía; el
  bucket no se puede consultar como objeto.
- **Auth**: solo Google habilitado (`email: false`), así que nadie puede
  crear una cuenta con el email del admin para entrar al panel.
- **Avistamientos**: la ubicación pública es la aproximada; es donde se vio
  al animal, no un domicilio. `detalles` (público) solo trae datos del
  animal, hora, dirección en que iba y el comentario opcional.

Revisé además, en `supabase/schema.sql` y las migraciones, cada policy,
GRANT por columna y función SECURITY DEFINER: todas tienen
`set search_path = public`, las que tocan datos de otros son solo de
`service_role` y las de usuario filtran por `auth.uid()`. Las suscripciones
push que alguien cargue a mano con su sesión se filtran al enviar
(`isAllowedPushEndpoint`, `src/lib/alertsServer.js:147`).

---

## 2. Hallazgos

### A1 (Alto) — Ocultar cualquier aviso con una sola conexión IPv6

- **Dónde:** `supabase/schema.sql:1070` (`flag_report` oculta el aviso con
  denuncias de 3 IPs distintas) + `src/app/api/flag-report/route.js:47`
  (le pasaba la IP exacta).
- **Escenario:** una conexión de casa o de celular con IPv6 recibe un bloque
  de 2^64 direcciones. Con 3 pedidos a `/api/flag-report`, cada uno desde
  una dirección distinta del mismo bloque, el aviso queda oculto. Como el
  límite de 10 por hora también era por dirección exacta, un script oculta
  **todos** los avisos del sitio en minutos. Lo mismo con "Reportar abuso"
  de un alias de apoyo (`/api/support-flag`).
- **Arreglo (hecho):** todas las rutas que limitan por IP cuentan IPv6 por
  bloque /64 (`ipParaLimite` en `src/lib/serverRateLimit.js`):
  `flag-report`, `support-flag`, `support-alias`, `log-error`,
  `report-contact`, `create-report`, `chat`, `import-post`, `embed` y
  `photo-check`. Con IPv4 sigue igual (3 IPs reales distintas).

### A2 (Alto) — Extracción en masa de teléfonos y emails

- **Dónde:** `supabase/schema.sql:2500` (`get_report_contact`: 30 por hora
  por IP, sin tope diario ni global).
- **Escenario:** los ids de todos los avisos son públicos
  (`GET /rest/v1/reports?select=id`). Con 30 por hora, **una sola IP** se
  lleva unos 720 contactos por día: hoy hay ~290 avisos, o sea todos en
  ~10 horas. Rotando direcciones IPv6, en minutos. Además, abrir varias
  veces el mismo aviso gastaba cupo a la gente real.
- **Arreglo (hecho):** función nueva `obtener_contacto_reporte` (migración
  `20261104_01`) usada por `src/app/api/report-contact/route.js`:
  - cuenta **avisos distintos**: reabrir el mismo no gasta cupo;
  - por IP: 30 por hora y **80 por día**;
  - con sesión: por **cuenta** 30/hora y 100/día, y la IP con el doble (así
    no se frenan entre sí personas detrás de la misma IP); el navegador
    ahora manda la sesión (`fetchReportContact` en `src/lib/store.js`);
  - tope **global** de 3000 por día, con aviso al admin si se alcanza;
  - avisos inexistentes, ocultos o sin contacto no gastan cupo;
  - es atómica (un pedido por vez), así una ráfaga en paralelo no pasa.
  Sin la migración, la ruta usa la función vieja (con la IP en /64).

### A3 (Alto) — IA sin techo de costo

- **Dónde:** `src/lib/serverAiRateLimit.js:19` y `:51` (versión anterior:
  si la base respondía error, o fallaba la conexión, **dejaba pasar todo**);
  `supabase/schema.sql:1605` (`check_chat_rate_limit`: 8/min y 80/día por
  IP, sin tope global).
- **Escenario:** `/api/chat` (Claude) e `/api/import-post` (Gemini) no piden
  sesión. Con muchas IPs (IPv6, proxies) cada una tiene 80 pedidos por día y
  cada pedido del chat son hasta 4 llamadas a Claude: la factura no tiene
  techo. Si Supabase está con problemas, no hay límite.
- **Arreglo (hecho):** bucket `ia` en `felpus_limite`: por IP 8/min y
  80/día (igual que hoy) + **tope global de 1500 por día** + aviso al admin
  al llegar. Si la base no responde, ahora pasa solo un cupo chico por
  instancia (20 por minuto) en vez de todo. Respuestas 429 sin detalle.
- **Por qué no hay tope "por cuenta" acá:** estas rutas se usan sin sesión,
  así que un atacante simplemente no manda la sesión; lo que pone el techo
  es el tope por IP y el global.

### A4 (Alto) — Publicación masiva de avisos

- **Dónde:** `src/app/api/create-report/route.js:120-146` (versión anterior).
- **Escenario:** el límite de 8 por hora se contaba con un SELECT y después
  un INSERT: 100 pedidos **en paralelo** desde una IP veían todos "0" y
  pasaban todos. No había tope diario, ni por cuenta, ni global, y si la
  consulta del conteo devolvía error se publicaba sin límite. Cada aviso
  nuevo dispara `notify-match` → push a las zonas de alerta y emails a
  dueños de posibles coincidencias: los avisos falsos llegan a gente real.
  Los avistamientos pasan por la misma ruta.
- **Arreglo (hecho):** bucket `reporte`, atómico: por IP 8/hora y 20/día;
  con sesión por cuenta 8/hora y 20/día (IP 16/40); global 120/hora y
  600/día, con aviso al admin. Si la base no responde se sigue pudiendo
  publicar (nunca frenar a alguien real por una falla nuestra) pero con un
  respaldo en memoria de 8 por hora. Sin la migración, el límite viejo,
  ahora sin el hueco del error.
- Un usuario real que publica "un par de reportes" no se acerca a ningún
  cupo. Los consejos (respuestas que se guardan en `detalles`) solo los
  puede escribir quien publicó, vía `/api/reports/edit`.

### M1 (Medio) — Vectores y chequeo de fotos sin tope diario

- **Dónde:** `src/app/api/embed/route.js:42`,
  `src/app/api/photo-check/route.js:31` (fallaban abiertos) y
  `supabase/schema.sql:853` (12 por minuto por IP, sin tope diario).
- **Escenario:** cada pedido corre un modelo en Vercel hasta 60 s: un
  script con muchas IPs consume el cupo de funciones del plan.
- **Arreglo (hecho):** bucket `embed` (compartido por las dos rutas):
  12/min y 600/día por IP, 20000/día global. Siguen fallando abiertas si la
  base no responde (no cuestan plata de un proveedor y no deben trabar la
  publicación), con el respaldo en memoria por IP.

### M2 (Medio) — Subida de fotos sin login y sin límite

- **Dónde:** policy `felpus_photos_public_insert`
  (`supabase/schema.sql:2466`).
- **Escenario:** cualquiera con la clave pública sube JPG/PNG/WebP de hasta
  2 MB con un nombre válido, sin límite de cantidad. ~500 archivos llenan el
  1 GB del plan gratis y las fotos de la gente real dejan de subir.
- **Arreglo propuesto (no lo hice):** que el servidor entregue URLs de
  subida firmadas (`createSignedUploadUrl`) después de pasar un cupo por IP,
  y cerrar el INSERT anónimo directo. Toca el flujo de subida de fotos y el
  modo invitado, así que conviene hacerlo en un PR aparte y probarlo en el
  teléfono antes de cerrar la policy. Mientras tanto: mirar de vez en cuando
  el uso de Storage en Supabase → Settings → Usage.

### M3 (Medio) — Verificar si se corrió `20261026_01`

Con la clave pública no se puede saber. En el SQL Editor:

```sql
select exists (select 1 from pg_trigger where tgname = 'reports_guard_resuelto') as corrida;
```

`true` = ya está. `false` = falta: cualquier cuenta logueada puede
cambiarle el nombre del ranking a otra persona (ver
`REVISION_SEGURIDAD_2026-10-26.md`). Se corre pegando
`supabase/migrations/20261026_01_puntos_y_reencuentro.sql`.

### B1 (Bajo) — Contacto escrito en la descripción

En producción hay 2 avisos con un teléfono y 2 con un email dentro de la
descripción (texto público): esos datos no pasan por los límites. Lo
escribió la propia persona; propuesta: un aviso suave en el formulario
("tu teléfono va en el campo de contacto, así no lo copian robots").

### B2 (Bajo) — `user_id` público en `reports`

Permite saber qué avisos publicó una misma cuenta (no quién es). Lo usa el
perfil público y "Mi Felpus". Lo dejo así.

### B3 (Bajo) — Mensajes de límite

Ahora las respuestas 429 dicen solo "Probá de nuevo más tarde", sin decir
qué cupo ni cuánto falta.

---

## 3. Qué cambió

- `supabase/migrations/20261104_01_limites_anti_abuso.sql` (también al
  final de `schema.sql`): tablas `limites_config` y `limites_uso` (RLS, sin
  permisos para la clave pública), `felpus_limite()` y
  `obtener_contacto_reporte()` (solo `service_role`).
- Rollback: `scripts/audit-rls/rollback_20261104_01.sql`.
- Prueba en la réplica: `scripts/audit-rls/limites.test.mjs` (permisos,
  cupos por IP/cuenta/global, ráfaga, contacto que no gasta al reabrir,
  función vieja intacta, migración repetible, rollback).
- `src/lib/serverRateLimit.js` (nuevo) y `src/lib/serverAiRateLimit.js`.
- Rutas: `create-report`, `report-contact`, `chat`/`import-post` (vía la
  librería), `embed`, `photo-check`, `flag-report`, `support-flag`,
  `support-alias`, `log-error`. Cliente: `fetchReportContact`.
- Verificación: `npm test` (72 archivos, 1057 tests), `npm run lint` y `next build` OK.

Cambiar un cupo después, sin deploy (SQL Editor):

```sql
update public.limites_config set maximo = 3000
where bucket = 'ia' and tipo = 'global' and ventana = interval '1 day';
```
