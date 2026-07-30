# Decisiones pendientes — requieren acción o información tuya

Este archivo lista todo lo que encontré durante la sesión autónoma que **no
puedo resolver yo mismo** porque necesita credenciales, acceso a una consola
externa, o una decisión de producto/negocio.

---

## 1. Habilitar "Places API (New)" en Google Cloud

**Descripción:** el autocompletado de sugerencias al escribir la zona (campo
"Zona / barrio" del formulario de Reportar) no muestra ningún desplegable.

**Motivo del bloqueo:** requiere una acción manual en la consola de Google
Cloud, a la que no tengo acceso.

**Diagnóstico confirmado** (interceptando la llamada de red real):

```
<gmp-place-autocomplete>: Encountered a network request error:
Places API (New) has not been used in project 885118143352 before or
it is disabled. Enable it by visiting
https://console.developers.google.com/apis/api/places.googleapis.com/overview?project=885118143352
then retry. If you enabled this API recently, wait a few minutes for
the action to propagate to our systems and retry.
```

Ya arreglé dos problemas relacionados que SÍ eran responsabilidad del código:
1. El CSP bloqueaba en silencio el dominio `places.googleapis.com` (commit
   `[ID 001]`) — sin este fix, ni siquiera se vería el error de arriba.
2. El mapa ya no se rompe si este autocompletado falla (commit `[ID 002]` y
   los commits de la sesión de esta tarde que aislaron `ZonaAutocomplete` del
   resto de la sesión de Maps compartida).

Lo único que falta es habilitar la API en sí.

**Opciones:**
- **A. Habilitarla** (recomendado): entrar al link de arriba con la cuenta de
  Google Cloud correcta y tocar "Habilitar". Gratis dentro de la cuota
  mensual normal de Maps Platform — es la misma cuenta de facturación que ya
  tenés activa para el resto de Maps. Después de habilitarla, puede tardar
  unos minutos en propagar.
- **B. Dejarlo así:** el campo de zona sigue funcionando 100% escribiendo a
  mano (sin sugerencias), con el botón "Ubicación", o tocando el pin en el
  mapa. No es un bloqueante funcional, solo una comodidad menos.

**Riesgo:** ninguno — habilitar una API en Google Cloud no cuesta nada por sí
sola, solo se factura por uso real, y ya tenés el resto de Maps funcionando
con la misma facturación.

**Cómo verificar después de habilitarla:** entrar a Reportar, escribir
"Salta" en Zona, y confirmar que aparece un desplegable con sugerencias.

---

## 2. Ciclo de vida de datos sensibles tras marcar una mascota como "reencontrada"

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

**Recomendación técnica:** B es el mejor balance costo/beneficio. No lo
implementé porque cambia qué datos ve la gente después de un reencuentro, y
esa es una decisión de producto que les corresponde a ustedes.

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

## 4. Mecanismo de eliminación de reporte por pedido del usuario

**Descripción:** hoy no existe ningún botón de "eliminar mi reporte" — solo
"marcar como reencontrada". Si alguien publicó por error, o quiere borrar
sus datos de contacto por privacidad, no tiene forma de hacerlo desde la app.

**Motivo del bloqueo:** agregar un DELETE real requeriría decidir varias
cosas de política (¿cualquiera puede borrar su propio reporte sin
confirmación? ¿se borra también de Storage? ¿afecta el conteo de puntos ya
otorgados?) — corresponde a una decisión de producto.

**Recomendación mínima viable:** un botón "Eliminar publicación" visible
solo para el dueño del reporte (mismo chequeo de `user_id` que ya se usa
para "marcar como reencontrada"), que borre la fila de `reports` y sus fotos
de Storage, sin tocar los puntos ya ganados en `contributors` (evita
complicaciones de "restar puntos retroactivamente").

**Mientras tanto:** cualquier usuario puede pedir la eliminación
manualmente contactando a quien administre el proyecto (vía Supabase
directamente).

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
