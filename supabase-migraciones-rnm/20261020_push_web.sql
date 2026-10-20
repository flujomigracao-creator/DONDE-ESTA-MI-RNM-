-- Suscripciones Web Push (VAPID) de la app. Sin Firebase.
create table if not exists public.rnm_push_subs (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  agente text,
  creado_at timestamptz not null default now(),
  visto_at timestamptz not null default now()
);
create index if not exists rnm_push_subs_user on public.rnm_push_subs(user_id);
alter table public.rnm_push_subs enable row level security;  -- sin políticas: solo service_role y la RPC

create table if not exists public.rnm_push_enviados (
  aviso_id uuid not null,
  endpoint text not null,
  enviado_at timestamptz not null default now(),
  primary key (aviso_id, endpoint)
);
alter table public.rnm_push_enviados enable row level security;

create or replace function public.rnm_push_registrar(p_endpoint text, p_p256dh text, p_auth text, p_agente text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'no autenticado'; end if;
  if p_endpoint !~ '^https://' or coalesce(length(p_p256dh),0) < 20 or coalesce(length(p_auth),0) < 8 then raise exception 'suscripción inválida'; end if;
  insert into public.rnm_push_subs(endpoint, user_id, p256dh, auth, agente) values (p_endpoint, auth.uid(), p_p256dh, p_auth, p_agente)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, visto_at = now();
end $$;
revoke all on function public.rnm_push_registrar(text, text, text, text) from public, anon;
grant execute on function public.rnm_push_registrar(text, text, text, text) to authenticated;
grant all on public.rnm_push_subs, public.rnm_push_enviados to service_role;
