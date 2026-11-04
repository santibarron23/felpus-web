-- Límites contra ataques automatizados (2026-11-04).
-- Ver REVISION_SEGURIDAD_2026-11-04.md (hallazgos A1, A2, A3 y M1).
--
-- Qué hace:
--   1. Una tabla de cupos (limites_config) y otra de uso (limites_uso), las
--      dos solo para el servidor: RLS activo y sin permisos para la clave
--      pública.
--   2. felpus_limite(): cuenta y registra un uso de forma atómica (un pedido
--      por vez por tipo, así 50 pedidos en paralelo no pasan todos juntos),
--      con tope por IP, por cuenta y uno global por día.
--   3. obtener_contacto_reporte(): igual que get_report_contact pero con los
--      cupos nuevos (por día además de por hora, por cuenta si hay sesión) y
--      sin gastar cupo al volver a abrir el mismo aviso.
--
-- Qué NO hace: no borra ni cambia datos existentes; no toca las funciones
-- viejas (check_chat_rate_limit, check_embed_rate_limit, get_report_contact),
-- que el código sigue usando de respaldo si esta migración no está.
--
-- Orden: se puede correr antes o después del deploy. Con el código nuevo y
-- sin esta migración, todo sigue como hoy (cupos viejos).
--
-- Para cambiar un cupo (por ejemplo, el tope diario del asistente):
--   update public.limites_config set maximo = 3000
--   where bucket = 'ia' and tipo = 'global' and ventana = interval '1 day';
--
-- Rollback: scripts/audit-rls/rollback_20261104_01.sql

create table if not exists public.limites_config (
  bucket text not null,          -- reporte | contacto | ia | embed
  tipo text not null,            -- ip | ipc (IP de alguien con sesión) | user | global
  ventana interval not null,
  maximo integer not null check (maximo > 0),
  primary key (bucket, tipo, ventana)
);
alter table public.limites_config enable row level security;
revoke all on table public.limites_config from anon, authenticated;

insert into public.limites_config (bucket, tipo, ventana, maximo) values
  -- Publicar (reportes, avistamientos): igual que hoy por hora, más tope diario.
  ('reporte', 'ip', interval '1 hour', 8),
  ('reporte', 'ip', interval '1 day', 20),
  ('reporte', 'ipc', interval '1 hour', 16),
  ('reporte', 'ipc', interval '1 day', 40),
  ('reporte', 'user', interval '1 hour', 8),
  ('reporte', 'user', interval '1 day', 20),
  ('reporte', 'global', interval '1 hour', 120),
  ('reporte', 'global', interval '1 day', 600),
  -- Ver el contacto de un aviso: cuenta avisos DISTINTOS (reabrir es gratis).
  ('contacto', 'ip', interval '1 hour', 30),
  ('contacto', 'ip', interval '1 day', 80),
  ('contacto', 'ipc', interval '1 hour', 60),
  ('contacto', 'ipc', interval '1 day', 160),
  ('contacto', 'user', interval '1 hour', 30),
  ('contacto', 'user', interval '1 day', 100),
  ('contacto', 'global', interval '1 day', 3000),
  -- Asistente (Claude) y leer capturas (Gemini): cuestan plata.
  ('ia', 'ip', interval '1 minute', 8),
  ('ia', 'ip', interval '1 day', 80),
  ('ia', 'global', interval '1 day', 1500),
  -- Vectores y chequeo de fotos (corren en Vercel: cuestan tiempo de función).
  ('embed', 'ip', interval '1 minute', 12),
  ('embed', 'ip', interval '1 day', 600),
  ('embed', 'global', interval '1 day', 20000)
on conflict (bucket, tipo, ventana) do nothing;

create table if not exists public.limites_uso (
  id bigint generated always as identity primary key,
  bucket text not null,
  clave text not null,
  ref text,
  creado_en timestamptz not null default now()
);
create index if not exists limites_uso_clave_idx on public.limites_uso (bucket, clave, creado_en);
create index if not exists limites_uso_creado_idx on public.limites_uso (creado_en);
alter table public.limites_uso enable row level security;
revoke all on table public.limites_uso from anon, authenticated;

-- Devuelve null si el pedido entra en el cupo (y lo registra), o el tipo de
-- límite que se pasó ('ip', 'ipc', 'user' o 'global'). p_claves: por ejemplo
-- {'ip:200.1.2.3', 'global'} o {'user:<uuid>', 'ipc:200.1.2.3', 'global'}.
-- Con p_ref (el id del aviso, en 'contacto'): si la primera clave ya pidió
-- ese mismo ref en las últimas 24 h, no gasta cupo.
create or replace function public.felpus_limite(p_bucket text, p_claves text[], p_ref text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  lim record;
  n integer;
begin
  if p_bucket is null or p_claves is null or cardinality(p_claves) = 0 then
    return null;
  end if;

  -- Un pedido por vez por tipo: sin esto, una ráfaga en paralelo leía el
  -- mismo conteo y pasaba entera.
  perform pg_advisory_xact_lock(hashtext('felpus_limite:' || p_bucket));

  -- Poda oportunista (el cupo más largo es de un día).
  if random() < 0.02 then
    delete from limites_uso where creado_en < now() - interval '2 days';
  end if;

  if p_ref is not null and exists (
    select 1 from limites_uso
    where bucket = p_bucket and clave = p_claves[1] and ref = p_ref
      and creado_en > now() - interval '1 day'
  ) then
    return null;
  end if;

  foreach k in array p_claves loop
    for lim in
      select c.ventana, c.maximo from limites_config c
      where c.bucket = p_bucket and c.tipo = split_part(k, ':', 1)
    loop
      select count(*) into n from limites_uso u
      where u.bucket = p_bucket and u.clave = k and u.creado_en > now() - lim.ventana;
      if n >= lim.maximo then
        return split_part(k, ':', 1);
      end if;
    end loop;
  end loop;

  foreach k in array p_claves loop
    insert into limites_uso (bucket, clave, ref) values (p_bucket, k, p_ref);
  end loop;
  return null;
end;
$$;
revoke all on function public.felpus_limite(text, text[], text) from public, anon, authenticated;
grant execute on function public.felpus_limite(text, text[], text) to service_role;

-- Contacto de un aviso con los cupos nuevos. Si el aviso no existe, está
-- oculto por moderación o no tiene contacto, no devuelve filas y no gasta
-- cupo. Si se pasó un cupo, devuelve una fila con el contacto vacío y
-- `limite` con el tipo de cupo (el servidor responde 429).
create or replace function public.obtener_contacto_reporte(p_report_id text, p_claves text[])
returns table(contacto_whatsapp text, contacto_email text, limite text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_limite text;
begin
  select rp.contacto_whatsapp as w, rp.contacto_email as e into r
  from reports rp
  where rp.id = p_report_id and rp.oculto is distinct from true;
  if not found or (coalesce(r.w, '') = '' and coalesce(r.e, '') = '') then
    return;
  end if;

  v_limite := felpus_limite('contacto', p_claves, p_report_id);
  if v_limite is not null then
    return query select null::text, null::text, v_limite;
    return;
  end if;
  return query select r.w, r.e, null::text;
end;
$$;
revoke all on function public.obtener_contacto_reporte(text, text[]) from public, anon, authenticated;
grant execute on function public.obtener_contacto_reporte(text, text[]) to service_role;
