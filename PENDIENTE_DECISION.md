# Decisiones pendientes — requieren acción o información tuya

## -12. Ciudad/provincia estructuradas en el flyer (2026-08-06) — requiere 1 paso tuyo

**Qué hice:** agregué dos columnas nuevas a `reports` (`ciudad`, `provincia`),
completadas automáticamente cuando alguien elige una sugerencia del
autocompletado de Google Places para la zona (no cuando la tipea a mano) —
ver `ZonaAutocomplete.jsx`. Se usan para completar la línea "ZONA: ..." del
flyer imprimible con ciudad y provincia cuando esa información está
disponible (ver `composeZonaDisplay` en `flyer.js`), y también entran ahora
en el buscador de Explorar y del panel de admin.

Mismo patrón de columnas opcionales que `raza`/`detalles`/`oculto`
(`REPORT_LIST_OPTIONAL_COLUMNS` en `store.js`): mientras no corras la
migración de abajo, publicar y listar reportes sigue funcionando
exactamente igual que antes — simplemente esos dos campos quedan vacíos
("Sin especificar" en los desgloses del admin, y la zona del flyer se ve
igual que siempre, sin la ciudad/provincia agregada).

**Paso pendiente:**
1. Abrí el SQL Editor de tu proyecto Supabase.
2. Pegá y ejecutá todo `supabase/schema.sql` de nuevo (agrega `ciudad` y
   `provincia` a `reports`, no borra nada existente).
3. Listo — probá crear un reporte nuevo eligiendo una sugerencia del
   autocompletado de zona (no tipeándola a mano) y generá su flyer: la
   línea "ZONA:" debería incluir ciudad/provincia si Google las devolvió
   para esa dirección.

**No pude probarlo con datos reales de Google Places** (necesita la API key
de Google Maps configurada y una selección real del autocompletado, que no
puedo disparar en este entorno) — la lógica de combinar/deduplicar
zona+ciudad+provincia sí está cubierta por tests
(`composeZonaDisplay` en `flyer.test.js`), y generé un flyer real contra un
reporte existente (sin ciudad/provincia, caso que ya existía antes) para
confirmar que no se rompió nada.

## -11. Login con Google mostraba el dominio de Supabase, no el de Felpus (2026-08-06) — ✅ CERRADO, decisión tomada (2026-08-06): se queda con el flujo clásico

**Resultado final:** se probó de punta a punta (los 2 pasos de configuración
de abajo, corregidos 2 bugs de CSP encontrados en el camino — ver más abajo)
y el One Tap de Google **no llegó a mostrarse** en los dispositivos reales
del usuario (mobile y desktop), cayendo siempre al flujo clásico. Además,
aclarado con el usuario: el camino gratis de One Tap **nunca iba a mostrar
un dominio propio tipo "auth.felpus.com"** — cuando funciona, no muestra
ningún dominio (cartel embebido con marca "Felpus"), no lo reemplaza por
uno propio. Mostrar literalmente "auth.felpus.com" solo es posible con el
Custom Domain pago de Supabase (evaluado y descartado por costo, ver abajo).

**Decisión del usuario (2026-08-06):** dejarlo como está — el login clásico
(con el dominio de Supabase visible) sigue funcionando bien, sin costo
extra, y se reenvía la verificación de marca con los 3 puntos que Google sí
pidió explícitamente ya corregidos (dominio verificado, propósito explicado,
nombre de la app coincidente). El código de Google Identity Services
(`googleAuth.js`, la parte de `useAuth.js`) se queda en el repo tal cual
— no molesta a nadie (sin la env var no se activa, y con la env var
activada simplemente no logra mostrarse y cae al flujo de siempre — cero
regresión), por si en el futuro Google mejora la elegibilidad de One Tap
para esta app y empieza a funcionar solo.

**2 bugs reales encontrados y corregidos en el camino (quedan igual,
son mejoras aparte de esta decisión):**
1. El CSP de `next.config.mjs` bloqueaba `accounts.google.com` en
   `script-src` y `connect-src` — el script de Google ni cargaba.
2. Con eso arreglado, seguía bloqueado en `style-src`
   (`accounts.google.com/gsi/style`, el CSS del cartel de One Tap) —
   confirmado en vivo contra producción, con el pedido de red fallando.

Ambos ya están en `main` (commits `8f2ae28` y `4479b12`) — quedan bien,
son correcciones legítimas del CSP independientemente de si el One Tap
termina mostrándose algún día.

**Nota aparte, no relacionada con esto:** durante las pruebas apareció una
vez un error real "401: invalid_client — The OAuth client was not found"
en el flujo clásico (rompía TODO el login, no solo lo nuevo) — se
resolvió solo después de recargar la config en Supabase y esperar la
propagación de Google (la doc de Google avisa que los cambios de redirect
URI pueden tardar de 5 minutos a algunas horas). Si vuelve a aparecer sin
haber tocado nada, investigar de nuevo — no se llegó a confirmar la causa
raíz exacta, solo que se resolvió con el tiempo.

---

## -11 (contexto original, dejado abajo para referencia) — requería 2 pasos, ya completados

**Qué encontré:** en el proceso de verificación de marca de Google OAuth
(ver los 3 motivos de rechazo que Google fue dando — dominio no verificado,
propósito no explicado, nombre de la app sin coincidir), vos mismo
detectaste algo que los mensajes de Google no decían explícitamente: al
tocar "Acceder con Google" en la app, la pantalla "Elige una cuenta" de
Google muestra *"Ir a woqckndwnxdqcwbrvluj.supabase.co"* — el dominio propio
de tu proyecto de Supabase, no `felpus.com`.

