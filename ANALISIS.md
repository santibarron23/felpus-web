# Análisis competitivo — Felpus vs. apps exitosas del rubro

Fuente: `Comparativa_apps_busqueda_mascotas_Felpus.docx` (PawBoost, Petco Love
Lost, PetRadar, Finding Rover, Pet FBI, Nextdoor) + relevamiento completo del
código actual de Felpus (`src/components/FelpusMatcher.jsx`, `src/lib/*.js`,
`supabase/schema.sql`).

## Qué hace exitosas a esas apps (resumen)

| App | Por qué funciona |
|---|---|
| **PawBoost** | Comunidad masiva + difusión automática (Facebook, flyers imprimibles) + mensajería propia. El alcance es lo que resuelve casos, no la tecnología. |
| **Petco Love Lost** | IA de comparación de fotos + integración con miles de refugios reales (dato institucional, no solo P2P). |
| **PetRadar** | Alertas geolocalizadas — te avisa activamente en vez de esperar que vuelvas a mirar. |
| **Finding Rover** | Reconocimiento facial específico de perros — muy preciso pero de nicho (sin mapa, sin refugios, sin redes). |
| **Pet FBI** | Base de datos histórica nacional — persistencia y alcance geográfico amplio, cero fricción de uso (solo publicar/buscar). |
| **Nextdoor** | Alcance **hiperlocal** — el vecino que ve el flyer y comenta "lo vi hace 10 min en tal calle" es lo que más recupera mascotas en la práctica. |

Patrón común: **ninguna gana por un solo feature "mágico"** — ganan por
combinar (a) que la mascota se pueda *encontrar* fácil (mapa, alertas, IA de
fotos) y (b) que la gente **vuelva y participe** (alertas, difusión,
comunidad). Felpus ya cubre bien el punto (a) para P2P; el punto (b) —
"volver, difundir, participar" — es donde hay más brecha.

## Estado actual de Felpus (resumen del código)

Ya tiene, y con buena profundidad:
- Matching multi-señal (imagen IA opcional + histograma color, campos
  estructurados con similitud ordinal, texto libre, ubicación/zona) con pesos
  adaptativos según qué señales están disponibles (`src/lib/matching.js`).
- Mapa de búsqueda con pines reales (`ReportsMap.jsx`), mapa de carga de
  ubicación con confirmación (`MapPicker.jsx`).
- Login con Google + RLS real en Supabase (reportes solo editables por su
  dueño, puntos protegidos, función RPC atómica para corazones).
- Gamificación base: puntos, niveles (Vecino atento → Leyenda Felpus),
  corazones entre colaboradores, posición en el ranking.
- Contacto directo (WhatsApp/email) por reporte.
- Compartir a WhatsApp/Facebook/X/copiar enlace.
- Mascota guía (Felpi), estados vacíos ilustrados, sonidos, microinteracciones.

Lo que **no** tiene todavía, y que sí aparece en la comparativa:
- Ningún tipo de alerta/notificación — hay que volver a abrir la app para
  enterarte de una coincidencia nueva.
- Ningún radio de búsqueda que se adapte al tiempo transcurrido (el radio de
  filtro es fijo: 2/5/10/25km, elegido a mano).
- Sin insignias/logros más allá del nivel por puntos (la comparativa pide
  explícitamente "niveles, XP e insignias" — Felpus tiene niveles pero no
  insignias puntuales).
- Sin flyer/póster imprimible (PawBoost lo usa mucho — la recuperación
  offline, boca a boca y cartel en el barrio, sigue siendo real).
- Sin mensajería interna (mitigado: Felpus ya resuelve esto mejor y más
  simple con contacto directo WhatsApp/email, no hace falta replicarlo).
- Sin reportes de "avistamiento" (alguien vio a la mascota pero no la tiene) —
  PawBoost lo tiene, Felpus solo tiene perdida/encontrada binario.
- Sin aprendizaje continuo del algoritmo de matching con casos confirmados —
  variante ambiciosa de "IA fotos", requeriría volumen de datos que hoy no
  existe (~15 reportes en la base).

## Features priorizadas por impacto potencial

Ordenadas de mayor a menor impacto esperado, con el motivo y qué tan bien
encajan en la base de código actual (menor esfuerzo = encaja mejor).

