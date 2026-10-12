-- Deshace 'cerrar_lectura_global_a_miembros' (devuelve la lectura abierta a cualquier usuario con sesión).
drop policy if exists pitch_read on public.comercial_audios_pitch;
create policy pitch_read on public.comercial_audios_pitch for select to authenticated using (true);

drop policy if exists authenticated_read on public.kommo_tramites;
create policy authenticated_read on public.kommo_tramites for select to authenticated using (true);

drop policy if exists "opciones lectura autenticados" on public.meta_opciones_segmentacion;
create policy "opciones lectura autenticados" on public.meta_opciones_segmentacion for select to authenticated using (true);

drop policy if exists authenticated_global_read on public.nora_estrategias_confianza;
create policy authenticated_global_read on public.nora_estrategias_confianza for select to authenticated using (true);

drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions for select to authenticated using (true);

drop policy if exists authenticated_read on public.pipeline_stages;
create policy authenticated_read on public.pipeline_stages for select to authenticated using (true);

drop policy if exists "catalogo lectura autenticados" on public.publicos_catalogo;
create policy "catalogo lectura autenticados" on public.publicos_catalogo for select to authenticated using (true);

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);

drop policy if exists creatives_read on storage.objects;
create policy creatives_read on storage.objects for select to authenticated using (bucket_id = 'creatives');
