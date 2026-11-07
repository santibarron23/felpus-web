-- Cupo de subida de fotos (2026-11-07, hallazgo M1 de
-- REVISION_SEGURIDAD_2026-11-07.md). /api/fotos/subir pide permiso a
-- felpus_limite (tipo "foto") antes de entregar cada permiso de subida
-- firmado. Mismo mecanismo que 20261104_01: solo agrega filas de cupo.
--
-- Uso real: hasta 3 fotos por aviso (más reintentos si se corta la red) y la
-- foto de perfil. 15 por minuto, 40 por hora y 80 por día por IP sobran para
-- una persona. El tope global (120 por hora, 400 por día) es lo que protege
-- el 1 GB del plan gratis aunque alguien rote IPs; si se llega, le llega una
-- alerta al admin ("Felpus llegó al tope diario de subidas de fotos").
-- Sin esta migración, /api/fotos/subir usa solo el respaldo en memoria.
-- Requiere 20261104_01. No borra ni cambia datos.
--
-- Rollback: delete from public.limites_config where bucket = 'foto';

insert into public.limites_config (bucket, tipo, ventana, maximo) values
  ('foto', 'ip', interval '1 minute', 15),
  ('foto', 'ip', interval '1 hour', 40),
  ('foto', 'ip', interval '1 day', 80),
  ('foto', 'global', interval '1 hour', 120),
  ('foto', 'global', interval '1 day', 400)
on conflict (bucket, tipo, ventana) do nothing;
