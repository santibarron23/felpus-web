# PLAN — Alertas automáticas (copia textual del pedido, 2026-10-20)

Guía para todas las sesiones de este trabajo. El estado y las decisiones se
anotan en `PROGRESO.md` (sección "Alertas automáticas").

---

Vas a implementar en Felpus (Next.js + Supabase) un sistema de alertas automáticas para mascotas perdidas y encontradas. Usá solo herramientas gratuitas. No agregues ningún servicio pago ni ninguna dependencia que requiera tarjeta de crédito.
0. Antes de escribir código

1. Si existen `PLAN.md` y `PROGRESO.md` en la raíz, leelos. Si no existen, crealos. Copiá este prompt completo en `PLAN-alertas.md` y usalo como guía en cada sesión.
2. Recorré el repo y anotá en `PROGRESO.md`, en la sección "Mapa del código":
   * el nombre exacto de la tabla de reportes y sus columnas (tipo perdido/encontrado, especie, color, tamaño, lat/lng, fecha, estado, user_id);
   * dónde está el matcher (CLIP + texto + distancia + fecha), qué recibe, qué devuelve y en qué escala está el score;
   * cómo se maneja la autenticación con Supabase y Google OAuth;
   * si ya existe una tabla de matches.
3. No inventes nombres: adaptá todo lo que sigue a lo que encontraste. Si algo de este plan choca con el código existente, frená, explicalo en `PROGRESO.md` y preguntame.
4. Reglas de seguridad:
   * no borres ni modifiques datos existentes;
   * las migraciones SQL van en archivos nuevos dentro de `supabase/migrations/` y nunca hacen DROP de nada que ya exista;
   * antes de correr cualquier migración contra la base remota, mostrame el SQL y esperá mi OK;
   * las claves van en `.env.local`, que debe estar en `.gitignore`. Nunca commitees claves.
5. Ninguna tarea puede llevarte más de 45 minutos de intentos fallidos. Si te trabás, anotá el bloqueo en `PROGRESO.md` y seguí con la próxima tarea que no dependa de esa.

Objetivo
Que Felpus avise solo, sin que el usuario tenga que entrar a mirar:

* Alerta de match (prioridad 1): cuando se carga un reporte y el matcher encuentra una mascota parecida del tipo opuesto (perdido ↔ encontrado), se avisa a los dos dueños.
* Alerta de zona (prioridad 2): cuando se carga un reporte dentro del radio que eligió un usuario, se le avisa.

Herramientas (todas gratuitas)

* Web Push con la librería npm `web-push` y claves VAPID. No uses Firebase ni OneSignal.
* PostGIS en Supabase, con `geography(Point,4326)` y `ST_DWithin`.
* Database Webhooks de Supabase para disparar el envío cuando se inserta un reporte.
* pg_cron de Supabase para la tarea programada de las 8:00.
* Sin email y sin WhatsApp por API. El botón de compartir por WhatsApp que ya existe queda como está.

Fase 1: PWA instalable

1. `app/manifest.ts` con estos valores: name "Felpus", short_name "Felpus", display "standalone", start_url "/", theme_color "#d31c22", background_color "#e2d2bd". Íconos de 192 y 512 px más una versión maskable, generados a partir del isotipo en `public/assets/`.
2. `public/sw.js` con los eventos:
   * `push`: muestra la notificación con título, cuerpo, ícono y url;
   * `notificationclick`: enfoca la pestaña de Felpus si ya hay una abierta, o abre la url del reporte.
3. Un componente cliente que registre el service worker.
4. Un banner de instalación:
   * en Android y escritorio, capturar `beforeinstallprompt` y mostrar el botón "Instalar Felpus";
   * en iPhone con Safari sin instalar, mostrar una guía: "Tocá Compartir → Agregar a inicio".
   * El banner tiene que poder cerrarse y no volver a aparecer durante 7 días (guardalo en localStorage).

Listo cuando: Lighthouse marca la app como instalable y se instala en Android abriéndose sin la barra del navegador.
Fase 2: Suscripciones
Migración nueva:

```sql
create extension if not exists postgis;

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now()
);

create table alert_zones (
  user_id uuid primary key references auth.users on delete cascade,
  center geography(Point,4326) not null,
  radius_m int not null check (radius_m in (1000,3000,5000,10000)),
  species text[] not null default '{perro,gato}',
  report_types text[] not null default '{perdido,encontrado}',
  active boolean not null default true,
  updated_at timestamptz default now()
);
create index on alert_zones using gist (center);

create table notifications_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  report_id uuid not null,
  kind text not null check (kind in ('zona','match')),
  status text not null default 'enviada' check (status in ('enviada','pendiente')),
  payload jsonb,
  created_at timestamptz default now(),
  unique (user_id, report_id, kind)
);

```

* Si la tabla de reportes no tiene una columna geography, agregá `location geography(Point,4326)` generada a partir de lat/lng, con un índice GIST.
* Si no existe una tabla de matches, creala con estas columnas: report_lost_id, report_found_id, score, estado ('nuevo','visto','descartado','confirmado') y created_at, más unique(report_lost_id, report_found_id).
* RLS activado en todas las tablas nuevas: cada usuario lee y edita solo sus filas. El despacho usa la service role key, siempre del lado del servidor.

Rutas de API:

* `POST /api/push/subscribe` guarda o actualiza la suscripción del dispositivo actual.
* `DELETE /api/push/subscribe` la borra.
* `GET` y `PUT /api/alerts/zone` leen y guardan la zona del usuario.

Página `/configuracion/alertas`:

