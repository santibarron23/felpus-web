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