Es así porque el login usa `supabase.auth.signInWithOAuth()` (flujo clásico
de OAuth con redirect): Supabase arma la URL de autorización con
`redirect_uri = https://<tu-proyecto>.supabase.co/auth/v1/callback`, y esa
es la URL que Google le muestra al usuario antes de continuar. Cosméticamente
raro para cualquier visitante, y un candidato muy plausible para seguir
trabando la verificación de marca aunque los otros 3 puntos ya estén
resueltos.

**Arreglo evaluado y descartado (por ahora): dominio propio de Supabase.**
Supabase permite servir toda su API (incluida la de Auth) bajo un
subdominio propio (ej. `auth.felpus.com`), lo que resolvería esto de raíz —
pero es una función paga (plan Pro + add-on de Custom Domains), y el
proyecto está en el plan Free. Se descartó por costo, no por dificultad
técnica.

**Qué hice en su lugar (gratis):** agregué un segundo camino de login,
opcional, con **Google Identity Services** (el SDK oficial de "Acceder con
Google" que corre embebido en la propia página, sin redirect por ningún
dominio ajeno):

1. `src/lib/googleAuth.js` — carga perezosa del script de Google (mismo
   patrón que `googleMaps.js`) + generación del nonce que exige
   `supabase.auth.signInWithIdToken()` para verificar que el token no fue
   reutilizado de otro contexto.
2. `src/components/felpus/useAuth.js` — si hay
   `NEXT_PUBLIC_GOOGLE_CLIENT_ID` configurada, inicializa Google Identity
   Services en segundo plano al montar. `signInWithGoogle()` (la misma
   función que ya llamaban los 5 lugares de la app que ofrecen login)
   primero intenta el One Tap de Google (`prompt()`) — si Google puede
   mostrarlo, todo el intercambio ocurre embebido en `felpus.com`, sin pisar
   ningún dominio de Supabase. Si no se puede mostrar (enfriamiento por un
   cierre previo, navegador sin soporte, cookies de terceros bloqueadas),
   cae automáticamente al flujo clásico de siempre — nadie se queda sin
   poder loguearse.
3. **Sin tocar ningún botón/JSX existente**: como los 5 lugares de la app ya
   llamaban a la misma función `signInWithGoogle()` de `useAuth.js`, el
   cambio quedó contenido ahí adentro — cero riesgo de romper el diseño o el
   layout de los botones.
4. Sin `NEXT_PUBLIC_GOOGLE_CLIENT_ID` configurada, nada de esto se activa:
   la app sigue funcionando exactamente como antes, con el flujo clásico de
   siempre.

