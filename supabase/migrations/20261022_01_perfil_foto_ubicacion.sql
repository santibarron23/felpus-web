-- Perfil: foto y país/provincia/ciudad (2026-10-22).
--
-- contributors ya es la tabla de perfil por cuenta (ver schema.sql, "Perfil:
-- NO se crea una tabla nueva"). Se suman 4 columnas opcionales. No borra ni
-- cambia nada que ya exista.
--
-- Seguridad:
-- - avatar_url solo puede apuntar a una foto subida al bucket de Felpus, en
--   la carpeta avatars/. Así nadie puede poner una URL de otro sitio que se
--   muestre en el ranking a todo el mundo.
-- - Largos acotados, igual que whatsapp.
-- - contributors tiene permisos POR COLUMNA para escribir (ver schema.sql:
--   "revoke update on contributors" + "grant update (...)"). Sin los grants
--   de abajo, guardar el perfil con estos campos fallaría con 42501.
--   Solo authenticated: el perfil se edita con sesión iniciada, y la policy
--   contributors_update_own/insert_own ya limita a la fila propia.

alter table contributors add column if not exists avatar_url text;
alter table contributors add column if not exists pais text;
alter table contributors add column if not exists provincia text;
alter table contributors add column if not exists ciudad text;

alter table contributors drop constraint if exists contributors_avatar_url_bucket;
alter table contributors add constraint contributors_avatar_url_bucket check (
  avatar_url is null
  or (
    char_length(avatar_url) <= 300
    and avatar_url like 'https://%.supabase.co/storage/v1/object/public/felpus-photos/avatars/%'
  )
);

alter table contributors drop constraint if exists contributors_ubicacion_len;
alter table contributors add constraint contributors_ubicacion_len check (
  (pais is null or char_length(pais) <= 60)
  and (provincia is null or char_length(provincia) <= 80)
  and (ciudad is null or char_length(ciudad) <= 80)
);

grant update (avatar_url, pais, provincia, ciudad) on contributors to authenticated;
grant insert (avatar_url, pais, provincia, ciudad) on contributors to authenticated;
