-- Auditoría integral de seguridad (2026-10-23) — endurecimiento de permisos.
-- Ver AUDITORIA_SEGURIDAD_2026-10-23.md para el detalle de cada hallazgo.
--
-- Qué NO hace: no borra filas, no borra tablas ni columnas, no toca datos
-- de usuarios. Solo cambia permisos (GRANT/REVOKE), una policy del bucket,
-- la configuración del bucket y una función. Todo es reversible.
--
-- Probada en un Postgres local con las mismas tablas, permisos y policies
-- que producción (scripts/audit-rls/): las lecturas/escrituras que tiene que
-- poder hacer la app siguen andando y las demás quedan denegadas.
--
-- Orden: correr DESPUÉS de que esté en producción el deploy de la rama
-- auditoria-seguridad-db (no depende del código, pero así se prueba junto).

-- ---------------------------------------------------------------------------
-- 1. Bucket de fotos (MEDIA): la migración 20261022_02 nunca se corrió en
--    producción. El bucket público aceptaba SVG (puede llevar JavaScript),
--    archivos de hasta 8 MB y cualquier nombre, subidos por cualquiera sin
--    login. Se reaplica igual que en esa migración (el código de la app ya
--    sube solo JPG/PNG/WebP con nombres de este formato).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. get_report_contact (BAJA): devolvía el contacto también de reportes
--    ocultados por moderación (oculto = true). Mismo cuerpo, más la
--    condición. Solo la llama el servidor (service_role).
-- ---------------------------------------------------------------------------
create or replace function public.get_report_contact(p_report_id text, p_client_ip text default null)
returns table(contacto_whatsapp text, contacto_email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  if p_client_ip is not null then
    delete from contact_requests where created_at < now() - interval '1 day';

    select count(*) into recent_count
      from contact_requests
      where ip = p_client_ip and created_at > now() - interval '1 hour';

    if recent_count >= 30 then
      raise exception 'Demasiadas consultas de contacto desde esta conexión. Probá de nuevo más tarde.';
    end if;

    insert into contact_requests (ip) values (p_client_ip);
  end if;

  return query
    select r.contacto_whatsapp, r.contacto_email
    from reports r
    where r.id = p_report_id
      and r.oculto is distinct from true;
end;
$$;
revoke all on function public.get_report_contact(text, text) from public, anon, authenticated;
grant execute on function public.get_report_contact(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Mínimo privilegio en tablas (BAJA, defensa en profundidad). Hoy RLS ya
--    bloquea todo esto (comprobado), pero anon/authenticated tenían INSERT,
--    UPDATE, DELETE y TRUNCATE sobre casi todas las tablas: un solo error en
--    una policy futura (o desactivar RLS por un rato) las dejaba abiertas.
-- ---------------------------------------------------------------------------

-- 3a. Nadie del lado del cliente necesita TRUNCATE, TRIGGER ni REFERENCES.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- 3b. Tablas internas: solo las tocan el servidor (service_role) o
--     funciones SECURITY DEFINER (que corren como dueño, no como anon).
revoke all on table
  public.chat_requests, public.contact_requests, public.embed_requests,
  public.report_submissions, public.flag_submissions, public.error_log_submissions,
  public.error_logs, public.points_award_log, public.points_events,
  public.heart_sends, public.report_flags, public.notifications_log
from anon, authenticated;

-- 3c. Tablas por usuario: un visitante sin login no puede tener filas
--     propias, así que anon no necesita ningún permiso. authenticated
--     conserva lo que usan sus policies (dueño = auth.uid()).
revoke all on table public.saved_reports, public.push_subscriptions, public.alert_zones, public.matches from anon;
revoke update on table public.saved_reports from authenticated;               -- sin policy de UPDATE
revoke insert, update, delete on table public.matches from authenticated;     -- solo lee; escribe el servidor

-- 3d. reports y contributors: anon solo lee (columnas ya limitadas).
revoke insert, update, delete on table public.reports from anon;
revoke insert, update, delete on table public.contributors from anon;
revoke delete on table public.contributors from authenticated;                -- sin policy de DELETE

-- 3e. Secuencias: las usan solo inserts del servidor.
revoke all on all sequences in schema public from anon, authenticated;

-- 3f. Funciones de trigger: no se llaman como RPC; nadie necesita EXECUTE.
revoke all on function public.notify_new_report() from public, anon, authenticated;
revoke all on function public.close_matches_on_resolve() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Que no vuelva a pasar (MEDIA, prevención): Supabase da por defecto
--    TODOS los permisos a anon y authenticated sobre cada tabla, secuencia
--    y función NUEVA del esquema public. Una tabla nueva creada sin
--    "enable row level security" quedaba legible y editable por cualquiera.
--    Desde acá, lo nuevo arranca cerrado y cada migración otorga a mano lo
--    que haga falta (como ya se hace con reports y contributors).
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
