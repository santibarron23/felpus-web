# Asistente Felpus (chat con IA)

Botón flotante "Asistente" en toda la app. Ayuda a:

1. **Armar un reporte conversando**: la persona cuenta lo que pasó con sus palabras, el asistente completa el borrador (sin inventar datos) y pregunta solo lo que falta. La vista previa es editable. Con "Revisar y publicar" todo pasa al formulario real, fotos incluidas. Ahí se publica con el botón "Publicar" de siempre. **El asistente nunca publica ni escribe en la base.**
2. **Buscar con lenguaje natural** ("¿encontraron algún caniche blanco por San Lorenzo?", "solo los de esta semana") sobre reportes reales activos, con tarjetas con foto que abren la ficha.
3. **Consultar coincidencias** con el motor de matching existente (`findMatches` / `matchBreakdown` de `src/lib/matching.js`, sin cambios). Se muestran etiquetas de probabilidad (alta/media/baja) en vez de porcentajes.
4. **Fotos en el chat**: se procesan una sola vez con las mismas funciones del formulario (`resizeImageFile` + `computeHistogram`). Una copia chica (640 px) va a Claude para sugerir rasgos, siempre como sugerencia a confirmar.
5. **Preguntas frecuentes sin IA** (costo cero) y **respuestas de respaldo** si la IA no está disponible o se superó el límite.
6. **Ayuda según la sección** (Reportar, Explorar, ficha abierta → "Explicame esta publicación").

## Archivos

| Archivo | Qué hace |
|---|---|
| `src/lib/chatbot.js` | Lógica pura: prompt, herramientas (`guardar_borrador`, `buscar_reportes`), validación de todo lo que llega del navegador o del modelo, borrador → formulario, matching y búsqueda, filtro de región |
| `src/lib/chatService.js` | Loop con Claude, ejecución de herramientas (solo lectura con la anon key), métricas de consumo |
| `src/app/api/chat/route.js` | Ruta HTTP: validación, límite por IP, errores |
| `src/lib/chatFaq.js` | Bienvenida, accesos rápidos, preguntas frecuentes y respuestas de respaldo |
| `src/components/felpus/FelpusAssistant.jsx` | Interfaz (botón + panel, vista previa editable, tarjetas, fotos) |
| `FelpusMatcher.jsx` / `PureViews.jsx` | Integración: `applyChatDraft` vuelca el borrador al formulario; botón opcional "Preguntale al Asistente" en la ficha |
| `supabase/schema.sql` | Nueva función `check_chat_rate_limit` (8 mensajes/minuto y 80/día por IP). Es aditiva |

## Configuración

- `ANTHROPIC_API_KEY` (**obligatoria para la IA**, secreta, solo en el servidor). Sin ella el asistente igual aparece, con preguntas frecuentes y accesos al formulario.
- `ANTHROPIC_WORKSPACE_ID` (solo si la clave no está asignada a un workspace de Anthropic; si falta, la API responde "This API key is not scoped to a workspace"). Empieza con `wrkspc_` y no es secreta.
- `ANTHROPIC_CHAT_MODEL` (opcional). Por defecto `claude-opus-5-5`. Para gastar menos: `claude-sonnet-5-5` o `claude-haiku-5-5`.
- Correr en Supabase (SQL Editor) el bloque `check_chat_rate_limit` del final de `schema.sql`. Mientras no se corra, se usa el límite de `/api/embed` como respaldo.
- Recomendado: poner un límite de gasto mensual en console.anthropic.com.

## Seguridad y costos

- La key nunca llega al navegador. El modelo solo tiene dos herramientas, ambas de lectura o de borrador local, con schema estricto y revalidación en el servidor.
- Los textos de otros reportes no se le pasan al modelo (posible inyección de instrucciones). No se exponen contactos ni coordenadas.
- Historial acotado (12 mensajes), esfuerzo `low`, caché de prompt, como máximo 3 rondas de herramientas por mensaje, fallback de servidor ante rechazos.
- Métricas: `chat_usage` en los logs de Vercel (tokens, costo estimado, herramientas, sin texto ni IP). Eventos `asistente_*` en GA4 (aperturas, mensajes, borradores, pase al formulario, reportes publicados desde el chat con su duración, búsquedas, coincidencias abiertas, errores).

## Pendiente / límites conocidos

- La "publicación" final pasa por el formulario porque ahí se cargan el contacto, el apodo y la ubicación en el mapa, con todas las validaciones existentes (invitado o cuenta Google, doble envío). No hay un segundo camino de publicación.
- El borrador del chat no tiene coordenadas. Si la zona es de Salta, los candidatos se acotan al Gran Salta (80 km).
- El chat se guarda en el navegador (localStorage), sin fotos.
