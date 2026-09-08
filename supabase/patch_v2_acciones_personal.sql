-- OGTIC RRHH Cloud v2 - Acciones de Personal
-- Formulario de Acción de Personal fiel al modelo institucional:
-- datos personales, naturaleza de la acción, cambio de datos laborales,
-- información de la acción y firmas.

create table if not exists public.acciones_personal (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references public.empleados(id) on delete set null,

  -- Datos personales (snapshot al momento de la acción; el colaborador puede cambiar luego)
  nombre text not null,
  cedula text,
  direccion_departamento text,
  superior_inmediato text,
  sede_trabajo text,
  cargo text,
  fecha_ingreso date,
  sueldo numeric(14,2) default 0,

  -- Naturaleza de la acción: lista de claves marcadas (ej. {"nombramiento_ordinario"})
  naturaleza text[] not null default '{}',
  -- Rango de licencia (solo aplica a acciones de licencia)
  licencia_desde date,
  licencia_hasta date,

  -- Cambio de datos laborales (aplica a cambios/promociones/ascensos, etc.)
  cambio_area_trabajo text,
  cambio_superior_inmediato text,
  cambio_sede_trabajo text,
  cambio_cargo_aprobado text,
  cambio_aplica_aumento boolean not null default false,
  cambio_salario_aprobado numeric(14,2),

  -- Información de la acción
  motivacion text,
  fecha_accion date not null,

  -- Firmas (etiquetas institucionales; se pueden personalizar por acción)
  firmante_rrhh text default 'Director/a de Recursos Humanos',
  firmante_general text default 'Director/a General',

  creado_por uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists acciones_personal_empleado_idx
  on public.acciones_personal(empleado_id);

alter table public.acciones_personal enable row level security;

-- Usuarios activos pueden leer y crear; se registra quién la creó.
drop policy if exists "acciones read" on public.acciones_personal;
create policy "acciones read" on public.acciones_personal
  for select to authenticated using (public.is_active_user());

drop policy if exists "acciones insert" on public.acciones_personal;
create policy "acciones insert" on public.acciones_personal
  for insert to authenticated
  with check (public.is_active_user() and creado_por = auth.uid());

-- El administrador puede actualizar o eliminar registros del historial.
drop policy if exists "acciones admin write" on public.acciones_personal;
create policy "acciones admin write" on public.acciones_personal
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
