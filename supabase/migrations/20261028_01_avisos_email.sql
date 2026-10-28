-- Avisos por email (2026-10-28): pocos y solo cuando importan.
--
--  - Coincidencia ALTA con tu reporte: como mucho 1 mail por semana.
--  - A los 30 días sin novedades: "¿Hubo novedades?" con 3 botones (volvió a
--    casa / sigo buscando / ya no busco). "Sigo buscando" renueva el reporte
--    (actividad_en) y el próximo llega 30 días después.
--  - Tope de mails por día (ver EMAIL_TOPE_DIARIO en src/lib/emailAvisos.js)
--    para no pasar el plan gratuito de Resend.
--
-- Solo se escribe al email que dejó quien publicó (contacto_email), que
-- sigue sin ser legible con la clave pública. Cada mail trae "No quiero más
-- avisos" (avisos_email = false).
--
-- Todo lo usa el servidor con service_role: no hacen falta grants para anon
-- ni authenticated. Si esta migración todavía no se corrió, la app publica
-- igual (create-report reintenta sin avisos_email) y los mails se saltean.
--
-- No borra ni cambia datos existentes.

alter table public.reports add column if not exists avisos_email boolean not null default true;
alter table public.reports add column if not exists seguimiento_email_en timestamptz;
alter table public.reports add column if not exists ultimo_email_match_en timestamptz;

-- notifications_log: también registra los mails (para el tope diario).
alter table public.notifications_log drop constraint if exists notifications_log_kind_check;
alter table public.notifications_log add constraint notifications_log_kind_check
  check (kind in ('zona', 'match', 'inactividad', 'email_match', 'email_seguimiento'));
