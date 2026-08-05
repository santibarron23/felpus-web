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
-- — controla FILAS, no columnas. Antes de esto, cualquiera con la anon key
-- (pública, está en el bundle del navegador de toda la app) podía pedir
-- "select=contacto_whatsapp,contacto_email" directo a la API REST y
-- llevarse el contacto de TODOS los reportes en un solo pedido, sin pasar
-- por fetchReportContact ni por ningún código del cliente — el hecho de que
-- el listado general no pidiera esas columnas era una convención del
-- frontend, no una restricción real. Esto revoca el SELECT de esas dos
-- columnas puntuales a nivel de Postgres (no de RLS) para anon/authenticated,
-- y deja como único camino esta función: rate-limitada por IP, con su propio
-- cupo (no comparte el de report_submissions — navegar varios detalles de
-- reportes en una sesión es normal y no debería competir con publicar
-- reportes o activar notificaciones push).
-- ---------------------------------------------------------------------------
revoke select (contacto_whatsapp, contacto_email) on reports from anon, authenticated;

create table if not exists contact_requests (
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists contact_requests_ip_created_idx on contact_requests (ip, created_at);
alter table contact_requests enable row level security;
-- Sin políticas: nadie (anon ni authenticated) puede leer ni escribir esta
-- tabla directamente vía la API — solo la toca la función de abajo.

create or replace function public.get_report_contact(p_report_id text)
returns table(contacto_whatsapp text, contacto_email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  client_ip text;
  recent_count integer;
begin
  begin
    client_ip := nullif(trim(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1)), '');
  exception when others then
    client_ip := null;
  end;

  -- Sin x-forwarded-for (llamado servidor-a-servidor, ej. el webhook de
  -- notify-match, o desde el SQL Editor) se deja pasar sin contar, mismo
  -- criterio que enforce_report_rate_limit más abajo.
  if client_ip is not null then
    delete from contact_requests where created_at < now() - interval '1 day';

    select count(*) into recent_count
      from contact_requests
      where ip = client_ip and created_at > now() - interval '1 hour';

    if recent_count >= 30 then
      raise exception 'Demasiadas consultas de contacto desde esta conexión. Probá de nuevo más tarde.';
    end if;

    insert into contact_requests (ip) values (client_ip);
  end if;

  return query select r.contacto_whatsapp, r.contacto_email from reports r where r.id = p_report_id;
end;
$$;

revoke all on function public.get_report_contact(text) from public;
grant execute on function public.get_report_contact(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rate limiting de creación de reportes: la política de arriba (with check
-- (true)) permite insertar sin límite a cualquiera, logueado o no — sin esto,
-- un script puede crear reportes (y fotos en Storage, con su costo) sin
-- ningún techo. RLS controla QUIÉN puede insertar, no CUÁNTO, así que el
-- límite va en un trigger.
--
-- PostgREST (la API REST que usa Supabase) expone los headers del pedido
-- HTTP original como el GUC "request.headers" — de ahí se saca el
-- x-forwarded-for para identificar la IP real del cliente sin necesitar
-- autenticación. Si no está disponible (ej. llamado desde el SQL Editor, o
-- el sembrado de datos de ejemplo que corre con la service key) se deja
-- pasar, para no romper flujos internos.
-- ---------------------------------------------------------------------------
create table if not exists report_submissions (
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists report_submissions_ip_created_idx on report_submissions (ip, created_at);
alter table report_submissions enable row level security;
-- Sin políticas: nadie (anon ni authenticated) puede leer ni escribir esta
-- tabla directamente vía la API — solo la toca la función security definer
-- de abajo, que corre con privilegios elevados.

create or replace function public.enforce_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  client_ip text;
  recent_count integer;
begin
  begin
    client_ip := nullif(trim(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1)), '');
  exception when others then
    client_ip := null;
  end;

  if client_ip is null then
    return NEW;
  end if;

  -- Poda oportunista: evita que la tabla crezca indefinidamente sin
  -- necesitar un cron job aparte.
  delete from report_submissions where created_at < now() - interval '1 day';

  select count(*) into recent_count
    from report_submissions
    where ip = client_ip and created_at > now() - interval '1 hour';

  if recent_count >= 8 then
    raise exception 'Se alcanzó el límite de reportes por hora desde esta conexión. Probá de nuevo más tarde.';
  end if;

  insert into report_submissions (ip) values (client_ip);
  return NEW;
end;
$$;

drop trigger if exists trg_enforce_report_rate_limit on public.reports;
create trigger trg_enforce_report_rate_limit
  before insert on public.reports
  for each row
  execute function public.enforce_report_rate_limit();

-- ---------------------------------------------------------------------------
-- Activar notificaciones push para un reporte puntual (no una suscripción
-- "de la cuenta": un reporte de invitado, sin login, también tiene que
-- poder recibir avisos — por eso esto no puede pasar por la policy de
-- UPDATE de arriba, que exige auth.uid() = user_id). Solo puede actualizar
-- push_subscription, ninguna otra columna.
--
-- Riesgo aceptado: como el id del reporte no es un secreto (aparece en la
-- URL pública /r/<id> y en los links de compartir), alguien que lo conozca
-- podría llamar a esto y "robar" la suscripción de otra persona — no
-- expone ningún dato (no devuelve nada), pero sí podría hacer que dejen de
-- llegarte avisos de tu propio reporte. Mismo nivel de riesgo ya aceptado
-- en otros lugares de esta app (ej. los reportes de invitado no se pueden
-- borrar ni por su propio autor — ver PENDIENTE_DECISION.md #0). Se mitiga
-- parcialmente reusando el mismo límite de 8/hora por IP que ya protege la
-- creación de reportes.
-- ---------------------------------------------------------------------------
create or replace function public.subscribe_report_push(p_report_id text, p_subscription jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  client_ip text;
  recent_count integer;
begin
  if p_subscription is null then
    raise exception 'Falta la suscripción.';
  end if;

  begin
    client_ip := nullif(trim(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1)), '');
  exception when others then
    client_ip := null;
  end;

  if client_ip is not null then
    select count(*) into recent_count
      from report_submissions
      where ip = client_ip and created_at > now() - interval '1 hour';
    if recent_count >= 8 then
      raise exception 'Demasiados intentos desde esta conexión. Probá de nuevo más tarde.';
    end if;
    insert into report_submissions (ip) values (client_ip);
  end if;

  update reports set push_subscription = p_subscription where id = p_report_id;
  if not found then
    raise exception 'No se encontró ese reporte.';
  end if;
end;
$$;

revoke all on function public.subscribe_report_push(text, jsonb) from public;
grant execute on function public.subscribe_report_push(text, jsonb) to anon, authenticated;

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

revoke all on function public.send_heart(text) from public;
grant execute on function public.send_heart(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: bucket público para las fotos de mascotas
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('felpus-photos', 'felpus-photos', true)
on conflict (id) do nothing;

drop policy if exists "felpus_photos_public_read" on storage.objects;
create policy "felpus_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'felpus-photos');

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
      url := 'https://felpus-web.vercel.app/api/notify-match',
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
-- atómica en la base, como el rate limit de reportes de más arriba, pero acá
-- la IP se pasa como parámetro (la ruta corre en nuestro propio servidor, no
-- hace falta leer request.headers de PostgREST).
-- ---------------------------------------------------------------------------
create table if not exists embed_requests (
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists embed_requests_ip_created_idx on embed_requests (ip, created_at);
alter table embed_requests enable row level security;
-- Sin políticas: nadie accede a esta tabla directamente vía la API — solo la
-- toca la función security definer de abajo.

create or replace function public.check_embed_rate_limit(client_ip text, max_per_minute integer default 12)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
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

revoke all on function public.check_embed_rate_limit(text, integer) from public;
grant execute on function public.check_embed_rate_limit(text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Log de errores del cliente: antes logError() solo hacía console.error, así
-- que un error en producción era invisible a menos que el usuario lo
-- reportara a mano. Esta tabla es el único lugar donde se guardan — sin
-- política de SELECT (mismo patrón que report_submissions/embed_requests de
-- arriba), así que nadie puede leerla vía la API; solo vos, desde el Table
-- Editor de Supabase (que usa la service key y ignora RLS).
-- No requiere ninguna cuenta ni servicio nuevo — reutiliza el Supabase que
-- ya existe.
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
-- Sin políticas de SELECT/UPDATE/DELETE: nadie lee ni modifica esto vía la
-- API. El INSERT sí queda abierto más abajo, mediado por rate limiting.

alter table error_logs drop constraint if exists error_logs_message_len;
alter table error_logs add constraint error_logs_message_len check (char_length(message) <= 2000);
alter table error_logs drop constraint if exists error_logs_stack_len;
alter table error_logs add constraint error_logs_stack_len check (stack is null or char_length(stack) <= 8000);
alter table error_logs drop constraint if exists error_logs_url_len;
alter table error_logs add constraint error_logs_url_len check (url is null or char_length(url) <= 500);
alter table error_logs drop constraint if exists error_logs_user_agent_len;
alter table error_logs add constraint error_logs_user_agent_len check (user_agent is null or char_length(user_agent) <= 500);

-- El insert queda abierto a cualquiera (el error puede venir de un usuario
-- sin sesión) pero con el mismo rate limiting por IP que ya usan
-- reports/embed — sin esto, este endpoint sería una forma fácil de llenar
-- la tabla de basura sin límite.
create table if not exists error_log_submissions (
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists error_log_submissions_ip_created_idx on error_log_submissions (ip, created_at);
alter table error_log_submissions enable row level security;

create or replace function public.enforce_error_log_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  client_ip text;
  recent_count integer;
begin
  begin
    client_ip := nullif(trim(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1)), '');
  exception when others then
    client_ip := null;
  end;

  if client_ip is null then
    return NEW;
  end if;

  delete from error_log_submissions where created_at < now() - interval '1 day';

  select count(*) into recent_count
    from error_log_submissions
    where ip = client_ip and created_at > now() - interval '1 hour';

  -- Más permisivo que el de reports (8/hora): un mismo bug real puede
  -- disparar varios errores encadenados en poco tiempo para una persona.
  if recent_count >= 40 then
    raise exception 'rate limited';
  end if;

  insert into error_log_submissions (ip) values (client_ip);
  return NEW;
end;
$$;

drop trigger if exists trg_enforce_error_log_rate_limit on public.error_logs;
create trigger trg_enforce_error_log_rate_limit
  before insert on public.error_logs
  for each row
  execute function public.enforce_error_log_rate_limit();

drop policy if exists "error_logs_insert_all" on error_logs;
create policy "error_logs_insert_all" on error_logs for insert with check (true);
