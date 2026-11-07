-- Cerrar la subida directa de fotos (2026-11-07, hallazgo M1 de
-- REVISION_SEGURIDAD_2026-11-07.md).
--
-- CORRER RECIÉN DESPUÉS de que el código de /api/fotos/subir esté en
-- producción y se haya comprobado que publicar un aviso con foto anda
-- (la foto se ve en el aviso). Antes de eso, sacar esta policy deja a todos
-- sin poder subir fotos.
--
-- Qué hace: saca felpus_photos_public_insert, la policy que dejaba subir
-- archivos al bucket con la clave pública, sin límite de cantidad. Desde
-- este cambio, la única forma de subir es el permiso firmado que entrega
-- /api/fotos/subir después de pasar el cupo (20261107_01). Ese permiso no
-- depende de ninguna policy de insert. El admin y el servidor siguen
-- subiendo con la service key. No borra ni cambia archivos ni datos.
--
-- Rollback (vuelve a abrir la subida directa):
--   create policy "felpus_photos_public_insert" on storage.objects
--     for insert with check (bucket_id = 'felpus-photos');

drop policy if exists "felpus_photos_public_insert" on storage.objects;
