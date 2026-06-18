-- OGTIC RRHH Cloud - Supabase schema
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null check (role in ('admin','operador')) default 'operador',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.empleados (
  id uuid primary key default gen_random_uuid(),
  cedula text not null unique check (cedula ~ '^[0-9]{11}$'),
  nombre text not null,
  cargo text,
  departamento text,
  grupo_ocupacional text,
  genero text check (genero in ('M','F','')),
  sueldo numeric(14,2) not null default 0,
  fecha_ingreso date not null,
  estado text not null check (estado in ('activo','inactivo')) default 'activo',
  fecha_desvinculacion date,
  ultimo_sueldo_mensual_completo numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.periodos_reconocidos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  institucion text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio)
);

create table if not exists public.feriados (
  id uuid primary key default gen_random_uuid(),
  fecha date not null unique,
  descripcion text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.vacaciones_solicitudes (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id),
  fecha_inicio date not null,
  fecha_fin date not null,
  dias_solicitados integer not null check (dias_solicitados > 0),
  estado text not null check (estado in ('pendiente','aprobada','rechazada','cancelada')) default 'pendiente',
  observacion text,
  creado_por uuid references auth.users(id) default auth.uid(),
  aprobado_por uuid references auth.users(id),
  fecha_aprobacion timestamptz,
  created_at timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio)
);

create table if not exists public.vacaciones_consumos (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.vacaciones_solicitudes(id) on delete cascade,
  empleado_id uuid not null references public.empleados(id),
  periodo_inicio date not null,
  periodo_fin date not null,
  dias_consumidos integer not null check (dias_consumidos > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.certificaciones (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id),
  numero_oficio text not null,
  fecha_emision date not null,
  destinatario text default 'A QUIEN PUEDA INTERESAR',
  firmante text default 'Vikianny M. Muñoz',
  cargo_firmante text default 'Directora de Recursos Humanos',
  iniciales_firma text default 'VM',
  iniciales_elaboro text,
  creado_por uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.inactivos_liquidaciones (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id),
  fecha_desvinculacion date not null,
  ultimo_sueldo_mensual_completo numeric(14,2) not null,
  dias_restantes integer not null,
  valor_diario numeric(14,2) not null,
  monto numeric(14,2) not null,
  calculado_por uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  cedula_relacionada text,
  detalle text not null,
  estado text not null check (estado in ('abierto','cerrado','rechazado')) default 'abierto',
  creado_por uuid references auth.users(id) default auth.uid(),
  resuelto_por uuid references auth.users(id),
  respuesta text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.audit_log (
  id bigserial primary key,
  actor uuid references auth.users(id),
  action text not null,
  table_name text not null,
  record_id text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
  );
$$;

alter table public.profiles enable row level security;
alter table public.empleados enable row level security;
alter table public.periodos_reconocidos enable row level security;
alter table public.feriados enable row level security;
alter table public.vacaciones_solicitudes enable row level security;
alter table public.vacaciones_consumos enable row level security;
alter table public.certificaciones enable row level security;
alter table public.inactivos_liquidaciones enable row level security;
alter table public.tickets enable row level security;
alter table public.audit_log enable row level security;

-- Profiles
drop policy if exists "profiles select active" on public.profiles;
create policy "profiles select active" on public.profiles for select to authenticated using (public.is_active_user());

drop policy if exists "profiles admin write" on public.profiles;
create policy "profiles admin write" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Employees: all active users read; admin writes.
drop policy if exists "empleados read" on public.empleados;
create policy "empleados read" on public.empleados for select to authenticated using (public.is_active_user());
drop policy if exists "empleados admin write" on public.empleados;
create policy "empleados admin write" on public.empleados for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Admin-only recognized periods writes; all read.
drop policy if exists "periodos read" on public.periodos_reconocidos;
create policy "periodos read" on public.periodos_reconocidos for select to authenticated using (public.is_active_user());
drop policy if exists "periodos admin write" on public.periodos_reconocidos;
create policy "periodos admin write" on public.periodos_reconocidos for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Feriados read all; admin writes.
drop policy if exists "feriados read" on public.feriados;
create policy "feriados read" on public.feriados for select to authenticated using (public.is_active_user());
drop policy if exists "feriados admin write" on public.feriados;
create policy "feriados admin write" on public.feriados for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Solicitudes: active users can create/read; admin can approve/update.
drop policy if exists "solicitudes read" on public.vacaciones_solicitudes;
create policy "solicitudes read" on public.vacaciones_solicitudes for select to authenticated using (public.is_active_user());
drop policy if exists "solicitudes insert" on public.vacaciones_solicitudes;
create policy "solicitudes insert" on public.vacaciones_solicitudes for insert to authenticated with check (public.is_active_user() and creado_por = auth.uid());
drop policy if exists "solicitudes admin update" on public.vacaciones_solicitudes;
create policy "solicitudes admin update" on public.vacaciones_solicitudes for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Consumos admin write; active read.
drop policy if exists "consumos read" on public.vacaciones_consumos;
create policy "consumos read" on public.vacaciones_consumos for select to authenticated using (public.is_active_user());
drop policy if exists "consumos admin write" on public.vacaciones_consumos;
create policy "consumos admin write" on public.vacaciones_consumos for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Certificaciones: active users create/read.
drop policy if exists "certificaciones read" on public.certificaciones;
create policy "certificaciones read" on public.certificaciones for select to authenticated using (public.is_active_user());
drop policy if exists "certificaciones insert" on public.certificaciones;
create policy "certificaciones insert" on public.certificaciones for insert to authenticated with check (public.is_active_user() and creado_por = auth.uid());

-- Liquidaciones: active users can create/read.
drop policy if exists "liquidaciones read" on public.inactivos_liquidaciones;
create policy "liquidaciones read" on public.inactivos_liquidaciones for select to authenticated using (public.is_active_user());
drop policy if exists "liquidaciones insert" on public.inactivos_liquidaciones;
create policy "liquidaciones insert" on public.inactivos_liquidaciones for insert to authenticated with check (public.is_active_user() and calculado_por = auth.uid());

-- Tickets: users create/read their own; admin reads/writes all.
drop policy if exists "tickets read" on public.tickets;
create policy "tickets read" on public.tickets for select to authenticated using (public.is_admin() or creado_por = auth.uid());
drop policy if exists "tickets insert" on public.tickets;
create policy "tickets insert" on public.tickets for insert to authenticated with check (public.is_active_user() and creado_por = auth.uid());
drop policy if exists "tickets admin update" on public.tickets;
create policy "tickets admin update" on public.tickets for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "audit admin read" on public.audit_log;
create policy "audit admin read" on public.audit_log for select to authenticated using (public.is_admin());