**Paso pendiente — 2 cosas, ambas gratis (ver README.md, sección 2.1.1):**
1. Agregar `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (el mismo Client ID que ya usás
   para el login, no el secreto) en `.env.local` y en las variables de
   entorno de producción.
2. En el Dashboard de Supabase → *Authentication → Providers → Google* →
   agregar ese mismo Client ID al campo **"Authorized Client IDs"**.

**No pude probarlo end-to-end:** no tengo forma de completar un login real
de Google en este entorno (necesitaría entrar con una cuenta de Google real,
algo que no hago por vos bajo ninguna circunstancia). Confirmé que el script
carga sin errores de consola, que el flujo clásico sigue intacto (tests +
build limpios), y que la lógica de nonce/hash está cubierta por tests
(`src/lib/googleAuth.test.js`) — pero **la primera vez que actives esto,
probá vos mismo el botón "Acceder con Google" de punta a punta** (desktop y
mobile) antes de confiar en que ya está resuelto.

**Si después de probarlo la pantalla de Google sigue mostrando
`supabase.co`** (por ejemplo porque el navegador no soporta One Tap y cae
siempre al flujo clásico), significa que esta vía gratuita no alcanza para
tu caso — ahí sí valdría la pena evaluar pagar el dominio propio de Supabase
mencionado arriba.

## -10. Bono de puntos al confirmar reencuentro nunca se otorgaba (y rompía el flujo entero) (2026-08-05) — requiere 1 paso tuyo

**Qué encontré, auditando el flujo de "confirmar reencuentro":** al marcar
un match como reencuentro, además de sumarle 50 puntos a quien confirma, la
app le suma un bono de 20 puntos ("bono-reporte-original") al dueño del
**otro** reporte del match — por ejemplo, si vos publicaste una mascota
encontrada y alguien más confirma que es su reporte de "perdida", ese bono
te lo lleva vos, no la persona que confirmó.

El problema: `awardPoints()` en `src/lib/store.js` hacía un lee-y-escribe
directo desde el cliente (sin ninguna función atómica de por medio) —
funciona para sumarte puntos A VOS MISMO porque la policy RLS
`contributors_update_own` lo permite, pero el caso del bono escribe en la
fila de **otra persona**, y esa misma policy lo deniega siempre. Cada vez
que ese bono debía otorgarse (básicamente cada confirmación de reencuentro
con un match real de por medio), el intento fallaba por RLS, y como estaba
adentro del mismo `try` que todo el resto del flujo, ese error tumbaba
TODO: el mensaje de éxito nunca aparecía y en su lugar se veía "No pudimos
guardar el reencuentro. Probá de nuevo." — **aunque el reporte ya se
hubiera marcado como resuelto igual, de forma silenciosa.** El bono en sí
nunca se llegó a otorgar en ningún caso real desde que existe esta
mecánica.

**Qué hice:**
1. Agregué `award_points()` a `schema.sql` — una función atómica (mismo
   patrón que `send_heart`, ya existente para los corazones), que sólo
   acepta las combinaciones reales de motivo/monto que usa la app (no un
   delta arbitrario, para no abrir una forma de inflar puntos propios o
   ajenos llamándola directo con la anon key) y sólo deja tocar la fila de
   otra persona para el caso puntual del bono.
2. `awardPoints()` en `store.js` ahora llama a esa función primero, y sólo
   cae al lee-y-escribe de siempre si la función todavía no existe (mismo
   patrón de respaldo que ya se usa para `raza`/`detalles`/`get_report_contact`).
3. Independientemente de la migración: aislé el llamado a `awardPoints()`
   (el propio Y el del bono) en su propio `try/catch` en
   `FelpusMatcher.jsx`, separado del resto del flujo de confirmar
   reencuentro — así, aunque falle sumar puntos (por el motivo que sea), el
   reencuentro ya guardado sigue mostrando el mensaje de éxito en vez de un
   error falso. Esto ya está activo ahora mismo, sin depender de que corras
   la migración.

**Mientras no corras el paso de abajo:** el reencuentro se confirma bien y
ya no rompe el flujo (por el punto 3), pero el bono al dueño del otro
reporte sigue sin otorgarse — mismo comportamiento (ausente) que tenía
desde siempre, sólo que ya no genera un error falso.

**Paso pendiente — correr la migración de schema.sql:**
1. Abrí el SQL Editor de tu proyecto Supabase.
2. Pegá y ejecutá todo `supabase/schema.sql` de nuevo (agrega la función
   `award_points`, no borra nada existente).
3. Listo — probá confirmar un reencuentro con un match real y verificá en
   Colaboradores que la otra persona sumó sus 20 puntos de bono.

**No pude probarlo end-to-end** (no tengo acceso a la base real para crear
dos usuarios y confirmar un reencuentro entre ellos) — la lógica está
revisada a mano y cubierta por tests (`describe("awardPoints")` en
`src/lib/store.test.js`, mock de Supabase), pero conviene que lo confirmes
una vez con la migración corrida.

---

## -9. Mismatch de hidratación sistémico: `style={{color: C.x}}` en todo el árbol (2026-08-05) — ✅ RESUELTO DE RAÍZ (2026-08-05), no requiere ningún paso tuyo

**Qué encontré:** al cerrar la sesión de dark mode fui a verificar que no
quedaran advertencias de hidratación en consola. Encontré y arreglé tres
casos puntuales en el header (el logo que yo mismo había roto al hacerlo
condicional por `themeMode`, el subtítulo del header, y los íconos
sol/luna del botón de tema) reemplazando el `style={{color: C.x}}`
calculado en JS por pares de clases Tailwind fijas (`text-[...] dark:text-[...]`).

Al arreglar el botón de tema, apareció OTRA advertencia distinta más abajo
en el mismo `<header>`: `border-color` también difiere entre servidor y
cliente (`style={{ borderColor: C.border }}`). Confirmé que esto era la
misma causa raíz, pero mucho más amplia: `useTheme()` (`C`/`CD` de
`theme.js`) siempre devolvía la paleta CLARA durante el render de servidor
(no había forma de que el server supiera qué tema eligió cada visitante), y
el cliente corregía recién al hidratar leyendo `data-theme`. Cualquier
`style={{...: C.algo}}` en un elemento que se renderiza siempre (no solo
detrás de un `if`) tenía este mismo problema en potencia — y
`style={{...: C.algo}}` aparece decenas de veces en `FelpusMatcher.jsx` y
`PureViews.jsx` (bordes de cards, colores de texto, íconos, etc.), o sea
que parchear caso por caso hubiera significado tocar prácticamente toda la
app — quedó anotado acá como pendiente para una sesión aparte.

**Qué hice (sesión siguiente):** en vez de seguir ese camino (convertir
cientos de `style={{}}` a clases Tailwind, un refactor estructural amplio
que el pedido original explícitamente no quería), fui a la causa raíz: el
servidor ahora SÍ conoce el tema elegido, leyendo una cookie
`felpus-theme` (`src/app/layout.js`, con `cookies()` de `next/headers`) y
pasándosela a `ThemeProvider` como `initialMode` — así el primer render de
servidor y el primer render de cliente parten del mismo `C`/`CD` desde el
arranque, sin que ningún componente tuviera que cambiar una sola línea de
sus `style={{color: C.x}}` existentes. El toggle de tema (`ThemeProvider.jsx`)
ahora escribe esa cookie en vez de `localStorage` (localStorage no es
legible por el servidor). El único caso que el servidor sigue sin poder
conocer — la primerísima visita de alguien, todavía sin cookie, cuyo
sistema prefiere oscuro — lo sigue resolviendo el mismo script anti-parpadeo
de siempre (ahora recibe el `initialMode` ya resuelto por el servidor
incrustado, y solo consulta `prefers-color-scheme` para ese caso puntual).

**Bug real encontrado y corregido en el camino:** la primera versión de
este fix agregaba `data-theme` como prop de JSX en `<html>` — React lo
"adoptaba" como propio y, al hidratar, lo pisaba de vuelta al valor que
había usado el servidor, peleándose con el script anti-parpadeo
(reproducido y confirmado en browser). Se corrigió dejando `data-theme`
100% imperativo (nunca una prop de React), igual que en la versión
original. Un segundo bug relacionado: dos `useEffect` separados en
`ThemeProvider` (uno reconciliaba el estado con el DOM, otro volvía a
escribir `data-theme` a partir del `mode` de React) corrían ambos en el
mismo commit inicial usando el `mode` TODAVÍA no reconciliado — el segundo
pisaba lo que el primero acababa de detectar. Se fusionaron en un único
efecto para eliminar esa carrera. Ambos bugs se detectaron con pruebas de
browser reales (no solo lectura de código) antes de darlo por cerrado.

**Verificado:** cero advertencias de hidratación recorriendo Inicio,
Explorar, el modal de detalle, Colaboradores y el formulario de Reportar
completo, en claro y oscuro, con y sin cookie previa, con el sistema en
claro y en oscuro — probado tanto en `npm run dev` como en un build de
producción real (`npm run build` + `npm start`). 120/120 tests, build
limpio.

**Costo aceptado:** `cookies()` vuelve dinámico el layout raíz (no se
puede pre-generar `/` en build) — ya lo era antes por otros motivos (la
app es interactiva de punta a punta, tira datos de Supabase en runtime),
así que no hay ganancia real de estático que se haya perdido acá.

**Qué pasó:** el bucket `felpus-photos` solo tenía políticas de lectura e
inserción — nunca de borrado. `deleteReport()` (botón "Eliminar
publicación") borra la fila de `reports` pero el intento de borrar la(s)
foto(s) de Storage fallaba en silencio (atrapado, solo logueado, para no
bloquear el borrado de la fila) — cada publicación eliminada dejaba su foto
huérfana, pública, en Storage para siempre.

**Qué hice:** agregué una política de `delete` en `storage.objects`
limitada al dueño real del archivo (`owner = auth.uid()`, la columna que
Supabase Storage completa sola al subir un archivo con sesión activa) — no
un delete abierto a cualquiera, porque el bucket es público y eso hubiera
dejado que cualquiera con la anon key borre fotos ajenas. Misma limitación
ya aceptada para reportes de invitado (ver ítem #0 más abajo): sin login,
ni la fila ni ahora la foto se pueden borrar por este mecanismo.

**Mientras no corras el paso de abajo:** todo sigue exactamente igual que
antes — el borrado de fotos sigue fallando en silencio, sin romper nada,
hasta que se corra la migración.

**Paso pendiente — correr la migración de schema.sql:**
1. Abrí el SQL Editor de tu proyecto Supabase.
2. Pegá y ejecutá todo `supabase/schema.sql` de nuevo.

---

## -7. Cerrar el hueco real del contacto (WhatsApp/email) (2026-08-05) — requiere 1 paso tuyo

**Qué pasó:** al revisar `schema.sql` a fondo encontré que la protección de
contacto de la sesión anterior ("el listado general no trae WhatsApp/email")
era solo una convención del código del cliente, no una restricción real de
la base. La política de lectura de `reports` es `using (true)` —controla
FILAS, no columnas— así que cualquiera con la anon key (pública, está en el
bundle del navegador de toda la app, no es un secreto) podía pedir
`select=contacto_whatsapp,contacto_email` directo a la API REST de Supabase
y llevarse el contacto de TODOS los reportes activos en un solo pedido, sin
pasar por ningún código de la app.

**Qué hice:** revoqué el SELECT de esas dos columnas puntuales a nivel de
Postgres para `anon`/`authenticated` (`revoke select (...) on reports from
anon, authenticated`) — ya no hay ningún SELECT directo, desde donde sea,
que pueda traerlas. El único camino que queda es una función nueva
(`get_report_contact`), rate-limitada a 30 consultas por hora por IP, con
su propio cupo separado del de publicar reportes. Actualicé:
- `fetchReportContact` en `src/lib/store.js` para llamar a esa función en
  vez de un `.select()` directo.
- El webhook `src/app/api/notify-match/route.js`, que usa la anon key y
  antes pedía `select=*` (incluía el email de los ~200 candidatos en
  bloque) — ahora pide columnas explícitas sin contacto, y recién pide el
  email puntual de cada coincidencia que ya superó el umbral de aviso.

**Lo que esto NO resuelve (limitación real, no un descuido):** una vez que
una persona real abre el detalle y ve el WhatsApp, ese número tiene que
llegar al navegador para armar el link `wa.me/<numero>` — no hay forma de
"proxyearlo" sin la API oficial de WhatsApp Business (cuenta aprobada,
costo, infraestructura propia). Es un riesgo residual aceptado, mismo
nivel que otros ya documentados en este archivo. Si en algún momento
importa más el email que el WhatsApp, existe una versión que nunca expone
la dirección (un botón "Enviar mensaje" que pega a una API route propia
que manda el email por vos) — quedó anotado como mejora futura, no
implementado todavía.

**Paso pendiente — correr la migración de schema.sql:**
1. Abrí el SQL Editor de tu proyecto Supabase.
2. Pegá y ejecutá todo `supabase/schema.sql` de nuevo (revoca las columnas,
   crea `contact_requests` y la función `get_report_contact`).

**Mientras no corras el paso de abajo:** el `revoke`/la función nueva no
existen todavía del lado de la base. `fetchReportContact` lo detecta (mismo
patrón que raza/detalles) y cae solo al SELECT directo de siempre, así que
ver el contacto en el detalle de un reporte sigue andando igual — el hueco
simplemente sigue abierto hasta que corras la migración. Lo único que sí
pausa mientras tanto: los emails automáticos de "posible coincidencia"
(webhook `notify-match`) — dejan de mandarse hasta que exista la función
(el push, si lo tenés configurado, sigue funcionando igual).

---

## -6. Rediseño de "Detalles para reconocerlo" (2026-08-05) — requiere 1 paso tuyo

**Qué hace:** la sección que antes era "¿Tenía algo puesto? / ¿Cómo se
comporta? / Algo más para identificarla / Así se va a ver la descripción" se
rediseñó completa:
- **¿Tenía algo puesto?** — mismos chips, con "Nada" en vez de "Sin nada puesto".
- **¿Cómo reacciona con desconocidos?** — reemplaza al "¿Cómo se comporta?"
  de 16 opciones en 3 categorías por 6 opciones puntuales y accionables (Se
  acerca, Se deja agarrar, Es miedoso/a, Puede escapar, Ladra o gruñe, No sé).
- **¿Tiene algo que lo haga fácil de reconocer?** — reemplaza al textarea
  libre por chips (mancha, cicatriz, le falta una oreja/pata, cojea, ojos de
  distinto color, muy peludo/a, otro). Elegir "Mancha particular" despliega
  una pregunta más (dónde) y, opcionalmente, de qué color — sin saltos
  bruscos de layout.
- El texto libre pasa a ser sólo "¿Querés agregar algo más?" (con Dictar por
  voz), para lo que de verdad no entra en ningún chip.
- La vista previa ("Vista previa", antes "Así se va a ver la descripción")
  ahora es compacta y sólo aparece cuando hay algo que mostrar.

Además de seguir armando `descripcion` en texto (como antes), ahora también
se guarda un objeto **estructurado** (`accesorios`, `comportamientos`,
`marca_distintiva`, `ubicacion_marca`, `color_marca` — ver
`buildDetallesEstructurados` en `src/lib/matching.js`) en una columna nueva,
`detalles` (jsonb). El matching ya lo usa como una señal más (ver
`detallesSimilarity`), con peso moderado.

**Mientras no corras el paso de abajo:** todo funciona igual —la app
detecta que la columna no existe todavía y sigue publicando/cargando
reportes con normalidad—, simplemente ese dato estructurado no se guarda (ni
suma al matching) hasta que se corra la migración. Es el mismo mecanismo de
respaldo que ya se usa para `raza` (ver `fetchReports`/`createReport` en
`src/lib/store.js`).

**Paso pendiente — correr la migración de schema.sql:**
1. Abrí el SQL Editor de tu proyecto Supabase.
2. Pegá y ejecutá todo `supabase/schema.sql` de nuevo (agrega la columna
   `detalles` a `reports`).

---

## -5. Notificaciones push del navegador (2026-08-04) — requiere 2 pasos tuyos

**Qué hace:** además del email, ahora se puede activar un aviso push del
navegador (con el celular cerrado) cuando alguien publica una coincidencia
con tu reporte — botón "Avisame acá si hay una coincidencia" en la pantalla
de resultado, justo después de publicar. Funciona por reporte, no por
cuenta, así que también sirve para reportes de invitado (sin login). No usa
ningún servicio de terceros ni requiere crear ninguna cuenta — Web Push es
un estándar del navegador, las claves VAPID son un par de llaves que se
generan localmente en tu máquina (no dependen de ninguna cuenta).

**⚠️ Por seguridad, esta vez NO generé las claves acá:** este archivo va a
un repo público — la clave *privada* nunca debe quedar escrita en un
archivo versionado (fue exactamente el incidente ya corregido del ítem -1
más abajo, con el secreto del webhook). Te las mostré una vez en el chat
de la sesión donde armé esta función (canal privado, no el repo), pero
lo más prolijo es que generes tu propio par vos mismo — 10 segundos:

**⚠️ Paso 1 — generar el par de claves (en tu máquina, no en el repo):**
```
npx web-push generate-vapid-keys
```
Esto imprime una "Public Key" y una "Private Key". Guardalas, no las
pegues en ningún archivo del proyecto.

**Mientras no completes los pasos de abajo:** el botón de activar
simplemente no aparece (se esconde solo si `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
no está seteada), y el email de coincidencia sigue funcionando igual.

