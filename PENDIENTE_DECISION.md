# Decisiones pendientes — requieren acción o información tuya

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
Pegá y ejecutá esto (con TU secreto, el mismo del paso 2 — este comando no
se guarda en ningún archivo del repo, corré esta única línea a mano):
```sql
alter database postgres set app.notify_webhook_secret = '29e162951637def7afc9bdaf0b0caa5e2ae4545c3f232a88';
```
Después, volvé a pegar y correr todo `supabase/schema.sql` completo — ahí
está la versión nueva de la función `notify_new_report()` que ya no tiene
ningún secreto escrito adentro, solo lee la variable que acabás de
configurar.

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

## 5. Testing automatizado (E2E / accesibilidad automatizada)

**Descripción:** el prompt de esta sesión pedía usar Playwright + axe-core
para capturas en 2 anchos y auditoría de accesibilidad automatizada de las
pantallas modificadas.

**Motivo del bloqueo:** el proyecto no tiene ninguna infraestructura de
testing hoy (`package.json` no tiene `test` script, no hay Playwright ni
Jest ni Vitest instalados). Instalar y configurar Playwright desde cero es
una tarea grande (agregar dependencias de testing, configurar el runner,
escribir specs iniciales) que excede lo que se puede hacer con criterio
dentro de esta sesión sin also arriesgar dejar el build roto por una mala
configuración. Ver `AUDITORIA.md` para el detalle de qué SÍ pude verificar
sin esa infraestructura (inspección de DOM real vía consola del navegador,
interceptando requests de red, revisando estilos computados).

**Recomendación:** si quieren testing automatizado real a futuro, es un
proyecto en sí mismo (elegir Playwright vs Cypress, definir qué flujos
cubrir primero — probablemente "publicar un reporte" y "confirmar un
reencuentro" por ser los más críticos). No lo empecé por el riesgo de
dejarlo a medias.
