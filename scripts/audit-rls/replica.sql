-- Réplica local del estado de PRODUCCIÓN de la base de Felpus (2026-10-23),
-- armada a partir del catálogo real (pg_policies, information_schema.*,
-- pg_proc) leído en la auditoría. Sirve para probar permisos y RLS en un
-- Postgres local (PGlite) sin tocar producción: ver rls.test.mjs.
--
-- Fiel en lo que importa para seguridad: roles, RLS, policies, grants por
-- tabla y por columna, funciones SECURITY DEFINER y el bucket de Storage.
-- Simplificado en lo que no: tipos de algunas columnas y defaults.

-- Roles y helpers de Supabase -------------------------------------------------
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.email() returns text language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.email', true), '') $$;
create table auth.users (id uuid primary key, email text, created_at timestamptz default now());
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
insert into storage.buckets values ('felpus-photos', 'felpus-photos', true, 8388608, array['image/jpeg','image/png','image/webp','image/svg+xml']);

-- Default de Supabase: todo lo nuevo de public queda con TODOS los permisos
-- para anon/authenticated (por eso cada tabla depende 100% de su RLS).
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- Tablas -----------------------------------------------------------------------
create table public.reports (
  id text primary key, tipo text not null, especie text not null, raza text, detalles jsonb,
  nombre text, color text, color_otro text, tamano text, sexo text, edad text, peso text,
  zona text, ciudad text, provincia text, lat double precision, lng double precision, fecha date,
  descripcion text, contacto_whatsapp text, contacto_email text, foto_url text, hist jsonb,
  embedding jsonb, foto_urls jsonb, hists jsonb, embeddings jsonb, nickname text,
  resuelto boolean not null default false, resuelto_por text, resuelto_por_user_id uuid,
  resuelto_en timestamptz, creado_en timestamptz not null default now(), user_id uuid,
  oculto boolean default false, inactivo boolean default false, actividad_en timestamptz,
  aviso_inactividad_en timestamptz, push_token uuid default gen_random_uuid(), push_subscription jsonb
);
create table public.contributors (
  id text primary key, nickname text not null, points integer not null default 0,
  reportes integer not null default 0, reencuentros integer not null default 0,
  hearts integer not null default 0, streak_days integer not null default 0,
  last_active_date date, streak_updated_at timestamptz, updated_at timestamptz default now(),
  whatsapp text, avatar_url text, pais text, provincia text, ciudad text
);
create table public.saved_reports (user_id uuid, report_id text, created_at timestamptz default now(), primary key (user_id, report_id));
create table public.matches (id bigserial primary key, report_lost_id text, report_found_id text, score real, estado text default 'nuevo', notificado boolean default false, created_at timestamptz default now(), unique (report_lost_id, report_found_id));
create table public.push_subscriptions (id bigserial primary key, user_id uuid, endpoint text unique, p256dh text, auth text, user_agent text, created_at timestamptz default now());
create table public.alert_zones (user_id uuid primary key, center text, radius_m integer, species text[], report_types text[], active boolean, updated_at timestamptz);
create table public.heart_sends (sender_id uuid, target_id text, created_at date default current_date, primary key (sender_id, target_id, created_at));
create table public.points_award_log (id bigserial primary key, caller_id uuid, created_at timestamptz default now());
create table public.points_events (id bigserial primary key, user_id uuid, reason text, source_id text, points integer, created_at timestamptz default now());
create table public.report_flags (id bigserial primary key, report_id text, reason text, ip text, created_at timestamptz default now());
create table public.notifications_log (id bigserial primary key, user_id uuid, report_id text, kind text, recipient text, status text, payload jsonb, created_at timestamptz default now());
create table public.error_logs (id bigserial primary key, message text, stack text, url text, user_agent text, context jsonb, created_at timestamptz default now());
create table public.contact_requests (ip text, created_at timestamptz default now());
create table public.chat_requests (ip text, created_at timestamptz default now());
create table public.embed_requests (ip text, created_at timestamptz default now());
create table public.report_submissions (ip text, created_at timestamptz default now());
create table public.flag_submissions (ip text, created_at timestamptz default now());
create table public.error_log_submissions (ip text, created_at timestamptz default now());

do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Grants por columna (tal cual producción) -------------------------------------
revoke select, insert, update on public.reports from anon, authenticated;
grant select (ciudad,color,color_otro,creado_en,descripcion,detalles,edad,embedding,embeddings,especie,fecha,foto_url,foto_urls,hist,hists,id,inactivo,lat,lng,nickname,nombre,oculto,peso,provincia,raza,resuelto,resuelto_en,resuelto_por,resuelto_por_user_id,sexo,tamano,tipo,user_id,zona) on public.reports to anon, authenticated;
grant update (ciudad,color,color_otro,contacto_email,contacto_whatsapp,descripcion,detalles,edad,embedding,embeddings,especie,fecha,foto_url,foto_urls,hist,hists,lat,lng,nickname,nombre,peso,provincia,raza,resuelto,resuelto_en,resuelto_por,resuelto_por_user_id,sexo,tamano,tipo,zona) on public.reports to anon, authenticated;

