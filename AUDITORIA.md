# Auditoría — sesión autónoma (rama `mejoras-automaticas-felpus`)

Fecha: 2026-07-30. Realizada sobre el estado de `main` al momento de crear la
rama (incluye todo el trabajo de la tarde: streak, skeletons, bottom sheet de
filtros, metadata social, autocompletado de zona con la API nueva de Places,
etc. — ver `git log main` para el detalle de esos commits, ya en producción).

**Stack detectado:** Next.js 14.2.5 (App Router), React 18, Tailwind CSS,
Supabase (Postgres + Auth + Storage), sin TypeScript (JS/JSX puro). Sin
backend propio más allá de una única API route (`/api/embed`, proxy a
Hugging Face). Sin infraestructura de testing (no hay Jest/Vitest/Playwright,
no hay `test` script en `package.json`). Sin ESLint configurado (`next lint`
pide setup interactivo — nunca se corrió).

---

## Hallazgos

### AUD-001 — Build local roto (P0, seguridad: no, corregido)
- **Categoría:** Errores que impiden usar el producto / calidad de build.
- **Severidad:** Crítica.
- **Descripción:** `npm run build` fallaba siempre en este entorno con
  `TypeError: Invalid URL` al pre-renderizar `/opengraph-image`. La causa es
  que `next/og` (usado por el archivo especial `opengraph-image.jsx`) intenta
  resolver una ruta de archivo interna a su fuente por defecto en el momento
  de IMPORTAR el módulo — antes de que corra código propio — y esa
  resolución rompe en cualquier proyecto cuya carpeta tenga espacios o
  paréntesis en la ruta (como esta: `felpus-web (1)`).
- **Archivo:** `src/app/opengraph-image.jsx` (eliminado).
- **Impacto:** nadie podía correr `npm run build` en este entorno — bloqueaba
  cualquier verificación de producción local, y motivo real por el que el
  prompt de esta sesión pedía "ejecutá build" como paso obligatorio.
- **Solución implementada:** reemplazar la generación dinámica por un PNG
  estático (`public/og-image.png`, descargado de la versión ya desplegada en
  producción — Vercel corre en Linux, no tiene este problema de rutas) y
  referenciarlo desde `metadata.openGraph.images` / `metadata.twitter.images`
  en `layout.js`.
- **Riesgo de la solución:** bajo. Mismo resultado visual, una dependencia
  menos en tiempo de build, sin regeneración por request.
- **Verificación:** `npm run build` ahora compila y prerrenderiza las 8
  páginas sin errores. Commit `[ID 000]`.

### AUD-002 — CSP bloqueaba en silencio el autocompletado de zona (P0, seguridad: sí, corregido)
- **Categoría:** Flujo principal roto / configuración de seguridad.
- **Severidad:** Alta.
- **Descripción:** el campo "Zona / barrio" del formulario de Reportar usa
  `PlaceAutocompleteElement` (API nueva de Google Places), que hace sus
  pedidos de red a `places.googleapis.com` — un dominio DISTINTO de
  `maps.googleapis.com`. El `Content-Security-Policy` del sitio
  (`next.config.mjs`) solo permitía `maps.googleapis.com` en `connect-src`,
  así que el navegador bloqueaba esos pedidos antes de que salieran de la
  pestaña. El síntoma en consola era un genérico "Rpc failed due to xhr
  error" sin ningún mensaje de CSP explícito — muy difícil de diagnosticar
  sin interceptar manualmente `XMLHttpRequest`.
- **Archivo:** `next.config.mjs`.
- **Impacto:** el autocompletado de sugerencias nunca podía funcionar,
  independientemente de cualquier otra configuración de Google Cloud.
- **Solución implementada:** agregar `https://places.googleapis.com` a
  `connect-src` en la CSP.
- **Riesgo:** ninguno — solo amplía el allowlist de red a un dominio de
  Google ya de por sí confiable (mismo proveedor que el resto de Maps).
- **Verificación:** interceptando `XMLHttpRequest` manualmente, el pedido a
  `AutocompletePlaces` ahora sale de la pestaña y Google responde (ver
  AUD-003 para el resto de la cadena). Commit `[ID 001]`.

### AUD-003 — "Places API (New)" no habilitada en Google Cloud (P1, bloqueado — ver PENDIENTE_DECISION.md)
- **Categoría:** Flujo principal parcialmente roto.
- **Severidad:** Media (hay alternativas funcionales: escribir a mano, botón
  "Ubicación", tocar el pin del mapa).
- **Descripción:** una vez resuelto AUD-002, el pedido de red llega a Google
  pero responde 403 con el mensaje: *"Places API (New) has not been used in
  project 885118143352 before or it is disabled."*
- **Impacto:** el desplegable de sugerencias de zona no aparece nunca.
- **Solución propuesta:** habilitar la API en
  `https://console.developers.google.com/apis/api/places.googleapis.com/overview?project=885118143352`.
  Requiere acceso a la consola de Google Cloud — no lo puedo hacer yo. Ver
  `PENDIENTE_DECISION.md` #1.
- **Riesgo de implementación:** ninguno (habilitar la API es gratis, se
  factura por uso dentro de la misma cuenta de Maps Platform ya activa).

### AUD-004 — Mapa se veía "cortado" por no re-medirse tras un layout shift (P1, corregido)
- **Categoría:** Experiencia móvil / bug visual.
- **Severidad:** Alta (capturas de pantalla del usuario mostraban el mapa con
  una mitad en gris sólido).
