-- OGTIC RRHH Cloud v4 - Rol "acciones"
-- Nuevo rol que SOLO puede usar el modulo de Acciones de Personal.
-- En la app se le oculta todo el resto del menu. A nivel de datos sigue
-- siendo un usuario activo (is_active_user), por lo que puede buscar
-- colaboradores y crear/editar/imprimir sus acciones, pero no es admin.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin','operador','acciones'));

-- Para dar el permiso a un usuario ya creado en Supabase Auth:
--   update public.profiles set role = 'acciones', active = true
--   where email = 'usuario@ogtic.gob.do';
