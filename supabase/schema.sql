-- ---------------------------------------------------------------------------
-- Felpus — esquema de base de datos para Supabase
-- Pegá todo este archivo en el SQL Editor de tu proyecto Supabase y ejecutalo.
-- Incluye al final TODAS las migraciones de supabase/migrations (en orden):
-- correrlo deja la base igual que producción. schemaSync.test.js lo verifica.
-- Una migración nueva se agrega a supabase/migrations Y al final de este archivo.
-- ---------------------------------------------------------------------------

-- Reportes de mascotas perdidas / encontradas
create table if not exists reports (
  id text primary key,
  tipo text not null check (tipo in ('perdida', 'encontrada')),
  especie text not null,
  nombre text,
  color text not null,
  color_otro text,
  tamano text not null,
  sexo text,
  edad text,
  peso text,
  zona text not null,
  lat double precision,
  lng double precision,
  fecha date,
  descripcion text not null,
  contacto_whatsapp text,
  contacto_email text,
  foto_url text not null,
  hist jsonb,
  embedding jsonb,
  foto_urls jsonb,
  hists jsonb,
  embeddings jsonb,
  nickname text,
  resuelto boolean not null default false,
  resuelto_por text,
  resuelto_por_user_id uuid,
  resuelto_en timestamptz,
  creado_en timestamptz not null default now(),
  user_id uuid
);

-- Ranking de contribuyentes (gamificación)
create table if not exists contributors (
  id text primary key, -- apodo normalizado (minúsculas, sin espacios/acentos)
  nickname text not null,
  points integer not null default 0,
  reportes integer not null default 0,
  reencuentros integer not null default 0,
  hearts integer not null default 0,
  streak_days integer not null default 0,
  last_active_date date,
  updated_at timestamptz not null default now()
);

-- Si ya habías corrido una versión anterior de este schema, estas líneas
-- agregan las columnas nuevas sin borrar nada de lo que ya tenías.
alter table reports add column if not exists color_otro text;
alter table reports add column if not exists sexo text;
alter table reports add column if not exists edad text;
alter table reports add column if not exists peso text;
alter table reports add column if not exists embedding jsonb;
alter table reports add column if not exists user_id uuid;
alter table reports add column if not exists resuelto_por_user_id uuid;
-- Hasta 3 fotos por reporte (arrays paralelos: foto_urls[i] / hists[i] / embeddings[i]).
-- foto_url/hist/embedding (singular) se mantienen con la primera foto por compatibilidad.
alter table reports add column if not exists foto_urls jsonb;
alter table reports add column if not exists hists jsonb;
alter table reports add column if not exists embeddings jsonb;
alter table contributors add column if not exists hearts integer not null default 0;
alter table reports add column if not exists contacto_whatsapp text;
alter table reports add column if not exists contacto_email text;
-- Racha de días consecutivos usando la app (mecánica de retención tipo Duolingo).
alter table contributors add column if not exists streak_days integer not null default 0;
alter table contributors add column if not exists last_active_date date;
-- Suscripción de notificaciones push del navegador para ESTE reporte
-- puntual (no una suscripción "de la cuenta" — un reporte de invitado, sin
-- login, también tiene que poder recibir avisos). Formato: el objeto
-- PushSubscription tal cual lo devuelve pushManager.subscribe() en JSON.
alter table reports add column if not exists push_subscription jsonb;
-- Raza: opcional a propósito (mucha gente no la sabe, sobre todo con
-- mascotas encontradas o mestizas) pero es una señal fuerte para el
-- matching cuando ambos lados la completan — ver structuredFieldSimilarity
-- en matching.js.
alter table reports add column if not exists raza text;
alter table reports drop constraint if exists reports_raza_len;
alter table reports add constraint reports_raza_len check (raza is null or char_length(raza) <= 60) not valid;
-- "Detalles para reconocerlo": accesorio, reacción con desconocidos y marca
-- distintiva, en forma estructurada (ids fijos, ver ACCESORIO_OPTIONS/
-- REACCION_OPTIONS/MARCA_OPTIONS en matching.js) además de la frase que ya
-- se arma sola dentro de "descripcion" — pensado para pesar en el matching
-- (ver detallesSimilarity) sin depender de comparar texto libre.
alter table reports add column if not exists detalles jsonb;
alter table reports drop constraint if exists reports_detalles_len;
alter table reports add constraint reports_detalles_len check (detalles is null or char_length(detalles::text) <= 2000) not valid;

-- ---------------------------------------------------------------------------
-- Límites de longitud a nivel de base de datos: el formulario ya los aplica
-- con maxLength, pero eso solo protege la UI — alguien podría llamar a la
-- API de Supabase directamente con un texto gigante. "not valid" evita que
-- esta migración falle si por algún motivo ya hay una fila que no cumple
-- (no valida datos viejos, solo exige el límite de acá en adelante).
-- ---------------------------------------------------------------------------
alter table reports drop constraint if exists reports_descripcion_len;
alter table reports add constraint reports_descripcion_len check (char_length(descripcion) <= 600) not valid;

alter table reports drop constraint if exists reports_zona_len;
alter table reports add constraint reports_zona_len check (char_length(zona) <= 100) not valid;

alter table reports drop constraint if exists reports_nombre_len;
alter table reports add constraint reports_nombre_len check (nombre is null or char_length(nombre) <= 60) not valid;

alter table reports drop constraint if exists reports_color_otro_len;
alter table reports add constraint reports_color_otro_len check (color_otro is null or char_length(color_otro) <= 60) not valid;

alter table reports drop constraint if exists reports_nickname_len;
alter table reports add constraint reports_nickname_len check (nickname is null or char_length(nickname) <= 40) not valid;

alter table reports drop constraint if exists reports_contacto_email_len;
alter table reports add constraint reports_contacto_email_len check (contacto_email is null or char_length(contacto_email) <= 120) not valid;

alter table reports drop constraint if exists reports_contacto_whatsapp_len;
alter table reports add constraint reports_contacto_whatsapp_len check (contacto_whatsapp is null or char_length(contacto_whatsapp) <= 25) not valid;

alter table reports enable row level security;
alter table contributors enable row level security;

-- ---------------------------------------------------------------------------
-- Políticas: reportar sigue abierto a invitados (máximo alcance), pero
-- confirmar reencuentros y sumar puntos requiere sesión real de Supabase
-- Auth Y ser el dueño de esa fila — antes cualquier usuario logueado podía
-- editar el reporte o los puntos de CUALQUIER OTRA persona llamando
-- directamente a la API de Supabase (el chequeo de "sos el dueño" vivía
-- solo en el código del cliente, que no es un límite de seguridad real).
-- La lectura sigue pública para todos.
-- Rate limiting de creación de reportes: ver trigger trg_enforce_report_rate_limit
-- más abajo (después de las políticas de reports).
-- ---------------------------------------------------------------------------

-- (endurecida más abajo, después de que exista la columna "oculto" — ver
-- el comentario junto a "alter table reports add column ... oculto")
drop policy if exists "reports_select_all" on reports;
create policy "reports_select_all" on reports for select using (true);

drop policy if exists "reports_insert_all" on reports;
create policy "reports_insert_all" on reports for insert with check (true);

drop policy if exists "reports_update_all" on reports;
drop policy if exists "reports_update_authenticated" on reports;
drop policy if exists "reports_update_owner" on reports;
create policy "reports_update_owner" on reports for update using (auth.uid() = user_id);

-- Borrar la propia publicación (botón "Eliminar publicación") — mismo
-- chequeo de dueño que el update de arriba. No existía ninguna política de
-- DELETE hasta ahora, así que sin esto el borrado queda denegado por RLS
-- aunque el código del cliente lo intente.
drop policy if exists "reports_delete_owner" on reports;
create policy "reports_delete_owner" on reports for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Contacto (WhatsApp/email): reports_select_all de arriba es "using (true)"
-- — controla FILAS, no columnas. Sin esto, cualquiera con la anon key
-- (pública, está en el bundle del navegador de toda la app) podía pedir
-- "select=contacto_whatsapp,contacto_email" directo a la API REST y
-- llevarse el contacto de TODOS los reportes en un solo pedido, sin pasar
-- por fetchReportContact ni por ningún código del cliente.
--
-- CORRECCIÓN (2026-08-08): un "revoke select (columna) ... from anon" NO
-- ALCANZA cuando ese rol ya tiene SELECT a nivel de TODA LA TABLA — que es
-- justo el caso acá (Supabase le da acceso amplio a anon/authenticated por
-- default a cada tabla nueva del schema public). Postgres no deja que un
-- revoke de columna "recorte" un permiso más amplio que ya existe a nivel
-- de tabla — confirmado en vivo contra la base real: el revoke de columna
-- de más arriba (versión anterior de esta migración) nunca bloqueó nada,
-- contacto_whatsapp/contacto_email seguían siendo legibles directo con la
-- anon key. La única forma real de restringir columnas puntuales es
-- revocar TODA la tabla y volver a otorgar, explícitas, las columnas
-- permitidas — por eso la lista de abajo repite cada columna de "reports"
-- salvo las dos de contacto.
-- ---------------------------------------------------------------------------
-- push_subscription y push_token quedan AFUERA de esta lista a propósito
-- (auditoría integral, 2026-08-09): una PushSubscription incluye el
-- endpoint real del navegador de quien reportó — no es información que
-- deba poder leerse en bloque por SELECT público, y nadie del lado del
-- cliente necesita leerla nunca (solo escribirla, vía subscribe_report_push
-- más abajo, y solo notify-match/route.js la lee, con la service role key).
-- push_token es el capability token de esa misma función — si estuviera acá,
-- cualquiera podría leerlo con un SELECT y usarlo para pisar la suscripción
-- de otro reporte, exactamente el problema que existe para resolver.
revoke select on reports from anon, authenticated;
grant select (
  id, tipo, especie, nombre, color, color_otro, tamano, sexo, edad, peso, zona,
  lat, lng, fecha, descripcion, foto_url, hist, embedding, foto_urls, hists,
  embeddings, nickname, resuelto, resuelto_por, resuelto_por_user_id, resuelto_en,
  creado_en, user_id, raza, detalles, oculto, ciudad, provincia, inactivo
) on reports to anon, authenticated;

