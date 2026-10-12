-- Migración aplicada en producción el 2026-10-12 (nombre en Supabase: app_rnm_endurecimiento).
-- Las migraciones anteriores app_rnm_* (20261012001612 … 20261012014222) existen en la base pero aún no están en este repositorio:
-- traerlas con `supabase db pull` (ver docs/PLAN_IMPLEMENTACION_RNM.md, C9).

-- C1. Registrar un cobro y activar el plan en UNA sola transacción (si algo falla, no queda nada a medias).
create or replace function public.rnm_registrar_pago_mp(p_payment text, p_preapproval text, p_user uuid, p_cupos int, p_monto int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_res jsonb; v_n int;
begin
  insert into rnm_pagos_mp (payment_id, preapproval_id, user_id, cupos, monto_centavos)
  values (p_payment, p_preapproval, p_user, p_cupos, p_monto)
  on conflict (payment_id) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('aplicado', false, 'motivo', 'ya_aplicado'); end if;
  v_res := public.rnm_activar_plan_servicio(p_user, p_cupos, 'mp:' || p_payment, p_preapproval);
  update rnm_suscripciones_mp set estado = 'activa', actualizado_at = now() where preapproval_id = p_preapproval;
  return v_res || jsonb_build_object('aplicado', true);
end $$;
revoke all on function public.rnm_registrar_pago_mp(text, text, uuid, int, int) from public, anon, authenticated;
grant execute on function public.rnm_registrar_pago_mp(text, text, uuid, int, int) to service_role;

-- C10. Auditoría de lo que hace el equipo (solo accesible por el servidor).
create table public.rnm_auditoria (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  accion text not null,
  objetivo text,
  detalle jsonb
);
alter table public.rnm_auditoria enable row level security;
revoke all on public.rnm_auditoria from anon, authenticated;
grant all on public.rnm_auditoria to service_role;

-- rnm_activar_plan y rnm_guardar_resultado: igual que antes, más una fila de auditoría (ver definiciones en la base).

-- C6. El cliente solo puede enviar estas 3 columnas al registrar un RNM.
revoke insert on public.rnm_registros from authenticated;
grant insert (user_id, rnm, fecha_nacimiento) on public.rnm_registros to authenticated;

-- C12. El cliente no necesita ver las referencias internas de Mercado Pago.
revoke select on public.rnm_planes from authenticated;
grant select (user_id, cupos, precio_centavos, vence_at) on public.rnm_planes to authenticated;

-- C11. Funciones internas: nadie las ejecuta directamente.
revoke execute on function private.rnm_aplicar_plan(uuid, int, text, text) from public;
revoke execute on function private.rnm_cubierto(uuid) from public;
revoke execute on function private.rnm_estado_normalizado(text) from public;
revoke execute on function private.rnm_limite_4() from public;
revoke execute on function private.rnm_marcar_gratis() from public;
revoke execute on function private.rnm_perfil_updated_at() from public;
revoke execute on function private.rnm_precio_centavos(int) from public;
alter function private.rnm_perfil_updated_at() set search_path = public;
alter function private.rnm_estado_normalizado(text) set search_path = public;
alter function private.rnm_precio_centavos(int) set search_path = public;

-- ============================ REVERSIÓN ============================
-- (ejecutar solo si hace falta deshacer; no borra datos de negocio)
-- grant insert on public.rnm_registros to authenticated;
-- grant select on public.rnm_planes to authenticated;
-- grant execute on function private.rnm_aplicar_plan(uuid, int, text, text), private.rnm_cubierto(uuid),
--   private.rnm_estado_normalizado(text), private.rnm_limite_4(), private.rnm_marcar_gratis(),
--   private.rnm_perfil_updated_at(), private.rnm_precio_centavos(int) to public;
-- drop function public.rnm_registrar_pago_mp(text, text, uuid, int, int);
-- drop table public.rnm_auditoria;  -- y restaurar rnm_activar_plan / rnm_guardar_resultado sin la línea de auditoría
