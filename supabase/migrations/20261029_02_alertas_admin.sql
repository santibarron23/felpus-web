-- Alertas al administrador (2026-10-29): cuándo se mandó por última vez
-- cada tipo de alerta, para no mandar la misma más de una vez cada 30
-- minutos (ver src/lib/adminAlerts.js). Solo la usa el servidor con
-- service_role; nadie la lee con la clave pública.
--
-- Sin esta tabla las alertas igual salen (con el límite en memoria de cada
-- instancia del servidor, menos confiable).
--
-- No borra ni cambia datos existentes.

create table if not exists public.admin_alertas (
  firma text primary key,
  enviada_en timestamptz not null default now(),
  repeticiones integer not null default 0
);
alter table public.admin_alertas enable row level security;
revoke all on table public.admin_alertas from anon, authenticated;

-- Cuántas veces se repitió la alerta mientras estaba en silencio (para
-- saber, al mirar la tabla, si el problema siguió).
create or replace function public.admin_alerta_repetida(p_firma text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.admin_alertas set repeticiones = repeticiones + 1 where firma = p_firma;
$$;
revoke all on function public.admin_alerta_repetida(text) from public, anon, authenticated;
grant execute on function public.admin_alerta_repetida(text) to service_role;
