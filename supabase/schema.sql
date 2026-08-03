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
-- Antes de un lanzamiento real todavía conviene agregar rate limiting
-- (por IP o por usuario) a la creación de reportes.
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

-- ---------------------------------------------------------------------------
-- Webhook: avisa a /api/notify-match cada vez que se publica un reporte
-- nuevo, para que calcule coincidencias y mande el email correspondiente.
-- Usa pg_net (async, no bloquea el insert) y atrapa cualquier error propio
-- para que un problema con la notificación nunca rompa la publicación real
-- del reporte.
--
-- El secreto compartido NUNCA va literal acá (este archivo se sube a un
-- repo público) — se lee de un GUC de la base que se configura UNA sola vez
-- a mano en el SQL Editor, fuera de cualquier archivo versionado:
--   alter database postgres set app.notify_webhook_secret = '<tu secreto>';
-- Tiene que ser el mismo valor que NOTIFY_WEBHOOK_SECRET en Vercel. Si no
-- está configurado, la función no manda nada (no rompe el insert).
-- ---------------------------------------------------------------------------
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_new_report()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  webhook_secret text;
begin
  begin
    webhook_secret := current_setting('app.notify_webhook_secret', true);
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
