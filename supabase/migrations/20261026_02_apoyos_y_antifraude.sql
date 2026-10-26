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
