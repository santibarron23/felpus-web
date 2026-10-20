-- Arreglo urgente (2026-10-20): la lista pública de reportes pide la columna
-- nueva "inactivo", pero reports usa permisos POR COLUMNA para anon y
-- authenticated (ver schema.sql: "revoke select on reports" + "grant select
-- (...)"). Sin este grant, Supabase rechaza toda la consulta con 42501 y el
-- sitio muestra 0 mascotas. Solo permite LEER un booleano; no cambia datos.
grant select (inactivo) on public.reports to anon, authenticated;
