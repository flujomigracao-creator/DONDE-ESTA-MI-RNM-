-- CPF opcional en el perfil: se pide en el onboarding (junto con la dirección) y sirve para rellenar el pago con Pix o boleto.
-- Solo dígitos (11); la validación del dígito verificador se hace en la app. UPDATE de rnm_perfiles es por columnas, por eso el grant.
alter table public.rnm_perfiles add column if not exists cpf text;
alter table public.rnm_perfiles drop constraint if exists rnm_perfiles_cpf_check;
alter table public.rnm_perfiles add constraint rnm_perfiles_cpf_check check (cpf is null or cpf ~ '^[0-9]{11}$');
grant update (cpf) on public.rnm_perfiles to authenticated;
comment on column public.rnm_perfiles.cpf is 'CPF del cliente (11 dígitos), opcional: se usa para prellenar el pago.';
