-- ---------------------------------------------------------------------------
-- Felpus — esquema de base de datos para Supabase
-- Pegá todo este archivo en el SQL Editor de tu proyecto Supabase y ejecutalo.
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
  creado_en, user_id, raza, detalles, oculto, ciudad, provincia
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

drop policy if exists "felpus_photos_public_read" on storage.objects;
create policy "felpus_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'felpus-photos');

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
