-- OGTIC RRHH Cloud v3 - Editar acciones de personal
-- Permite que el autor edite sus propias acciones (además del admin, que ya
-- puede editar cualquiera por la política "acciones admin write").

drop policy if exists "acciones update propias" on public.acciones_personal;
create policy "acciones update propias" on public.acciones_personal
  for update to authenticated
  using (creado_por = auth.uid())
  with check (creado_por = auth.uid());
