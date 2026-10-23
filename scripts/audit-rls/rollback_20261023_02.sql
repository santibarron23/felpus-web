-- ROLLBACK de supabase/migrations/20261023_02_endurecimiento_permisos.sql.
-- Devuelve los permisos, el bucket y get_report_contact EXACTAMENTE al
-- estado de producción leído del catálogo el 2026-10-23 (antes de la
-- migración). Probado: rls.test.mjs aplica migración + este rollback y
-- verifica que todo vuelve a comportarse igual que hoy.
-- Usar solo si la migración rompe algo. No toca datos.

-- 1. Bucket
update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
where id = 'felpus-photos';
drop policy if exists "felpus_photos_public_insert" on storage.objects;
create policy "felpus_photos_public_insert"
  on storage.objects for insert
  with check (bucket_id = 'felpus-photos');

-- 2. get_report_contact (cuerpo anterior)
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
  return query select r.contacto_whatsapp, r.contacto_email from reports r where r.id = p_report_id;
end;
$$;
revoke all on function public.get_report_contact(text, text) from public, anon, authenticated;
grant execute on function public.get_report_contact(text, text) to service_role;

-- 3. Permisos de tablas
grant truncate, trigger, references on all tables in schema public to anon, authenticated;
grant all on table
  public.chat_requests, public.contact_requests, public.embed_requests,
  public.report_submissions, public.flag_submissions, public.error_log_submissions,
  public.error_logs, public.points_award_log, public.points_events,
  public.heart_sends, public.report_flags, public.notifications_log
to anon, authenticated;
revoke insert on table public.error_logs from anon, authenticated;
grant all on table public.saved_reports, public.push_subscriptions, public.alert_zones, public.matches to anon;
grant update on table public.saved_reports to authenticated;
grant insert, update, delete on table public.matches to authenticated;
grant delete on table public.reports to anon;
grant update (ciudad,color,color_otro,contacto_email,contacto_whatsapp,descripcion,detalles,edad,embedding,embeddings,especie,fecha,foto_url,foto_urls,hist,hists,lat,lng,nickname,nombre,peso,provincia,raza,resuelto,resuelto_en,resuelto_por,resuelto_por_user_id,sexo,tamano,tipo,zona) on public.reports to anon;
grant insert (id,nickname,whatsapp,updated_at), update (id,nickname,whatsapp,updated_at) on public.contributors to anon;
grant delete on table public.contributors to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant execute on function public.notify_new_report() to public, anon, authenticated;
grant execute on function public.close_matches_on_resolve() to public, anon, authenticated;

-- 4. Permisos por defecto de Supabase
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to public, anon, authenticated;
