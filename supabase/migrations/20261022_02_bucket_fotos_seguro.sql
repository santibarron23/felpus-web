-- Bucket felpus-photos más cerrado (2026-10-22, análisis de seguridad).
--
-- Antes: cualquiera (sin sesión) podía subir cualquier archivo de imagen de
-- hasta 8 MB con cualquier nombre, incluso SVG. Un SVG puede llevar scripts:
-- quedaba hosteado en el dominio de Supabase (phishing, "hosting gratis") y
-- además era la puerta de entrada de la vulnerabilidad crítica de Next.js
-- en el optimizador de imágenes (GHSA-2464-fhr4-w9xw, corregida en 15.5.28).
--
-- Ahora:
-- - Solo JPEG, PNG y WebP (la app siempre sube JPEG: resizeImageFile y
--   cropAvatarDataUrl). Los 15 SVG de ejemplo que ya existen quedan donde
--   están (se pueden leer); solo se impide subir SVG nuevos.
-- - Hasta 2 MB por archivo (las fotos ya llegan achicadas a 1000 px, unos
--   100-400 KB; los avatares a 256 px).
-- - El nombre tiene que tener la forma que usa la app (ver uploadPhoto en
--   store.js): "<id del reporte>-<n>-<uuid>.jpg" en la raíz, o
--   "avatars/<tu usuario>/avatar-<uuid>.jpg" — y la carpeta de avatar solo
--   la del usuario con sesión iniciada.
--
-- No borra ningún archivo ni cambia las políticas de lectura o borrado.

update storage.buckets
set file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'felpus-photos';

drop policy if exists "felpus_photos_public_insert" on storage.objects;
create policy "felpus_photos_public_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'felpus-photos'
    and (
      name ~ '^[A-Za-z0-9-]{10,120}\.(jpg|jpeg|png|webp)$'
      or (
        auth.uid() is not null
        and name ~ ('^avatars/' || auth.uid()::text || '/avatar-[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
      )
    )
  );
