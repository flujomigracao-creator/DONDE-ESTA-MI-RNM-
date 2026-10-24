-- Los avisos de WhatsApp sobre CAMBIOS del RNM (listo, etapa, impresión, problema, dirección) son para quien tiene un plan activo
-- que cubre ese RNM Y activó los avisos. Sin plan, el cliente ve el estado en la app (y por correo) pero no recibe WhatsApp.
-- Se mantienen igual para todos los que aceptaron WhatsApp: «corregir» (acción que debe hacer el cliente) y las invitaciones
-- «plan», «plan_semana», «registrar» y «opinion» (no son cambios del RNM).
-- Base: private.rnm_encolar_aviso de 20261023_rnm_aviso_impresion.sql; solo cambia la condición del insert en rnm_avisos.

CREATE OR REPLACE FUNCTION private.rnm_encolar_aviso()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Pasó a impresión (no en la primera consulta: ese resultado ya lo ve en la app al registrarlo).
  elsif old.ultima_consulta_at is not null and coalesce(new.ultimo_resultado, '') ~* 'encaminhad[oa] para impress'
        and coalesce(old.ultimo_resultado, '') !~* 'encaminhad[oa] para impress' then v_tipo := 'impresion';
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

  -- WhatsApp: los avisos de cambios del RNM solo con plan activo que cubra este RNM (y avisos activados).
  if v_wa
     and (v_tipo not in ('listo','etapa','impresion','problema','direccion') or private.rnm_cubierto(new.id))
     and not exists (select 1 from rnm_avisos where registro_id = new.id and tipo = v_tipo and created_at > now() - interval '24 hours') then
    insert into rnm_avisos (registro_id, user_id, tipo, telefono, parametros) values (new.id, new.user_id, v_tipo, v_tel, v_params);
  end if;
  if (v_tipo <> 'plan' or v_email) and not exists (select 1 from rnm_avisos_email where registro_id = new.id and tipo = v_tipo and created_at > now() - interval '24 hours') then
    insert into rnm_avisos_email (registro_id, user_id, tipo, parametros) values (new.id, new.user_id, v_tipo, v_params);
  end if;

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

  if v_tipo = 'listo' and v_email
     and not exists (select 1 from rnm_opiniones where user_id = new.user_id and creado_at > now() - interval '60 days')
     and not exists (select 1 from rnm_avisos_email where user_id = new.user_id and tipo = 'opinion' and created_at > now() - interval '60 days') then
    insert into rnm_avisos_email (registro_id, user_id, tipo, parametros, enviar_despues_at)
    values (new.id, new.user_id, 'opinion', jsonb_build_object('nombre', nullif(v_nombre,''), 'rnm_final', right(new.rnm, 4)), now() + interval '24 hours');
  end if;
  return new;
end $function$;
