-- El WhatsApp deja de ser obligatorio en el registro. Las funciones que lo leen (avisos, embudo, cobros) ya usan coalesce y omiten a quien no lo tiene.
-- El CHECK de formato (10 a 15 dígitos) sigue valiendo cuando hay número; con NULL no se evalúa.
alter table public.rnm_perfiles alter column telefono drop not null;
