-- Ejecuta esto después de crear el usuario admin en Authentication > Users.
-- Cambia el correo por el correo real del administrador.

insert into public.profiles (id, email, full_name, role, active)
select id, email, 'Administrador', 'admin', true
from auth.users
where email = 'ADMIN@OGTIC.GOB.DO'
on conflict (id) do update
set role = 'admin',
    active = true,
    email = excluded.email;

-- Para usuarios normales:
-- insert into public.profiles (id, email, full_name, role, active)
-- select id, email, 'Nombre Usuario', 'operador', true
-- from auth.users
-- where email = 'usuario@ogtic.gob.do'
-- on conflict (id) do update set role = 'operador', active = true;
