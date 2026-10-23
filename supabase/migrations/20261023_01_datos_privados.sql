-- Revisión de seguridad (2026-10-23): dos lecturas públicas que no tenían
-- que serlo, confirmadas en vivo con la anon key (que es pública por diseño:
-- va en el JS del sitio, así que lo que importa es qué permite leer).
--
-- CORRER DESPUÉS de que esté en producción el deploy que cambia
-- src/lib/store.js (CONTRIBUTOR_PUBLIC_COLUMNS): el código viejo pide
-- select("*") sobre contributors y, con el SELECT por columnas de abajo,
-- Supabase rechazaría esa consulta entera (el ranking quedaría vacío).
-- Nunca hace DROP de datos ni borra filas.

-- 1. contributors.whatsapp (el WhatsApp de perfil de "Mi Felpus") se podía
--    leer en bloque: GET /rest/v1/contributors?select=whatsapp devolvía los
--    teléfonos de todos. Mismo esquema que reports: SELECT revocado y
--    habilitado columna por columna, sin whatsapp. Cada usuario lee el suyo
--    con get_my_whatsapp() (solo su propia fila, vía auth.uid()).
revoke select on public.contributors from anon, authenticated;
grant select (
  id, nickname, points, reportes, reencuentros, hearts, streak_days,
  last_active_date, streak_updated_at, updated_at, avatar_url, pais,
  provincia, ciudad
) on public.contributors to anon, authenticated;

create or replace function public.get_my_whatsapp()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select whatsapp from public.contributors where id = auth.uid()::text;
$$;
revoke all on function public.get_my_whatsapp() from public, anon;
grant execute on function public.get_my_whatsapp() to authenticated;

-- 2. Bucket felpus-photos: la policy de SELECT abierta permitía LISTAR todos
--    los archivos (POST /storage/v1/object/list/felpus-photos), incluidas
--    fotos de reportes ocultos o borrados. Las fotos se siguen viendo igual:
--    el bucket es público y las URLs /object/public/... no pasan por esta
--    policy. Listar queda solo para el dueño de cada archivo (lo necesita
--    remove() al borrar sus fotos) y el admin.
drop policy if exists "felpus_photos_public_read" on storage.objects;
drop policy if exists "felpus_photos_owner_read" on storage.objects;
create policy "felpus_photos_owner_read"
  on storage.objects for select
  using (
    bucket_id = 'felpus-photos'
    and (owner = auth.uid() or auth.email() = 'santiagobarronlf@gmail.com')
  );
