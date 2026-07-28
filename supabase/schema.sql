-- ---------------------------------------------------------------------------
-- Felpus — esquema de base de datos para Supabase
-- Pegá todo este archivo en el SQL Editor de tu proyecto Supabase y ejecutalo.
-- ---------------------------------------------------------------------------

-- Reportes de mascotas perdidas / encontradas
create table if not exists reports (
  id text primary key,
  tipo text not null check (tipo in ('perdida', 'encontrada')),
  especie text not null,
  nombre text,
  color text not null,
  color_otro text,
  tamano text not null,
  sexo text,
  edad text,
  peso text,
  zona text not null,
  lat double precision,
  lng double precision,
  fecha date,
  descripcion text not null,
  contacto_whatsapp text,
  contacto_email text,
  foto_url text not null,
  hist jsonb,
  embedding jsonb,
  foto_urls jsonb,
  hists jsonb,
  embeddings jsonb,
  nickname text,
  resuelto boolean not null default false,
  resuelto_por text,
  resuelto_por_user_id uuid,
  resuelto_en timestamptz,
  creado_en timestamptz not null default now(),
  user_id uuid
);

-- Ranking de contribuyentes (gamificación)
create table if not exists contributors (
  id text primary key, -- apodo normalizado (minúsculas, sin espacios/acentos)
  nickname text not null,
  points integer not null default 0,
  reportes integer not null default 0,
  reencuentros integer not null default 0,
  hearts integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Si ya habías corrido una versión anterior de este schema, estas líneas
-- agregan las columnas nuevas sin borrar nada de lo que ya tenías.
alter table reports add column if not exists color_otro text;
alter table reports add column if not exists sexo text;
alter table reports add column if not exists edad text;
alter table reports add column if not exists peso text;
alter table reports add column if not exists embedding jsonb;
alter table reports add column if not exists user_id uuid;
alter table reports add column if not exists resuelto_por_user_id uuid;
-- Hasta 3 fotos por reporte (arrays paralelos: foto_urls[i] / hists[i] / embeddings[i]).
-- foto_url/hist/embedding (singular) se mantienen con la primera foto por compatibilidad.
alter table reports add column if not exists foto_urls jsonb;
alter table reports add column if not exists hists jsonb;
alter table reports add column if not exists embeddings jsonb;
alter table contributors add column if not exists hearts integer not null default 0;
alter table reports add column if not exists contacto_whatsapp text;
alter table reports add column if not exists contacto_email text;

alter table reports enable row level security;
alter table contributors enable row level security;

-- ---------------------------------------------------------------------------
-- Políticas: reportar sigue abierto a invitados (máximo alcance), pero sumar
-- puntos y confirmar reencuentros ("reports_update_all") ahora requiere una
-- sesión real de Supabase Auth (auth.uid() is not null) — es decir, haber
-- iniciado sesión con Google. Esto cierra el hueco de que cualquiera podía
-- resolver el reporte de otra persona y darse puntos con solo escribir un
-- apodo de texto libre. La lectura sigue pública para todos.
-- Antes de un lanzamiento real todavía conviene agregar rate limiting
-- (por IP o por usuario) a la creación de reportes.
-- ---------------------------------------------------------------------------

drop policy if exists "reports_select_all" on reports;
create policy "reports_select_all" on reports for select using (true);

drop policy if exists "reports_insert_all" on reports;
create policy "reports_insert_all" on reports for insert with check (true);

drop policy if exists "reports_update_all" on reports;
drop policy if exists "reports_update_authenticated" on reports;
create policy "reports_update_authenticated" on reports for update using (auth.uid() is not null);

drop policy if exists "contributors_select_all" on contributors;
create policy "contributors_select_all" on contributors for select using (true);

drop policy if exists "contributors_insert_all" on contributors;
drop policy if exists "contributors_insert_authenticated" on contributors;
create policy "contributors_insert_authenticated" on contributors for insert with check (auth.uid() is not null);

drop policy if exists "contributors_update_all" on contributors;
drop policy if exists "contributors_update_authenticated" on contributors;
create policy "contributors_update_authenticated" on contributors for update using (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- Storage: bucket público para las fotos de mascotas
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('felpus-photos', 'felpus-photos', true)
on conflict (id) do nothing;

drop policy if exists "felpus_photos_public_read" on storage.objects;
create policy "felpus_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'felpus-photos');

drop policy if exists "felpus_photos_public_insert" on storage.objects;
create policy "felpus_photos_public_insert"
  on storage.objects for insert
  with check (bucket_id = 'felpus-photos');
