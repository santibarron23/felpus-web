-- Aviso de avistamiento (2026-10-30): cuando alguien toca "La vi" en la
-- ficha de una perdida, el dueño recibe un push "¡Alguien podría haber
-- visto a tu mascota!" (ver notifySightingOwner en src/lib/alertsServer.js).
-- Esos envíos se registran en notifications_log con kind 'avistamiento',
-- para no repetirlos y para el límite de uno cada 30 minutos.
--
-- Solo amplía la lista de tipos permitidos. No borra ni cambia datos.
-- Sin esta migración, el aviso de avistamiento no sale (queda en el log del
-- servidor) y el resto de las alertas sigue igual.

alter table public.notifications_log drop constraint if exists notifications_log_kind_check;
alter table public.notifications_log add constraint notifications_log_kind_check
  check (kind in ('zona', 'match', 'inactividad', 'email_match', 'email_seguimiento', 'avistamiento'));

-- Rollback (solo si no hay filas con kind 'avistamiento'):
--   alter table public.notifications_log drop constraint if exists notifications_log_kind_check;
--   alter table public.notifications_log add constraint notifications_log_kind_check
--     check (kind in ('zona', 'match', 'inactividad', 'email_match', 'email_seguimiento'));
