-- La app (Play Billing) lee pago_ref para saber si el plan es de Mercado Pago (mp:) o de Google Play (play:).
-- Sin este permiso la consulta del plan respondía 403 y la app no veía el plan de la persona. RLS sigue limitando a la fila propia.
grant select (pago_ref) on public.rnm_planes to authenticated;
