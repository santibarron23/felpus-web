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