**⚠️ Paso 2 — correr la migración de schema.sql:**
1. Abrí el SQL Editor de tu proyecto Supabase.
2. Pegá y ejecutá todo `supabase/schema.sql` de nuevo (agrega la columna
   `push_subscription` a `reports` y la función `subscribe_report_push`).

**⚠️ Paso 3 — variables de entorno (local y Vercel), con las claves del Paso 1:**
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<tu Public Key>
VAPID_PRIVATE_KEY=<tu Private Key>
VAPID_SUBJECT=mailto:tu-email@ejemplo.com
```
1. Agregalas a tu `.env.local` (para probar en local — ese archivo ya está
   en `.gitignore`, nunca se sube).
2. Agregalas también en Vercel → tu proyecto → Settings → Environment
   Variables (con esos mismos 3 nombres), y redeploy.

**Nota de seguridad aceptada:** como el id del reporte no es secreto
(aparece en la URL pública `/r/<id>`), alguien que lo conozca técnicamente
podría llamar a `subscribe_report_push` con ese id y reemplazar tu
suscripción por la suya — no expone ningún dato tuyo, en el peor caso
dejarías de recibir avisos push de ESE reporte puntual (el email no se ve
afectado). Mismo nivel de riesgo que ya está aceptado en otros lugares de
esta app (ver ítem #0 más abajo, sobre el borrado de reportes de
invitado). Mitigado parcialmente con el mismo límite de 8 intentos/hora
por IP que ya protege la creación de reportes.

**No pude probarlo end-to-end** (no tengo forma de instalar la PWA y
recibir una notificación real desde acá) — la lógica está revisada a mano
y el flujo completo (suscribirse → guardar → mandar desde el webhook)
sigue el mismo patrón que el resto de la app, pero conviene que lo
verifiques una vez con los pasos de arriba hechos: activá notificaciones en
un reporte, publicá otro que matchee, y confirmá que llega el push.

---

## -4. Log de errores a Supabase (2026-08-04) — requiere 1 paso tuyo

**Qué hace:** `logError()` (`src/lib/log.js`) antes solo hacía
`console.error` — un error en producción era invisible salvo que el usuario
te lo contara. Ahora además intenta guardar una fila en una tabla nueva,
`error_logs` (mensaje, stack, URL, user agent), protegida con el mismo
patrón de RLS que `report_submissions`/`embed_requests`: el INSERT queda
abierto (con rate limiting por IP, 40/hora) pero nadie puede leerla vía la
API — solo vos, desde el **Table Editor** de tu proyecto Supabase. No usa
ningún servicio nuevo (Sentry ni parecidos) ni requiere crear ninguna
cuenta — reutiliza el Supabase que ya tenés.

**Mientras no corras el paso de abajo:** la tabla no existe todavía, así
que cada intento de guardar un error falla en silencio (atrapado a
propósito — nunca debe romper nada) y solo queda el `console.error` de
siempre. La app funciona exactamente igual, simplemente no vas a ver nada
nuevo en Supabase hasta este paso.

**⚠️ ACCIÓN REQUERIDA DE TU LADO — 1 paso:** el mismo de siempre:

1. Abrí el SQL Editor de tu proyecto Supabase.
2. Pegá y ejecutá todo `supabase/schema.sql` de nuevo (seguro re-correrlo
   completo).
3. Listo. Para revisar errores: Table Editor → `error_logs`, ordená por
   `created_at` descendente. Como no hay agrupación automática, para no
   acumular basura sin límite te conviene de tanto en tanto borrar filas
   viejas a mano (o agregar un cron de limpieza si en algún momento se
   vuelve un volumen real).

---

## -3. Rate limiting real de /api/embed (2026-08-04) — requiere 1 paso tuyo

**Qué hace:** `/api/embed` llama a Hugging Face (costo/cuota propia) para el
embedding de IA de cada foto. El limitador que tenía antes vivía en memoria
adentro de la función serverless — no protegía nada de verdad, porque cada
cold start de Vercel arranca el contador en cero y las instancias
concurrentes no comparten memoria entre sí. Ahora hace el mismo
conteo+poda+insert pero en la base (función `check_embed_rate_limit`,
máximo 12 pedidos por minuto por IP), igual que el rate limit de reportes
que ya armamos.

**Mientras no corras el paso de abajo:** el chequeo llama a una función que
todavía no existe en tu base, así que falla y se deja pasar el pedido sin
bloquear nada (a propósito — un problema de infra ajeno no debería tumbar la
función real). Ya lo probé así: sigue funcionando exactamente igual que
antes, solo que sin el rate limit activo todavía.

**⚠️ ACCIÓN REQUERIDA DE TU LADO — 1 paso:** el mismo de siempre:

1. Abrí el SQL Editor de tu proyecto Supabase.
2. Pegá y ejecutá todo `supabase/schema.sql` de nuevo (seguro re-correrlo
   completo).
3. Listo — no hace falta nada más.

---

## -2. Rate limiting de creación de reportes (2026-08-04) — requiere 1 paso tuyo

**Qué hace:** `supabase/schema.sql` ahora tiene un trigger
(`enforce_report_rate_limit`) que bloquea más de 8 reportes por hora desde
la misma IP (usando el header `x-forwarded-for` que PostgREST expone). Antes
cualquiera podía scriptear inserts ilimitados — la policy de RLS controla
quién puede insertar, no cuántos, y no había ningún otro límite.

**⚠️ ACCIÓN REQUERIDA DE TU LADO — 1 paso:** igual que con la policy de
borrado, no tengo acceso a tu SQL Editor para correrlo yo:

1. Abrí el SQL Editor de tu proyecto Supabase.
2. Pegá y ejecutá todo `supabase/schema.sql` de nuevo (seguro re-correrlo
   completo, usa `if not exists`/`drop ... if exists` en todos lados).
3. Listo — no hace falta reconfigurar nada más, el trigger queda activo
   solo.

**No pude probarlo end-to-end** (no tengo acceso a la base real para
publicar 9 reportes seguidos y confirmar el bloqueo) — la lógica está
revisada a mano pero conviene que la chequees vos una vez aplicada.

---

Este archivo lista todo lo que encontré durante la sesión autónoma que **no
puedo resolver yo mismo** porque necesita credenciales, acceso a una consola
externa, o una decisión de producto/negocio.

---

## -1. Activar el email de "posible coincidencia" (2026-07-31, secreto rotado el 2026-08-03)

**Qué hace:** cuando alguien publica un reporte nuevo, el servidor calcula
coincidencias con el mismo algoritmo que ya usa la app (color, forma de la
foto, zona/distancia) y le manda un email a los dueños de los reportes que
matchean con probabilidad media/alta (40%+), con un link directo a la
publicación nueva.

**⚠️ Incidente de seguridad ya corregido:** el primer secreto que generé
para este webhook quedó escrito literal en `schema.sql`, que está en el
repo **público** de GitHub — GitGuardian lo detectó y te avisó por mail.
Ese secreto ya no se usa: reescribí el trigger para que lea el valor desde
una variable de configuración de la base en vez de tenerlo escrito en un
archivo versionado, así no puede volver a pasar. Los pasos de abajo ya
usan el mecanismo nuevo — si ya habías hecho el Paso 1/2 antes, repetilos
con el secreto nuevo.

**Paso 1 — cuenta de Resend (gratis, ~2 min) — salteá si ya la creaste:**
1. Andá a [resend.com](https://resend.com) y creá una cuenta gratis (no pide
   tarjeta). El plan free da 3.000 emails/mes.
2. En el dashboard, generá una **API Key** con permiso **"Sending access"**
   (no "Full access").

**Paso 2 — variables en Vercel:**
1. Vercel → tu proyecto → Settings → Environment Variables:
   - `RESEND_API_KEY` = la key de Resend.
   - `NOTIFY_WEBHOOK_SECRET` = `29e162951637def7afc9bdaf0b0caa5e2ae4545c3f232a88`
     (nuevo secreto, generado ahora — el anterior queda inválido).
2. Redeploy.

**Paso 3 — configurar el secreto en Supabase (SQL Editor):**

`alter database ... set` no funciona desde el SQL Editor de Supabase (tira
"permission denied" — el rol que usa el editor no tiene ese permiso). En
su lugar se usa **Vault**, el mecanismo que Supabase da para esto mismo.
Pegá y ejecutá (con TU secreto, el mismo del paso 2 — este comando no se
guarda en ningún archivo del repo, corré esta única línea a mano):
```sql
select vault.create_secret('29e162951637def7afc9bdaf0b0caa5e2ae4545c3f232a88', 'notify_webhook_secret');
```
Si en algún momento necesitás cambiarlo de nuevo, no se puede volver a
crear con el mismo nombre — hay que borrar el anterior primero:
```sql
select vault.update_secret(id, '<secreto nuevo>') from vault.decrypted_secrets where name = 'notify_webhook_secret';
```
Después, volvé a pegar y correr todo `supabase/schema.sql` completo — ahí
está la versión nueva de la función `notify_new_report()`, que lee el
secreto desde Vault en vez de tenerlo escrito adentro.

**⚠️ Limitación de Resend sin dominio propio verificado:** hasta que
verifiques un dominio (agregando unos registros DNS), Resend en modo
sandbox **solo entrega emails a la casilla con la que creaste la cuenta**
(`santiagobarronlf@gmail.com`) — para otros destinatarios no va a llegar
nada, aunque el envío "funcione" del lado del código.

**Cómo probarlo:** publicá un reporte de prueba desde una cuenta logueada
con `santiagobarronlf@gmail.com` como `contacto_email` en un reporte
"opuesto" ya existente (ej. si publicás una "perdida", el reporte
"encontrada" con el que debería matchear tiene que tener esa casilla en su
contacto).

---

## 0. Borrar una publicación de prueba que quedó en la base real (2026-07-30)

**Qué pasó:** mientras diagnosticaba el bug de "no se puede publicar" (ver
más abajo, ya resuelto), probé el flujo completo contra la base de datos
real para reproducir el error exacto. Uno de esos reportes de prueba se
insertó con éxito, y cuando intenté borrarlo automáticamente el borrado
falló en silencio: como el reporte se creó sin usuario logueado
(`user_id = null`), la policy de RLS que protege el borrado
(`auth.uid() = user_id`) nunca puede dar verdadero para una fila así —
ni siquiera usando la key pública sin sesión. No es un bug nuevo, es una
limitación ya existente: **los reportes de invitado (sin login) no se
pueden borrar por este mecanismo, ni por mí ni por su autor.**

**Por qué no lo pude arreglar yo:** borrar esa fila requiere la clave
`service_role` de Supabase (que bypasea RLS) o hacerlo a mano desde el SQL
Editor — no tengo ninguna de las dos.

**Qué hay que borrar:** un reporte de mascota "Negro" (perro), apodo
`DiagBot`, zona "Zona de diagnostico", descripción "Prueba de diagnostico
automatizada, ignorar / borrar." — visible ahora mismo en Explorar.

**Cómo borrarlo (30 segundos):** en el SQL Editor de Supabase, ejecutá:

```sql
delete from storage.objects where name = 'diag-1785431328791.png' and bucket_id = 'felpus-photos';
delete from reports where id = 'diag-1785431328791';
```

---

## 1. Autocompletado de zona roto — falta habilitar "Places API (New)" en Google Cloud

**Estado actual (2026-07-30):** ya arreglaste el problema de la key
corrupta en Vercel (ver historial abajo) — el header `X-Goog-Api-Key` ahora
es válido y el request sí llega a Google. Pero al llegar, Google contesta
que la API todavía no está habilitada para este proyecto. Es el mismo
bloqueo original, solo que antes nunca llegábamos a verlo porque el
navegador rechazaba el pedido localmente por la key corrupta.

**Diagnóstico confirmado** (interceptando la llamada de red real):

```
<gmp-place-autocomplete>: Encountered a network request error:
Places API (New) has not been used in project 885118143352 before or
it is disabled. Enable it by visiting
https://console.developers.google.com/apis/api/places.googleapis.com/overview?project=885118143352
then retry. If you enabled this API recently, wait a few minutes for
the action to propagate to our systems and retry.
```

**⚠️ ACCIÓN REQUERIDA DE TU LADO — 1 paso:**

1. Entrá a [este link](https://console.developers.google.com/apis/api/places.googleapis.com/overview?project=885118143352)
   con la cuenta de Google Cloud correcta y tocá **"Habilitar"**.
2. Esperá unos minutos a que propague.
3. Probá de nuevo: Reportar → escribir "Palermo" en Zona → debería aparecer
   un desplegable con sugerencias reales.

**Riesgo:** ninguno — es gratis dentro de la cuota normal de Maps Platform,
misma facturación que ya tenés activa.

<details><summary>Historial de este diagnóstico (guiones y keys corruptas ya resueltos)</summary>

Antes de llegar a este punto se resolvieron, en orden, dos problemas
laterales que tapaban el diagnóstico real:

1. El CSP bloqueaba en silencio el dominio `places.googleapis.com` —
   resuelto (commit `[ID 001]`).
2. El `<title>` de la página tenía un guion largo "—" fuera de rango
   ISO-8859-1 — se corrigió por las dudas (commit `e2271d6`), aunque
   luego se confirmó que no era la causa real del bloqueo.
3. La key `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` guardada en Vercel tenía al
   menos un carácter fuera de ISO-8859-1 (probablemente un copy-paste
   sucio desde un editor que autocorrige guiones/comillas). Esto hacía
   que el navegador rechazara el header `X-Goog-Api-Key` del
   autocompletado ANTES de mandar el request — por eso el error real de
   Google (API deshabilitada) nunca aparecía. El mapa base seguía
   funcionando porque manda la key por URL, no por header, así que no
   había ninguna señal visible de que la key estuviera mal. Ya lo
   corregiste en Vercel y quedó confirmado (header ahora válido).

</details>

---

## 2. Ciclo de vida de datos sensibles tras marcar una mascota como "reencontrada" — ✅ RESUELTO

**Implementado:** se eligió la opción B. `resolveReports()` (`src/lib/store.js`)
ahora borra `contacto_whatsapp` y `contacto_email` en la misma fila que marca
`resuelto = true`, en la base (no solo en el cliente). El estado en memoria
(`FelpusMatcher.jsx`) también se sincroniza para no mostrar datos que ya no
existen del lado del servidor. Fotos y descripción se mantienen para el
"final feliz" en el contador de reencuentros.

**Acción requerida de tu lado:** ninguna, ya está en `main` y desplegado.

<details><summary>Descripción original</summary>

**Descripción:** hoy, cuando un reporte se marca como resuelto (`resuelto =

