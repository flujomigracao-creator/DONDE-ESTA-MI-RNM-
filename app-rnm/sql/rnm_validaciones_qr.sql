-- Validación del carné por el QR: la app entrega el enlace del QR, el bot del VPS abre la página oficial de la PF,
-- pulsa «Validar» y devuelve RNM, fecha de nacimiento y validez. Solo se guardan esos datos mínimos.
create table if not exists public.rnm_validaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  codigo text not null,
  url text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','ok','error')),
  intentos smallint not null default 0,
  rnm text,
  fecha_nacimiento date,
  validez date,
  situacion text,
  error text,
  created_at timestamptz not null default now(),
  resuelto_at timestamptz
);
alter table public.rnm_validaciones enable row level security;   -- sin políticas: solo se accede por las funciones de abajo
revoke all on public.rnm_validaciones from anon, authenticated;
grant all on public.rnm_validaciones to service_role;
create index if not exists rnm_validaciones_estado_idx on public.rnm_validaciones (estado, created_at);

-- La persona pide validar el enlace de su QR (solo páginas oficiales *.gov.br con ?codigo=…).
create or replace function public.rnm_pedir_validacion(p_url text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_url text := btrim(coalesce(p_url, '')); v_cod text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;
  -- Gratis para toda persona con sesión (22 oct 2026): sirve para atraer gente. Límite: 10 validaciones por hora y por cuenta.
  if v_url !~* '^https://([a-z0-9-]+\.)*gov\.br(:443)?/' then raise exception 'qr_no_oficial'; end if;
  v_cod := lower((regexp_match(v_url, '[?&]codigo=([0-9a-fA-F-]{16,64})'))[1]);
  if v_cod is null then raise exception 'qr_sin_codigo'; end if;
  delete from rnm_validaciones where user_id = auth.uid() and created_at < now() - interval '1 day';
  if (select count(*) from rnm_validaciones where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then raise exception 'demasiados_intentos'; end if;
  select id into v_id from rnm_validaciones where user_id = auth.uid() and codigo = v_cod and estado = 'pendiente' and created_at > now() - interval '10 minutes' limit 1;
  if v_id is null then insert into rnm_validaciones (user_id, codigo, url) values (auth.uid(), v_cod, left(v_url, 500)) returning id into v_id; end if;
  return v_id;
end $$;

-- La persona consulta el resultado de SU validación.
create or replace function public.rnm_mi_validacion(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('estado', v.estado, 'rnm', v.rnm,
           'nacimiento', to_char(v.fecha_nacimiento, 'DD/MM/YYYY'), 'validez', to_char(v.validez, 'DD/MM/YYYY'),
           'situacion', v.situacion, 'error', v.error)
    from rnm_validaciones v where v.id = p_id and v.user_id = auth.uid();
$$;

-- Bot (operador): validaciones por hacer.
create or replace function public.rnm_validaciones_pendientes()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if private.get_user_org_id() is null then raise exception 'no_autorizado'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'url', url) order by created_at)
                     from rnm_validaciones where estado = 'pendiente' and intentos < 3 and created_at > now() - interval '30 minutes'), '[]'::jsonb);
end $$;

-- Bot (operador): guarda el resultado. Si falla y quedan intentos, sigue pendiente.
create or replace function public.rnm_guardar_validacion(p_id uuid, p_ok boolean, p_rnm text default null, p_nacimiento text default null,
  p_validez text default null, p_situacion text default null, p_error text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_nac date; v_val date;
begin
  if private.get_user_org_id() is null then raise exception 'no_autorizado'; end if;
  if p_ok then
    begin v_nac := to_date(p_nacimiento, 'DD/MM/YYYY'); exception when others then v_nac := null; end;
    begin v_val := to_date(p_validez, 'DD/MM/YYYY'); exception when others then v_val := null; end;
    update rnm_validaciones set estado = 'ok', rnm = upper(left(regexp_replace(coalesce(p_rnm, ''), '[^A-Za-z0-9]', '', 'g'), 12)),
      fecha_nacimiento = v_nac, validez = v_val, situacion = left(p_situacion, 200), error = null, resuelto_at = now() where id = p_id;
  else
    update rnm_validaciones set intentos = intentos + 1, error = left(p_error, 200),
      estado = case when intentos + 1 >= 3 then 'error' else 'pendiente' end,
      resuelto_at = case when intentos + 1 >= 3 then now() else null end where id = p_id;
  end if;
end $$;

revoke all on function public.rnm_pedir_validacion(text), public.rnm_mi_validacion(uuid), public.rnm_validaciones_pendientes(),
  public.rnm_guardar_validacion(uuid, boolean, text, text, text, text, text) from public, anon;
grant execute on function public.rnm_pedir_validacion(text), public.rnm_mi_validacion(uuid), public.rnm_validaciones_pendientes(),
  public.rnm_guardar_validacion(uuid, boolean, text, text, text, text, text) to authenticated, service_role;
