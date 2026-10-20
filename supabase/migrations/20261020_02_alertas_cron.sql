-- Tarea diaria de las 8:00 (hora de Argentina = 11:00 UTC; Argentina no
-- tiene horario de verano). Llama a /api/alerts/flush, que:
--   1. manda las alertas de zona que quedaron "pendiente" durante la noche;
--   2. pasa a inactivos los reportes sin actividad en 60 días y avisa a los
--      dueños 7 días antes.
--
-- Requiere: pg_cron activado (Supabase → Database → Extensions → pg_cron) y
-- pg_net (ya está, lo usa trg_notify_new_report). Usa el MISMO secreto que el
-- trigger existente (Vault: 'notify_webhook_secret'), así no hay que guardar
-- otro. Aditiva: si el job ya existe con este nombre, cron.schedule lo
-- reemplaza (no toca ningún otro job).

create extension if not exists pg_cron;

select cron.schedule(
  'felpus-alertas-8am',
  '0 11 * * *',
  $job$
  select net.http_post(
    url := 'https://felpus.com/api/alerts/flush',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_webhook_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $job$
);