### 1. Insignias/logros concretos (además de los niveles)
**Por qué importa:** es el pedido explícito de la comparativa
("gamificación con niveles, XP e insignias") y el usuario ya lo había pedido
antes en esta misma sesión — quedó a mitad de camino por interrupciones.
Insignias puntuales (vs. un nivel genérico) dan una sensación de logro mucho
más frecuente e inmediata, que es justo lo que hace "pegajosas" a las apps
tipo Duolingo. Encaja directo con el objetivo ya definido de gamificación:
"empujar publicar completo, revisar seguido, colaborar, compartir".
**Encaje:** Muy alto — `contributors` ya tiene `reportes`, `reencuentros`,
`hearts`, `points`; las insignias se derivan de esos campos sin tocar el
esquema. Bajo riesgo, alto impacto visible.

### 2. Radio de búsqueda dinámico según días transcurridos
**Por qué importa:** está nombrado explícitamente como oportunidad en la
comparativa, y tiene lógica real detrás: una mascota perdida hace 5 días
pudo haberse alejado mucho más que una perdida hace 2 horas. Hoy Felpus
penaliza por distancia con una curva fija (`Math.exp(-d/8)`) sin importar
cuánto tiempo pasó — un match real a 3km puede quedar subvalorado si la
mascota se perdió hace una semana.
**Encaje:** Alto — es un cambio acotado en `scoreMatch` (una señal más:
antigüedad del reporte más viejo del par) más un ajuste de copy en la UI
para explicar el radio sugerido. No requiere schema nuevo.

### 3. Notificaciones en la app ("campanita" de coincidencias nuevas)
**Por qué importa:** es la brecha más grande frente a PawBoost/Petco/PetRadar
(las tres tienen alertas) y ataca directo el objetivo de "que la gente
vuelva todos los días". Una alerta por email/push real requeriría un
servicio externo nuevo (Resend/SendGrid, service worker de push) — no viable
"esta noche" sin credenciales nuevas del usuario. Una versión liviana **sí**
es viable: marcar qué reportes tienen coincidencias nuevas desde la última
visita (comparando contra un timestamp guardado en `localStorage`) y
mostrarlo como badge en la navegación.
**Encaje:** Medio-alto — no toca el esquema, pero sí requiere recorrer
reportes propios contra el resto en cada carga, que ya se hace parcialmente
en el matching existente.

### 4. Flyer/póster imprimible
**Por qué importa:** es el feature más citado de PawBoost y tiene lógica de
recuperación offline real (carteles en el barrio siguen funcionando). Es
además una forma más de "compartir" que ya está en los objetivos de
gamificación.
**Encaje:** Medio — se puede resolver 100% client-side con `canvas` (dibujar
foto + datos + QR/link) sin backend nuevo, pero es más trabajo de diseño
visual que las anteriores. Buen candidato si sobra tiempo después de 1-3.

### 5. Reportes de "avistamiento"
**Por qué importa:** PawBoost lo tiene y es un tipo de aporte de menor
fricción que "perdida/encontrada" (alguien puede colaborar sin haber
encontrado ni perdido nada, solo "la vi pasar").
**Encaje:** Bajo por ahora — requiere un tercer `tipo` de reporte, tocar el
`check` constraint de `tipo` en `reports`, y bastante UI nueva (formulario
reducido, listado separado). Ambicioso para completar bien en una sola
noche junto con lo demás; queda documentado pero no priorizado para hoy.

### 6. Aprendizaje continuo del matching con casos confirmados
**Por qué importa:** en teoría, la promesa más fuerte a largo plazo (mejorar
precisión con datos reales).
**Encaje:** Muy bajo hoy — con ~15 reportes en la base no hay volumen para
que "aprender" signifique algo estadísticamente válido; implementarlo ahora
sería much ceremonia sin beneficio real medible. Se documenta como
oportunidad futura, no se prioriza.

## Conclusión

Prioridad para esta sesión: **1 → 2 → 3**, y **4** si el tiempo/contexto
alcanza. **5** y **6** quedan documentados pero descartados por ahora (ver
`PLAN.md` para el detalle de implementación y `DECISIONES.md` para el
razonamiento si alguno se abandona a mitad de camino).
