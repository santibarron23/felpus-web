# Plan — sesión autónoma (rama `mejoras-automaticas-felpus`)

Basado en `AUDITORIA.md`. Backlog ordenado por prioridad P0 → P3.

---

### [ID 000] Arreglar build local roto por opengraph-image dinámico
- **Prioridad:** P0
- **Impacto esperado:** desbloquea `npm run build` y toda verificación local.
- **Archivos:** `src/app/opengraph-image.jsx` (eliminado), `src/app/layout.js`, `public/og-image.png` (nuevo).
- **Riesgo:** bajo.
- **Criterio de aceptación:** `npm run build` termina sin errores.
- **Prueba:** build local + comparación visual del PNG contra la versión ya verificada en producción.
- **Estado:** ✅ Hecho (commit `992e09f`).

### [ID 001] Agregar places.googleapis.com al CSP
- **Prioridad:** P0
- **Impacto esperado:** desbloquea el autocompletado de zona a nivel de red (condición necesaria, no suficiente — ver ID 999).
- **Archivos:** `next.config.mjs`.
- **Riesgo:** ninguno.
- **Criterio de aceptación:** el pedido XHR a `AutocompletePlaces` sale de la pestaña (no lo bloquea el navegador).
- **Prueba:** intercepción manual de `XMLHttpRequest` en consola, antes/después del fix.
- **Estado:** ✅ Hecho (commit `ec02ba9`).

### [ID 002] Arreglar mapa "cortado" por no re-medirse al cambiar tamaño
- **Prioridad:** P1
- **Impacto esperado:** elimina un bug visual real reportado con capturas (mapa mitad gris) en el flujo de publicar reporte.
- **Archivos:** `src/lib/googleMaps.js`, `src/components/MapPicker.jsx`, `src/components/ReportsMap.jsx`.
- **Riesgo:** bajo (aditivo).
- **Criterio de aceptación:** el mapa se repinta correctamente si su contenedor cambia de tamaño después de inicializado.
- **Prueba:** recarga completa + revisión de consola sin errores nuevos; patrón de fix documentado oficialmente por Google.
- **Estado:** ✅ Hecho (commit `1448167`).

### [ID 003] Asociar labels del formulario de Reportar con sus campos
- **Prioridad:** P1
- **Impacto esperado:** accesibilidad real del flujo más importante de la app para usuarios de lector de pantalla.
- **Archivos:** `src/components/FelpusMatcher.jsx`, `src/components/ZonaAutocomplete.jsx`.
- **Riesgo:** ninguno (solo atributos HTML).
- **Criterio de aceptación:** `label.htmlFor` resuelve un control real vía `getElementById`, o el control tiene `aria-label` equivalente.
- **Prueba:** script de verificación en consola sobre las 13 labels del formulario.
- **Estado:** ✅ Hecho (commit `3dc9432`).

### [ID 999] Habilitar "Places API (New)" en Google Cloud
- **Prioridad:** P1
- **Impacto esperado:** completa el autocompletado de sugerencias de zona.
- **Archivos:** ninguno (configuración externa).
- **Riesgo:** ninguno.
- **Criterio de aceptación:** al escribir "Salta" en Zona, aparece un desplegable con sugerencias.
- **Prueba:** manual, después de habilitar la API.
- **Estado:** 🔒 Bloqueado — requiere acceso a Google Cloud Console. Ver `PENDIENTE_DECISION.md` #1.

### [ID 004] Anonimizar datos de contacto al marcar un reporte como reencontrado
- **Prioridad:** P2
- **Impacto esperado:** mejora la privacidad por defecto sin afectar la funcionalidad de "reencuentros felices".
- **Archivos:** `src/lib/store.js` (`resolveReports`).
- **Riesgo:** medio — cambia qué datos ve la gente después de un reencuentro; requiere confirmación de producto.
- **Criterio de aceptación:** (a definir tras la decisión).
- **Estado:** 🔒 Bloqueado — decisión de producto. Ver `PENDIENTE_DECISION.md` #2.

### [ID 005] Confirmar que las fotos subidas no conservan EXIF de ubicación GPS
- **Prioridad:** P2
- **Impacto esperado:** privacidad — evitar exponer ubicación más precisa de la que la persona eligió compartir.
- **Archivos:** `src/lib/matching.js` (`resizeImageFile`), a confirmar.
- **Riesgo:** bajo si hace falta ajustar (el pipeline actual ya pasa por `<canvas>`, que normalmente descarta EXIF).
- **Estado:** 🔒 Pendiente de verificación manual con una foto real. Ver `PENDIENTE_DECISION.md` #3.

### [ID 006] Botón de "eliminar mi publicación"
- **Prioridad:** P2
- **Impacto esperado:** control real del usuario sobre sus propios datos.
- **Archivos:** `src/components/FelpusMatcher.jsx`, `src/lib/store.js`, posible policy nueva de `DELETE` en `schema.sql`.
- **Riesgo:** medio — requiere decidir política antes de implementar.
- **Estado:** 🔒 Bloqueado — decisión de producto. Ver `PENDIENTE_DECISION.md` #4.

### [ID 007] Configurar ESLint
- **Prioridad:** P2
- **Impacto esperado:** detección automática de errores comunes en cada cambio futuro.
- **Archivos:** nuevo `.eslintrc.json` + `eslint` + `eslint-config-next` como devDependencies.
- **Riesgo:** bajo, pero implica agregar dependencias — no lo hice esta sesión para no ampliar el alcance sin necesidad clara (ver AUD-007). Queda documentado como mejora futura concreta, no ambigua.
- **Estado:** ⏸ No iniciado — P2, fuera del foco de esta sesión.

### [ID 008] Testing automatizado (Playwright + axe-core)
- **Prioridad:** P3
- **Impacto esperado:** cobertura real de regresiones en los flujos críticos.
- **Riesgo:** alto esfuerzo de configuración inicial — proyecto en sí mismo.
- **Estado:** ⏸ No iniciado — P3. Ver `PENDIENTE_DECISION.md` #5.

---

## Resumen de estado

- **P0 (2):** ambos resueltos.
- **P1 (3):** 2 resueltos, 1 bloqueado por acceso externo (no técnico).
- **P2 (4):** documentados con recomendación técnica clara; 3 requieren
  decisión de producto, 1 (ESLint) es puro trabajo técnico futuro.
- **P3 (1):** documentado, fuera de alcance de esta sesión.

No quedan P0 ni P1 abiertos que dependan solo de código — todo lo que falta
depende de una acción externa (Google Cloud) o de una decisión de producto
que no me corresponde tomar sola.
