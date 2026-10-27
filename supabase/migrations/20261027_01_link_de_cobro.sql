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
