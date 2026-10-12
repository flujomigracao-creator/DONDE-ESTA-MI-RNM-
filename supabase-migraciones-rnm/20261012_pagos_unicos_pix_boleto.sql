-- Pagos de un mes por Pix o Boleto (aplicado en producción como app_rnm_pagos_unicos_pix_boleto)
create table public.rnm_pagos_unicos (
  payment_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  cupos smallint not null check (cupos between 1 and 4),
  monto_centavos integer not null check (monto_centavos > 0),
  metodo text not null check (metodo in ('pix','boleto')),
  creado_at timestamptz not null default now(),
  aplicado_at timestamptz
);
alter table public.rnm_pagos_unicos enable row level security;
revoke all on public.rnm_pagos_unicos from anon, authenticated;
grant all on public.rnm_pagos_unicos to service_role;
create index on public.rnm_pagos_unicos (user_id);

create or replace function public.rnm_registrar_pago_unico(p_payment text, p_user uuid, p_cupos int, p_monto int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_res jsonb; v_n int;
begin
  update rnm_pagos_unicos set aplicado_at = now()
   where payment_id = p_payment and user_id = p_user and cupos = p_cupos and monto_centavos = p_monto and aplicado_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('aplicado', false, 'motivo', 'ya_aplicado_o_desconocido'); end if;
  v_res := public.rnm_activar_plan_servicio(p_user, p_cupos, 'mp:' || p_payment, null);
  return v_res || jsonb_build_object('aplicado', true);
end $$;
revoke all on function public.rnm_registrar_pago_unico(text, uuid, int, int) from public, anon, authenticated;
grant execute on function public.rnm_registrar_pago_unico(text, uuid, int, int) to service_role;
-- REVERSIÓN: drop function public.rnm_registrar_pago_unico(text, uuid, int, int); drop table public.rnm_pagos_unicos;
