-- Coordenadas aproximadas para la clave pública (2026-10-29).
--
-- El punto que marca quien publica puede ser su casa. Hasta ahora lat/lng
-- exactos se podían leer con la clave pública (va en el JS del sitio), y el
-- corrimiento de 150-350 m que hace la app (src/lib/approxLocation.js) era
-- solo de pantalla: como el código es público, se podía deshacer.
--
-- Ahora:
--   - lat_aprox / lng_aprox: las calcula la base (columnas generadas) sobre
--     una grilla de 0,004° (~445 m de norte a sur). El punto real queda a
--     como mucho ~315 m del aproximado. No se pueden escribir a mano.
--   - La clave pública (anon y authenticated) lee solo las aproximadas. Sin
--     permiso de lectura sobre lat/lng tampoco se puede filtrar ni ordenar
--     por ellas (?lat=gt...), que hubiera permitido encontrarlas por tanteo.
--   - El servidor (service_role: alertas, emails, notify-match) y el panel
--     de admin (admin_list_all_reports) siguen usando las exactas.
--   - Publicar no cambia: create-report escribe lat/lng con service_role, y
--     el dueño conserva el permiso de UPDATE de esas columnas.
--
-- Orden: primero tiene que estar desplegado el código que pide lat_aprox
-- (si la columna no existe, reintenta con lat/lng). Después de correr esto,
-- /api/health empieza a vigilar que lat no vuelva a ser legible.
-- Rollback: grant select (lat, lng) on public.reports to anon, authenticated;
--
-- No borra ni cambia datos existentes.

alter table public.reports
  add column if not exists lat_aprox double precision
  generated always as ((round((lat / 0.004)::numeric) * 0.004)::double precision) stored;
alter table public.reports
  add column if not exists lng_aprox double precision
  generated always as ((round((lng / 0.004)::numeric) * 0.004)::double precision) stored;

grant select (lat_aprox, lng_aprox) on public.reports to anon, authenticated;
revoke select (lat, lng) on public.reports from anon, authenticated;