**Descripción:** hoy, cuando un reporte se marca como resuelto (`resuelto =
true`), las fotos y los datos de contacto (WhatsApp/email) del reporte
siguen guardados y accesibles públicamente igual que antes — no se anonimizan
ni se eliminan.

**Motivo del bloqueo:** es una decisión de producto/política de privacidad,
no un bug técnico. Cambiar este comportamiento sin confirmarlo podría borrar
información que alguien todavía necesita (por ejemplo, para contactar y
agradecer, o para casos de "reencuentro falso" que se descubren después).

**Opciones:**
- **A. Dejarlo como está** (más simple, cero riesgo técnico): los reportes
  resueltos quedan visibles con toda su info, marcados como "reencontrada".
- **B. Anonimizar automáticamente al resolver** (mi recomendación si les
  importa la privacidad por defecto): al marcar como resuelto, borrar
  `contacto_whatsapp` y `contacto_email` de la fila (las fotos y la
  descripción pueden quedar, ya que ayudan a mostrar el "final feliz" en el
  contador de reencuentros). Implementación acotada: un `UPDATE` extra en
  `resolveReports()` (`src/lib/store.js`).
- **C. Eliminar el reporte completo tras un plazo** (ej. 30 días después de
  resuelto) — requeriría un job programado (cron) que hoy no existe en el
  proyecto; es la opción de mayor esfuerzo.

