# Decisiones pendientes — requieren acción o información tuya

Este archivo lista todo lo que encontré durante la sesión autónoma que **no
puedo resolver yo mismo** porque necesita credenciales, acceso a una consola
externa, o una decisión de producto/negocio.

---

## 1. Autocompletado de zona roto — causa real: la API key en Vercel está corrupta

**Estado:** la Places API (New) que estaba deshabilitada YA SE HABILITÓ (ya
no aparece ese error). Pero apareció un segundo problema, distinto, que
también bloquea el autocompletado: la key guardada en Vercel no es idéntica
a la que genera Google Cloud.

**Diagnóstico confirmado (2026-07-30):** interceptando el request real del
navegador, el error que tira la consola cambió de:

```
Places API (New) has not been used in project 885118143352...
```

a este otro, distinto:

```
<gmp-place-autocomplete>: Encountered a network request error:
Failed to execute 'setRequestHeader' on 'XMLHttpRequest': String contains
non ISO-8859-1 code point.
```

Investigué a fondo (parcheando `XMLHttpRequest.setRequestHeader` para ver
exactamente qué header falla, sin exponer el valor de la key en ningún
momento) y confirmé: el header `X-Goog-Api-Key` — que se arma directamente
con el valor de `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` en Vercel — tiene 39
caracteres (el largo normal de una key de Google) pero **al menos uno de
esos caracteres no es texto ASCII/Latin-1 puro**. Es decir: la key guardada
en Vercel no es un copy-paste limpio de la key real — en algún momento se
coló un carácter "raro" (común cuando se pega un texto desde Word, Notion,
Slack u otro editor que autocorrige guiones/comillas a versiones
tipográficas, por ejemplo "-" → "–").

**Por qué el mapa en sí funciona bien pero el autocompletado no:** el mapa
base (`MapPicker`, `ReportsMap`) manda la key como parámetro de la URL del
script de Google — el navegador codifica automáticamente cualquier
carácter raro ahí, así que "funciona" aunque la key tenga basura. El
autocompletado nuevo (`PlaceAutocompleteElement`) manda la MISMA key como
un header HTTP crudo (`X-Goog-Api-Key`), y ahí el navegador exige texto
ISO-8859-1 puro — por eso explota justo en esta única función.

Ya descarté que el problema fuera el CSP (commit `[ID 001]`, ya resuelto) o
el guion largo del `<title>` de la página (lo arreglé igual, por las dudas,
commit `e2271d6`, pero confirmé que no era la causa real).

**⚠️ ACCIÓN REQUERIDA DE TU LADO — no tengo acceso a tu dashboard de
Vercel:**

1. Entrá a [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
   y ubicá la key de Maps. Copiala con el botón de copiar que aparece al
   lado del campo (el ícono de portapapeles), **no** selecciones el texto a
   mano — así evitás que se cuele algún carácter invisible.
2. Andá a tu proyecto en Vercel → **Settings → Environment Variables**,
   editá `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, borrá el valor actual por
   completo y pegá el que acabás de copiar.
3. Guardá y volvé a desplegar (Vercel suele ofrecer "Redeploy" apenas
   guardás la variable; si no, hacé un redeploy manual desde la pestaña
   Deployments).

**Cómo verificar después:** entrar a Reportar, escribir "Palermo" en Zona,
y confirmar que aparece un desplegable con sugerencias reales (no solo el
input de texto plano).

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
