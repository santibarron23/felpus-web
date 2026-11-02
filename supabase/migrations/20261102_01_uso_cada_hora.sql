-- Aviso temprano de uso de Supabase (2026-11-02): cada hora, al minuto 5,
-- llama a /api/alerts/uso, que cuenta los eventos de log de la última hora
-- y le avisa al admin si se disparan (ver src/lib/serverUsoSupabase.js).
-- El 31/10 hubo un pico de ~6,9 GB de logs en un día y no se pudo saber la
-- causa porque el plan gratis guarda el detalle un solo día.
--
-- Mismo mecanismo y mismo secreto que la tarea de las 8 (20261020_02):
-- pg_cron + pg_net, secreto 'notify_webhook_secret' del Vault. Si el job ya
-- existe con este nombre, cron.schedule lo reemplaza.
-- Sin SUPABASE_ACCESS_TOKEN en Vercel, la ruta responde sin hacer nada.
--
-- Para sacarlo: select cron.unschedule('felpus-uso-cada-hora');
-- No borra ni cambia datos.

select cron.schedule(
  'felpus-uso-cada-hora',
  '5 * * * *',
  $job$
  select net.http_post(
    url := 'https://felpus.com/api/alerts/uso',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_webhook_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $job$
);
