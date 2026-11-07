# Revisión de seguridad y optimización — 2026-11-07

Código revisado: `origin/main` en `d26fc14` (PR #123). Rama con los arreglos:
`seguridad-repaso-2026-11-07`. Parte de las revisiones anteriores
(`REVISION_SEGURIDAD_2026-10-26.md`, `REVISION_SEGURIDAD_2026-11-04.md`,
PRs #58 y #117-#120): lo que ya se cerró ahí no se repite. Se miró sobre todo
lo que se agregó o cambió después (#118-#123) y lo que esas revisiones
dejaron afuera.

No se escribió nada en producción ni se tocó configuración de Supabase,
Vercel o Google Cloud.

## Resumen

| # | Nivel | Qué | Estado |
|---|---|---|---|
| M1 | Medio | Fotos: cualquiera sin login puede subir archivos sin límite de cantidad (ya conocido, sigue abierto) | Instrucciones abajo, sin cambiar |
| M2 | Medio | `/api/coincidencias`: ids inventados = hasta 10 consultas a Supabase por pedido | ✅ Arreglado |
| M3 | Medio | `/api/log-error`: 6 pedidos a Supabase por cada error, se podía usar desde otros sitios | ✅ Arreglado (queda tope global, propuesto) |
| B1 | Bajo | "Seguir buscando" fallaba con sesión iniciada en avisos publicados como invitado | ✅ Arreglado |
| B2 | Bajo | `/api/matches`: el dueño de un aviso puede guardar pares con cualquier id | Propuesto |
| B3 | Bajo | Una cuenta suspendida puede seguir publicando como invitado | Aceptado / decisión |
| B4 | Bajo | El % del mail de coincidencia se calcula con la ubicación exacta | Info |
| B5 | Bajo | CSP sigue permitiendo `accounts.google.com` (One Tap ya no se usa) | Propuesto |
| B6 | Info | `npm audit`: 0 en producción; 6 moderadas en ESLint (desarrollo) | Sin arreglo simple |
| O1 | Optimización | La pantalla principal baja 314 kB de JS; el panel de admin va incluido | Propuesto |

Sin hallazgos críticos ni altos nuevos.

---

## Arreglados en la rama

### M2 — `/api/coincidencias` multiplicaba las consultas a Supabase

- **Dónde (antes):** `src/app/api/coincidencias/route.js:60-63` llamaba
  `uno(id)` por cada id, y `src/lib/serverCoincidencias.js:57-63` hacía una
  consulta a Supabase por cada id que no estuviera en la caché.
- **Escenario:** un script manda `{"reportIds": ["a1","a2",…,"a10"]}` con ids
  que no existen. Cada pedido = 10 consultas a la base. Con el cupo de 40
  pedidos por minuto por IP, 400 consultas por minuto desde una sola
  conexión, y el cupo no lo frena porque cuenta pedidos, no consultas. Suma
  directo al uso de Supabase (ya pasado del plan gratis).
- **Arreglo:** `varios(ids)` en `serverCoincidencias.js`: los que faltan van
  todos en **una** consulta (`id=in.(…)`), y los que no existen se recuerdan
  1 minuto (los ids nuevos son aleatorios, así que esto no esconde un aviso
  recién publicado). Tests en `serverCoincidencias.test.js` y
  `coincidencias/route.test.js`.

### M3 — `/api/log-error`: muchas consultas por error y abierto a otros sitios

- **Dónde (antes):** `src/app/api/log-error/route.js:67-96`: por cada error,
  borrar viejos de `error_log_submissions`, contar, insertar, borrar viejos de
  `error_logs`, insertar y (si no es ruido) leer 500 filas. Seis pedidos a
  Supabase. Y no tenía el control de "pedido desde otro sitio" que ya tienen
  las demás rutas públicas.
- **Escenario:** una página ajena con un script que llama a
  `felpus.com/api/log-error`: cada visitante usa su propia IP (el cupo de 40
  por hora por IP no lo frena) y llena `error_logs` de basura, tapando los
  errores reales y gastando cupo de la base.
- **Arreglo:** las dos limpiezas corren 1 de cada 20 veces (las tablas igual
  se mantienen chicas) y la ruta rechaza pedidos desde otros sitios
  (`esPedidoDeOtroSitio`, mismo control que `/api/chat`). Test nuevo en
  `log-error/route.test.js`.
- **Queda (propuesto):** el cupo es solo por IP y se cuenta con un SELECT y
  después un INSERT (una ráfaga en paralelo pasa). La solución completa es
  pasarlo a `felpus_limite` con un tipo `log` y tope global, como los demás.
  Requiere una migración y un cambio de código juntos; lo dejo para un PR
  aparte si querés.

### B1 — "Seguir buscando" con sesión iniciada

- **Dónde (antes):** `src/app/api/reports/renew/route.js:23`: con sesión
  iniciada filtraba solo por `user_id` y descartaba el `pushToken` que manda
  el navegador (`FelpusMatcher.jsx:1952`).
- **Escenario:** alguien publica como invitado, después entra con Google y
  toca "Seguir buscando": "No es tu reporte". Ahora usa el mismo filtro que
  "Editar mi aviso" (cuenta **o** token del dispositivo). Test nuevo en
  `reports/renew/route.test.js`.

Verificación: `npm test` (81 archivos, 1102 tests) y `npm run lint` OK.

---

## Para decidir o configurar (sin cambios)

### M1 — Subida de fotos sin login y sin límite (sigue igual que el 04/11)

- **Dónde:** policy `felpus_photos_public_insert` (`supabase/schema.sql:737`).
- **Qué pasa:** con la clave pública cualquiera sube JPG/PNG/WebP de hasta
  2 MB sin límite de cantidad. Unos 500 archivos llenan el 1 GB del plan
  gratis y las fotos reales dejan de subir.
- **Por qué no lo cambié:** el arreglo de verdad (que el servidor entregue
  URLs de subida firmadas después de pasar un cupo, y cerrar la subida
  directa) cambia cómo se publica, también en la app de Play. Conviene un PR
  propio, probado en el teléfono.
- **Mientras tanto, mirarlo una vez por semana:**
  1. Entrá a supabase.com → tu proyecto → **Settings → Usage**.
  2. Mirá **Storage size**. Hoy debería estar muy por debajo de 1 GB.
  3. Si sube de golpe sin que haya muchos avisos nuevos, avisame: se puede
     cerrar la subida anónima en minutos (los invitados no podrían subir foto
     hasta tener el arreglo completo).

### B2 — `/api/matches` acepta cualquier par

- **Dónde:** `src/app/api/matches/route.js:68-79`. Comprueba que seas dueño
  de **uno** de los dos avisos, pero no que el otro exista ni que sea del
  tipo opuesto. Alguien logueado puede llenar `matches` con filas basura
  (solo afectan a sus propios avisos). Propuesta: verificar que los dos ids
  existan y sean perdida/encontrada antes de guardar.

### B3 — Cuenta suspendida publica como invitado

- **Dónde:** `src/app/api/create-report/route.js:159-164`. La suspensión se
  mira solo si viene la sesión; sin sesión publica como cualquier invitado
  (con los mismos cupos por IP). Es esperable con publicación sin login; lo
  anoto para que lo sepas.

### B4 — % del mail de coincidencia con ubicación exacta

- **Dónde:** `src/app/api/notify-match/route.js:55` (pide `lat,lng`) y
  `src/lib/emailAvisos.js:123` (muestra el %). La pantalla usa coordenadas
  aproximadas para no dejar triangular domicilios; el mail no. El % mezcla
  foto, texto, fecha y distancia, así que sacar la distancia de ahí es muy
  difícil. Si querés el mismo criterio en todos lados: cambiar `lat,lng` por
  `lat_aprox,lng_aprox` en esa consulta (cambia un poco los puntajes de los
  mails).

### B5 — CSP con `accounts.google.com`

- **Dónde:** `next.config.mjs:58, 67, 95, 96`. Estaba para One Tap, que se
  descartó (el login es el clásico de Supabase, que no lo necesita). Sacarlo
  achica lo que el sitio puede cargar. Antes, confirmá en Vercel que
  `NEXT_PUBLIC_GOOGLE_CLIENT_ID` sigue borrada. Si querés, lo saco en un PR
  aparte.

### B6 — Dependencias

`npm audit --omit=dev`: **0** vulnerabilidades en lo que corre en el sitio.
Quedan 6 moderadas en `@typescript-eslint` / `minimatch`, que solo usa ESLint
en tu compu y en el CI. `npm audit fix` no las resuelve sin pasar a ESLint 9
(cambio de configuración); no vale la pena por ahora.

### O1 — Tamaño del JS

`next build`: la página principal baja **314 kB** de JS (104 kB propios +
103 kB compartidos + mapas, etc.). Casi todo es `FelpusMatcher.jsx` (más de
5.600 líneas), que incluye el panel de admin aunque casi nadie lo use.
Propuesta: cargar el panel de admin y el asistente solo cuando se abren
(`next/dynamic`). Es un cambio de estructura en el archivo más grande de la
app, mejor en un PR propio y probado.

---

## Revisado y sin problemas

- Rutas de admin (`admin/*`): exigen sesión verificada contra Supabase y el
  email del admin. Cron y webhooks (`alerts/*`, `notify-match`): secreto con
  comparación de tiempo constante; pg_cron lo lee del Vault.
- `reports/edit`, `reports/contacto`, `push/subscribe`, `alerts/zone`,
  `matches` GET: solo el dueño, comprobado en la misma consulta a la base.
- `aviso`: links firmados; el GET no cambia nada.
- Chat con Claude e `import-post`: claves solo en el servidor, cuerpo acotado,
  cupo por IP y global, mismo origen.
- La service role key no aparece en código del navegador; las únicas
  variables públicas son la URL y la clave anon de Supabase, GA, VAPID
  pública y el client id de Google.
- Headers: HSTS, `frame-ancestors 'none'`, `nosniff`, sin `X-Powered-By`, sin
  source maps.
