# Diagnóstico UX, confianza y privacidad — Felpus (2026-10-29)

Código revisado: `origin/main` en `c5e01c4` (PR #88). Rama de trabajo:
`ux-onboarding-confianza`. Tests al arrancar: 51 archivos, 817 pruebas, todas
en verde.

Leyenda: ✅ ya resuelto · 🟡 parcial · 🔴 falta · ⏸ no conviene ahora

## Resumen

Felpus ya tiene resuelto mucho de lo pedido: los tres caminos de reporte,
borrador automático, títulos sin colores como nombre, chequeo de fotos
(flyers/capturas), ubicación aproximada en pantalla, alertas por push y por
email, asistente virtual, sitemap, páginas por ciudad y vistas previas al
compartir. Lo que más falta para alguien poco tecnológico: **una guía para
la primera vez**, **ayuda en el momento justo dentro del formulario**, **una
pantalla de "¡Listo!" con qué hacer después** y **una página "Sobre
Felpus"**. En privacidad, el hallazgo principal es que **la API pública
devuelve las coordenadas exactas** aunque la pantalla muestre un punto
aproximado.

## Por fase

### Fase 1 — Onboarding

| Punto | Estado | Qué hay hoy |
|---|---|---|
| 1.1 Tarjeta "¿Primera vez?" | 🔴 | No existe. Hay una tarjeta "Cómo funciona" fija (3 pasos), que no se puede descartar. |
| 1.2 Tutorial de 3 pasos | 🔴 | No existe. |
| 1.3 Ayuda contextual | 🟡 | Hay textos de ayuda en foto y zona. Falta: "no necesitás la dirección exacta", "si no sabés el nombre dejalo vacío" (solo en "Encontré"), y **qué datos de contacto se muestran**. |
| 1.4 Botón de ayuda permanente | 🟡 | El asistente (`FelpusAssistant`) está siempre y ya tiene "Necesito ayuda" con preguntas frecuentes, pero no hay un acceso visible desde el formulario. |

### Fase 2 — Formularios

| Punto | Estado | Qué hay hoy |
|---|---|---|
| 2.1 Tres tipos de reporte | ✅ | "Perdí", "Encontré" y "Vi una mascota suelta" (hoja propia con foto opcional y hora). Cada uno con campos distintos. |
| 2.3 Títulos | 🟡 | `petTitle.js` ya evita mostrar colores como nombre ("Perra blanca, tamaño chico"). Falta: la ciudad en el título al compartir. El dueño **no puede editar** su reporte (solo el admin, `AdminEditReport`). |
| 2.4 Borrador | ✅ | `reportDraft.js`: se guarda en el dispositivo 24 h, sin fotos ni contacto. Publicar reintenta ante cortes de red. |

### Fase 4.2 — Fotos

| Punto | Estado |
|---|---|
| Vista previa, compresión (1000 px, JPEG 0,85), validación de tamaño (`MAX_FOTO_MB`) | ✅ |
| Orientación | ✅ los navegadores actuales aplican la rotación EXIF al dibujar en canvas |
| Flyers / capturas / ilustraciones | ✅ `photoCheck.js`, nunca bloquea |
| Foto demasiado oscura | 🔴 |
| Foto borrosa | ⏸ sin fotos reales para calibrar, avisaría de más. Se deja para cuando se pueda medir con las fotos de producción, como se hizo con `photoCheck`. |
| Recorte | ⏸ suma complejidad; la foto se muestra recortada en tarjetas igual |
| Botón "quitar foto" de 20 px | 🔴 por debajo del mínimo de WCAG 2.2 (24 px) |

### Fase 6 — Privacidad y seguridad

| Punto | Estado | Detalle |
|---|---|---|
| 6.1 Ubicación aproximada en pantalla | ✅ | `approxLocation.js`: ficha, mapa y link a Maps muestran un punto corrido 150–350 m. |
| 6.1 Coordenadas exactas en la API | 🔴 **Hallazgo** | `lat`/`lng` exactos se pueden leer con la clave pública (`reportColumns.js` + grant por columna). El corrimiento de pantalla se puede deshacer porque el algoritmo es público. Quien marca su casa queda expuesto. Ver "Decisión pendiente". |
| 6.2 RLS y datos personales | ✅ | Dos auditorías (23/10 y 26/10), SELECT por columna en `reports` y `contributors`, contacto solo vía `/api/report-contact` con rate limit, y `/api/health` prueba cada 30 min que la clave pública no lea contacto, tokens ni el bucket. |
| 6.2 Pendientes de esas auditorías | 🟡 | Según `REVISION_SEGURIDAD_2026-10-26.md`: B4 (desactivar registro con email/contraseña en Supabase) es manual. No pude verificar desde acá si se hizo. |
| 6.3 Consejos para contactar | 🔴 | No hay. |
| Zona en metadatos | 🟡 | El título al compartir usa el texto de "zona", que alguien podría llenar con su dirección. El formulario ya pide "no tu casa". |

### Fase 7 — Confirmación

🟡 Hoy dice "✓ Reporte publicado (+N huellitas)", muestra la tarjeta y las
coincidencias. Faltan: el mensaje claro "¡Listo!", las tres acciones (Ver mi
aviso / Compartir por WhatsApp / Volver al inicio) y qué pasa después.
Las alertas **sí existen** (push y email), así que se pueden explicar sin
prometer de más.

### Fase 8 — Sobre Felpus

🔴 No hay página. El email de contacto publicado es
`contacto.felpus@gmail.com` (en Términos). **No incluyo** la declaración de
interés de la Cámara de Diputados ni menciones en medios: no encontré en el
código ninguna fuente verificable (número de resolución o link). Si me la
pasás, se agrega.

### Fase 9 — Accesibilidad

🟡 Buena base: foco visible en casi todos los botones, `aria-live` en
estados, diálogos con trampa de foco y Escape, contraste auditado
(`theme.js`). Problemas puntuales: botones de foto de 20 px, el rótulo
"Fotos" no está asociado al campo, textos de 11 px en varias ayudas.

### Fase 10 — SEO

✅ Sitemap con reportes activos y ciudades, robots, canonical en `/r/<id>`,
`noindex` en reencontradas e inválidos, JSON-LD, imagen OG por reporte.
🟡 El sitemap incluye reportes ocultos por denuncias (la página ya responde
`noindex`, pero es una URL de más para Google). Página local de Salta ya
existe; no creo páginas nuevas por barrio porque serían repetitivas.

### Fase 11 — Alertas

✅ Ya existe: push por reporte y por zona, email con coincidencia muy
probable y recordatorio a los 30 días, configuración en
`/configuracion/alertas`, opt-in explícito. No lo toco.

### Fase 12 — Analítica

🔴 GA4 y Vercel Analytics están instalados, pero solo se mandan 2 eventos
(`avistamiento_publicado`, `asistente_reporte_publicado`). No se mide inicio
ni abandono del formulario, errores, compartidos ni contactos.

## Qué implemento en esta rama (por prioridad)

1. **Privacidad:** consejos para contactar en la ficha; aviso de qué datos
   de contacto se muestran; sitemap sin reportes ocultos.
2. **Formularios y fotos:** ayudas contextuales (foto, ubicación, nombre,
   contacto); aviso no bloqueante de foto muy oscura; botones de foto de
   tamaño accesible; acceso a "¿Necesitás ayuda?" desde el formulario.
3. **Onboarding:** tarjeta de primera vez (se descarta y no vuelve) +
   tutorial de 3 pasos accesible, también abrible desde el pie de página.
4. **Confirmación:** "¡Listo! Tu aviso ya está publicado." con las tres
   acciones y qué pasa después, según lo que de verdad está activo.
5. **Confianza:** página `/sobre` ("Sobre Felpus") enlazada en el pie.
6. **Analítica:** eventos sin datos personales para inicio, publicación,
   errores, tutorial, ayuda, compartir, contacto y reencuentros.

### Hecho en esta rama (verificado)

Todo lo de la lista anterior, más un bug de accesibilidad encontrado de
paso: el botón "Subir foto" era un `<label>` de un input oculto y **no se
podía usar con el teclado**. También: el título al compartir incluye la
ciudad ("… en Centro (Salta)"), el asistente sabe responder "¿Cómo contacto
de forma segura?", y si falla publicar el mensaje aclara que lo cargado
sigue ahí. "+N huellitas" en la confirmación solo se muestra con sesión
iniciada (a los invitados no se les suman).

Verificación: 53 archivos / 827 pruebas en verde (10 nuevas: `analytics`,
`photoQuality`), `next lint` y `next build` sin errores. En el navegador
(375 px): tarjeta de bienvenida, guía completa (pasos, Escape, se recuerda al
recargar, se reabre desde el pie), ayuda del formulario, consejos en la
ficha, página `/sobre` y la pantalla de confirmación. Eventos de analytics
comprobados interceptando `gtag`. **No se publicó ningún reporte real**
(`.env.local` apunta a producción): la confirmación se probó cargando un
reporte existente en memoria.

## Coordenadas exactas — en la rama `coordenadas-aproximadas`

Implementado como se propone abajo (migración `20261029_01`, código
compatible antes y después de correrla, prueba en la réplica local con
control negativo, y `/api/health` vigilando `lat` una vez migrado). Falta:
mergear, esperar el despliegue y **recién ahí** correr la migración.

## Propuesta original: coordenadas exactas

Propuesta: columnas `lat_aprox`/`lng_aprox` en `reports` (redondeadas a una
grilla de ~500 m, calculadas por la base), dar acceso público solo a esas y
quitar el acceso público a `lat`/`lng`. El matching del navegador perdería
hasta ~400 m de precisión (no cambia los resultados: la distancia de
referencia es de varios km); alertas y emails siguen usando las exactas del
lado del servidor. Requiere una migración que corrés vos y un despliegue en
dos pasos (primero el código que tolera las dos versiones, después la
migración), así que lo dejo para un PR aparte con tu OK.

## Lo que no se pudo verificar

- Estado real de producción de Supabase (qué migraciones están corridas,
  registro con email/contraseña). `/api/health` lo vigila cada 30 min.
- Lectores de pantalla reales (se verificó estructura ARIA y teclado en el
  navegador, no con NVDA/VoiceOver).
- Rendimiento móvil real (Lighthouse en el dispositivo).