create table if not exists contact_requests (
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists contact_requests_ip_created_idx on contact_requests (ip, created_at);
alter table contact_requests enable row level security;
-- Sin políticas: nadie (anon ni authenticated) puede leer ni escribir esta
-- tabla directamente vía la API — solo la toca la función de abajo.

-- ---------------------------------------------------------------------------
-- Hallazgo de auditoría de seguridad (2026-08-07) — CRÍTICO: la versión
-- anterior de get_report_contact leía la IP desde
-- current_setting('request.headers',...)::json->>'x-forwarded-for', un
-- header HTTP que QUIEN LLAMA A LA API CONTROLA POR COMPLETO cuando llama a
-- Supabase directo (no a través de esta app). Probado en vivo contra la
-- base real: agotar el límite de 30/hora con una IP falsa fija y después
-- mandar un pedido más con OTRA IP falsa (nunca usada) pasaba sin
-- problema — bastaba con rotar un header de texto plano para resetear el
-- cupo cada vez, sin límite real. Ver PENDIENTE_DECISION.md #-14.
--
-- Fix real: la función ya NO lee la IP de request.headers — la recibe como
-- parámetro (p_client_ip), que solo puede llegar de una fuente confiable
-- porque la función pasa a ser callable ÚNICAMENTE por el rol service_role
-- (revoke de abajo saca anon/authenticated por completo). El único que
-- puede usar esa key es el propio servidor de Next.js (nunca el navegador,
-- ver .env.local.example), así que get_report_contact ahora solo se llama
-- desde src/app/api/report-contact/route.js, que determina la IP real a
-- partir del request que le llega a Vercel (confiable, no falsificable por
-- quien visita el sitio) y se la pasa acá explícita.
-- ---------------------------------------------------------------------------
drop function if exists public.get_report_contact(text);

create or replace function public.get_report_contact(p_report_id text, p_client_ip text default null)
returns table(contacto_whatsapp text, contacto_email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  -- Sin IP (llamado servidor-a-servidor sin una IP real que identificar,
  -- ej. desde el SQL Editor) se deja pasar sin contar, mismo criterio que
  -- siempre tuvo esta función.
  if p_client_ip is not null then
    delete from contact_requests where created_at < now() - interval '1 day';

    select count(*) into recent_count
      from contact_requests
      where ip = p_client_ip and created_at > now() - interval '1 hour';

    if recent_count >= 30 then
      raise exception 'Demasiadas consultas de contacto desde esta conexión. Probá de nuevo más tarde.';
    end if;

    insert into contact_requests (ip) values (p_client_ip);
  end if;

  return query select r.contacto_whatsapp, r.contacto_email from reports r where r.id = p_report_id;
end;
$$;

-- "revoke ... from public" NO alcanza acá: Supabase le otorga EXECUTE a
-- anon/authenticated en cada función nueva del schema public por defecto,
-- por FUERA de lo que hereda de "public" (confirmado en vivo contra la
-- base real — information_schema.routine_privileges seguía listando a
-- anon/authenticated con EXECUTE después del revoke "from public" solo).
-- Hay que revocárselo a esos dos roles de forma explícita.
revoke all on function public.get_report_contact(text, text) from public, anon, authenticated;
grant execute on function public.get_report_contact(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Rate limiting de creación de reportes.
--
-- report_submissions se queda (subscribe_report_push más abajo también la
-- usa para SU propio límite), pero el trigger enforce_report_rate_limit que
-- vivía acá se ELIMINÓ — hallazgo de auditoría de seguridad (2026-08-07):
-- leía la IP de current_setting('request.headers',...)::json->>
-- 'x-forwarded-for', un header HTTP que quien llama a la API de Supabase
-- directo controla por completo. Probado en vivo contra la base real:
-- agotar el límite con una IP falsa fija y mandar un pedido más con OTRA IP
-- falsa (nunca usada) pasaba sin problema — sin límite real. Ver
-- PENDIENTE_DECISION.md #-14 para el detalle completo.
--
-- El fix real necesitaba más que cambiar de dónde se lee la IP: un trigger
-- no puede recibir un parámetro explícito del que llama (a diferencia de
-- una función RPC), así que no había forma de pasarle una IP confiable
-- calculada del lado correcto. En cambio, el INSERT directo a "reports"
-- para anon/authenticated queda revocado más abajo — TODA publicación
-- nueva pasa ahora por src/app/api/create-report/route.js, que hace este
-- mismo chequeo (mismo cupo, misma tabla) en JS, con la IP que determina
-- Vercel en el request real.
-- ---------------------------------------------------------------------------
create table if not exists report_submissions (
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists report_submissions_ip_created_idx on report_submissions (ip, created_at);
alter table report_submissions enable row level security;
-- Sin políticas: nadie (anon ni authenticated) puede leer ni escribir esta
-- tabla directamente vía la API — solo la tocan la ruta de servidor de
-- arriba y subscribe_report_push (security definer), que corren con
-- privilegios elevados.

drop trigger if exists trg_enforce_report_rate_limit on public.reports;
drop function if exists public.enforce_report_rate_limit();

-- Cierra el único camino que quedaba para insertar en "reports" sin pasar
-- por /api/create-report: la policy reports_insert_own_or_guest (RLS)
-- solo controla QUÉ FILA se puede insertar una vez que el permiso de base
-- ya lo permite — este revoke saca ese permiso de base por completo para
-- anon/authenticated, así que ni siquiera alguien con la anon key puede
-- insertar directo, tenga o no una fila válida.
revoke insert on reports from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Activar notificaciones push para un reporte puntual (no una suscripción
-- "de la cuenta": un reporte de invitado, sin login, también tiene que
-- poder recibir avisos — por eso esto no puede pasar por la policy de
-- UPDATE de arriba, que exige auth.uid() = user_id). Solo puede actualizar
-- push_subscription, ninguna otra columna.
--
-- REDISEÑO (auditoría integral, 2026-08-09): dos huecos reales en la
-- versión anterior:
-- 1. Leía la IP de current_setting('request.headers') — el mismo header
--    falsificable por quien llama a la API de Supabase directo que ya se
--    cerró para get_report_contact/flag_report (ver PENDIENTE_DECISION.md
--    #-14). Ahora la función ya NO lee ningún header — la IP se determina
--    exclusivamente en /api/subscribe-push (Vercel, no falsificable) y se
--    revoca el EXECUTE de anon/authenticated: la única forma de llamar esto
--    es a través de esa ruta, con la service_role key.
-- 2. "Riesgo aceptado" (documentado, nunca arreglado): como el id del
--    reporte no es secreto (aparece en la URL pública /r/<id>), CUALQUIERA
--    que lo conociera podía pisar la suscripción push de otra persona —
--    sin exponer datos, pero silenciando sus avisos. Como los reportes de
--    invitado (sin login) tienen que poder seguir activando avisos sin
--    obligar a crear una cuenta (principio de Felpus: reportar no requiere
--    registro), la solución es un capability token — push_token (columna
--    nueva, uuid aleatorio, uno por reporte, generado al crear la fila,
--    NUNCA expuesto en el SELECT público, ver el revoke de columnas más
--    abajo). Solo dos caminos válidos para tocar la suscripción de un
--    reporte: sos su dueño logueado (auth.uid() = user_id), o conocés su
--    push_token — que solo se entrega UNA vez, en la respuesta directa de
--    /api/create-report a quien lo acaba de publicar (ver ese route.js).
-- ---------------------------------------------------------------------------
alter table reports add column if not exists push_token uuid not null default gen_random_uuid();

drop function if exists public.subscribe_report_push(text, jsonb);
drop function if exists public.subscribe_report_push(text, jsonb, uuid);

-- p_caller_user_id (no auth.uid()): esta función queda restringida a
-- service_role — el mismo patrón que get_report_contact/flag_report/
-- create-report (ver /api/subscribe-push/route.js), donde el ÚNICO
-- llamador posible es esa ruta propia, siempre con la service_role key.
-- Como PostgREST determina el rol de Postgres (y por lo tanto qué GRANT
-- aplica) a partir del JWT del header Authorization, pasar el JWT real del
-- usuario ahí haría que la llamada corriera como "authenticated" (sin
-- permiso), no como "service_role" — por eso la identidad de quien llama NO
-- se lee de auth.uid() acá, sino que la ruta la verifica con
-- supabase.auth.getUser(accessToken) y se la pasa explícita, igual que ya
-- hace create-report/route.js con user_id.
create or replace function public.subscribe_report_push(p_report_id text, p_subscription jsonb, p_push_token uuid default null, p_caller_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rpt record;
begin
  if p_subscription is null then
    raise exception 'Falta la suscripción.';
  end if;

  select id, user_id, push_token into rpt from reports where id = p_report_id;
  if rpt.id is null then
    raise exception 'No se encontró ese reporte.';
  end if;

  if not (
    (p_caller_user_id is not null and p_caller_user_id = rpt.user_id)
    or (p_push_token is not null and p_push_token = rpt.push_token)
  ) then
    raise exception 'No autorizado.';
  end if;

  update reports set push_subscription = p_subscription where id = p_report_id;
end;
$$;

revoke all on function public.subscribe_report_push(text, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.subscribe_report_push(text, jsonb, uuid, uuid) to service_role;

drop policy if exists "contributors_select_all" on contributors;
create policy "contributors_select_all" on contributors for select using (true);

drop policy if exists "contributors_insert_all" on contributors;
drop policy if exists "contributors_insert_authenticated" on contributors;
drop policy if exists "contributors_insert_own" on contributors;
create policy "contributors_insert_own" on contributors for insert with check (auth.uid()::text = id);

drop policy if exists "contributors_update_all" on contributors;
drop policy if exists "contributors_update_authenticated" on contributors;
drop policy if exists "contributors_update_own" on contributors;
create policy "contributors_update_own" on contributors for update using (auth.uid()::text = id);

-- ---------------------------------------------------------------------------
-- Corazones: mandarle un corazón a OTRO colaborador necesita tocar SU fila,
-- no la propia — por eso no puede pasar por la política de update de arriba
-- (que ya restringimos a "solo tu propia fila" para blindar los puntos).
-- Esta función corre con privilegios elevados (security definer) pero solo
-- hace una cosa muy acotada: sumar 1 a hearts de una fila puntual, de forma
-- atómica (evita condiciones de carrera de leer-y-escribir desde el cliente).
-- Solo usuarios logueados pueden ejecutarla.
-- ---------------------------------------------------------------------------
create or replace function public.send_heart(target_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_hearts integer;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión para mandar corazones.';
  end if;
  update contributors set hearts = hearts + 1
    where id = target_id
    returning hearts into new_hearts;
  return new_hearts;
end;
$$;

revoke all on function public.send_heart(text) from public, anon;
grant execute on function public.send_heart(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Hallazgo de auditoría de anti-abuso (2026-08-07): send_heart no tenía
-- NINGÚN límite server-side — "heartedIds" en localStorage (FelpusMatcher.jsx)
-- es pura UX (evita el click doble sin querer en el mismo navegador), no un
-- control de seguridad real: cualquiera podía llamar a la RPC directo (otra
-- pestaña, otro navegador, o simplemente borrando ese localStorage) y
-- mandarle miles de corazones seguidos al mismo colaborador, o mandárselos a
-- sí mismo para inflar su propia reputación visible en el ranking. Bajo
-- impacto real (hearts es un gesto decorativo, no afecta el matching ni
-- expone nada), pero es exactamente el "anti-abuse" que pide auditar.
--
-- heart_sends registra cada envío real (remitente autenticado, no IP —
-- mandar corazones YA exige login, así que atarlo a la cuenta es más fuerte
-- que por IP) y el índice único de abajo limita a 1 por remitente/destino
-- por día calendario (en el huso horario del servidor — un límite
-- anti-abuso, no una mecánica fina como la racha, así que no hace falta
-- calcularlo en el huso horario de quien lo usa).
-- ---------------------------------------------------------------------------
create table if not exists heart_sends (
  sender_id uuid not null,
  target_id text not null,
  created_at timestamptz not null default now()
);
-- (created_at::date) directo no compila ("functions in index expression
-- must be marked IMMUTABLE") — el cast timestamptz -> date depende del
-- TimeZone de la sesión, así que Postgres no lo acepta en un índice. Pasar
-- primero por "at time zone 'UTC'" (a un timestamp fijo, sin zona) sí es
-- determinístico, y de ahí el ::date ya es válido.
create unique index if not exists heart_sends_sender_target_day_uidx
  on heart_sends (sender_id, target_id, ((created_at at time zone 'UTC')::date));
alter table heart_sends enable row level security;
-- Sin políticas: nadie lee ni escribe esta tabla directamente vía la API —
-- solo la toca send_heart() (security definer), reemplazada abajo.

create or replace function public.send_heart(target_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_hearts integer;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión para mandar corazones.';
  end if;
  if auth.uid()::text = target_id then
    raise exception 'No podés mandarte un corazón a vos mismo.';
  end if;

  begin
    insert into heart_sends (sender_id, target_id) values (auth.uid(), target_id);
  exception when unique_violation then
    raise exception 'Ya le mandaste un corazón hoy a este colaborador. Probá mañana.';
  end;

  update contributors set hearts = hearts + 1
    where id = target_id
    returning hearts into new_hearts;
  if new_hearts is null then
    raise exception 'No se encontró ese colaborador.';
  end if;
  return new_hearts;
end;
$$;

revoke all on function public.send_heart(text) from public, anon;
grant execute on function public.send_heart(text) to authenticated;

-- ---------------------------------------------------------------------------
-- award_points: suma puntos/reportes/reencuentros de forma atómica. Mismo
-- motivo que send_heart de arriba, y el mismo problema real que encontró: al
-- confirmar un reencuentro, quien confirma le suma un bono al DUEÑO DEL OTRO
-- REPORTE del match ("bono-reporte-original") — una fila ajena, no la propia
-- — así que la policy contributors_update_own (auth.uid() = id) lo bloqueaba
-- siempre. La app llamaba awardPoints() directo desde el cliente (leer +
-- upsert, sin ninguna función atómica de por medio) y ese caso puntual
-- fallaba en un 100% de las veces que se disparaba: RLS deniega la parte
-- UPDATE del upsert, y ese error hacía fallar TODO el flujo de "confirmar
-- reencuentro" con un mensaje genérico, aunque el reporte ya se hubiera
-- marcado como resuelto igual. El bono al reportero original nunca se llegó
-- a otorgar en ningún caso real desde que existe esta mecánica.
--
-- (p_reason, p_delta) están restringidos a los pares reales que usa la app
-- (PUNTOS_REENCUENTRO/PUNTOS_BONO_ORIGINAL/PUNTOS_PERDIDA/PUNTOS_ENCONTRADA
-- en src/lib/matching.js) — no un delta arbitrario — porque esta función,
-- al ser necesariamente de privilegios elevados (escribe filas ajenas), no
-- debería poder usarse para inflar puntos con cualquier valor llamándola
-- directo con la anon key. Si esos montos cambian alguna vez en el código,
-- hay que actualizar también esta lista. Los motivos que solo pueden
-- afectar la fila propia ("reencuentro"/"reporte") además exigen
-- p_user_id = auth.uid() — solo "bono-reporte-original" puede tocar la fila
-- de otra persona, que es exactamente el caso que esta función existe para
-- destrabar.
-- ---------------------------------------------------------------------------
-- REDISEÑO (auditoría integral, 2026-08-09): el rediseño anterior de esta
-- sección solo agregaba un límite de frecuencia (40 llamadas/día) — mitigaba
-- el daño pero no cerraba el hueco real: el cliente le podía decir al
-- servidor "dame X puntos por el motivo Y" sin que el servidor verificara
-- que existió un evento real detrás. Ahora es event-sourced e idempotente:
--
-- 1. points_events registra cada otorgamiento con una clave única
--    (reason, source_id) — el "evento" que originó los puntos (el id del
--    reporte publicado, resuelto, o del reporte "original" que recibe el
--    bono). Publicar/resolver/dar el bono de UN reporte puntual solo puede
--    otorgar puntos UNA vez, para siempre — un reintento, un doble-click,
--    o alguien llamando la RPC a mano con el mismo source_id no suma una
--    segunda vez (insert con conflicto -> no-op silencioso, no error).
-- 2. Antes de insertar, la función verifica contra "reports" que el evento
--    sea real:
--    - 'reporte': el reporte source_id existe y pertenece a auth.uid().
--    - 'reencuentro': el reporte source_id existe, pertenece a auth.uid(),
--      y está realmente marcado resuelto=true.
--    - 'bono-reporte-original': el reporte source_id pertenece a p_user_id
--      (no a auth.uid() — el bono es justamente para OTRA persona), Y
--      quien llama (auth.uid()) tiene que tener un reporte PROPIO resuelto
--      hace poco (últimos 10 minutos) de tipo opuesto — es decir, tiene que
--      haber confirmado un reencuentro real de verdad para poder acreditar
--      el bono a quien matcheó con él. Sin esto, cualquier cuenta logueada
--      podía llamar este motivo en loop y sumarle puntos a CUALQUIER OTRA
--      cuenta (o a la propia, mintiendo el motivo) sin haber resuelto nada.
--
-- No verifica que source_id sea EXACTAMENTE el reporte que el algoritmo de
-- matching mostró como coincidencia (eso requeriría portar todo matching.js
-- a PL/pgSQL, sobreingeniería para el riesgo real: en el peor caso alguien
-- ya logueado, que ya resolvió un reporte propio de verdad, le suma un bono
-- de 20 puntos a la cuenta de OTRA persona real — no a la propia, y no más
-- de una vez por reporte ajeno real que exista). Se mantiene además el
-- límite de frecuencia (40/día) como defensa adicional contra probar ids al
-- voleo.
-- ---------------------------------------------------------------------------
create table if not exists points_award_log (
  id bigint generated always as identity primary key,
  caller_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists points_award_log_caller_created_idx on points_award_log (caller_id, created_at);
alter table points_award_log enable row level security;
-- Sin políticas: nadie lee/escribe esto directo, solo award_points (security definer).

create table if not exists points_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  reason text not null,
  source_id text not null,
  points integer not null,
  created_at timestamptz not null default now()
);
create unique index if not exists points_events_reason_source_uidx on points_events (reason, source_id);
alter table points_events enable row level security;
-- Sin políticas: nadie lee/escribe esto directo, solo award_points (security definer).

drop function if exists public.award_points(text, text, integer, text);

create or replace function public.award_points(p_user_id text, p_display_name text, p_delta integer, p_reason text, p_source_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  calls_today integer;
  rpt record;
  own_resolved_id text;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión para sumar puntos.';
  end if;
  if (p_reason, p_delta) not in (('reencuentro', 50), ('bono-reporte-original', 20), ('reporte', 10), ('reporte', 15)) then
    raise exception 'Combinación de motivo/puntos no reconocida.';
  end if;
  if p_source_id is null or length(trim(p_source_id)) = 0 then
    raise exception 'Falta el reporte de origen.';
  end if;

  delete from points_award_log where created_at < now() - interval '2 days';
  select count(*) into calls_today from points_award_log
    where caller_id = auth.uid() and created_at > now() - interval '24 hours';
  if calls_today >= 40 then
    raise exception 'Demasiadas operaciones de puntos en poco tiempo. Probá de nuevo más tarde.';
  end if;
  insert into points_award_log (caller_id) values (auth.uid());

  select id, user_id, tipo, resuelto into rpt from reports where id = p_source_id;
  if rpt.id is null then
    raise exception 'No se encontró el reporte de origen.';
  end if;

  if p_reason = 'reporte' then
    if p_user_id <> auth.uid()::text or rpt.user_id is distinct from auth.uid() then
      raise exception 'Solo podés sumarte puntos por tus propios reportes.';
    end if;
  elsif p_reason = 'reencuentro' then
    if p_user_id <> auth.uid()::text or rpt.user_id is distinct from auth.uid() then
      raise exception 'Solo podés sumarte puntos por tus propios reencuentros.';
    end if;
    if rpt.resuelto is distinct from true then
      raise exception 'Ese reporte todavía no está marcado como reencontrado.';
    end if;
  elsif p_reason = 'bono-reporte-original' then
    if p_user_id = auth.uid()::text then
      raise exception 'Este motivo es para acreditarle puntos a otra persona.';
    end if;
    if rpt.user_id is null or rpt.user_id::text <> p_user_id then
      raise exception 'El reporte de origen no pertenece al usuario indicado.';
    end if;
    select id into own_resolved_id
      from reports
      where resuelto_por_user_id = auth.uid()
        and resuelto = true
        and resuelto_en > now() - interval '10 minutes'
        and tipo is distinct from rpt.tipo
        and id <> rpt.id
      limit 1;
    if own_resolved_id is null then
      raise exception 'No encontramos un reencuentro reciente propio para acreditar este bono.';
    end if;
  end if;

  begin
    insert into points_events (user_id, reason, source_id, points) values (p_user_id::uuid, p_reason, p_source_id, p_delta);
  exception when unique_violation then
    -- Ya se otorgaron puntos por este evento exacto — no es un error, solo
    -- evita el doble conteo (reintento del cliente, doble-click, o alguien
    -- probando a mano). No suma de nuevo, pero tampoco rompe el flujo.
    return;
  end;

  insert into contributors (id, nickname, points, reportes, reencuentros, updated_at)
  values (
    p_user_id,
    coalesce(p_display_name, p_user_id),
    p_delta,
    case when p_reason = 'reporte' then 1 else 0 end,
    case when p_reason = 'reencuentro' then 1 else 0 end,
    now()
  )
  on conflict (id) do update set
    points = contributors.points + excluded.points,
    reportes = contributors.reportes + excluded.reportes,
    reencuentros = contributors.reencuentros + excluded.reencuentros,
    nickname = coalesce(p_display_name, contributors.nickname),
    updated_at = now();
end;
$$;

revoke all on function public.award_points(text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.award_points(text, text, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: bucket público para las fotos de mascotas
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('felpus-photos', 'felpus-photos', true)
on conflict (id) do nothing;

-- Auditoría integral (2026-08-09): el bucket no tenía file_size_limit ni
-- allowed_mime_types — la validación de "es una imagen razonable" (recorte
-- a 1000px, recodificado a JPEG calidad 0.85, ver resizeImageFile en
-- matching.js) es SOLO del navegador. Cualquiera con la anon key (pública)
-- puede llamar directo a la API de Storage de Supabase, sin pasar por esa
-- función ni por ningún rate limit de esta app, y subir un archivo de
-- cualquier tipo/tamaño — el único límite real hoy es el del plan de
-- Supabase. "on conflict do nothing" de arriba no vuelve a aplicar esto si
-- el bucket ya existía, por eso va aparte como update explícito, así corre
-- siempre que se re-ejecute esta migración. 8MB es generoso frente a lo que
-- sube la app de verdad (fotos ya redimensionadas, típicamente <500KB) —
-- deja margen sin ser un límite simbólico. image/svg+xml se permite porque
-- los datos semilla (seedIfEmpty en store.js) usan placeholders SVG.
update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
where id = 'felpus-photos';

-- Sin policy de SELECT abierta: listar el bucket quedaba al alcance de la
-- clave pública (fotos de reportes ocultos o borrados incluidas). Las fotos
-- se siguen viendo igual por /object/public/...; listar queda para el dueño
-- y el admin (felpus_photos_owner_read, migración 20261023_01, incluida al
-- final de este archivo).
drop policy if exists "felpus_photos_public_read" on storage.objects;

-- Auditoría integral (2026-08-09): se evaluó mover el insert detrás de una
-- ruta server-side (service_role) para poder además atarlo al mismo rate
-- limit de 8/hora que ya protege /api/create-report — pero eso hubiera
-- roto felpus_photos_owner_delete más abajo (depende de que "owner" quede
-- seteado al auth.uid() real de quien sube, algo que se pierde si el
-- upload pasa por la service_role key en vez del cliente autenticado) sin
-- un rediseño más grande del flujo de borrado. Se optó por el fix
-- proporcional al riesgo real: uploadPhoto() (store.js) ahora arma cada
-- path con un sufijo aleatorio (crypto.randomUUID(), no adivinable) en vez
-- de basarse en el id del reporte (que SÍ es público, aparece en la URL
-- /r/<id>) — eso cierra el hueco grave (cualquiera podía pisar la foto de
-- un reporte ajeno adivinando/conociendo su id) sin tocar esta policy.
-- Sigue quedando un riesgo menor, aceptado y documentado: alguien podría
-- llamar a la API de Storage directo (sin pasar por la app) para subir
-- archivos sin nunca crear un reporte — acotado por file_size_limit/
-- allowed_mime_types de arriba y, en última instancia, por la cuota de
-- almacenamiento del plan de Supabase. Recomendación para una próxima
-- iteración: mover también el delete a una ruta server-side (verificando
-- dueño contra reports.user_id en vez de storage.owner) para poder cerrar
-- el insert público sin perder el borrado de fotos propias.
drop policy if exists "felpus_photos_public_insert" on storage.objects;
create policy "felpus_photos_public_insert"
  on storage.objects for insert
  with check (bucket_id = 'felpus-photos');

-- Sin esto, deleteReport() en store.js (botón "Eliminar publicación") borra
-- la FILA de reports pero storage.remove() falla en silencio (RLS deniega
-- por default sin una policy de delete) — la foto queda huérfana en Storage
-- para siempre, pública, aunque el reporte ya no exista. No se abre el
-- delete a cualquiera (bucket_id = '...' solo, sin más) porque el bucket es
-- público: cualquiera con la anon key podría borrar las fotos de cualquier
-- otra persona. En cambio, "owner" es la columna que Supabase Storage
-- completa solo con auth.uid() al subir un archivo autenticado — mismo
-- criterio de dueño que reports_delete_owner más arriba, y la misma
-- limitación ya aceptada para reportes de invitado (ver PENDIENTE_DECISION.md
-- #0): sin login, ni la fila ni ahora tampoco la foto se pueden borrar por
-- este mecanismo.
drop policy if exists "felpus_photos_owner_delete" on storage.objects;
create policy "felpus_photos_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'felpus-photos' and owner = auth.uid());

-- ---------------------------------------------------------------------------
-- Webhook: avisa a /api/notify-match cada vez que se publica un reporte
-- nuevo, para que calcule coincidencias y mande el email correspondiente.
-- Usa pg_net (async, no bloquea el insert) y atrapa cualquier error propio
-- para que un problema con la notificación nunca rompa la publicación real
-- del reporte.
--
-- El secreto compartido NUNCA va literal acá (este archivo se sube a un
-- repo público) — se guarda con Vault, el mecanismo propio de Supabase para
-- esto (a diferencia de "alter database ... set", que el rol usado por el
-- SQL Editor no tiene permiso para ejecutar). Se configura UNA sola vez a
-- mano, fuera de cualquier archivo versionado:
--   select vault.create_secret('<tu secreto>', 'notify_webhook_secret');
-- Tiene que ser el mismo valor que NOTIFY_WEBHOOK_SECRET en Vercel. Si no
-- está configurado, la función no manda nada (no rompe el insert).
-- ---------------------------------------------------------------------------
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

create or replace function public.notify_new_report()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  webhook_secret text;
begin
  begin
    select decrypted_secret into webhook_secret
      from vault.decrypted_secrets
      where name = 'notify_webhook_secret'
      limit 1;
    if webhook_secret is null or webhook_secret = '' then
      return NEW;
    end if;
    perform net.http_post(
      url := 'https://felpus.com/api/notify-match',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', webhook_secret
      ),
      body := jsonb_build_object('type', 'INSERT', 'table', 'reports', 'record', to_jsonb(NEW))
    );
  exception when others then
    null;
  end;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_new_report on public.reports;
create trigger trg_notify_new_report
  after insert on public.reports
  for each row
  execute function public.notify_new_report();

-- ---------------------------------------------------------------------------
-- Rate limiting de /api/embed (llama a Hugging Face, que tiene costo/cuota
-- propia). El limitador anterior vivía en un Map en memoria adentro de la
-- función serverless — no servía de nada real: cada cold start (frecuente en
-- Vercel) arranca el contador en cero, y las instancias concurrentes no
-- comparten memoria entre sí. Esto hace el mismo conteo+poda+insert de forma
-- atómica en la base, como el rate limit de reportes de más arriba.
--
-- Auditoría integral (2026-08-09): esta función estaba otorgada a
-- anon/authenticated — cualquiera con la anon key (pública) podía llamarla
-- DIRECTO, mandando cualquier client_ip inventada (resetea el cupo a
-- voluntad, mismo truco que ya se cerró para get_report_contact/flag_report)
-- y además un max_per_minute absurdamente alto (el límite real dejaba de
-- limitar nada). Ahora client_ip la determina EXCLUSIVAMENTE /api/embed (el
-- único lugar donde corre con la IP real que ve Vercel, nunca falsificable
-- por quien visita el sitio) llamando con la service_role key, y
-- max_per_minute ya no es un parámetro — queda fijo adentro de la función,
-- así que nadie que la llame puede subirlo.
-- ---------------------------------------------------------------------------
create table if not exists embed_requests (
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists embed_requests_ip_created_idx on embed_requests (ip, created_at);
alter table embed_requests enable row level security;
-- Sin políticas: nadie accede a esta tabla directamente vía la API — solo la
-- toca la función security definer de abajo.

drop function if exists public.check_embed_rate_limit(text, integer);

create or replace function public.check_embed_rate_limit(client_ip text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
  max_per_minute constant integer := 12;
begin
  if client_ip is null or client_ip = '' then
    return true; -- sin IP no se puede evaluar el límite, se deja pasar
  end if;

  -- Poda oportunista: evita que la tabla crezca indefinidamente sin
  -- necesitar un cron job aparte.
  delete from embed_requests where created_at < now() - interval '1 hour';

  select count(*) into recent_count
    from embed_requests
    where ip = client_ip and created_at > now() - interval '1 minute';

  if recent_count >= max_per_minute then
    return false;
  end if;

  insert into embed_requests (ip) values (client_ip);
  return true;
end;
$$;

revoke all on function public.check_embed_rate_limit(text) from public, anon, authenticated;
grant execute on function public.check_embed_rate_limit(text) to service_role;

-- ---------------------------------------------------------------------------
-- Log de errores del cliente: antes logError() solo hacía console.error, así
-- que un error en producción era invisible a menos que el usuario lo
-- reportara a mano. Esta tabla es el único lugar donde se guardan — sin
-- política de SELECT (mismo patrón que report_submissions/embed_requests de
-- arriba), así que nadie puede leerla vía la API; solo vos, desde el Table
-- Editor de Supabase (que usa la service key y ignora RLS).
-- No requiere ninguna cuenta ni servicio nuevo — reutiliza el Supabase que
-- ya existe.
--
-- REDISEÑO (auditoría integral, 2026-08-09): el trigger de rate limiting
-- leía la IP de current_setting('request.headers') — el mismo header
-- falsificable por quien llama a la API de Supabase directo que ya se
-- cerró en todos los demás lugares de este archivo (ver PENDIENTE_DECISION.md
-- #-14). Como acá el INSERT era directo desde el cliente (no había ninguna
-- ruta propia de por medio), el hueco quedaba abierto: alguien podía
-- llenar esta tabla sin límite real rotando el header, un vector de DoS de
-- almacenamiento/costo sobre el propio sistema de observabilidad. Ahora el
-- INSERT queda completamente cerrado a anon/authenticated — el único
-- camino es /api/log-error (server-side, IP real de Vercel), que además
-- poda filas de más de 30 días en cada escritura (retención acotada, sin
-- necesitar un cron job aparte) — antes esta tabla podía crecer para
-- siempre sin límite.
-- ---------------------------------------------------------------------------
create table if not exists error_logs (
  id bigint generated always as identity primary key,
  message text not null,
  stack text,
  context jsonb,
  url text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists error_logs_created_at_idx on error_logs (created_at);
alter table error_logs enable row level security;
-- Sin ninguna política (ni SELECT ni INSERT): nadie toca esto vía la API
-- con anon/authenticated — solo /api/log-error, con la service_role key.

alter table error_logs drop constraint if exists error_logs_message_len;
alter table error_logs add constraint error_logs_message_len check (char_length(message) <= 2000);
alter table error_logs drop constraint if exists error_logs_stack_len;
alter table error_logs add constraint error_logs_stack_len check (stack is null or char_length(stack) <= 8000);
alter table error_logs drop constraint if exists error_logs_url_len;
alter table error_logs add constraint error_logs_url_len check (url is null or char_length(url) <= 500);
alter table error_logs drop constraint if exists error_logs_user_agent_len;
alter table error_logs add constraint error_logs_user_agent_len check (user_agent is null or char_length(user_agent) <= 500);

revoke insert on error_logs from anon, authenticated;
drop policy if exists "error_logs_insert_all" on error_logs;
drop trigger if exists trg_enforce_error_log_rate_limit on public.error_logs;
drop function if exists public.enforce_error_log_rate_limit();

-- El límite por IP en sí ahora vive enteramente en /api/log-error (mismo
-- patrón que report_submissions en create-report/route.js) — esta tabla
-- queda igual (RLS habilitado, sin políticas, solo tocada por esa ruta con
-- la service_role key) para no perder el historial de intentos ya
-- registrado.
create table if not exists error_log_submissions (
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists error_log_submissions_ip_created_idx on error_log_submissions (ip, created_at);
alter table error_log_submissions enable row level security;

-- ---------------------------------------------------------------------------
-- Denunciar publicaciones falsas/erróneas. No hay panel de admin en esta
-- app (ver el resto de este archivo: todo lo delicado se revisa a mano
-- desde el Table Editor de Supabase), así que en vez de sumar una pieza de
-- arquitectura nueva, esto sigue el mismo molde ya probado acá: tabla sin
-- política de SELECT (nadie la lee vía la API, solo vos desde el Table
-- Editor) + inserción mediada por una función security definer con rate
-- limiting por IP.
--
-- La única automatización es defensiva, no editorial: si 3 IPs DISTINTAS
-- denuncian el mismo reporte, se oculta del listado público (columna
-- "oculto", filtrada en fetchReports — ver store.js). No se borra: el
-- registro queda para que lo revises vos y decidas. Publicar sigue abierto
-- a invitados a propósito (alguien angustiado no debería tener que crear
-- una cuenta para reportar), así que 3 denuncias reales es un umbral bajo
-- adrede — el objetivo es frenar el daño rápido, no juzgar con certeza.
-- ---------------------------------------------------------------------------
alter table reports add column if not exists oculto boolean not null default false;

-- ---------------------------------------------------------------------------
-- Auditoría integral (2026-08-09): reports_select_all (definida más arriba,
-- antes de que existiera esta columna) es "using (true)" — controla FILAS,
-- no ocultamiento. Un reporte auto-ocultado por 3+ denuncias o escondido a
-- mano por el admin seguía siendo 100% legible pidiendo "oculto=eq.true"
-- directo a la API REST con la anon key — fetchReports() (store.js) solo lo
-- filtraba EN EL CLIENTE, que no es una barrera real, exactamente el mismo
-- tipo de error que ya se corrigió para contacto_whatsapp/contacto_email
-- (confiar en un filtro de la app en vez de en la base). Acá la barrera
-- correcta es la propia policy de RLS, no un revoke de columna.
--
-- El panel de admin SÍ necesita ver los ocultos — antes leía la tabla
-- directo con la sesión del navegador (adminListAllReports() en store.js),
-- así que un RLS que excluya "oculto" le habría roto esa vista. Por eso
-- store.js pasa a usar admin_list_all_reports() (definida más abajo, junto
-- al resto de funciones de admin) — security definer, bypassea RLS, con el
-- mismo chequeo de auth.email() que ya protege admin_metrics/admin_delete_report.
-- ---------------------------------------------------------------------------
drop policy if exists "reports_select_all" on reports;
create policy "reports_select_all" on reports for select using (oculto is distinct from true);

create table if not exists report_flags (
  id bigint generated always as identity primary key,
  report_id text not null references reports(id) on delete cascade,
  reason text not null,
  ip text,
  created_at timestamptz not null default now()
);
-- Único por (report_id, ip) cuando hay IP real — evita que una sola persona
-- infle el conteo de "IPs distintas" reenviando la denuncia, y de paso hace
-- que el conteo de abajo sea directo (count(distinct ip) sin duplicados).
-- Parcial (where ip is not null) porque las llamadas sin IP identificable
-- (poco frecuentes — ver el mismo patrón en get_report_contact más arriba)
-- no deberían chocar entre sí.
create unique index if not exists report_flags_report_ip_uidx on report_flags (report_id, ip) where ip is not null;
alter table report_flags enable row level security;
-- Sin políticas: nadie lee ni escribe esta tabla directamente vía la API —
-- solo la toca flag_report() de abajo.

create table if not exists flag_submissions (
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists flag_submissions_ip_created_idx on flag_submissions (ip, created_at);
alter table flag_submissions enable row level security;

-- ---------------------------------------------------------------------------
-- Hallazgo de auditoría de seguridad (2026-08-07) — CRÍTICO, más grave que
-- get_report_contact: esta función auto-oculta un reporte apenas ve 3 IPs
-- DISTINTAS denunciando — y leía esa IP del mismo request.headers
-- falsificable (ver el comentario largo junto a get_report_contact más
-- arriba). Con IPs falsas rotando libremente, cualquiera podía ocultar
-- CUALQUIER reporte ajeno (por ejemplo el de un competidor, o el de alguien
-- con quien tuviera un conflicto personal) en 3 pedidos, sin límite real.
-- Mismo fix: p_client_ip como parámetro, función restringida a
-- service_role — ahora solo se llama desde
-- src/app/api/flag-report/route.js.
-- ---------------------------------------------------------------------------
drop function if exists public.flag_report(text, text);

create or replace function public.flag_report(p_report_id text, p_reason text, p_client_ip text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
  distinct_ips integer;
begin
  if p_reason not in ('falsa', 'info_incorrecta', 'inapropiado', 'otro') then
    raise exception 'Motivo de denuncia no reconocido.';
  end if;

  if not exists (select 1 from reports where id = p_report_id) then
    raise exception 'No se encontró ese reporte.';
  end if;

  -- Mismo criterio que report_submissions/contact_requests: sin IP
  -- identificable se deja pasar sin contar hacia el límite (llamado
  -- servidor-a-servidor, o desde el SQL Editor).
  if p_client_ip is not null then
    delete from flag_submissions where created_at < now() - interval '1 day';

    select count(*) into recent_count
      from flag_submissions
      where ip = p_client_ip and created_at > now() - interval '1 hour';

    if recent_count >= 10 then
      raise exception 'Se alcanzó el límite de denuncias por hora desde esta conexión. Probá de nuevo más tarde.';
    end if;

    insert into flag_submissions (ip) values (p_client_ip);
  end if;

  insert into report_flags (report_id, reason, ip)
    values (p_report_id, p_reason, p_client_ip)
    on conflict (report_id, ip) where ip is not null do nothing;

  -- El auto-ocultamiento exige IP real de los denunciantes (si no, alguien
  -- sin IP identificable podría, en teoría, mandar muchas denuncias con ip
  -- null que nunca chocan entre sí por el índice parcial de arriba, e
  -- inflar el conteo si contáramos filas en vez de IPs).
  if p_client_ip is not null then
    select count(distinct ip) into distinct_ips
      from report_flags
      where report_id = p_report_id and ip is not null;

    if distinct_ips >= 3 then
      update reports set oculto = true where id = p_report_id;
    end if;
  end if;
end;
$$;

-- Mismo motivo que get_report_contact más arriba: "from public" no alcanza,
-- Supabase le da EXECUTE a anon/authenticated por defecto en cada función
-- nueva, aparte de lo que hereda de "public" — hay que revocárselo
-- explícito a esos dos roles (confirmado en vivo: sin esto, la anon key
-- podía seguir llamando a flag_report igual después del revoke original).
revoke all on function public.flag_report(text, text, text) from public, anon, authenticated;
grant execute on function public.flag_report(text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Panel de administrador — un solo dueño (santiagobarronlf@gmail.com), sin
-- tabla de roles: mismo criterio de "lo mínimo que resuelve el problema
-- real" que el resto de este archivo. El email admin queda hardcodeado en
-- cada función (no en una tabla ni env var) porque hoy es un valor de un
-- solo bit (es/no es el dueño) que no va a rotar seguido — si alguna vez
-- hace falta más de un admin, ahí sí vale una tabla de roles; hasta
-- entonces sería complejidad sin un problema real que resolver. Requiere
-- estar logueado con Google con ESE email exacto (auth.email() lee el
-- email del JWT de Supabase Auth) — el cliente además esconde la UI del
-- panel para cualquier otro usuario, pero la barrera real es esta.
-- ---------------------------------------------------------------------------

create or replace function public.admin_delete_report(p_report_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.email() is distinct from 'santiagobarronlf@gmail.com' then
    raise exception 'No autorizado.';
  end if;
  delete from reports where id = p_report_id;
end;
$$;

revoke all on function public.admin_delete_report(text) from public, anon;
grant execute on function public.admin_delete_report(text) to authenticated;

-- Ocultar/mostrar a mano — mismo campo "oculto" que usa el auto-ocultamiento
-- de flag_report, así que esto también sirve para revertir un falso
-- positivo (un reporte legítimo que llegó a 3 denuncias infundadas).
create or replace function public.admin_set_oculto(p_report_id text, p_oculto boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.email() is distinct from 'santiagobarronlf@gmail.com' then
    raise exception 'No autorizado.';
  end if;
  update reports set oculto = p_oculto where id = p_report_id;
  if not found then
    raise exception 'No se encontró ese reporte.';
  end if;
end;
$$;

revoke all on function public.admin_set_oculto(text, boolean) from public, anon;
grant execute on function public.admin_set_oculto(text, boolean) to authenticated;

-- Denuncias agrupadas por reporte — report_flags no tiene política de SELECT
-- (a propósito, ver más arriba), así que sin esto ni siquiera el admin
-- podría leerlas desde el cliente.
create or replace function public.admin_list_flagged_reports()
returns table(
  report_id text,
  tipo text,
  especie text,
  nombre text,
  zona text,
  foto_url text,
  oculto boolean,
  flag_count bigint,
  distinct_ips bigint,
  reasons text[],
  last_flagged_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.email() is distinct from 'santiagobarronlf@gmail.com' then
    raise exception 'No autorizado.';
  end if;
  return query
    select r.id, r.tipo, r.especie, r.nombre, r.zona, r.foto_url, r.oculto,
           count(f.id), count(distinct f.ip), array_agg(distinct f.reason), max(f.created_at)
    from report_flags f
    join reports r on r.id = f.report_id
    group by r.id
    order by max(f.created_at) desc;
end;
$$;

revoke all on function public.admin_list_flagged_reports() from public, anon;
grant execute on function public.admin_list_flagged_reports() to authenticated;

-- Métricas básicas — un solo viaje en vez de que el cliente arme varios
-- counts sueltos (y varios de esos counts, como error_logs, ni son legibles
-- desde el cliente sin esto).
create or replace function public.admin_metrics()
returns table(
  total bigint, perdidas bigint, encontradas bigint, resueltos bigint, ocultos bigint,
  last_24h bigint, last_7d bigint, contributors bigint, flags_total bigint,
  flagged_reports_pending bigint, errors_24h bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.email() is distinct from 'santiagobarronlf@gmail.com' then
    raise exception 'No autorizado.';
  end if;
  return query
    select
      (select count(*) from reports),
      (select count(*) from reports where tipo = 'perdida'),
      (select count(*) from reports where tipo = 'encontrada'),
      (select count(*) from reports where resuelto),
      (select count(*) from reports where oculto),
      (select count(*) from reports where creado_en > now() - interval '24 hours'),
      (select count(*) from reports where creado_en > now() - interval '7 days'),
      (select count(*) from contributors),
      (select count(*) from report_flags),
      (select count(distinct report_id) from report_flags where report_id in (select id from reports where not oculto)),
      (select count(*) from error_logs where created_at > now() - interval '24 hours');
end;
$$;

revoke all on function public.admin_metrics() from public, anon;
grant execute on function public.admin_metrics() to authenticated;

-- Informe de cuentas registradas (login de Google) para el admin — cruza
-- auth.users (que ningún rol del cliente puede leer directo: no hay
-- policy de RLS posible sobre una tabla del schema `auth`, y el cliente
-- ni siquiera tiene grants ahí) con contributors (apodo/whatsapp que cada
-- quien cargó en "Mi Felpus" — ver updateProfile en store.js, donde
-- contributors.id = auth.uid() para cuentas logueadas). `security definer`
-- + dueño `postgres` es lo que permite esta única función leer auth.users
-- sin abrir esa tabla a nadie más. A propósito NO incluye reportes,
-- puntos, racha ni fechas — si en algún momento hace falta más, se agrega
-- ahí, no "por si acaso" de entrada.
create or replace function public.admin_list_users()
returns table(
  id uuid,
  email text,
  nickname text,
  whatsapp text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.email() is distinct from 'santiagobarronlf@gmail.com' then
    raise exception 'No autorizado.';
  end if;
  return query
    select u.id, u.email, c.nickname, c.whatsapp
    from auth.users u
    left join contributors c on c.id = u.id::text
    where u.email is not null
    order by u.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- Auditoría integral (2026-08-09): el panel de admin usaba adminListAllReports()
-- (store.js) = fetchReports({includeHidden:true}), que leía la tabla "reports"
-- DIRECTO con la sesión del navegador — dependía de que reports_select_all
-- fuera "using (true)" para poder ver los ocultos. Ahora que esa policy
-- filtra "oculto" (ver el comentario junto a la columna, más arriba), el
-- admin necesita su propio camino que bypasee RLS — mismo patrón que
-- admin_list_users de arriba: security definer + chequeo de auth.email().
-- A propósito NO incluye contacto_whatsapp/contacto_email (mismas columnas
-- que ya excluye fetchReports() para el listado general — el admin sigue
-- viendo el contacto solo a través de get_report_contact, no en bloque acá).
create or replace function public.admin_list_all_reports()
returns table(
  id text, tipo text, especie text, raza text, detalles jsonb, nombre text,
  color text, color_otro text, tamano text, sexo text, edad text, peso text,
  zona text, ciudad text, provincia text, lat double precision, lng double precision,
  fecha date, descripcion text, foto_url text, hist jsonb, embedding jsonb,
  foto_urls jsonb, hists jsonb, embeddings jsonb, nickname text, resuelto boolean,
  resuelto_por text, resuelto_por_user_id uuid, resuelto_en timestamptz,
  creado_en timestamptz, user_id uuid, oculto boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.email() is distinct from 'santiagobarronlf@gmail.com' then
    raise exception 'No autorizado.';
  end if;
  return query
    select
      r.id, r.tipo, r.especie, r.raza, r.detalles, r.nombre,
      r.color, r.color_otro, r.tamano, r.sexo, r.edad, r.peso,
      r.zona, r.ciudad, r.provincia, r.lat, r.lng,
      r.fecha, r.descripcion, r.foto_url, r.hist, r.embedding,
      r.foto_urls, r.hists, r.embeddings, r.nickname, r.resuelto,
      r.resuelto_por, r.resuelto_por_user_id, r.resuelto_en,
      r.creado_en, r.user_id, r.oculto
    from reports r
    order by r.creado_en desc;
end;
$$;

revoke all on function public.admin_list_all_reports() from public, anon, authenticated;
grant execute on function public.admin_list_all_reports() to authenticated;

-- Le permite al admin borrar la foto de CUALQUIER reporte de Storage (la
-- política de owner-delete de más arriba solo alcanza al dueño real) — mismo
-- flujo de dos pasos que ya usa deleteReport() en store.js (borrar la foto,
-- después la fila), solo que sin el filtro .eq("user_id", ...).
drop policy if exists "felpus_photos_admin_delete" on storage.objects;
create policy "felpus_photos_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'felpus-photos' and auth.email() = 'santiagobarronlf@gmail.com');

-- ---------------------------------------------------------------------------
-- "Mi Felpus" — perfil personal + mascotas guardadas.
--
-- Perfil: NO se crea una tabla nueva. contributors YA ES, en los hechos, la
-- tabla de perfil por cuenta (contributors.id = auth.uid()::text, ver
-- awardPoints/bumpStreak en store.js — el comentario viejo de más arriba
-- que decía "apodo normalizado" quedó desactualizado, hoy es el uuid del
-- usuario) — reutilizarla evita el "User separado de PetReport" que
-- duplicaría nickname/id sin necesidad. Se le agrega una sola columna
-- nueva: el WhatsApp de perfil, que sirve como valor por defecto para
-- publicar (mismo rol que "recordar contacto" en localStorage, ver
-- PhoneInput.jsx, pero ligado a la cuenta en vez de al dispositivo — así
-- no queda un teléfono de perfil y otro de reportes que puedan
-- desincronizarse: store.js siempre escribe/lee este mismo campo).
-- No se agrega un campo de email: el de la cuenta (auth.users.email) ya es
-- la fuente real, mostrar uno editable aparte sería el "distintos teléfonos
-- inconsistentes" que se pidió evitar, ahora para email.
-- ---------------------------------------------------------------------------
alter table contributors add column if not exists whatsapp text;
alter table contributors drop constraint if exists contributors_whatsapp_len;
alter table contributors add constraint contributors_whatsapp_len check (whatsapp is null or char_length(whatsapp) <= 25);

-- Mascotas guardadas: relación pura User×Report, sin duplicar ningún dato
-- del reporte (ni foto, ni zona, ni nada) — la UI vuelve a pedirle el
-- reporte completo a "reports" por id cuando hace falta mostrarlo. La
-- primary key compuesta (user_id, report_id) es lo que impide guardar el
-- mismo reporte dos veces a nivel de base, no solo en el cliente.
create table if not exists saved_reports (
  user_id uuid not null,
  report_id text not null references reports(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, report_id)
);
create index if not exists saved_reports_user_idx on saved_reports (user_id, created_at desc);
alter table saved_reports enable row level security;

-- Solo la propia cuenta puede ver/guardar/quitar sus guardados — ni con la
-- anon key ni manipulando la URL se puede leer ni tocar los guardados de
-- otra persona (el control real es este, no el que el cliente solo pida
-- "los míos").
drop policy if exists "saved_reports_select_own" on saved_reports;
create policy "saved_reports_select_own" on saved_reports for select using (auth.uid() = user_id);

drop policy if exists "saved_reports_insert_own" on saved_reports;
create policy "saved_reports_insert_own" on saved_reports for insert with check (auth.uid() = user_id);

drop policy if exists "saved_reports_delete_own" on saved_reports;
create policy "saved_reports_delete_own" on saved_reports for delete using (auth.uid() = user_id);

-- Ciudad/provincia estructuradas: además de "zona" (texto libre que ya
-- existía, ej. "Villa San Lorenzo"), cuando la persona elige la dirección
-- del autocompletado de Google Places (ZonaAutocomplete.jsx) ahora también
-- se guardan estos dos campos aparte, extraídos de los address_components
-- de esa selección ("locality" y "administrative_area_level_1"). Se usan
-- para completar la línea de zona del flyer imprimible (ver flyer.js) con
-- ciudad + provincia cuando esa info está disponible — quedan null cuando
-- la persona tipeó la zona a mano (sin pasar por el autocompletado), igual
-- que zona seguía funcionando antes de este cambio.
alter table reports add column if not exists ciudad text;
alter table reports add column if not exists provincia text;
alter table reports drop constraint if exists reports_ciudad_len;
alter table reports add constraint reports_ciudad_len check (ciudad is null or char_length(ciudad) <= 80) not valid;
alter table reports drop constraint if exists reports_provincia_len;
alter table reports add constraint reports_provincia_len check (provincia is null or char_length(provincia) <= 80) not valid;

-- ---------------------------------------------------------------------------
-- Hallazgo de auditoría de seguridad (2026-08-07): mass assignment real en
-- "contributors". contributors_update_own/insert_own (más arriba) solo
-- restringen la FILA ("auth.uid() = id"), no las COLUMNAS — cualquier
-- usuario logueado podía, llamando al cliente de Supabase directo (sin pasar
-- por award_points/send_heart, que sí están bien acotadas), hacer:
--   supabase.from('contributors').update({ points: 999999999 }).eq('id', miPropioId)
-- e inflar su propio puntaje/racha/reencuentros arbitrariamente en el
-- ranking público — exactamente el "Mass Assignment" que pide revisar OWASP.
-- award_points()/send_heart() ya existían para el caso de tocar la fila de
-- OTRA persona, pero nunca protegían la fila PROPIA porque para eso ni
-- hacía falta una función: la policy de update ya lo permitía directo.
--
-- Mismo patrón que la columna de contacto (revoke select más arriba): en vez
-- de sacar la policy de update entera (updateProfile() la necesita para
-- nickname/whatsapp) o intentar validar "no cambiaste este valor" dentro de
-- una policy RLS (no se puede comparar OLD/NEW ahí), se revoca a nivel de
-- Postgres el UPDATE/INSERT de las columnas sensibles para authenticated —
-- updateProfile() nunca las toca, así que sigue funcionando igual; points/
-- reportes/reencuentros/hearts/streak_days/last_active_date quedan
-- alcanzables SOLO por las funciones security definer de abajo.
--
-- CORRECCIÓN (2026-08-08): igual que con contacto_whatsapp/contacto_email
-- más arriba, un revoke de columna puntual NO alcanza si el rol ya tiene el
-- privilegio a nivel de TODA LA TABLA (confirmado en vivo: la versión
-- anterior de este revoke nunca bloqueó nada — points/reportes seguían
-- siendo editables directo con la anon key). Se revoca la tabla entera y se
-- vuelve a otorgar explícita cada columna permitida.
-- ---------------------------------------------------------------------------
revoke update on contributors from anon, authenticated;
grant update (id, nickname, whatsapp, updated_at) on contributors to anon, authenticated;

revoke insert on contributors from anon, authenticated;
grant insert (id, nickname, whatsapp, updated_at) on contributors to anon, authenticated;

-- bump_streak: la racha (bumpStreak en store.js) era el único lee-y-escribe
-- directo que quedaba tocando esas columnas para la FILA PROPIA — a
-- diferencia de award_points/send_heart, nunca se había migrado a una
-- función, porque nunca tocaba la fila de otra persona (por eso no rompía
-- con la policy de update). El revoke de arriba lo habría dejado sin forma
-- de funcionar sin esto.
--
-- REDISEÑO (auditoría integral, 2026-08-09): antes el cliente mandaba
-- p_today/p_yesterday ya calculados, y el servidor solo los validaba contra
-- un margen de ±2 días — mitigaba el abuso más burdo, pero seguía siendo el
-- cliente quien "declaraba" qué día era. Ahora el cliente solo manda su
-- TIMEZONE (nombre IANA, ej. "America/Argentina/Buenos_Aires" — necesario
-- de verdad, no cosmético: sin él, el corte de "día" caería a medianoche
-- UTC, que en Argentina son las 21hs, y alguien que abre la app a las 22hs
-- vería "ayer"). "Hoy" se calcula ENTERAMENTE server-side, a partir del
-- reloj real de Postgres + ese timezone — el cliente ya no puede declarar
-- una fecha arbitraria.
--
-- Queda un solo vector: cambiar de timezone repetidas veces EN EL MISMO
-- MOMENTO REAL para que "today" salte de un día a otro sin que pase tiempo
-- de verdad (ej. UTC-12 y después UTC+14 en el mismo minuto — 26hs de
-- diferencia). streak_updated_at (columna nueva, dedicada — no reutiliza
-- "updated_at" porque otras funciones como award_points también la tocan,
-- lo que daría falsos positivos) cierra ese hueco: no permite otro
-- incremento si el último fue hace menos de 12hs REALES, sin importar qué
-- timezone declare. Nadie usa la app dos veces por día con menos de 12hs
-- reales entre medio de forma legítima para efectos de la racha.
alter table contributors add column if not exists streak_updated_at timestamptz;

drop function if exists public.bump_streak(text, text, date, date);

create or replace function public.bump_streak(p_user_id text, p_display_name text, p_timezone text default 'UTC')
returns table(streak_days integer, is_new_today boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  cur record;
  new_streak integer;
  tz text;
  today date;
  yesterday date;
begin
  if auth.uid() is null or auth.uid()::text <> p_user_id then
    raise exception 'Solo podés actualizar tu propia racha.';
  end if;

  -- Timezone inválido/desconocido cae a UTC en vez de tirar un error feo —
  -- "AT TIME ZONE" con un nombre que Postgres no reconoce rompe con una
  -- excepción interna poco clara; mejor degradar que romper la racha.
  tz := coalesce(p_timezone, 'UTC');
  if not exists (select 1 from pg_timezone_names where name = tz) then
    tz := 'UTC';
  end if;

  today := (now() at time zone tz)::date;
  yesterday := today - 1;

  select * into cur from contributors where id = p_user_id;

  if cur.id is not null and cur.last_active_date = today then
    return query select coalesce(cur.streak_days, 0), false;
    return;
  end if;

  if cur.id is not null and cur.streak_updated_at is not null and cur.streak_updated_at > now() - interval '12 hours' then
    return query select coalesce(cur.streak_days, 0), false;
    return;
  end if;

  if cur.id is not null and cur.last_active_date = yesterday then
    new_streak := coalesce(cur.streak_days, 0) + 1;
  else
    new_streak := 1;
  end if;

  insert into contributors (id, nickname, points, reportes, reencuentros, streak_days, last_active_date, streak_updated_at, updated_at)
  values (p_user_id, coalesce(p_display_name, p_user_id), 0, 0, 0, new_streak, today, now(), now())
  on conflict (id) do update set
    nickname = coalesce(p_display_name, contributors.nickname),
    streak_days = new_streak,
    last_active_date = today,
    streak_updated_at = now(),
    updated_at = now();

  return query select new_streak, true;
end;
$$;

revoke all on function public.bump_streak(text, text, text) from public, anon, authenticated;
grant execute on function public.bump_streak(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Hallazgo de auditoría de seguridad (2026-08-07): reports_insert_all (más
-- arriba) es "with check (true)" — sin ninguna restricción sobre user_id.
-- Cualquiera (ni siquiera hace falta estar logueado) podía insertar un
-- reporte directo contra la API de Supabase con user_id = el UUID de OTRA
-- persona real. Quien insertó así no gana control sobre esa fila después
-- (reports_update_owner/reports_delete_owner comparan auth.uid() DE QUIEN
-- ACTÚA contra user_id, no importa quién insertó originalmente), pero sí
-- logra que un reporte falso/ofensivo aparezca listado como propio en "Mis
-- reportes" de la cuenta de la víctima la próxima vez que inicie sesión —
-- suplantación de autoría, no takeover de la fila.
--
-- El fix preserva el comportamiento actual para los dos casos legítimos
-- (invitado sin cuenta: user_id null: y usuario logueado publicando a su
-- propio nombre: user_id = auth.uid()) y bloquea el resto. Sin sesión,
-- auth.uid() es null, así que un anónimo solo puede insertar con user_id
-- null — no puede spoofear ningún UUID ajeno ni logueado.
-- ---------------------------------------------------------------------------
drop policy if exists "reports_insert_all" on reports;
drop policy if exists "reports_insert_own_or_guest" on reports;
create policy "reports_insert_own_or_guest" on reports
  for insert with check (user_id is null or user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Hallazgo de auditoría de seguridad (2026-08-07): reports_update_owner
-- (auth.uid() = user_id) es correcto para "sos el dueño de la fila", pero no
-- distingue COLUMNAS — el dueño de un reporte podía, llamando al cliente
-- directo, revertir su propio "oculto" a false:
--   supabase.from('reports').update({ oculto: false }).eq('id', miReporte)
-- Eso rompe por completo la moderación: alguien cuyo reporte se auto-ocultó
-- por 3 denuncias reales (flag_report) simplemente se lo reactivaba solo,
-- sin que ningún admin lo revise. "oculto" tiene que quedar alcanzable
-- ÚNICAMENTE por admin_set_oculto() (admin) y flag_report() (auto-ocultado
-- por denuncias) — mismo patrón que el revoke de columnas de contacto y de
-- puntos/racha más arriba. El resto de los campos de un reporte propio
-- (color, zona, resuelto, etc.) se siguen pudiendo editar directo — esto no
-- les saca ningún permiso legítimo, "oculto" es lo único que nunca debería
-- decidir el propio autor del reporte.
--
-- CORRECCIÓN (2026-08-08): mismo motivo que los dos revoke de columna de
-- más arriba — "revoke update (oculto) ... from anon" no alcanza cuando
-- esos roles ya tienen UPDATE a nivel de toda la tabla. Se revoca la tabla
-- entera y se vuelve a otorgar cada columna permitida (todas menos
-- "oculto", "id", "creado_en" y "user_id" — estas tres últimas tampoco
-- deberían cambiar después de creado el reporte: cambiar el dueño de una
-- fila ya existente no es un caso de uso real de esta app).
-- ---------------------------------------------------------------------------
-- push_subscription tampoco está en esta lista (auditoría integral,
-- 2026-08-09): ahora solo se toca vía subscribe_report_push (security
-- definer, verifica dueño o push_token) — dejarla en este grant hubiera
-- permitido que el dueño logueado de un reporte la pisara con un UPDATE
-- directo, esquivando esa función a propósito.
revoke update on reports from anon, authenticated;
grant update (
  tipo, especie, nombre, color, color_otro, tamano, sexo, edad, peso, zona,
  lat, lng, fecha, descripcion, contacto_whatsapp, contacto_email, foto_url,
  hist, embedding, foto_urls, hists, embeddings, nickname, resuelto,
  resuelto_por, resuelto_por_user_id, resuelto_en, raza,
  detalles, ciudad, provincia
) on reports to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Hallazgo de auditoría de performance (2026-08-07): "reports" nunca tuvo
-- ningún índice más allá de la primary key (id) — cada consulta hace un
-- full table scan. Con el volumen de hoy no se nota, pero ya es el patrón
-- real de acceso de la app:
--  - fetchReports() (store.js): "order by creado_en desc" en cada carga del
--    listado/Explorar.
--  - sitemap.js / r/[id]/page.js: "where resuelto=eq.false order by
--    creado_en.desc" contra la REST API directa.
--  - notify-match/route.js: "where tipo=eq.X and especie=eq.Y and
--    resuelto=eq.false" — corre en CADA publicación nueva (el trigger la
--    dispara siempre), es la consulta más sensible a volumen de toda la app.
--  - admin_metrics(): varios "count(*) where oculto"/"where not oculto".
-- Los tres índices de abajo cubren esos cuatro patrones sin tocar ninguna
-- query existente — son puramente aditivos, "if not exists" (no rompen nada
-- si ya corriste esta migración antes).
-- ---------------------------------------------------------------------------
create index if not exists reports_creado_en_idx on reports (creado_en desc);
create index if not exists reports_resuelto_tipo_especie_idx on reports (resuelto, tipo, especie);
create index if not exists reports_oculto_idx on reports (oculto) where oculto = true;

-- ---------------------------------------------------------------------------
-- Rate limiting de /api/chat (Asistente Felpus, 2026-10-18). Cada mensaje
-- del chat es una llamada paga a la API de Claude, así que el cupo por IP es
-- chico y además tiene tope diario. Mismo diseño que check_embed_rate_limit:
-- tabla sin políticas (nadie la lee por la API), función security definer
-- solo para service_role, y la IP la determina exclusivamente la ruta de
-- servidor (la que ve Vercel, no falsificable por quien visita el sitio).
-- Puramente aditivo: no toca ninguna tabla existente. Si todavía no se
-- corrió, /api/chat usa check_embed_rate_limit como respaldo.
-- ---------------------------------------------------------------------------
create table if not exists chat_requests (
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_requests_ip_created_idx on chat_requests (ip, created_at);
alter table chat_requests enable row level security;

create or replace function public.check_chat_rate_limit(client_ip text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  per_minute integer;
  per_day integer;
  max_per_minute constant integer := 8;
  max_per_day constant integer := 80;
begin
  if client_ip is null or client_ip = '' then
    return true;
  end if;

  delete from chat_requests where created_at < now() - interval '1 day';

  select count(*) filter (where created_at > now() - interval '1 minute'), count(*)
    into per_minute, per_day
    from chat_requests
    where ip = client_ip;

  if per_minute >= max_per_minute or per_day >= max_per_day then
    return false;
  end if;

  insert into chat_requests (ip) values (client_ip);
  return true;
end;
$$;

revoke all on function public.check_chat_rate_limit(text) from public, anon, authenticated;
grant execute on function public.check_chat_rate_limit(text) to service_role;

-- ---------------------------------------------------------------------------
-- Perfil: foto y país/provincia/ciudad (2026-10-22). Mismo contenido que
-- supabase/migrations/20261022_01_perfil_foto_ubicacion.sql (ver ahí el
-- porqué de cada línea).
-- ---------------------------------------------------------------------------
alter table contributors add column if not exists avatar_url text;
alter table contributors add column if not exists pais text;
alter table contributors add column if not exists provincia text;
alter table contributors add column if not exists ciudad text;

alter table contributors drop constraint if exists contributors_avatar_url_bucket;
alter table contributors add constraint contributors_avatar_url_bucket check (
  avatar_url is null
  or (
    char_length(avatar_url) <= 300
    and avatar_url like 'https://%.supabase.co/storage/v1/object/public/felpus-photos/avatars/%'
  )
);

alter table contributors drop constraint if exists contributors_ubicacion_len;
alter table contributors add constraint contributors_ubicacion_len check (
  (pais is null or char_length(pais) <= 60)
  and (provincia is null or char_length(provincia) <= 80)
  and (ciudad is null or char_length(ciudad) <= 80)
);

grant update (avatar_url, pais, provincia, ciudad) on contributors to authenticated;
grant insert (avatar_url, pais, provincia, ciudad) on contributors to authenticated;

-- ---------------------------------------------------------------------------
-- Bucket felpus-photos más cerrado (2026-10-22). Mismo contenido que
-- supabase/migrations/20261022_02_bucket_fotos_seguro.sql (ver ahí el
-- porqué): sin SVG, hasta 2 MB y solo los nombres de archivo que usa la app.
-- Reemplaza la configuración del bucket y la policy de insert de más arriba.
-- ---------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'felpus-photos';

drop policy if exists "felpus_photos_public_insert" on storage.objects;
create policy "felpus_photos_public_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'felpus-photos'
    and (
      name ~ '^[A-Za-z0-9-]{10,120}\.(jpg|jpeg|png|webp)$'
      or (
        auth.uid() is not null
        and name ~ ('^avatars/' || auth.uid()::text || '/avatar-[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
      )
    )
  );

-- ===========================================================================
-- Apoyos entre personas + antifraude (2026-10-26). Copia de
-- supabase/migrations/20261026_02_apoyos_y_antifraude.sql.
-- ===========================================================================
-- Apoyos entre personas + herramientas antifraude (2026-10-26).
--
-- Apoyos: cualquier colaborador puede activar "Aceptar apoyos" y cargar su
-- alias (CBU/CVU o alias). Desde el ranking, cualquiera puede verlo y
-- transferirle por fuera de Felpus: Felpus no cobra ni intermedia nada, y
-- apoyar no da ventajas en la app (regla de Google Play y Apple para
-- regalos entre personas).
--
-- Privacidad: alias_pago NO se agrega al SELECT por columnas de
-- contributors (ver 20261023_01_datos_privados.sql), así nadie lo lee en
-- bloque. Se obtiene de a uno con get_support_alias(), que solo llama el
-- servidor (/api/support-alias) con límite por IP; cada persona lee el suyo
-- con get_my_support().
--
-- Antifraude: el admin puede banear una cuenta (oculta todos sus reportes,
-- le apaga los apoyos, la saca del ranking y no la deja publicar) y ve un
-- informe de señales por usuario (denuncias recibidas, reportes ocultos,
-- reportes en las últimas 24 h, denuncias a su alias). Regla automática: un
-- alias con 3 o más denuncias de IPs distintas deja de mostrarse hasta que
-- el admin lo revise.
--
-- No borra ni cambia datos existentes.

-- ---------------------------------------------------------------------------
-- 1. Columnas nuevas en contributors
-- ---------------------------------------------------------------------------
alter table contributors add column if not exists alias_pago text;
alter table contributors add column if not exists acepta_apoyos boolean not null default false;
alter table contributors add column if not exists baneado boolean not null default false;
alter table contributors add column if not exists baneado_motivo text;
alter table contributors add column if not exists baneado_en timestamptz;
-- El admin puede volver a habilitar un alias denunciado sin banear a nadie.
alter table contributors add column if not exists apoyos_revisado_en timestamptz;

alter table contributors drop constraint if exists contributors_alias_pago_formato;
alter table contributors add constraint contributors_alias_pago_formato check (
  alias_pago is null
  or alias_pago ~ '^[0-9]{22}$'                 -- CBU / CVU
  or alias_pago ~ '^[A-Za-z0-9.-]{6,20}$'       -- alias bancario / Mercado Pago
);
alter table contributors drop constraint if exists contributors_baneado_motivo_len;
alter table contributors add constraint contributors_baneado_motivo_len check (baneado_motivo is null or char_length(baneado_motivo) <= 200);

-- Público: si acepta apoyos y si está suspendida (para el botón y el
-- ranking). El alias y el motivo del baneo, no.
grant select (acepta_apoyos, baneado) on public.contributors to anon, authenticated;
-- Cada uno edita solo sus datos de apoyo (la policy ya limita a la fila
-- propia). baneado/motivo NO: solo el admin, vía admin_set_baneado().
grant update (alias_pago, acepta_apoyos) on public.contributors to authenticated;
grant insert (alias_pago, acepta_apoyos) on public.contributors to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Denuncias de alias ("Reportar abuso" en la ventana de Apoyar)
-- ---------------------------------------------------------------------------
create table if not exists support_flags (
  id bigint generated always as identity primary key,
  contributor_id text not null,
  reason text not null check (char_length(reason) <= 200),
  ip text,
  created_at timestamptz not null default now()
);
create unique index if not exists support_flags_contrib_ip_uidx on support_flags (contributor_id, ip) where ip is not null;
create index if not exists support_flags_contrib_idx on support_flags (contributor_id, created_at);
alter table support_flags enable row level security; -- sin policies: solo las funciones de abajo

create table if not exists support_alias_lookups (
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists support_alias_lookups_ip_idx on support_alias_lookups (ip, created_at);
alter table support_alias_lookups enable row level security;

-- Denuncias desde la última revisión del admin.
create or replace function public.support_flag_count(p_contributor_id text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct coalesce(f.ip, f.id::text))::int
  from support_flags f
  join contributors c on c.id = f.contributor_id
  where f.contributor_id = p_contributor_id
    and (c.apoyos_revisado_en is null or f.created_at > c.apoyos_revisado_en);
$$;
revoke all on function public.support_flag_count(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Leer el alias de alguien (solo el servidor, con límite por IP)
-- ---------------------------------------------------------------------------
create or replace function public.get_support_alias(p_contributor_id text, p_client_ip text default null)
returns table(alias_pago text, nickname text)
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  if p_client_ip is not null then
    delete from support_alias_lookups where created_at < now() - interval '1 day';
    select count(*) into recent_count from support_alias_lookups
      where ip = p_client_ip and created_at > now() - interval '1 hour';
    if recent_count >= 30 then
      raise exception 'Demasiadas consultas desde esta conexión. Probá de nuevo más tarde.';
    end if;
    insert into support_alias_lookups (ip) values (p_client_ip);
  end if;

  return query
    select c.alias_pago, c.nickname
    from contributors c
    where c.id = p_contributor_id
      and c.acepta_apoyos
      and c.alias_pago is not null
      and not c.baneado
      and public.support_flag_count(c.id) < 3;
end;
$$;
revoke all on function public.get_support_alias(text, text) from public, anon, authenticated;
grant execute on function public.get_support_alias(text, text) to service_role;

-- Denunciar un alias (solo el servidor, con límite por IP).
create or replace function public.flag_support(p_contributor_id text, p_reason text, p_client_ip text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  if p_client_ip is not null then
    select count(*) into recent_count from support_flags
      where ip = p_client_ip and created_at > now() - interval '1 hour';
    if recent_count >= 10 then
      raise exception 'Demasiadas denuncias desde esta conexión. Probá de nuevo más tarde.';
    end if;
  end if;
  insert into support_flags (contributor_id, reason, ip)
    values (p_contributor_id, left(coalesce(p_reason, 'Sin motivo'), 200), p_client_ip)
    on conflict (contributor_id, ip) where ip is not null do nothing;
end;
$$;
revoke all on function public.flag_support(text, text, text) from public, anon, authenticated;
grant execute on function public.flag_support(text, text, text) to service_role;

-- Mis datos de apoyo (el alias no es legible por SELECT).
create or replace function public.get_my_support()
returns table(alias_pago text, acepta_apoyos boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.alias_pago, c.acepta_apoyos from contributors c where c.id = auth.uid()::text;
$$;
revoke all on function public.get_my_support() from public, anon;
grant execute on function public.get_my_support() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Admin: banear / desbanear y revisar alias
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_baneado(p_user_id text, p_baneado boolean, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.email() is distinct from 'santiagobarronlf@gmail.com' then
    raise exception 'No autorizado.';
  end if;
  insert into contributors (id, nickname, updated_at)
    values (p_user_id, 'Usuario', now())
    on conflict (id) do nothing;
  update contributors
    set baneado = p_baneado,
        baneado_motivo = case when p_baneado then left(p_motivo, 200) else null end,
        baneado_en = case when p_baneado then now() else null end,
        acepta_apoyos = case when p_baneado then false else acepta_apoyos end,
        updated_at = now()
    where id = p_user_id;
  -- Banear oculta todos sus reportes. Desbanear NO los vuelve a mostrar
  -- solos: el admin decide cuáles, uno por uno.
  if p_baneado then
    update reports set oculto = true where user_id::text = p_user_id;
  end if;
end;
$$;
revoke all on function public.admin_set_baneado(text, boolean, text) from public, anon;
grant execute on function public.admin_set_baneado(text, boolean, text) to authenticated;

-- "Revisado": las denuncias anteriores dejan de contar y el alias vuelve a
-- mostrarse (si la persona no está baneada).
create or replace function public.admin_mark_support_reviewed(p_user_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.email() is distinct from 'santiagobarronlf@gmail.com' then
    raise exception 'No autorizado.';
  end if;
  update contributors set apoyos_revisado_en = now() where id = p_user_id;
end;
$$;
revoke all on function public.admin_mark_support_reviewed(text) from public, anon;
grant execute on function public.admin_mark_support_reviewed(text) to authenticated;

-- Señales de fraude por cuenta, para el panel de admin.
create or replace function public.admin_user_signals()
returns table(
  id uuid,
  email text,
  nickname text,
  points integer,
  baneado boolean,
  baneado_motivo text,
  acepta_apoyos boolean,
  tiene_alias boolean,
  reportes_total integer,
  reportes_ocultos integer,
  reportes_24h integer,
  denuncias_recibidas integer,
  denuncias_alias integer,
  creado_en timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.email() is distinct from 'santiagobarronlf@gmail.com' then
    raise exception 'No autorizado.';
  end if;
  return query
    select
      u.id,
      u.email::text,
      c.nickname,
      coalesce(c.points, 0),
      coalesce(c.baneado, false),
      c.baneado_motivo,
      coalesce(c.acepta_apoyos, false),
      (c.alias_pago is not null),
      (select count(*)::int from reports r where r.user_id = u.id),
      (select count(*)::int from reports r where r.user_id = u.id and r.oculto),
      (select count(*)::int from reports r where r.user_id = u.id and r.creado_en > now() - interval '24 hours'),
      (select count(distinct f.ip)::int from report_flags f join reports r on r.id = f.report_id where r.user_id = u.id),
      (select count(distinct coalesce(s.ip, s.id::text))::int from support_flags s where s.contributor_id = u.id::text),
      u.created_at
    from auth.users u
    left join contributors c on c.id = u.id::text
    where u.email is not null
    order by u.created_at desc;
end;
$$;
revoke all on function public.admin_user_signals() from public, anon;
grant execute on function public.admin_user_signals() to authenticated;

-- ===========================================================================
-- Historial de huellitas y referidos (2026-10-27). Detalle y reglas en
-- supabase/migrations/20261027_02_historial_y_referidos.sql.
-- ===========================================================================
-- ---------------------------------------------------------------------------
-- 1. Historial propio
-- ---------------------------------------------------------------------------
create index if not exists points_events_user_created_idx on points_events (user_id, created_at desc);

create or replace function public.get_my_points_history(p_limit integer default 50)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'total', coalesce((select sum(points) from points_events where user_id = auth.uid()), 0),
    'events', coalesce((
      select json_agg(e order by e.created_at desc)
      from (
        select
          pe.reason,
          pe.points,
          pe.created_at,
          case
            when pe.reason = 'referido' then (select c.nickname from contributors c where c.id = pe.source_id)
            else (select r.nombre from reports r where r.id::text = pe.source_id)
          end as detalle,
          (select r.tipo from reports r where r.id::text = pe.source_id) as tipo
        from points_events pe
        where pe.user_id = auth.uid()
        order by pe.created_at desc
        limit least(greatest(coalesce(p_limit, 50), 1), 200)
      ) e
    ), '[]'::json)
  );
$$;
revoke all on function public.get_my_points_history(integer) from public, anon;
grant execute on function public.get_my_points_history(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Referidos
-- ---------------------------------------------------------------------------
create table if not exists referrals (
  referred_id uuid primary key,
  referrer_id uuid not null,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz
);
create index if not exists referrals_referrer_idx on referrals (referrer_id);
alter table referrals enable row level security;
-- Sin políticas: nadie lee/escribe esto directo, solo las funciones de abajo.
revoke all on public.referrals from anon, authenticated;

-- La llama la persona invitada al iniciar sesión. Devuelve 'ok',
-- 'ya-registrado' o 'no-aplica' (nunca error por un link raro: no hay nada
-- que la persona pueda hacer al respecto).
create or replace function public.register_referral(p_referrer_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_created timestamptz;
begin
  if me is null then
    raise exception 'Necesitás iniciar sesión.';
  end if;
  if p_referrer_id is null or p_referrer_id = me then
    return 'no-aplica';
  end if;
  if exists (select 1 from referrals where referred_id = me) then
    return 'ya-registrado';
  end if;
  select created_at into my_created from auth.users where id = me;
  if my_created is null or my_created < now() - interval '7 days' then
    return 'no-aplica';
  end if;
  if exists (select 1 from points_events where user_id = me) then
    return 'no-aplica';
  end if;
  if not exists (select 1 from auth.users where id = p_referrer_id) then
    return 'no-aplica';
  end if;
  insert into referrals (referred_id, referrer_id) values (me, p_referrer_id) on conflict do nothing;
  return 'ok';
end;
$$;
revoke all on function public.register_referral(uuid) from public, anon;
grant execute on function public.register_referral(uuid) to authenticated;

-- Resumen para quien invita: a cuántas personas invitó y cuántas ya
-- publicaron su primer reporte (= premios cobrados).
create or replace function public.get_my_referrals()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'invitados', count(*),
    'premiados', count(rewarded_at)
  )
  from referrals
  where referrer_id = auth.uid();
$$;
revoke all on function public.get_my_referrals() from public, anon;
grant execute on function public.get_my_referrals() to authenticated;

-- El premio: cuando la persona invitada recibe huellitas por su primer
-- reporte, quien la invitó suma 20. Corre dentro de award_points (misma
-- transacción), así que si algo falla acá tampoco se suman los del reporte.
create or replace function public.points_events_referral_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ref record;
  premios_hoy integer;
  inserted integer;
begin
  if new.reason <> 'reporte' then
    return new;
  end if;
  select * into ref from referrals where referred_id = new.user_id and rewarded_at is null for update;
  if ref.referred_id is null then
    return new;
  end if;
  if exists (select 1 from contributors where id = ref.referrer_id::text and coalesce(baneado, false)) then
    update referrals set rewarded_at = now() where referred_id = ref.referred_id;
    return new;
  end if;
  select count(*) into premios_hoy from referrals
    where referrer_id = ref.referrer_id and rewarded_at > now() - interval '24 hours';
  if premios_hoy >= 10 then
    -- Queda pendiente: se cobra con un próximo reporte de esa persona.
    return new;
  end if;

  update referrals set rewarded_at = now() where referred_id = ref.referred_id;
  insert into points_events (user_id, reason, source_id, points)
    values (ref.referrer_id, 'referido', ref.referred_id::text, 20)
    on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return new;
  end if;

  insert into contributors (id, nickname, points, updated_at)
  values (ref.referrer_id::text, 'Colaborador', 20, now())
  on conflict (id) do update set
    points = contributors.points + 20,
    updated_at = now();
  return new;
end;
$$;
revoke all on function public.points_events_referral_reward() from public, anon, authenticated;

drop trigger if exists points_events_referral_reward on public.points_events;
create trigger points_events_referral_reward
  after insert on public.points_events
  for each row execute function public.points_events_referral_reward();

-- ===========================================================================
-- Migraciones que faltaban en este archivo (sincronizado 2026-10-28). Se
-- agregan completas y en orden; son re-ejecutables (if not exists, drop ... if
-- exists, create or replace). Las que ya estaban más arriba (20261022_01,
-- 20261022_02, 20261026_02, 20261027_02) llevan su marca acá también.
-- ===========================================================================
-- >>> migración 20261022_01_perfil_foto_ubicacion.sql: ya incluida más arriba en este archivo.
-- >>> migración 20261022_02_bucket_fotos_seguro.sql: ya incluida más arriba en este archivo.
-- >>> migración 20261026_02_apoyos_y_antifraude.sql: ya incluida más arriba en este archivo.
-- >>> migración 20261027_02_historial_y_referidos.sql: ya incluida más arriba en este archivo.

-- >>> migración 20261020_01_alertas.sql
-- Alertas automáticas (ver PLAN-alertas.md y PROGRESO.md, 2026-10-20).
--
-- Puramente ADITIVA: crea extensiones, columnas, tablas, índices, funciones
-- y un trigger nuevos. No hace DROP de nada existente ni modifica datos ya
-- cargados (la única escritura es completar la columna NUEVA actividad_en
-- con la fecha de carga de cada reporte). Se puede correr más de una vez.
--
-- Se corre a mano en Supabase → SQL Editor, recién después del OK.

-- ---------------------------------------------------------------------------
-- PostGIS (gratis en Supabase): distancias reales para las zonas de alerta.
-- ---------------------------------------------------------------------------
create extension if not exists postgis with schema extensions;

-- Punto geográfico del reporte, calculado solo a partir de lat/lng (nunca se
-- escribe a mano). Null si el reporte no marcó ubicación en el mapa.
alter table public.reports
  add column if not exists location extensions.geography(Point, 4326)
  generated always as (
    case
      when lat is not null and lng is not null
        then extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
    end
  ) stored;
create index if not exists reports_location_gist on public.reports using gist (location);

-- Ciclo de vida: un reporte sin actividad en 60 días pasa a inactivo y deja
-- de generar alertas (se reactiva con "Renovar"). actividad_en arranca en la
-- fecha de carga de cada reporte.
alter table public.reports add column if not exists actividad_en timestamptz;
update public.reports set actividad_en = creado_en where actividad_en is null;
alter table public.reports alter column actividad_en set default now();
alter table public.reports add column if not exists inactivo boolean not null default false;
alter table public.reports add column if not exists aviso_inactividad_en timestamptz;

-- ---------------------------------------------------------------------------
-- Suscripciones push POR USUARIO (todos sus dispositivos). Las de invitados
-- siguen viviendo en reports.push_subscription, como hasta ahora.
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Zona de alerta de cada usuario. El centro nunca se expone a otros: no hay
-- política de lectura pública y las rutas de API solo devuelven la propia.
-- ---------------------------------------------------------------------------
create table if not exists public.alert_zones (
  user_id uuid primary key references auth.users on delete cascade,
  center extensions.geography(Point, 4326) not null,
  radius_m int not null check (radius_m in (1000, 3000, 5000, 10000)),
  species text[] not null default '{perro,gato}',
  report_types text[] not null default '{perdida,encontrada}',
  active boolean not null default true,
  updated_at timestamptz default now()
);
create index if not exists alert_zones_center_gist on public.alert_zones using gist (center);
alter table public.alert_zones enable row level security;
drop policy if exists alert_zones_own on public.alert_zones;
create policy alert_zones_own on public.alert_zones
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Registro de avisos enviados/pendientes. recipient = 'user:<uuid>' o
-- 'report:<id>' (invitados, que no tienen user_id). El unique evita avisar
-- dos veces lo mismo. Sin políticas: solo lo usa el servidor (service_role).
-- ---------------------------------------------------------------------------
create table if not exists public.notifications_log (
  id bigint generated always as identity primary key,
  recipient text not null,
  user_id uuid,
  report_id text not null,
  kind text not null check (kind in ('zona', 'match', 'inactividad')),
  status text not null default 'enviada' check (status in ('enviada', 'pendiente')),
  payload jsonb,
  created_at timestamptz default now(),
  unique (recipient, report_id, kind)
);
create index if not exists notifications_log_user_day_idx on public.notifications_log (user_id, kind, created_at);
create index if not exists notifications_log_pending_idx on public.notifications_log (status) where status = 'pendiente';
alter table public.notifications_log enable row level security;

-- ---------------------------------------------------------------------------
-- Coincidencias guardadas (no existía ninguna tabla de matches).
-- ---------------------------------------------------------------------------
create table if not exists public.matches (
  id bigint generated always as identity primary key,
  report_lost_id text not null references public.reports (id) on delete cascade,
  report_found_id text not null references public.reports (id) on delete cascade,
  score real not null,
  estado text not null default 'nuevo' check (estado in ('nuevo', 'visto', 'descartado', 'confirmado', 'cerrado')),
  notificado boolean not null default false,
  created_at timestamptz default now(),
  unique (report_lost_id, report_found_id)
);
create index if not exists matches_found_idx on public.matches (report_found_id);
alter table public.matches enable row level security;
-- Cada dueño (con cuenta) lee las coincidencias de sus propios reportes. Los
-- cambios de estado pasan por /api/matches (service_role).
drop policy if exists matches_owner_read on public.matches;
create policy matches_owner_read on public.matches
  for select to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.user_id = auth.uid() and r.id in (matches.report_lost_id, matches.report_found_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Zonas que contienen el punto de un reporte (ST_DWithin), filtradas por
-- especie y tipo. Solo service_role: nunca devuelve el centro de la zona.
-- ---------------------------------------------------------------------------
create or replace function public.alert_zone_recipients(p_report_id text)
returns table (user_id uuid, distance_m double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select z.user_id, extensions.st_distance(z.center, r.location) as distance_m
  from public.reports r
  join public.alert_zones z
    on z.active
   and extensions.st_dwithin(z.center, r.location, z.radius_m)
   and r.especie = any (z.species)
   and r.tipo = any (z.report_types)
  where r.id = p_report_id
    and r.location is not null
    and (r.user_id is null or z.user_id <> r.user_id);
$$;
revoke all on function public.alert_zone_recipients(text) from public, anon, authenticated;
grant execute on function public.alert_zone_recipients(text) to service_role;

-- Guarda o actualiza la zona de un usuario a partir de lat/lng (PostgREST no
-- sabe armar un geography). Solo service_role: la ruta /api/alerts/zone
-- verifica la sesión y pasa el user_id real.
create or replace function public.upsert_alert_zone(
  p_user_id uuid, p_lat double precision, p_lng double precision, p_radius_m int,
  p_species text[], p_report_types text[], p_active boolean
)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  insert into public.alert_zones (user_id, center, radius_m, species, report_types, active, updated_at)
  values (
    p_user_id,
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
    p_radius_m, p_species, p_report_types, p_active, now()
  )
  on conflict (user_id) do update set
    center = excluded.center,
    radius_m = excluded.radius_m,
    species = excluded.species,
    report_types = excluded.report_types,
    active = excluded.active,
    updated_at = now();
$$;
revoke all on function public.upsert_alert_zone(uuid, double precision, double precision, int, text[], text[], boolean) from public, anon, authenticated;
grant execute on function public.upsert_alert_zone(uuid, double precision, double precision, int, text[], text[], boolean) to service_role;

-- La zona propia, con lat/lng legibles (solo para su dueño, vía la ruta).
create or replace function public.get_alert_zone(p_user_id uuid)
returns table (lat double precision, lng double precision, radius_m int, species text[], report_types text[], active boolean)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select extensions.st_y(center::extensions.geometry), extensions.st_x(center::extensions.geometry),
         radius_m, species, report_types, active
  from public.alert_zones where user_id = p_user_id;
$$;
revoke all on function public.get_alert_zone(uuid) from public, anon, authenticated;
grant execute on function public.get_alert_zone(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Reencuentro confirmado → sus coincidencias se cierran (y el reporte ya no
-- genera alertas: el despacho filtra resuelto = false).
-- ---------------------------------------------------------------------------
create or replace function public.close_matches_on_resolve()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.resuelto and not coalesce(old.resuelto, false) then
    update public.matches set estado = 'cerrado'
      where (report_lost_id = new.id or report_found_id = new.id)
        and estado in ('nuevo', 'visto');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_close_matches_on_resolve on public.reports;
create trigger trg_close_matches_on_resolve
  after update of resuelto on public.reports
  for each row
  execute function public.close_matches_on_resolve();

-- >>> migración 20261020_02_alertas_cron.sql
-- Tarea diaria de las 8:00 (hora de Argentina = 11:00 UTC; Argentina no
-- tiene horario de verano). Llama a /api/alerts/flush, que:
--   1. manda las alertas de zona que quedaron "pendiente" durante la noche;
--   2. pasa a inactivos los reportes sin actividad en 60 días y avisa a los
--      dueños 7 días antes.
--
-- Requiere: pg_cron activado (Supabase → Database → Extensions → pg_cron) y
-- pg_net (ya está, lo usa trg_notify_new_report). Usa el MISMO secreto que el
-- trigger existente (Vault: 'notify_webhook_secret'), así no hay que guardar
-- otro. Aditiva: si el job ya existe con este nombre, cron.schedule lo
-- reemplaza (no toca ningún otro job).

create extension if not exists pg_cron;

select cron.schedule(
  'felpus-alertas-8am',
  '0 11 * * *',
  $job$
  select net.http_post(
    url := 'https://felpus.com/api/alerts/flush',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_webhook_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $job$
);

-- >>> migración 20261020_03_alertas_grant_inactivo.sql
-- Arreglo urgente (2026-10-20): la lista pública de reportes pide la columna
-- nueva "inactivo", pero reports usa permisos POR COLUMNA para anon y
-- authenticated (ver schema.sql: "revoke select on reports" + "grant select
-- (...)"). Sin este grant, Supabase rechaza toda la consulta con 42501 y el
-- sitio muestra 0 mascotas. Solo permite LEER un booleano; no cambia datos.
grant select (inactivo) on public.reports to anon, authenticated;

-- >>> migración 20261023_01_datos_privados.sql
-- Revisión de seguridad (2026-10-23): dos lecturas públicas que no tenían
-- que serlo, confirmadas en vivo con la anon key (que es pública por diseño:
-- va en el JS del sitio, así que lo que importa es qué permite leer).
--
-- CORRER DESPUÉS de que esté en producción el deploy que cambia
-- src/lib/store.js (CONTRIBUTOR_PUBLIC_COLUMNS): el código viejo pide
-- select("*") sobre contributors y, con el SELECT por columnas de abajo,
-- Supabase rechazaría esa consulta entera (el ranking quedaría vacío).
-- Nunca hace DROP de datos ni borra filas.

-- 1. contributors.whatsapp (el WhatsApp de perfil de "Mi Felpus") se podía
--    leer en bloque: GET /rest/v1/contributors?select=whatsapp devolvía los
--    teléfonos de todos. Mismo esquema que reports: SELECT revocado y
--    habilitado columna por columna, sin whatsapp. Cada usuario lee el suyo
--    con get_my_whatsapp() (solo su propia fila, vía auth.uid()).
revoke select on public.contributors from anon, authenticated;
grant select (
  id, nickname, points, reportes, reencuentros, hearts, streak_days,
  last_active_date, streak_updated_at, updated_at, avatar_url, pais,
  provincia, ciudad
) on public.contributors to anon, authenticated;

create or replace function public.get_my_whatsapp()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select whatsapp from public.contributors where id = auth.uid()::text;
$$;
revoke all on function public.get_my_whatsapp() from public, anon;
grant execute on function public.get_my_whatsapp() to authenticated;

-- 2. Bucket felpus-photos: la policy de SELECT abierta permitía LISTAR todos
--    los archivos (POST /storage/v1/object/list/felpus-photos), incluidas
--    fotos de reportes ocultos o borrados. Las fotos se siguen viendo igual:
--    el bucket es público y las URLs /object/public/... no pasan por esta
--    policy. Listar queda solo para el dueño de cada archivo (lo necesita
--    remove() al borrar sus fotos) y el admin.
drop policy if exists "felpus_photos_public_read" on storage.objects;
drop policy if exists "felpus_photos_owner_read" on storage.objects;
create policy "felpus_photos_owner_read"
  on storage.objects for select
  using (
    bucket_id = 'felpus-photos'
    and (owner = auth.uid() or auth.email() = 'santiagobarronlf@gmail.com')
  );

-- >>> migración 20261023_02_endurecimiento_permisos.sql
-- Auditoría integral de seguridad (2026-10-23) — endurecimiento de permisos.
-- Ver AUDITORIA_SEGURIDAD_2026-10-23.md para el detalle de cada hallazgo.
--
-- Qué NO hace: no borra filas, no borra tablas ni columnas, no toca datos
-- de usuarios. Solo cambia permisos (GRANT/REVOKE), una policy del bucket,
-- la configuración del bucket y una función. Todo es reversible.
--
-- Probada en un Postgres local con las mismas tablas, permisos y policies
-- que producción (scripts/audit-rls/): las lecturas/escrituras que tiene que
-- poder hacer la app siguen andando y las demás quedan denegadas.
--
-- Orden: correr DESPUÉS de que esté en producción el deploy de la rama
-- auditoria-seguridad-db (no depende del código, pero así se prueba junto).

-- ---------------------------------------------------------------------------
-- 1. Bucket de fotos (MEDIA): la migración 20261022_02 nunca se corrió en
--    producción. El bucket público aceptaba SVG (puede llevar JavaScript),
--    archivos de hasta 8 MB y cualquier nombre, subidos por cualquiera sin
--    login. Se reaplica igual que en esa migración (el código de la app ya
--    sube solo JPG/PNG/WebP con nombres de este formato).
-- ---------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'felpus-photos';

drop policy if exists "felpus_photos_public_insert" on storage.objects;
create policy "felpus_photos_public_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'felpus-photos'
    and (
      name ~ '^[A-Za-z0-9-]{10,120}\.(jpg|jpeg|png|webp)$'
      or (
        auth.uid() is not null
        and name ~ ('^avatars/' || auth.uid()::text || '/avatar-[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. get_report_contact (BAJA): devolvía el contacto también de reportes
--    ocultados por moderación (oculto = true). Mismo cuerpo, más la
--    condición. Solo la llama el servidor (service_role).
-- ---------------------------------------------------------------------------
create or replace function public.get_report_contact(p_report_id text, p_client_ip text default null)
returns table(contacto_whatsapp text, contacto_email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  if p_client_ip is not null then
    delete from contact_requests where created_at < now() - interval '1 day';

    select count(*) into recent_count
      from contact_requests
      where ip = p_client_ip and created_at > now() - interval '1 hour';

    if recent_count >= 30 then
      raise exception 'Demasiadas consultas de contacto desde esta conexión. Probá de nuevo más tarde.';
    end if;

    insert into contact_requests (ip) values (p_client_ip);
  end if;

  return query
    select r.contacto_whatsapp, r.contacto_email
    from reports r
    where r.id = p_report_id
      and r.oculto is distinct from true;
end;
$$;
revoke all on function public.get_report_contact(text, text) from public, anon, authenticated;
grant execute on function public.get_report_contact(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Mínimo privilegio en tablas (BAJA, defensa en profundidad). Hoy RLS ya
--    bloquea todo esto (comprobado), pero anon/authenticated tenían INSERT,
--    UPDATE, DELETE y TRUNCATE sobre casi todas las tablas: un solo error en
--    una policy futura (o desactivar RLS por un rato) las dejaba abiertas.
-- ---------------------------------------------------------------------------

-- 3a. Nadie del lado del cliente necesita TRUNCATE, TRIGGER ni REFERENCES.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- 3b. Tablas internas: solo las tocan el servidor (service_role) o
--     funciones SECURITY DEFINER (que corren como dueño, no como anon).
revoke all on table
  public.chat_requests, public.contact_requests, public.embed_requests,
  public.report_submissions, public.flag_submissions, public.error_log_submissions,
  public.error_logs, public.points_award_log, public.points_events,
  public.heart_sends, public.report_flags, public.notifications_log
from anon, authenticated;

-- 3c. Tablas por usuario: un visitante sin login no puede tener filas
--     propias, así que anon no necesita ningún permiso. authenticated
--     conserva lo que usan sus policies (dueño = auth.uid()).
revoke all on table public.saved_reports, public.push_subscriptions, public.alert_zones, public.matches from anon;
revoke update on table public.saved_reports from authenticated;               -- sin policy de UPDATE
revoke insert, update, delete on table public.matches from authenticated;     -- solo lee; escribe el servidor

-- 3d. reports y contributors: anon solo lee (columnas ya limitadas).
revoke insert, update, delete on table public.reports from anon;
revoke insert, update, delete on table public.contributors from anon;
revoke delete on table public.contributors from authenticated;                -- sin policy de DELETE

-- 3e. Secuencias: las usan solo inserts del servidor.
revoke all on all sequences in schema public from anon, authenticated;

-- 3f. Funciones de trigger: no se llaman como RPC; nadie necesita EXECUTE.
revoke all on function public.notify_new_report() from public, anon, authenticated;
revoke all on function public.close_matches_on_resolve() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Que no vuelva a pasar (MEDIA, prevención): Supabase da por defecto
--    TODOS los permisos a anon y authenticated sobre cada tabla, secuencia
--    y función NUEVA del esquema public. Una tabla nueva creada sin
--    "enable row level security" quedaba legible y editable por cualquiera.
--    Desde acá, lo nuevo arranca cerrado y cada migración otorga a mano lo
--    que haga falta (como ya se hace con reports y contributors).
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- >>> migración 20261026_01_puntos_y_reencuentro.sql
-- Revisión de seguridad (2026-10-26) — PROPUESTA, NO APLICADA.
-- Ver REVISION_SEGURIDAD_2026-10-26.md (hallazgos A2 y M3).
--
-- Qué NO hace: no borra filas ni columnas, no toca datos existentes.
-- Cambia una función (award_points) y agrega un trigger en reports.
-- Correr DESPUÉS de 20261023_02 (que sigue sin correr en producción).
--
-- Antes de correr, comprobá el estado (todo en el SQL Editor):
--   select has_table_privilege('anon', 'public.error_logs', 'select');
--   -- true  => 20261023_02 TODAVÍA NO SE CORRIÓ: correla primero.
--   -- false => ya está; seguí con este archivo.

-- ---------------------------------------------------------------------------
-- 1. award_points (MEDIA): con el motivo "bono-reporte-original" quien
--    llama elige p_user_id = OTRA persona y además manda p_display_name,
--    que se guardaba como nickname de esa otra persona. Resultado:
--    cualquier cuenta logueada podía cambiarle el nombre público en el
--    ranking a cualquier colaborador (los user_id son públicos). Ahora el
--    nombre recibido solo se usa para la fila propia. Mismo cuerpo, cambian
--    solo las dos líneas de nickname.
-- ---------------------------------------------------------------------------
create or replace function public.award_points(p_user_id text, p_display_name text, p_delta integer, p_reason text, p_source_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  calls_today integer;
  rpt record;
  own_resolved_id text;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión para sumar puntos.';
  end if;
  if (p_reason, p_delta) not in (('reencuentro', 50), ('bono-reporte-original', 20), ('reporte', 10), ('reporte', 15)) then
    raise exception 'Combinación de motivo/puntos no reconocida.';
  end if;
  if p_source_id is null or length(trim(p_source_id)) = 0 then
    raise exception 'Falta el reporte de origen.';
  end if;

  delete from points_award_log where created_at < now() - interval '2 days';
  select count(*) into calls_today from points_award_log
    where caller_id = auth.uid() and created_at > now() - interval '24 hours';
  if calls_today >= 40 then
    raise exception 'Demasiadas operaciones de puntos en poco tiempo. Probá de nuevo más tarde.';
  end if;
  insert into points_award_log (caller_id) values (auth.uid());

  select id, user_id, tipo, resuelto, nickname into rpt from reports where id = p_source_id;
  if rpt.id is null then
    raise exception 'No se encontró el reporte de origen.';
  end if;

  if p_reason = 'reporte' then
    if p_user_id <> auth.uid()::text or rpt.user_id is distinct from auth.uid() then
      raise exception 'Solo podés sumarte puntos por tus propios reportes.';
    end if;
  elsif p_reason = 'reencuentro' then
    if p_user_id <> auth.uid()::text or rpt.user_id is distinct from auth.uid() then
      raise exception 'Solo podés sumarte puntos por tus propios reencuentros.';
    end if;
    if rpt.resuelto is distinct from true then
      raise exception 'Ese reporte todavía no está marcado como reencontrado.';
    end if;
  elsif p_reason = 'bono-reporte-original' then
    if p_user_id = auth.uid()::text then
      raise exception 'Este motivo es para acreditarle puntos a otra persona.';
    end if;
    if rpt.user_id is null or rpt.user_id::text <> p_user_id then
      raise exception 'El reporte de origen no pertenece al usuario indicado.';
    end if;
    select id into own_resolved_id
      from reports
      where resuelto_por_user_id = auth.uid()
        and resuelto = true
        and resuelto_en > now() - interval '10 minutes'
        and tipo is distinct from rpt.tipo
        and id <> rpt.id
      limit 1;
    if own_resolved_id is null then
      raise exception 'No encontramos un reencuentro reciente propio para acreditar este bono.';
    end if;
  end if;

  begin
    insert into points_events (user_id, reason, source_id, points) values (p_user_id::uuid, p_reason, p_source_id, p_delta);
  exception when unique_violation then
    -- Ya se otorgaron puntos por este evento exacto — no es un error, solo
    -- evita el doble conteo (reintento del cliente, doble-click, o alguien
    -- probando a mano). No suma de nuevo, pero tampoco rompe el flujo.
    return;
  end;

  insert into contributors (id, nickname, points, reportes, reencuentros, updated_at)
  values (
    p_user_id,
    -- Solo se usa el nombre que manda quien llama si es SU propia fila.
    case when p_user_id = auth.uid()::text then coalesce(p_display_name, p_user_id) else coalesce(rpt.nickname, p_user_id) end,
    p_delta,
    case when p_reason = 'reporte' then 1 else 0 end,
    case when p_reason = 'reencuentro' then 1 else 0 end,
    now()
  )
  on conflict (id) do update set
    points = contributors.points + excluded.points,
    reportes = contributors.reportes + excluded.reportes,
    reencuentros = contributors.reencuentros + excluded.reencuentros,
    nickname = case when p_user_id = auth.uid()::text then coalesce(p_display_name, contributors.nickname) else contributors.nickname end,
    updated_at = now();
end;
$$;

revoke all on function public.award_points(text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.award_points(text, text, integer, text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 2. Datos del reencuentro (BAJA/MEDIA): resuelto_en y resuelto_por_user_id
--    tienen GRANT UPDATE para el dueño, así que el navegador elige qué
--    fecha y qué "resolvedor" quedan. award_points confía en esos dos
--    campos para el bono ("reencuentro propio en los últimos 10 minutos").
--    Este trigger los fija la base cuando el cambio viene de anon o
--    authenticated: al marcar resuelto = now() y auth.uid(); si resuelto no
--    cambia, quedan como estaban. El código actual (resolveReports en
--    store.js) ya manda exactamente esos valores, así que no cambia nada
--    para la app. El servidor (service_role) no pasa por esta regla.
-- ---------------------------------------------------------------------------
create or replace function public.reports_guard_resuelto()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.resuelto is true and old.resuelto is distinct from true then
      new.resuelto_en := now();
      new.resuelto_por_user_id := auth.uid();
    elsif new.resuelto is not distinct from old.resuelto then
      new.resuelto_en := old.resuelto_en;
      new.resuelto_por_user_id := old.resuelto_por_user_id;
    else
      new.resuelto_en := null;
      new.resuelto_por_user_id := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.reports_guard_resuelto() from public, anon, authenticated;

drop trigger if exists reports_guard_resuelto on public.reports;
create trigger reports_guard_resuelto
  before update on public.reports
  for each row execute function public.reports_guard_resuelto();

-- Rollback:
--   drop trigger if exists reports_guard_resuelto on public.reports;
--   drop function if exists public.reports_guard_resuelto();
--   (award_points: volver a correr su bloque de supabase/schema.sql)

-- >>> migración 20261027_01_link_de_cobro.sql
-- Link de cobro para los apoyos (2026-10-27).
--
-- Además del alias, cada colaborador puede cargar su propio link de cobro de
-- Mercado Pago (link de pago, mpago.la) o de Cafecito. En su ficha aparece el
-- botón "Pagar con …" que abre ese link: la plata va directo a la persona,
-- Felpus no cobra ni intermedia nada.
--
-- Solo se aceptan esos sitios (check de abajo, mismo criterio que
-- normalizeLinkCobro en src/lib/support.js), así nadie carga un link de
-- phishing. Igual que alias_pago, no es legible por SELECT: se obtiene de a
-- uno con get_support_alias() (servidor, límite por IP) y cada persona lee el
-- suyo con get_my_support(). Las reglas antifraude (baneo, 3 denuncias) lo
-- ocultan igual que al alias.
--
-- No borra ni cambia datos existentes.

alter table contributors add column if not exists link_cobro text;

alter table contributors drop constraint if exists contributors_link_cobro_formato;
alter table contributors add constraint contributors_link_cobro_formato check (
  link_cobro is null
  or link_cobro ~ '^https://(link\.mercadopago\.com\.ar|mpago\.la|mpago\.li|cafecito\.app)/[A-Za-z0-9._~/-]{1,150}$'
);

grant update (link_cobro) on public.contributors to authenticated;
grant insert (link_cobro) on public.contributors to authenticated;

-- Cambia el tipo que devuelven: hay que borrarlas y volver a crearlas.
drop function if exists public.get_support_alias(text, text);
create function public.get_support_alias(p_contributor_id text, p_client_ip text default null)
returns table(alias_pago text, nickname text, link_cobro text)
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  if p_client_ip is not null then
    delete from support_alias_lookups where created_at < now() - interval '1 day';
    select count(*) into recent_count from support_alias_lookups
      where ip = p_client_ip and created_at > now() - interval '1 hour';
    if recent_count >= 30 then
      raise exception 'Demasiadas consultas desde esta conexión. Probá de nuevo más tarde.';
    end if;
    insert into support_alias_lookups (ip) values (p_client_ip);
  end if;

  return query
    select c.alias_pago, c.nickname, c.link_cobro
    from contributors c
    where c.id = p_contributor_id
      and c.acepta_apoyos
      and (c.alias_pago is not null or c.link_cobro is not null)
      and not c.baneado
      and public.support_flag_count(c.id) < 3;
end;
$$;
revoke all on function public.get_support_alias(text, text) from public, anon, authenticated;
grant execute on function public.get_support_alias(text, text) to service_role;

drop function if exists public.get_my_support();
create function public.get_my_support()
returns table(alias_pago text, acepta_apoyos boolean, link_cobro text)
language sql
stable
security definer
set search_path = public
as $$
  select c.alias_pago, c.acepta_apoyos, c.link_cobro from contributors c where c.id = auth.uid()::text;
$$;
revoke all on function public.get_my_support() from public, anon;
grant execute on function public.get_my_support() to authenticated;

-- El panel de admin muestra "tiene alias" contando también el link.
-- (admin_user_signals no cambia de tipo: solo la condición.)
create or replace function public.admin_user_signals()
returns table(
  id uuid,
  email text,
  nickname text,
  points integer,
  baneado boolean,
  baneado_motivo text,
  acepta_apoyos boolean,
  tiene_alias boolean,
  reportes_total integer,
  reportes_ocultos integer,
  reportes_24h integer,
  denuncias_recibidas integer,
  denuncias_alias integer,
  creado_en timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.email() is distinct from 'santiagobarronlf@gmail.com' then
    raise exception 'No autorizado.';
  end if;
  return query
    select
      u.id,
      u.email::text,
      c.nickname,
      coalesce(c.points, 0),
      coalesce(c.baneado, false),
      c.baneado_motivo,
      coalesce(c.acepta_apoyos, false),
      (c.alias_pago is not null or c.link_cobro is not null),
      (select count(*)::int from reports r where r.user_id = u.id),
      (select count(*)::int from reports r where r.user_id = u.id and r.oculto),
      (select count(*)::int from reports r where r.user_id = u.id and r.creado_en > now() - interval '24 hours'),
      (select count(distinct f.ip)::int from report_flags f join reports r on r.id = f.report_id where r.user_id = u.id),
      (select count(distinct coalesce(s.ip, s.id::text))::int from support_flags s where s.contributor_id = u.id::text),
      u.created_at
    from auth.users u
    left join contributors c on c.id = u.id::text
    where u.email is not null
    order by u.created_at desc;
end;
$$;

-- >>> migración 20261028_01_avisos_email.sql
-- Avisos por email (2026-10-28): pocos y solo cuando importan.
--
--  - Coincidencia ALTA con tu reporte: como mucho 1 mail por semana.
--  - A los 30 días sin novedades: "¿Hubo novedades?" con 3 botones (volvió a
--    casa / sigo buscando / ya no busco). "Sigo buscando" renueva el reporte
--    (actividad_en) y el próximo llega 30 días después.
--  - Tope de mails por día (ver EMAIL_TOPE_DIARIO en src/lib/emailAvisos.js)
--    para no pasar el plan gratuito de Resend.
--
-- Solo se escribe al email que dejó quien publicó (contacto_email), que
-- sigue sin ser legible con la clave pública. Cada mail trae "No quiero más
-- avisos" (avisos_email = false).
--
-- Todo lo usa el servidor con service_role: no hacen falta grants para anon
-- ni authenticated. Si esta migración todavía no se corrió, la app publica
-- igual (create-report reintenta sin avisos_email) y los mails se saltean.
--
-- No borra ni cambia datos existentes.

alter table public.reports add column if not exists avisos_email boolean not null default true;
alter table public.reports add column if not exists seguimiento_email_en timestamptz;
alter table public.reports add column if not exists ultimo_email_match_en timestamptz;

-- notifications_log: también registra los mails (para el tope diario).
alter table public.notifications_log drop constraint if exists notifications_log_kind_check;
alter table public.notifications_log add constraint notifications_log_kind_check
  check (kind in ('zona', 'match', 'inactividad', 'email_match', 'email_seguimiento'));

-- >>> migración 20261028_02_permisos_colaboradores.sql
-- Permisos de colaboradores + chequeo automático de permisos (2026-10-28).
--
-- 1. Restaura los permisos que se perdieron al correr una versión vieja de
--    schema.sql en el SQL Editor: esa versión hacía "revoke update/insert on
--    contributors" y volvía a dar permiso solo a id/nickname/whatsapp/
--    updated_at. Sin los de abajo, guardar el perfil fallaba con "permission
--    denied for table contributors" (foto, ubicación, alias y link de cobro),
--    y la clave pública volvía a poder escribir en contributors (RLS igual
--    bloqueaba las filas). Mismas líneas que 20261022_01, 20261023_02,
--    20261026_02 y 20261027_01.
--
-- 2. felpus_permisos_faltantes(): lista los permisos que la app necesita y
--    no están (y los que NO deberían estar). /api/health la llama cada 30
--    minutos (salud.yml): si devuelve algo, el chequeo queda en rojo y GitHub
--    avisa por email. Solo devuelve nombres de permisos, nada de datos.
--
-- No borra ni cambia datos.

grant update (avatar_url, pais, provincia, ciudad) on public.contributors to authenticated;
grant insert (avatar_url, pais, provincia, ciudad) on public.contributors to authenticated;
grant update (alias_pago, acepta_apoyos) on public.contributors to authenticated;
grant insert (alias_pago, acepta_apoyos) on public.contributors to authenticated;
grant update (link_cobro) on public.contributors to authenticated;
grant insert (link_cobro) on public.contributors to authenticated;
revoke insert, update, delete on table public.contributors from anon;
revoke delete on table public.contributors from authenticated;
grant select (inactivo) on public.reports to anon, authenticated;

create or replace function public.felpus_permisos_faltantes()
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  faltan text[] := '{}';
  c text;
begin
  -- Escritura del perfil (updateProfile en src/lib/store.js).
  foreach c in array array['id', 'nickname', 'updated_at', 'avatar_url', 'pais', 'provincia', 'ciudad', 'alias_pago', 'acepta_apoyos', 'link_cobro', 'whatsapp'] loop
    if not has_column_privilege('authenticated', 'public.contributors', c, 'UPDATE') then
      faltan := faltan || ('authenticated UPDATE contributors.' || c);
    end if;
  end loop;
  foreach c in array array['id', 'nickname', 'updated_at', 'avatar_url', 'pais', 'provincia', 'ciudad'] loop
    if not has_column_privilege('authenticated', 'public.contributors', c, 'INSERT') then
      faltan := faltan || ('authenticated INSERT contributors.' || c);
    end if;
  end loop;
  -- La clave pública no escribe contributors (20261023_02).
  if has_table_privilege('anon', 'public.contributors', 'UPDATE')
     or has_column_privilege('anon', 'public.contributors', 'nickname', 'UPDATE') then
    faltan := faltan || 'SOBRA: anon UPDATE contributors'::text;
  end if;
  -- Datos privados que la clave pública nunca lee.
  foreach c in array array['whatsapp', 'alias_pago', 'link_cobro'] loop
    if has_column_privilege('anon', 'public.contributors', c, 'SELECT') then
      faltan := faltan || ('SOBRA: anon SELECT contributors.' || c);
    end if;
  end loop;
  foreach c in array array['contacto_whatsapp', 'contacto_email', 'push_token', 'push_subscription'] loop
    if has_column_privilege('anon', 'public.reports', c, 'SELECT') then
      faltan := faltan || ('SOBRA: anon SELECT reports.' || c);
    end if;
  end loop;
  return faltan;
end;
$$;

revoke all on function public.felpus_permisos_faltantes() from public;
grant execute on function public.felpus_permisos_faltantes() to anon, authenticated, service_role;

-- >>> migración 20261029_01_coordenadas_aproximadas.sql
-- Coordenadas aproximadas para la clave pública (2026-10-29).
--
-- El punto que marca quien publica puede ser su casa. Hasta ahora lat/lng
-- exactos se podían leer con la clave pública (va en el JS del sitio), y el
-- corrimiento de 150-350 m que hace la app (src/lib/approxLocation.js) era
-- solo de pantalla: como el código es público, se podía deshacer.
--
-- Ahora:
--   - lat_aprox / lng_aprox: las calcula la base (columnas generadas) sobre
--     una grilla de 0,004° (~445 m de norte a sur). El punto real queda a
--     como mucho ~315 m del aproximado. No se pueden escribir a mano.
--   - La clave pública (anon y authenticated) lee solo las aproximadas. Sin
--     permiso de lectura sobre lat/lng tampoco se puede filtrar ni ordenar
--     por ellas (?lat=gt...), que hubiera permitido encontrarlas por tanteo.
--   - El servidor (service_role: alertas, emails, notify-match) y el panel
--     de admin (admin_list_all_reports) siguen usando las exactas.
--   - Publicar no cambia: create-report escribe lat/lng con service_role, y
--     el dueño conserva el permiso de UPDATE de esas columnas.
--
-- Orden: primero tiene que estar desplegado el código que pide lat_aprox
-- (si la columna no existe, reintenta con lat/lng). Después de correr esto,
-- /api/health empieza a vigilar que lat no vuelva a ser legible.
-- Rollback: grant select (lat, lng) on public.reports to anon, authenticated;
--
-- No borra ni cambia datos existentes.

alter table public.reports
  add column if not exists lat_aprox double precision
  generated always as ((round((lat / 0.004)::numeric) * 0.004)::double precision) stored;
alter table public.reports
  add column if not exists lng_aprox double precision
  generated always as ((round((lng / 0.004)::numeric) * 0.004)::double precision) stored;

grant select (lat_aprox, lng_aprox) on public.reports to anon, authenticated;
revoke select (lat, lng) on public.reports from anon, authenticated;

-- >>> migración 20261029_02_alertas_admin.sql
-- Alertas al administrador (2026-10-29): cuándo se mandó por última vez
-- cada tipo de alerta, para no mandar la misma más de una vez cada 30
-- minutos (ver src/lib/serverAdminAlerts.js). Solo la usa el servidor con
-- service_role; nadie la lee con la clave pública.
--
-- Sin esta tabla las alertas igual salen (con el límite en memoria de cada
-- instancia del servidor, menos confiable).
--
-- No borra ni cambia datos existentes.

create table if not exists public.admin_alertas (
  firma text primary key,
  enviada_en timestamptz not null default now(),
  repeticiones integer not null default 0
);
alter table public.admin_alertas enable row level security;
revoke all on table public.admin_alertas from anon, authenticated;

-- Cuántas veces se repitió la alerta mientras estaba en silencio (para
-- saber, al mirar la tabla, si el problema siguió).
create or replace function public.admin_alerta_repetida(p_firma text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.admin_alertas set repeticiones = repeticiones + 1 where firma = p_firma;
$$;
revoke all on function public.admin_alerta_repetida(text) from public, anon, authenticated;
grant execute on function public.admin_alerta_repetida(text) to service_role;

-- >>> migración 20261030_01_aviso_avistamiento.sql
-- Aviso de avistamiento (2026-10-30): cuando alguien toca "La vi" en la
-- ficha de una perdida, el dueño recibe un push "¡Alguien podría haber
-- visto a tu mascota!" (ver notifySightingOwner en src/lib/alertsServer.js).
-- Esos envíos se registran en notifications_log con kind 'avistamiento',
-- para no repetirlos y para el límite de uno cada 30 minutos.
--
-- Solo amplía la lista de tipos permitidos. No borra ni cambia datos.
-- Sin esta migración, el aviso de avistamiento no sale (queda en el log del
-- servidor) y el resto de las alertas sigue igual.

alter table public.notifications_log drop constraint if exists notifications_log_kind_check;
alter table public.notifications_log add constraint notifications_log_kind_check
  check (kind in ('zona', 'match', 'inactividad', 'email_match', 'email_seguimiento', 'avistamiento'));

-- Rollback (solo si no hay filas con kind 'avistamiento'):
--   alter table public.notifications_log drop constraint if exists notifications_log_kind_check;
--   alter table public.notifications_log add constraint notifications_log_kind_check
--     check (kind in ('zona', 'match', 'inactividad', 'email_match', 'email_seguimiento'));