**Recomendación técnica:** B es el mejor balance costo/beneficio.

</details>

---

## 3. Metadatos EXIF de ubicación GPS en las fotos subidas — ✅ RESUELTO (confirmado, no requiere acción)

**Descripción original:** si el navegador no despoja el EXIF antes de subir
la foto, podría contener la ubicación GPS exacta de dónde se sacó — más
precisa que la "zona" que la persona eligió a propósito mostrar.

**Confirmado durante esta sesión:** revisé el código exacto de
`resizeImageFile` (`src/lib/matching.js`, línea 234) — la imagen se dibuja
en un `<canvas>` (`ctx.drawImage(...)`) y se exporta con
`canvas.toDataURL("image/jpeg", 0.85)`. Esto **garantiza** que no queda
EXIF: un `<canvas>` solo contiene datos de píxeles crudos, sin ningún
concepto de metadata, y `toDataURL`/`toBlob` generan un archivo JPEG
completamente nuevo desde esos píxeles. Esto no es una particularidad de
algún navegador — es el comportamiento definido por la especificación del
Canvas API, universal en todos los motores (Chromium, Firefox, Safari). No
hace falta probarlo con una foto real: es imposible que sobreviva EXIF por
este camino, sin excepción.

**Acción requerida de tu lado:** ninguna. Este ítem queda cerrado.

