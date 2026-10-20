# Progreso — sesión autónoma (rama `mejoras-automaticas-felpus`)

## [ID 000] Arreglar build local roto por opengraph-image dinámico

- **Qué se modificó:** se eliminó `src/app/opengraph-image.jsx` (generación
  dinámica de la imagen de Open Graph vía `next/og`). Se agregó
  `public/og-image.png` (PNG estático 1200x630, descargado de la versión ya
  desplegada y verificada en producción). Se actualizó `src/app/layout.js`
  para referenciar ese PNG manualmente desde `metadata.openGraph.images` y
  `metadata.twitter.images`. Se archivó el `PLAN.md` de una sesión autónoma
  anterior (ya completada) como `PLAN_SESION_ANTERIOR.md`, para no
  confundirlo con el backlog nuevo de esta sesión.
- **Por qué:** `npm run build` fallaba siempre con `TypeError: Invalid URL`
  — un bug de `next/og` al resolver una ruta interna en carpetas con
  espacios/paréntesis (ver `AUDITORIA.md` AUD-001).
- **Archivos afectados:** `src/app/opengraph-image.jsx` (eliminado),
  `src/app/layout.js`, `public/og-image.png` (nuevo), `PLAN.md` →
  `PLAN_SESION_ANTERIOR.md`.
- **Pruebas ejecutadas:** `npm run build`.
- **Resultado:** build termina limpio, 8 páginas prerrenderizadas sin error.
- **Qué debe verificarse manualmente:** abrir un link de Felpus compartido
  en WhatsApp/Twitter y confirmar que la vista previa muestra la imagen
  correcta (ya se había verificado en la sesión de la tarde antes de este
  cambio — este commit no cambia el resultado visual, solo cómo se genera).

## [ID 001] Agregar places.googleapis.com al CSP

- **Qué se modificó:** `connect-src` en el `Content-Security-Policy` de
  `next.config.mjs` ahora incluye `https://places.googleapis.com`.
- **Por qué:** el autocompletado de zona (`PlaceAutocompleteElement`) hace
  sus pedidos a ese dominio, distinto de `maps.googleapis.com` que ya estaba
  permitido. Sin esto, el navegador bloqueaba el pedido en silencio.
- **Archivos afectados:** `next.config.mjs`.
- **Pruebas ejecutadas:** reinicio del servidor de desarrollo (los headers
  necesitan reinicio para aplicarse) + intercepción manual de
  `XMLHttpRequest` en la consola del navegador, tipeando en el campo Zona
  antes y después del cambio.
- **Resultado:** antes del fix, cero pedidos de red salían de la pestaña
  (bloqueados por CSP, sin mensaje explícito). Después del fix, el pedido
  sale y Google responde (con un 403 propio, no relacionado a CSP — ver
  ID 999).
- **Qué debe verificarse manualmente:** nada adicional — el fix en sí está
  verificado a nivel de red real.

## [ID 002] Arreglar mapa "cortado" por no re-medirse al cambiar tamaño

- **Qué se modificó:** nueva función `observeMapResize(map, container)` en
  `src/lib/googleMaps.js` — un `ResizeObserver` que dispara
  `google.maps.event.trigger(map, 'resize')` y re-centra el mapa cada vez
  que su contenedor cambia de tamaño. Se conecta en `MapPicker.jsx` (mapa
  del formulario de Reportar) y `ReportsMap.jsx` (mapa de Explorar), con
  cleanup correcto al desmontar el componente.
- **Por qué:** Google Maps mide el tamaño de su contenedor una sola vez al
  inicializarse; si el contenedor cambia de tamaño después (por ejemplo, un
  layout shift de un elemento hermano), el mapa queda pintado para el
  tamaño viejo — coincide con capturas de pantalla reales donde el mapa se
  veía con una mitad en gris sólido.
- **Archivos afectados:** `src/lib/googleMaps.js`, `src/components/MapPicker.jsx`,
  `src/components/ReportsMap.jsx`.
- **Pruebas ejecutadas:** recarga completa de la página + revisión de
  consola (sin errores nuevos atribuibles a este cambio).
- **Resultado:** el patrón de fix es el documentado oficialmente por Google
  para esta clase de problema (medir de nuevo tras un resize del
  contenedor). No se pudo reproducir visualmente el bug original de forma
  determinística dentro de esta sesión (dependía de un timing específico de
  layout shift), así que la verificación fue por revisión de código +
  patrón estándar, no por reproducir y comparar el bug antes/después.
