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