---

## 4. Mecanismo de eliminación de reporte por pedido del usuario — ✅ IMPLEMENTADO, requiere 1 paso tuyo

**Implementado:** se usó la "recomendación mínima viable" original — un
botón "Eliminar publicación" en el detalle del reporte, visible solo para
el dueño (mismo chequeo de `user_id` que "marcar como reencontrada"), con
confirmación inline antes de borrar. Borra la fila de `reports` y sus fotos
de Storage; no toca los puntos ya ganados en `contributors`.

**⚠️ ACCIÓN REQUERIDA DE TU LADO — 1 paso:** agregué la policy de RLS
`reports_delete_owner` a `supabase/schema.sql`, pero **no la ejecuté** (no
tengo acceso a tu SQL Editor). Sin esa policy, Supabase deniega el borrado
por default aunque el botón funcione del lado del cliente. Pasos:

1. Abrí el SQL Editor de tu proyecto Supabase.
2. Pegá y ejecutá todo `supabase/schema.sql` de nuevo (es seguro re-correrlo
   completo — todas las sentencias usan `if not exists` / `drop policy if
   exists`, no borra datos existentes).
3. Listo — probá el botón "Eliminar publicación" en un reporte propio.

**Mientras tanto** (hasta que corras el paso de arriba), el botón va a
mostrar el error genérico "No pudimos eliminar la publicación."

---

## 5. Testing automatizado — ✅ PARCIALMENTE RESUELTO (unit tests), E2E sigue pendiente

**Implementado (2026-08-04):** se agregó Vitest (`npm test`) con 42 tests
unitarios para `src/lib/matching.js` — el algoritmo de scoring (qué tan
probable es que dos reportes sean la misma mascota), el sistema de niveles,
y los helpers de formato/texto. Es la lógica más crítica de la app y antes
no tenía ningún test. Corré `npm test` para verificar.

**Lo que sigue pendiente** (la descripción original, sin resolver): tests
end-to-end (Playwright/Cypress) que simulen un flujo completo en un
navegador real — "publicar un reporte", "confirmar un reencuentro" — y
auditoría de accesibilidad automatizada (axe-core). Es un proyecto en sí
mismo (elegir herramienta, configurar el runner, decidir qué flujos cubrir
primero) que no se abordó en esta sesión por el riesgo de dejarlo a medias.
