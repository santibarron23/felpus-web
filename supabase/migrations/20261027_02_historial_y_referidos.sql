-- Historial de huellitas y referidos (2026-10-27).
--
-- 1. get_my_points_history(): cada persona ve SUS movimientos de huellitas
--    (sale de points_events, que award_points ya llena desde hace tiempo).
-- 2. Referidos: cada colaborador tiene un link felpus.com/?invita=<su id>.
--    Quien entra por ese link, inicia sesión por primera vez y después
--    publica su PRIMER reporte, le hace ganar 20 huellitas a quien lo invitó.
--    El premio lo da la base (trigger en points_events): el navegador nunca
--    elige a quién ni cuánto.
--
-- Reglas antitrampa del referido:
--   - Solo cuentas nuevas (creadas hace menos de 7 días) y que todavía no
--     sumaron ninguna huellita. Una cuenta vieja no puede "anotarse" como
--     invitada de un amigo.
--   - Nadie se invita a sí mismo; una cuenta baneada no cobra premios.
--   - El premio llega recién con un reporte publicado (no solo por loguearse),
--     una sola vez por persona invitada (índice único de points_events).
--   - Tope: 10 premios por día para quien invita.
--
-- Qué NO hace: no borra ni cambia datos existentes. Agrega una tabla
-- (referrals), un trigger en points_events y 3 funciones.
-- Correr DESPUÉS de 20261026_02 (usa contributors.baneado).

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

-- Después de correr, en el SQL Editor:
--   select public.get_my_referrals();  -- tiene que devolver {"invitados" : 0, "premiados" : 0}
--
-- Rollback:
--   drop trigger if exists points_events_referral_reward on public.points_events;
--   drop function if exists public.points_events_referral_reward();
--   drop function if exists public.get_my_referrals();
--   drop function if exists public.register_referral(uuid);
--   drop function if exists public.get_my_points_history(integer);
--   (la tabla referrals se puede dejar: sin funciones nadie la usa)