revoke select, insert, update on public.contributors from anon, authenticated;
grant select (id,nickname,points,reportes,reencuentros,hearts,streak_days,last_active_date,streak_updated_at,updated_at,avatar_url,pais,provincia,ciudad) on public.contributors to anon, authenticated;
grant insert (id,nickname,whatsapp,updated_at) on public.contributors to anon;
grant update (id,nickname,whatsapp,updated_at) on public.contributors to anon;
grant insert (id,nickname,whatsapp,updated_at,avatar_url,pais,provincia,ciudad) on public.contributors to authenticated;
grant update (id,nickname,whatsapp,updated_at,avatar_url,pais,provincia,ciudad) on public.contributors to authenticated;

revoke insert on public.error_logs from anon, authenticated;

-- Policies (tal cual producción) -----------------------------------------------
create policy reports_select_all on public.reports for select using (oculto is distinct from true);
create policy reports_insert_own_or_guest on public.reports for insert with check ((user_id is null) or (user_id = auth.uid()));
create policy reports_update_owner on public.reports for update using (auth.uid() = user_id);
create policy reports_delete_owner on public.reports for delete using (auth.uid() = user_id);
create policy contributors_select_all on public.contributors for select using (true);
create policy contributors_insert_own on public.contributors for insert with check ((auth.uid())::text = id);
create policy contributors_update_own on public.contributors for update using ((auth.uid())::text = id);
create policy saved_reports_select_own on public.saved_reports for select using (auth.uid() = user_id);
create policy saved_reports_insert_own on public.saved_reports for insert with check (auth.uid() = user_id);
create policy saved_reports_delete_own on public.saved_reports for delete using (auth.uid() = user_id);
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy alert_zones_own on public.alert_zones for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy matches_owner_read on public.matches for select to authenticated using (exists (select 1 from public.reports r where r.user_id = auth.uid() and r.id = any (array[matches.report_lost_id, matches.report_found_id])));
create policy felpus_photos_public_insert on storage.objects for insert with check (bucket_id = 'felpus-photos');
create policy felpus_photos_owner_read on storage.objects for select using (bucket_id = 'felpus-photos' and (owner = auth.uid() or auth.email() = 'santiagobarronlf@gmail.com'));
create policy felpus_photos_owner_delete on storage.objects for delete using (bucket_id = 'felpus-photos' and owner = auth.uid());

-- Funciones (cuerpos copiados de producción) -----------------------------------
create function public.get_my_whatsapp() returns text language sql stable security definer set search_path = public as
  $$ select whatsapp from public.contributors where id = auth.uid()::text; $$;
revoke all on function public.get_my_whatsapp() from public, anon;
grant execute on function public.get_my_whatsapp() to authenticated;

create function public.get_report_contact(p_report_id text, p_client_ip text default null)
returns table(contacto_whatsapp text, contacto_email text) language plpgsql security definer set search_path = public as $$
begin
  return query select r.contacto_whatsapp, r.contacto_email from reports r where r.id = p_report_id;
end; $$;
revoke all on function public.get_report_contact(text, text) from public, anon, authenticated;
grant execute on function public.get_report_contact(text, text) to service_role;

create function public.admin_set_oculto(p_report_id text, p_oculto boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.email() is distinct from 'santiagobarronlf@gmail.com' then raise exception 'No autorizado.'; end if;
  update reports set oculto = p_oculto where id = p_report_id;
end; $$;
create function public.admin_delete_report(p_report_id text) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.email() is distinct from 'santiagobarronlf@gmail.com' then raise exception 'No autorizado.'; end if;
  delete from reports where id = p_report_id;
end; $$;
revoke all on function public.admin_set_oculto(text, boolean), public.admin_delete_report(text) from public, anon;

create function public.send_heart(target_id text) returns integer language plpgsql security definer set search_path = public as $$
declare new_hearts integer;
begin
  if auth.uid() is null then raise exception 'Necesitás iniciar sesión.'; end if;
  if auth.uid()::text = target_id then raise exception 'No a vos mismo.'; end if;
  insert into heart_sends (sender_id, target_id) values (auth.uid(), target_id);
  update contributors set hearts = hearts + 1 where id = target_id returning hearts into new_hearts;
  return new_hearts;
end; $$;
revoke all on function public.send_heart(text) from public, anon;

create function public.close_matches_on_resolve() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.resuelto and not coalesce(old.resuelto, false) then
    update public.matches set estado = 'cerrado' where (report_lost_id = new.id or report_found_id = new.id) and estado in ('nuevo', 'visto');
  end if;
  return new;
end; $$;
create trigger trg_close_matches_on_resolve after update on public.reports for each row execute function public.close_matches_on_resolve();
create function public.notify_new_report() returns trigger language plpgsql security definer set search_path = public as
  $$ begin return new; end; $$;
create trigger trg_notify_new_report after insert on public.reports for each row execute function public.notify_new_report();