- **Qué debe verificarse manualmente:** abrir el formulario de Reportar en
  un celular real, escribir en Zona, y confirmar que el mapa de abajo se ve
  completo (no cortado ni con partes en gris) en todo momento.

## [ID 003] Asociar labels del formulario de Reportar con sus campos

- **Qué se modificó:** se agregaron pares `id`/`htmlFor` a 11 campos del
  formulario de Reportar (Especie, Tamaño, Sexo, Nombre, Color, "Describí el
  color", Edad, Peso, Zona, Fecha, Descripción). El grupo de Contacto
  (WhatsApp + Email bajo una sola etiqueta visual) usa `aria-label`
  individual en cada input en vez de `htmlFor`. El campo de Zona
  (`ZonaAutocomplete`) recibe además `id` como prop y aplica
  `aria-label="Zona / barrio"` directamente sobre el elemento de Google
  (`PlaceAutocompleteElement`) para cuando reemplaza al input de texto
  plano.
- **Por qué:** 12 de 13 `<label>` del formulario no estaban asociadas a su
  control — un lector de pantalla no anunciaba ningún nombre de campo al
  recibir foco (WCAG 1.3.1 / 3.3.2), en el flujo más importante de la app.
- **Archivos afectados:** `src/components/FelpusMatcher.jsx`,
  `src/components/ZonaAutocomplete.jsx`.
- **Pruebas ejecutadas:** script en la consola del navegador que recorre
  todas las `<label>` del formulario y verifica si `label.htmlFor` resuelve
  un elemento real vía `document.getElementById`.
- **Resultado:** 10/13 labels resuelven un control real por `htmlFor`; las 3
  restantes ("Fotos", grupo, y "Contacto", grupo) usan `aria-label`
  individual a propósito, no son bugs.
- **Qué debe verificarse manualmente:** navegar el formulario completo con
  un lector de pantalla real (VoiceOver/TalkBack/NVDA) y confirmar que cada
  campo anuncia su nombre correctamente.

## [ID 007] Configurar ESLint y corregir lo que encontró

- **Qué se modificó:** se agregó `.eslintrc.json` (`next/core-web-vitals`) y
  `eslint`/`eslint-config-next` como devDependencies. Se corrigieron 2
  errores de JSX (comillas sin escapar) en `FelpusMatcher.jsx` y
  `MapPicker.jsx`, y 2 warnings de `react-hooks/exhaustive-deps` agregando
  `pushToast`/`goToTab` a sus respectivos arrays de dependencias.
- **Por qué:** el proyecto nunca tuvo lint configurado; correrlo por primera
  vez es exactamente el tipo de verificación que pedía el prompt de esta
  sesión y que no se puede reemplazar solo con lectura de código.
- **Bug real encontrado y corregido en el camino:** al agregar `pushToast`
  a las dependencias del efecto de racha diaria, apareció
  `ReferenceError: Cannot access 'pushToast' before initialization` — la
  declaración de `pushToast` estaba físicamente MÁS ABAJO en el archivo que
  ese efecto. Un array de dependencias de `useEffect` se evalúa de forma
  síncrona durante el render (a diferencia del cuerpo del efecto, que corre
  después de forma asíncrona) — por eso el bug no existía antes de tocar
  esa línea, pero sí después. Se corrigió moviendo la declaración de
  `pushToast` junto al resto de los hooks de estado, antes de cualquier
  efecto que la use (mismo lugar donde ya estaba correctamente `goToTab`).
- **Archivos afectados:** `.eslintrc.json` (nuevo), `package.json`,
  `package-lock.json`, `src/components/FelpusMatcher.jsx`,
  `src/components/MapPicker.jsx`.
- **Pruebas ejecutadas:** `npm run lint`, `npm run build`, y — importante —
  navegación real de los 4 flujos principales en una pestaña **nueva** del
  navegador (para evitar el buffer de consola acumulado de pestañas
  reutilizadas, que mostraba el error ya corregido como si siguiera
  vigente).
- **Resultado:** lint y build limpios; app funcionando sin errores nuevos.
- **Qué debe verificarse manualmente:** nada adicional — verificado de
  punta a punta dentro de la sesión.

## [ID 009] Actualizar Next.js 14.2.5 → 14.2.35 (vulnerabilidad crítica)

- **Qué se modificó:** `next` pasa de `14.2.5` a `14.2.35` en
  `package.json`/`package-lock.json`. `eslint-config-next` se actualiza a
  la misma versión para evitar desalineación.
- **Por qué:** `npm audit` (corrido por primera vez como parte de ID 007)
  reveló que la versión de Next.js ya desplegada en producción tiene una
  vulnerabilidad crítica real (Cache Poisoning, GHSA-gp8f-8m3g-qvj9) entre
  ~30 CVEs más de la serie 14.x, todas resueltas en 14.2.35. Es el hallazgo
  más importante de toda la sesión y no estaba en el plan original — surgió
  de correr la herramienta real, no de leer código.
- **Archivos afectados:** `package.json`, `package-lock.json`.
- **Pruebas ejecutadas:** `npm audit` antes/después (confirma que la
  vulnerabilidad crítica desaparece), `npm run build`, navegación real de
  los 4 flujos principales.
- **Resultado:** vulnerabilidad crítica resuelta; build y app funcionando
  igual que antes (bump de parche, sin cambios de API). Quedan 16
  vulnerabilidades "high" sin resolver, todas en la cadena de dependencias
  de ESLint (herramienta de desarrollo, nunca se sirve a usuarios reales) —
  resolverlas del todo requeriría un bump mayor de ESLint que rompería la
  configuración actual, fuera del alcance de esta sesión.
- **Qué debe verificarse manualmente:** ninguna acción — es seguro mergear
  este cambio independientemente del resto.

---

## Tareas no iniciadas (documentadas, no ejecutadas)

Ver `PLAN.md` para el detalle completo de prioridad/impacto/riesgo de cada
una, y `PENDIENTE_DECISION.md` para las que requieren una decisión externa:

- **[ID 999]** Habilitar "Places API (New)" — bloqueado, requiere acceso a
  Google Cloud Console.
- **[ID 004]** Anonimizar contacto al resolver un reporte — bloqueado,
  decisión de producto.
- **[ID 006]** Botón de eliminar publicación — bloqueado, decisión de
  producto.
- **[ID 008]** Testing automatizado (Playwright + axe-core) — P3, no
  iniciado, esfuerzo de configuración inicial grande.

Completadas más tarde en la sesión (no estaban en el alcance original del
plan, pero sí eran parte de las dimensiones que pedía auditar el prompt):

- **[ID 005]** Confirmar ausencia de EXIF GPS en fotos subidas — ✅
  confirmado por revisión de código (no requiere una foto real, es
  imposible que el Canvas API preserve EXIF).
- **[ID 007]** Configurar ESLint — ✅ hecho, encontró y corrigió 4 issues
  reales (incluyendo un bug propio introducido y corregido en la misma
  sesión).
- **[ID 009]** Actualizar Next.js por una vulnerabilidad crítica — ✅ hecho,
  el hallazgo más importante de toda la sesión.

Ninguna tarea quedó "bloqueada a medias" con el build roto — cada commit de
esta sesión deja el repositorio en un estado consistente y verificado.

---

# Alertas automáticas (2026-10-20) — ver `PLAN-alertas.md`

Estado: **Fase 0 terminada (mapa del código). Frené antes de programar porque
el plan choca con lo que ya existe en varios puntos (abajo). Esperando tus
decisiones.**

## Mapa del código

**Tabla de reportes: `public.reports`** (`supabase/schema.sql`, y migraciones
sueltas al final del mismo archivo; no hay carpeta `supabase/migrations/`).
- `id` **text** (no uuid; ej. `1786006832226-dtj5xc`).
- Tipo: `tipo` text, valores **`'perdida'` / `'encontrada'`** (no
  perdido/encontrado).
- Especie: `especie` text, valores `perro`, `gato`, `otro`.
- `color`, `color_otro`, `tamano` (`chico`/`mediano`/`grande`), `sexo`,
  `edad`, `peso`, `raza`, `detalles` (jsonb), `nombre`, `descripcion`.
- Ubicación: `zona` (texto), `ciudad`, `provincia`, `lat` / `lng` (double
  precision, pueden ser null). **No hay columna geography ni PostGIS.**
- Fecha: `fecha` (date, del evento) y `creado_en` (timestamptz, de la carga).
- Estado: **no hay columna `estado`**: `resuelto` (bool, reencuentro
  confirmado; al confirmarse se borra el contacto), `oculto` (bool, denunciado
  o escondido por el admin). No existe "inactivo".
- Dueño: `user_id` uuid **opcional**: se puede publicar como invitado, sin
  cuenta (`nickname` + contacto).
- Contacto: `contacto_whatsapp`, `contacto_email` (SELECT revocado al
  público; solo vía RPC `get_report_contact` con service_role).
- Push ya existente: `push_subscription` jsonb y `push_token` uuid, **por
  reporte**, no por usuario.

**Matcher: `src/lib/matching.js`**
- `scoreMatch(a, b)` → `{ score, imgSim, textSim, locScore, fechaSim,
  distanceLabel, descartado }`; `findMatches(report, candidates, {limit})` →
  lista ordenada con `score ≥ 0.15`. **Score en escala 0–1.**
- Señales: imagen (histograma de color; **CLIP no funciona hoy**: la API de
  Hugging Face que usaba `/api/embed` ya no existe y ningún reporte tiene
  embedding), campos estructurados (color con compatibilidades, raza, sexo,
  tamaño, edad, peso, señas), texto libre, distancia (lat/lng o zona por
  nombre) y fecha. Filtros duros: especie distinta, demasiado lejos,
  cronología imposible.
- Corre igual en el navegador y en el servidor (es cálculo puro).

**Autenticación:** Supabase Auth con Google (`src/components/felpus/useAuth.js`:
One Tap / `signInWithIdToken`, con `signInWithOAuth` como respaldo). Las rutas
de servidor verifican el token `Authorization: Bearer` contra Supabase Auth
(patrón en `api/create-report` y `api/subscribe-push`). Publicar **no** exige
cuenta.

**Tabla de matches: no existe.** Las coincidencias se calculan en el momento,
en el navegador.

**Lo que ya existe de notificaciones** (importante para el plan):
- Trigger `trg_notify_new_report` (pg_net, `schema.sql`): en cada INSERT de
  `reports` llama a `https://felpus.com/api/notify-match` con
  `x-webhook-secret` (guardado en Supabase Vault).
- `api/notify-match`: corre el matcher contra los reportes del tipo opuesto y,
  con `score ≥ 0.4`, avisa al dueño del otro reporte por **email (Resend)** y
  por **push** (si ese reporte tenía push activado).
- Push por reporte: botón "Avisame acá si hay una coincidencia" al publicar
  (`src/lib/push.js` → `api/subscribe-push`, autorizado por `push_token`, así
  que **funciona para invitados**). `public/sw.js` ya tiene `push` y
  `notificationclick`.
- **En producción el push está apagado**: Vercel no tiene
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, así que ese botón
  hoy no aparece.
- PWA: ya existen `src/app/manifest.js` (JS, no TS), íconos 192/512 con
  `maskable`, `share_target` y un componente que registra el service worker
  (`ServiceWorkerRegister.jsx`). Falta el banner de instalación.

## Choques con el plan (necesito tu decisión)

1. **Invitados.** El plan guarda suscripciones y zonas por `user_id`
   (obligatorio). Hoy se puede publicar sin cuenta y el push existente
   funciona por reporte, también para invitados. Si sigo el plan al pie de la
   letra, quien publica como invitado **nunca** recibiría la alerta de match.
2. **Email.** El plan dice "sin email", pero hoy la alerta de match ya se
   manda por email (Resend, plan gratis). Sacarlo es quitar algo que
   funciona.
3. **Colores del manifest.** El plan pide `#d31c22` / `#e2d2bd`, pero la
   paleta nueva que pediste (2026-10-20) usa rojo `#D71925` y fondo
   `#F8F1E8`, que es lo que tiene hoy el manifest.
4. **Umbrales.** Sin CLIP, la parte de imagen casi no suma: con los datos
   reales, los pares plausibles dan entre ~0.55 y ~0.86. Con 0.80 / 0.65 casi
   no saldrían alertas. Propongo 0.70 (push) / 0.50 (guardar), configurables.
5. **Webhook.** Ya hay un trigger que llama a `/api/notify-match`. Propongo
   no crear un segundo webhook: que ese mismo trigger llame a la ruta nueva
   `/api/alerts/dispatch`, que reemplaza a `notify-match` y hace match + zona.
6. **Adaptaciones sin vuelta** (las hago así salvo que digas lo contrario):
   `report_id` text en vez de uuid; tipos `perdida`/`encontrada`; especie
   también `otro`; "inactivo" con una columna nueva; manifest en
   `manifest.js` (el proyecto es JavaScript).