* un mapa con pin (reutilizá el picker de Google Maps que ya existe) y un círculo que muestra el radio;
* selector de radio (1, 3, 5 o 10 km), checkboxes de especie y de tipo;
* interruptor "Pausar todas las alertas";
* botón "Desactivar notificaciones en este dispositivo".

Listo cuando: un usuario logueado acepta el permiso y aparece su fila en `push_subscriptions`, y además puede guardar y editar su zona.
Fase 3: Despacho
En `POST /api/alerts/dispatch` se reciben los inserts de la tabla de reportes desde el Database Webhook. La ruta valida el header `x-alerts-secret` contra `ALERTS_WEBHOOK_SECRET` y, si no coincide, responde 401.
A) Match (se procesa primero)

1. Correr el matcher existente contra los reportes activos del tipo opuesto que estén a 15 km o menos y sean de los últimos 45 días.
2. Clasificar según el score (umbrales en variables de entorno, normalizados a 0–1):
   * score ≥ `MATCH_THRESHOLD_HIGH` (0.80): guardar el match y enviar push inmediato a los dos dueños, a cualquier hora;
   * score entre `MATCH_THRESHOLD_MID` (0.65) y el umbral alto: guardar el match sin push, para que aparezca en la sección "Posibles coincidencias" del reporte.
3. No volver a avisar por un par que ya existe, sobre todo si está en estado `descartado`.
4. Agregar en el detalle del reporte los botones "Es mi mascota" (pasa a `confirmado` y suma puntos en "Mayores colaboradores", reutilizando la lógica existente) y "No es" (pasa a `descartado`).

B) Zona

1. Buscar las zonas activas que contienen el punto del reporte: `ST_DWithin(alert_zones.center, reporte.location, alert_zones.radius_m)`, filtrando por especie y tipo.
2. Excluir al autor del reporte y a quien ya recibió una alerta de match por ese mismo reporte.

Reglas para no molestar

* Máximo 5 alertas de zona por usuario por día. Las de match alto no cuentan.
* Entre las 23:00 y las 8:00, hora de Argentina (America/Argentina/Salta), las alertas de zona no se envían: se guardan con status `pendiente`. Un job de pg_cron a las 8:00 llama a `POST /api/alerts/flush` (protegido con el mismo secreto) y las envía.
* La restricción unique de `notifications_log` evita duplicados.
* Si web-push devuelve 404 o 410, borrar esa suscripción.
* Si un usuario tiene varios dispositivos, enviar a todos.

Textos de las notificaciones

* Match: título "🐾 Puede ser tu mascota"; cuerpo "Reportaron un {perro/gato} parecido a {nombre o 'tu mascota'} a {X} km. Tocá para verlo."
* Zona, perdido: título "Se perdió un {perro/gato} cerca tuyo"; cuerpo "{color}, {tamaño}, a {X} km. Si lo ves, avisá en Felpus."
* Zona, encontrado: título "Encontraron un {perro/gato} cerca tuyo"; cuerpo "{color}, {tamaño}, a {X} km. ¿Lo conocés?"
* La distancia siempre va redondeada (por ejemplo "a 2 km"). Nunca incluir direcciones exactas, teléfonos ni nombres de personas.
* La url de la notificación abre el detalle del reporte.

Listo cuando: con dos usuarios de prueba, cargar un perdido y un encontrado parecidos genera push a los dos en menos de 1 minuto; un tercer usuario cuya zona cubre el punto recibe la alerta de zona; cargar de nuevo lo mismo no duplica ningún aviso.
Fase 4: UX del permiso

* Nunca pidas el permiso de notificaciones al cargar la página.
* Después de publicar un perdido, mostrar un modal: "¿Querés que te avisemos al instante si alguien reporta un animal parecido?" con los botones [Sí, avisame] y [Ahora no].
* Después de publicar un encontrado: "Te avisamos si aparece el dueño."
* En el mapa, un botón "Vigilar esta zona" que lleva a `/configuracion/alertas` con el pin precargado.
* En iPhone sin la app instalada, en lugar de pedir el permiso, mostrar la guía de instalación.
* Si el usuario rechaza el permiso del navegador, no insistir. Mostrar solo un aviso discreto en la configuración que explique cómo activarlo.

Fase 5: Ciclo de vida y privacidad

* Cuando un reporte se marca como reencontrado: sus matches pasan a cerrados, deja de generar alertas y se aplica la limpieza de datos sensibles que ya está prevista.
* El centro de la zona de un usuario nunca se expone a otros usuarios ni en ninguna respuesta pública de la API.
* Los reportes sin actividad en 60 días pasan a inactivos y dejan de generar alertas. Si es posible, avisar antes al dueño con un push para que pueda renovarlo.

Variables de entorno
Generá las claves con `npx web-push generate-vapid-keys` y agregalas a `.env.local` y a un `.env.example` sin valores:
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:), `ALERTS_WEBHOOK_SECRET`, `MATCH_THRESHOLD_HIGH=0.80`, `MATCH_THRESHOLD_MID=0.65`
Pruebas

* Tests de Playwright para estos flujos: aceptar el permiso, guardar la zona, recibir una alerta de zona y recibir una alerta de match. Mockeá el envío de web-push en los tests.
* Corré axe-core sobre `/configuracion/alertas` y sobre los modales nuevos. Cero violaciones serias.
* Página `/dev/test-push`, visible solo en desarrollo, con un botón que se manda un push de prueba al usuario actual.

Al terminar
Escribí en `PROGRESO.md`, en lenguaje simple y sin tecnicismos:

1. qué quedó funcionando;
2. qué tengo que hacer yo a mano, paso a paso (por ejemplo: crear el Database Webhook en el panel de Supabase, activar pg_cron, cargar las variables de entorno en el hosting);
3. cómo lo pruebo desde mi celular;
4. qué quedó pendiente.
