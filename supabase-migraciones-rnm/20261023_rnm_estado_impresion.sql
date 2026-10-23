-- «Seu documento foi encaminhado para impressão» y «Ainda não foi iniciado o atendimento» y «em transferência» quedaban como 'desconocido'
-- (73 RNM y 81 consultas). Son trámites en curso: pasan a 'proceso', igual que los entiende la app.
CREATE OR REPLACE FUNCTION private.rnm_estado_normalizado(p_texto text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_texto ~* 'pronto para ser retirado|confeccionado' then 'listo'
    when p_texto ~* 'entregue|retirado em' then 'entregado'
    when p_texto ~* 'indeferid|negad|rejeitad|arquivad' then 'problema'
    when p_texto ~* 'pend[eê]ncia|exig[eê]ncia|complement|inconsist' then 'pendencia'
    when p_texto ~* 'an[aá]lise|em andamento|processamento|aguard|confec[cç][aã]o|produ[cç][aã]o|encaminhad[oa] para impress|impress[aã]o|n[aã]o foi iniciado o atendimento|transfer[eê]ncia' then 'proceso'
    when p_texto ~* 'n[aã]o (foi )?encontrad|nenhum|nao existe' then 'no_encontrado'
    else 'desconocido' end
$function$;

-- Corrección de los registros existentes SIN avisar a los clientes: el trigger rnm_encolar_aviso_trg mandaría
-- «Tu RNM avanzó» (WhatsApp, correo y push) al pasar de 'desconocido' a 'proceso', y para ellos no cambió nada.
alter table public.rnm_registros disable trigger rnm_encolar_aviso_trg;
update public.rnm_registros set estado_pf = private.rnm_estado_normalizado(ultimo_resultado)
 where estado_pf = 'desconocido' and private.rnm_estado_normalizado(ultimo_resultado) <> 'desconocido';
alter table public.rnm_registros enable trigger rnm_encolar_aviso_trg;

update public.rnm_consultas set estado_normalizado = private.rnm_estado_normalizado(resultado_texto)
 where estado_normalizado = 'desconocido' and private.rnm_estado_normalizado(resultado_texto) <> 'desconocido';
