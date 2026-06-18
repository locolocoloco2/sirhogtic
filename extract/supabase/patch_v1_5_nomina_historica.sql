-- OGTIC RRHH Cloud v1.5 - nómina histórica y corte para inactivos de vacaciones
alter table public.empleados
  add column if not exists tipo_servidor_publico text,
  add column if not exists categoria_servidor_publico text,
  add column if not exists estatus_nomina text,
  add column if not exists fecha_marcado_inactivo date,
  add column if not exists considerar_liquidacion_vacaciones boolean not null default false;

-- Nota operativa:
-- estatus_nomina se usa para certificaciones: Activo = "labora"; Desvinculado/Inactivo = "laboró".
-- estado se reserva para la lógica interna de vacaciones/inactivos del sistema.
-- considerar_liquidacion_vacaciones solo debe activarse para colaboradores marcados inactivos desde el 25/06/2026 en adelante.
