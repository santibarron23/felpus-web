-- Cupo de /api/coincidencias (2026-11-04): las coincidencias se calculan
-- ahora en el servidor (ver src/lib/serverCoincidencias.js). Mismo
-- mecanismo que 20261104_01 (felpus_limite): solo agrega filas de cupo.
--
-- Uso real: abrir "ver coincidencias" de un aviso, publicar, y la campanita
-- de Mi Felpus al entrar. 40 por minuto y 1500 por día por IP sobran para
-- una persona; el tope global frena a un script que rote IPs.
-- Sin esta migración, /api/coincidencias usa solo el respaldo en memoria.
-- Requiere 20261104_01. No borra ni cambia datos.
--
-- Rollback: delete from public.limites_config where bucket = 'coincidencias';

insert into public.limites_config (bucket, tipo, ventana, maximo) values
  ('coincidencias', 'ip', interval '1 minute', 40),
  ('coincidencias', 'ip', interval '1 day', 1500),
  ('coincidencias', 'global', interval '1 day', 60000)
on conflict (bucket, tipo, ventana) do nothing;
