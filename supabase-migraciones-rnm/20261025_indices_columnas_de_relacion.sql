-- Índices en las columnas de relación que usa la app en cada consulta (el aviso de rendimiento de Supabase los marcaba sin cubrir).
-- rnm_registros.user_id es la más importante: la usan las políticas de seguridad (RLS) y private.rnm_cubierto en cada lectura del cliente.
create index if not exists rnm_registros_user_id_idx on public.rnm_registros (user_id);
create index if not exists rnm_avisos_registro_id_idx on public.rnm_avisos (registro_id);
create index if not exists rnm_avisos_email_registro_id_idx on public.rnm_avisos_email (registro_id);
create index if not exists rnm_opiniones_registro_id_idx on public.rnm_opiniones (registro_id);
create index if not exists rnm_pagos_mp_user_id_idx on public.rnm_pagos_mp (user_id);
create index if not exists rnm_suscripciones_mp_user_id_idx on public.rnm_suscripciones_mp (user_id);
