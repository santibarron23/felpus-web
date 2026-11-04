-- Rollback de supabase/migrations/20261104_01_limites_anti_abuso.sql.
-- El código vuelve solo a los límites viejos (check_chat_rate_limit,
-- check_embed_rate_limit, get_report_contact y report_submissions) cuando
-- estas funciones no existen. Borra solo lo que creó esa migración (el
-- registro de uso de las últimas 48 h y los cupos).
drop function if exists public.obtener_contacto_reporte(text, text[]);
drop function if exists public.felpus_limite(text, text[], text);
drop table if exists public.limites_uso;
drop table if exists public.limites_config;