- **Descripción:** `MapPicker` y `ReportsMap` inicializan
  `new google.maps.Map(container, {...})` una sola vez, midiendo el tamaño
  del contenedor en ese momento. Si el contenedor cambia de tamaño después
  (por ejemplo, por el layout shift del campo de zona al pasar de input
  plano a `PlaceAutocompleteElement`), Google Maps no se entera solo — el
  mapa queda pintado para el tamaño viejo.
- **Archivos:** `src/components/MapPicker.jsx`, `src/components/ReportsMap.jsx`,
  `src/lib/googleMaps.js`.
- **Solución implementada:** `observeMapResize()` — un `ResizeObserver`
  compartido que dispara `google.maps.event.trigger(map, 'resize')` y
  re-centra el mapa cada vez que su contenedor cambia de tamaño, con cleanup
  correcto al desmontar.
- **Riesgo:** bajo — es aditivo, no cambia ningún comportamiento existente
  cuando el contenedor NO cambia de tamaño.
- **Verificación:** recarga completa de la página sin errores nuevos en
  consola; el patrón de fix es el documentado oficialmente por Google para
  este tipo de problema. Commit `[ID 002]`.

### AUD-005 — Etiquetas del formulario sin asociar a sus campos (P1, corregido)
- **Categoría:** Accesibilidad (WCAG 1.3.1 / 3.3.2).
- **Severidad:** Alta — afecta el flujo más importante de la app (publicar
  un reporte) para cualquier persona que use lector de pantalla.
- **Descripción:** 12 de 13 `<label>` del formulario de Reportar no tenían
  `htmlFor` apuntando al `id` de su control. Un lector de pantalla anuncia
  "combo box" o "editable text" sin ningún nombre al enfocar el campo.
- **Archivo:** `src/components/FelpusMatcher.jsx`, `src/components/ZonaAutocomplete.jsx`.
- **Solución implementada:** pares `id`/`htmlFor` en Especie, Tamaño, Sexo,
  Nombre, Color, "Describí el color", Edad, Peso, Zona, Fecha, Descripción.
  El grupo de Contacto (dos inputs bajo una etiqueta) usa `aria-label`
  individual. El campo de Zona también recibe `aria-label` directo en el
  elemento de Google para cuando reemplaza al input plano.
- **Riesgo:** ninguno — cambio puramente aditivo de atributos HTML.
- **Verificación:** script en consola confirmando que 10/13 labels resuelven
  ahora un control real vía `document.getElementById(label.htmlFor)`; las 3
  restantes usan `aria-label` a propósito. Commit `[ID 003]`.

### AUD-006 — Sin infraestructura de testing (P2, documentado, no implementado)
- **Categoría:** Calidad y mantenibilidad.
- **Descripción:** no hay Jest/Vitest/Playwright, no hay `test` script. El
  prompt de esta sesión pedía capturas Playwright + axe-core — no viable
  instalar y configurar todo eso de cero sin riesgo de dejarlo a medias.
  Ver `PENDIENTE_DECISION.md` #5.

### AUD-007 — Sin ESLint configurado (P2, documentado, no implementado)
- **Categoría:** Calidad y mantenibilidad.
- **Descripción:** `next lint` pide un setup interactivo la primera vez
  (nunca se corrió). No lo configuré automáticamente para no instalar
  dependencias nuevas sin necesidad clara dentro de esta sesión — el código
  se revisó igual manualmente (grep dirigido + lectura de los flujos
  críticos) en lugar de depender de lint.

### AUD-008 — Datos de contacto no se anonimizan al resolver un reporte (P2, decisión de producto — ver PENDIENTE_DECISION.md #2)

### AUD-009 — Sin mecanismo de auto-eliminación de reporte (P2, decisión de producto — ver PENDIENTE_DECISION.md #4)

---

## Verificaciones ya confirmadas como sólidas (sin cambios necesarios)

Revisado y confirmado en buen estado, sin necesidad de tocar nada:

- **Seguridad de escritura de datos:** RLS en Supabase restringe `UPDATE` de
  `reports`/`contributors` al dueño real (`auth.uid()`); puntos y
  reencuentros no se pueden falsificar llamando directo a la API REST.
  `send_heart` es la única excepción (RPC `security definer` acotada a un
  solo campo, con chequeo de sesión).
- **Rate limiting:** `/api/embed` tiene límite de 12 req/min por IP y valida
  tamaño/formato de imagen antes de reenviar a Hugging Face.
- **Sin secretos expuestos:** `.env.local` nunca se commiteó (confirmado con
  `git log --all` sobre esos paths); `.env.local.example` solo tiene
  placeholders.
- **Sin `dangerouslySetInnerHTML`** en toda la base de código — cero
  superficie de XSS vía HTML crudo.
- **`alt` en todas las imágenes** (`grep <img` en todo `src/`) — decorativas
  con `alt=""`, informativas con texto real.
- **Bundle inicial:** 191 kB First Load JS en `/` — dentro del objetivo de
  <200 kB del prompt.
- **CSP, headers de seguridad, HSTS, X-Frame-Options, etc.** ya configurados
  de una sesión anterior — se revisaron y siguen vigentes (con el agregado
  de AUD-002).

## Limitaciones de esta auditoría

No se pudo usar Playwright/axe-core (no instalados, ver AUD-006). La
verificación visual de UI se hizo con una combinación de: lectura de código,
inspección de DOM real vía consola del navegador (`document.querySelector`,
`getComputedStyle`, intercepción de `fetch`/`XMLHttpRequest`), y recarga de
página con revisión de consola — sin capturas de pantalla automatizadas
comparables a Playwright (la herramienta de captura de pantalla del entorno
tuvo fallas intermitentes de renderizado durante la sesión, documentadas en
el detalle de cada hallazgo donde fue relevante).
