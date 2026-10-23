-- Token interno para que pg_cron y los triggers llamen a las Edge Functions que antes no pedían nada
-- (respuesta-lote, seguimiento-lote, invitacion-pagina-lote, nora-asesor-aviso, kommo-canal flush).
-- Es distinto de la clave de servicio y vive en rnm_config (tabla privada: sin GRANT a anon/authenticated), igual que push_cron_token.
-- Se manda en la cabecera x-cron-token. Las funciones lo comparan con el valor guardado.

insert into public.rnm_config (clave, valor)
select 'interno_cron_token', encode(extensions.gen_random_bytes(32), 'hex')
where not exists (select 1 from public.rnm_config where clave = 'interno_cron_token');

create or replace function private.token_interno()
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select valor from public.rnm_config where clave = 'interno_cron_token';
$function$;
revoke all on function private.token_interno() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.nora_pausar_por_asesor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_id bigint;
begin
  if new.direction = 'outbound' and new.sender_type = 'agent' and new.kommo_lead_id is not null then
    update public.comercial_leads
       set atendente_pausado = true, asesor_tomo_at = now(), aviso_asesor_at = null, updated_at = now()
     where kommo_lead_id = new.kommo_lead_id
       and atendente_pausado = false
       and etapa_status_id in (112506940, 112506944, 112506948, 112506952, 112507848, 112507852, 112507856, 112967848, 112508152, 112508708)
    returning kommo_lead_id into v_id;
    if v_id is not null then
      perform net.http_post(
        url := 'https://rumpfqevyspdmhaggxtq.supabase.co/functions/v1/nora-asesor-aviso',
        body := jsonb_build_object('kommo_lead_id', v_id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', private.token_interno()),
        timeout_milliseconds := 5000);
    end if;
  end if;
  return new;
exception when others then
  return new; -- nunca debe impedir que se guarde el mensaje
end $function$;

CREATE OR REPLACE FUNCTION public.seguimiento_lote_respuesta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_id bigint;
begin
  if new.direction = 'inbound' and new.kommo_lead_id is not null then
    select s.kommo_lead_id into v_id from public.seguimiento_lote s
     where s.kommo_lead_id = new.kommo_lead_id and s.enviado_at is not null and s.respondio_at is null and new.created_at >= s.enviado_at;
    if v_id is not null then
      perform net.http_post(url := 'https://rumpfqevyspdmhaggxtq.supabase.co/functions/v1/respuesta-lote',
        body := jsonb_build_object('kommo_lead_id', v_id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', private.token_interno()),
        timeout_milliseconds := 60000);
    end if;
  end if;
  return new;
exception when others then
  return new;
end $function$;

CREATE OR REPLACE FUNCTION private.kommo_canal_despertar()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  perform net.http_post(
    url := 'https://rumpfqevyspdmhaggxtq.supabase.co/functions/v1/kommo-canal',
    body := jsonb_build_object('action', 'flush'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', private.token_interno()),
    timeout_milliseconds := 60000
  );
exception when others then
  raise warning 'kommo_canal_despertar: %', sqlerrm;
end;
$function$;

select cron.schedule('seguimiento_lote_plantilla', '*/5 * * * *',
  $cmd$select net.http_post(url := 'https://rumpfqevyspdmhaggxtq.supabase.co/functions/v1/seguimiento-lote', body := '{}'::jsonb, headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', private.token_interno()), timeout_milliseconds := 60000) where exists (select 1 from public.seguimiento_lote where enviado_at is null and omitido is null)$cmd$);

select cron.schedule('invitacion_pagina_lote', '*/10 * * * *',
  $cmd$select net.http_post(url := 'https://rumpfqevyspdmhaggxtq.supabase.co/functions/v1/invitacion-pagina-lote', body := '{}'::jsonb, headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', private.token_interno()), timeout_milliseconds := 60000) where exists (select 1 from public.invitacion_pagina_lote where enviado_at is null and intentos < 40)$cmd$);
