-- Avisos por correo a TODOS los clientes (además del WhatsApp para quien lo aceptó).
-- - Cola propia: public.rnm_avisos_email (la procesa la función rnm-enviar-avisos junto con la de WhatsApp).
-- - Avisos de estado (listo, etapa, pendencia, dirección, corregir dato): salen siempre al correo de la cuenta.
-- - Avisos promocionales (plan, pedir opinión): solo si el cliente no se dio de baja (rnm_perfiles.avisos_email).
-- - Solo desde ahora: no se reenvían avisos de cambios anteriores.

alter table public.rnm_perfiles add column if not exists avisos_email boolean not null default true;
alter table public.rnm_perfiles add column if not exists avisos_email_baja_at timestamptz;

create table if not exists public.rnm_avisos_email (
  id uuid primary key default gen_random_uuid(),
  registro_id uuid not null references public.rnm_registros(id) on delete cascade,
  user_id uuid not null,
  tipo text not null check (tipo in ('listo','etapa','problema','direccion','plan','corregir','opinion')),
  parametros jsonb not null default '{}'::jsonb,
  estado text not null default 'pendiente' check (estado in ('pendiente','enviado','error','cancelado')),
  error text,
  created_at timestamptz not null default now(),
  enviado_at timestamptz,
  enviar_despues_at timestamptz,
  resend_id text
);
create index if not exists rnm_avisos_email_cola_idx on public.rnm_avisos_email (estado, created_at);
create index if not exists rnm_avisos_email_user_tipo_idx on public.rnm_avisos_email (user_id, tipo, created_at);
-- Sin políticas: solo la clave de servicio (funciones) puede leer o escribir.
alter table public.rnm_avisos_email enable row level security;

create or replace function private.rnm_encolar_aviso()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_tipo text; v_tel text; v_nombre text; v_opt boolean; v_email boolean; v_wa boolean; v_precio int; v_params jsonb;
  v_cupos int := 4;
begin
  select avisos_whatsapp, regexp_replace(coalesce(telefono,''), '\D', '', 'g'), split_part(coalesce(nombre,''), ' ', 1), avisos_email
    into v_opt, v_tel, v_nombre, v_email from rnm_perfiles where user_id = new.user_id;
  v_email := coalesce(v_email, true);
  v_wa := coalesce(v_opt, false) and length(coalesce(v_tel,'')) >= 10;
  if v_wa and length(v_tel) in (10, 11) then v_tel := '55' || v_tel; end if;

  if new.estado_pf = 'listo' and (old.estado_pf is distinct from 'listo' or old.unidad_pf is distinct from new.unidad_pf) then v_tipo := 'listo';
  elsif new.estado_pf = 'no_encontrado' and old.estado_pf is distinct from 'no_encontrado' then v_tipo := 'corregir';
  elsif new.estado_pf in ('problema','pendencia') and old.estado_pf is distinct from new.estado_pf then v_tipo := 'problema';
  elsif new.cambio_direccion is not null and new.cambio_direccion is distinct from old.cambio_direccion then v_tipo := 'direccion';
  elsif old.estado_pf is not null and new.estado_pf = 'proceso' and old.estado_pf is distinct from new.estado_pf then v_tipo := 'etapa';
  elsif old.ultima_consulta_at is null and new.ultima_consulta_at is not null and not new.cerrado
        and new.estado_pf not in ('listo','entregado','problema','pendencia','no_encontrado')
        and not private.rnm_cubierto(new.id)
        and not exists (select 1 from rnm_avisos where user_id = new.user_id and tipo = 'plan' and created_at > now() - interval '30 days')
        and not exists (select 1 from rnm_avisos_email where user_id = new.user_id and tipo = 'plan' and created_at > now() - interval '30 days')
        then v_tipo := 'plan';
  else return new; end if;

  v_precio := case when v_tipo = 'plan' then private.rnm_precio_tipo('semanal') else null end;
  v_params := jsonb_build_object('nombre', nullif(v_nombre,''), 'rnm_final', right(new.rnm, 4), 'unidad', new.unidad_pf, 'cambio', new.cambio_direccion, 'cupos', v_cupos, 'precio_centavos', v_precio);

  -- WhatsApp: solo quien lo aceptó y dejó teléfono (igual que antes).
  if v_wa and not exists (select 1 from rnm_avisos where registro_id = new.id and tipo = v_tipo and created_at > now() - interval '24 hours') then
    insert into rnm_avisos (registro_id, user_id, tipo, telefono, parametros) values (new.id, new.user_id, v_tipo, v_tel, v_params);
  end if;
  -- Correo: avisos de estado a todos; plan y opinión solo a quien no se dio de baja.
  if (v_tipo <> 'plan' or v_email) and not exists (select 1 from rnm_avisos_email where registro_id = new.id and tipo = v_tipo and created_at > now() - interval '24 hours') then
    insert into rnm_avisos_email (registro_id, user_id, tipo, parametros) values (new.id, new.user_id, v_tipo, v_params);
  end if;

  -- Primera consulta con novedad (dirección / etapa): además de ese aviso, la invitación al plan.
  if v_tipo in ('direccion', 'etapa') and old.ultima_consulta_at is null and new.ultima_consulta_at is not null and not new.cerrado
     and new.estado_pf not in ('listo','entregado','problema','pendencia','no_encontrado')
     and not private.rnm_cubierto(new.id)
     and not exists (select 1 from rnm_avisos where user_id = new.user_id and tipo = 'plan' and created_at > now() - interval '30 days')
     and not exists (select 1 from rnm_avisos_email where user_id = new.user_id and tipo = 'plan' and created_at > now() - interval '30 days') then
    v_params := v_params || jsonb_build_object('precio_centavos', private.rnm_precio_tipo('semanal'));
    if v_wa then
      insert into rnm_avisos (registro_id, user_id, tipo, telefono, parametros) values (new.id, new.user_id, 'plan', v_tel, v_params);
    end if;
    if v_email then
      insert into rnm_avisos_email (registro_id, user_id, tipo, parametros) values (new.id, new.user_id, 'plan', v_params);
    end if;
  end if;

  -- Petición de opinión por correo, 24 h después del aviso de "listo".
  if v_tipo = 'listo' and v_email
     and not exists (select 1 from rnm_opiniones where user_id = new.user_id and creado_at > now() - interval '60 days')
     and not exists (select 1 from rnm_avisos_email where user_id = new.user_id and tipo = 'opinion' and created_at > now() - interval '60 days') then
    insert into rnm_avisos_email (registro_id, user_id, tipo, parametros, enviar_despues_at)
    values (new.id, new.user_id, 'opinion', jsonb_build_object('nombre', nullif(v_nombre,''), 'rnm_final', right(new.rnm, 4)), now() + interval '24 hours');
  end if;
  return new;
end $function$;
