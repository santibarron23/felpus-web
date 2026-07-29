# Plan de implementación — sesión autónoma

Basado en `ANALISIS.md`. Orden de ejecución: 1 → 2 → 3 → (4 si alcanza).
Cada feature se implementa, se prueba de punta a punta en el navegador, y se
commitea antes de pasar a la siguiente.

## 1. Insignias/logros

**Modelo:** función pura `getBadges(contributor)` en `matching.js`, derivada
de campos que ya existen en `contributors` (`reportes`, `reencuentros`,
`hearts`, `points`) — sin tocar el esquema.

Insignias:
- 🐾 "Primera huella" — `reportes >= 1`
- 🧭 "Guía de barrio" — `reportes >= 5`
- 🎉 "Héroe del reencuentro" — `reencuentros >= 1`
- 💞 "Querido por la comunidad" — `hearts >= 5`
- 👑 "Leyenda Felpus" — `points >= 100` (espeja el nivel más alto ya
  existente, para que la insignia top también aparezca acá)

**UI:** fila de íconos pequeños debajo del nivel en cada card del ranking
(`Colaboradores`), y una sección "Tus insignias" en la tarjeta "Tu posición"
si el usuario está logueado.

**Archivos:** `src/lib/matching.js` (nueva función + export),
`src/components/FelpusMatcher.jsx` (uso en ranking).

**Prueba:** cargar Colaboradores, confirmar que las insignias coinciden con
los contadores reales de cada fila (ej. alguien con 2 reportes → solo
"Primera huella", no "Guía de barrio").

## 2. Radio de búsqueda dinámico según antigüedad

**Lógica:** en `scoreMatch`, el `locScore` por distancia hoy es
`Math.exp(-d/8)` fijo. Se ajusta el divisor ("radio de referencia") según
cuántos días pasaron desde el reporte **más viejo** del par — cuanto más
tiempo, más se tolera la distancia antes de penalizar:

```
diasTranscurridos = max(0, hoy - creadoEn_mas_viejo) en días
radioReferenciaKm = 8 + min(diasTranscurridos, 14) * 2   // hasta +28km en 2 semanas
locScore = exp(-d / radioReferenciaKm)
```

Tope en 14 días para no diluir la señal de ubicación indefinidamente.

**UI:** en el filtro de "Radio de distancia" del Explorar, agregar una nota
breve explicando que el radio efectivo del matching crece con el tiempo (no
hace falta que el usuario lo configure — es automático en el score, la nota
es solo para que no parezca un bug si un match lejano aparece con buen %).

**Archivos:** `src/lib/matching.js` (`scoreMatch`).

**Prueba:** con dos reportes de prueba a >8km de distancia, confirmar que el
score de imagen/texto se mantiene pero el score total sube si se simula una
fecha de creación más vieja (verificar con datos reales de la tabla, no hace
falta UI de test — se valida leyendo el resultado en "Ver posibles
coincidencias").

## 3. Notificaciones en la app ("campanita")

**Lógica cliente:** guardar en `localStorage` el timestamp de la última vez
que el usuario revisó sus propias coincidencias
(`felpus_last_seen_matches_<userId>`). En cada carga, para los reportes
propios activos (`userId === user.id && !resuelto`), calcular si hay algún
candidato con score ≥ `SCORE_MINIMO` cuyo `creadoEn` sea posterior al último
timestamp guardado → mostrar contador en un ícono de campana en la barra de
navegación o el header.

**UI:** ícono de campana con badge numérico en el header (visible solo si
logueado y hay novedades); al tocarlo, navega a Explorar/Detalle y actualiza
el timestamp guardado.

**Archivos:** `src/components/FelpusMatcher.jsx` (nuevo estado + efecto +
ícono en header).

**Prueba:** publicar un reporte de prueba tipo A, luego otro tipo B que
matchee con A, confirmar que el usuario dueño de A ve la campanita con
"1 novedad", que al abrir se resetea.

## 4. Flyer/póster imprimible (si alcanza el tiempo)

**Lógica:** botón "Generar flyer" en el detalle del reporte → dibuja en
`<canvas>` una composición simple (foto, "PERDIDA/ENCONTRADA", nombre,
color/tamaño, zona, contacto) y ofrece descargarla como imagen o abrir el
diálogo de impresión del navegador.

**Archivos:** nuevo componente `src/components/Flyer.jsx` (o función
utilitaria), botón en `DetailModal`.

**Prueba:** generar un flyer de un reporte real, confirmar que el archivo
descargado tiene todos los datos legibles.

## Fuera de alcance por ahora

Ver `ANALISIS.md` puntos 5 (reportes de avistamiento) y 6 (aprendizaje
continuo) — quedan documentados pero no se empiezan hoy.
