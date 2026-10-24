-- Plantillas de WhatsApp con textos más claros (v2). Las actuales siguen aprobadas y sirven de respaldo mientras Meta aprueba estas:
-- rnm-enviar-avisos prueba primero la v2 y, si Meta aún no la aprobó, manda la anterior.
-- kommo-canal (sincronizar_plantillas, cada hora desde el flush) envía los borradores a Meta.
insert into public.whatsapp_plantillas (organization_id, nombre, idioma, estado, categoria, cuerpo, ejemplos) values
('00000000-0000-0000-0000-000000000001', 'rnm_listo_v2', 'es', 'BORRADOR', 'UTILITY',
 'Hola {{1}}, ¡tu carné ya está listo! Tu RNM terminado en {{2}} puede retirarse en {{3}} de la Policía Federal. Antes de ir, mira en la app si tienes que pedir cita, y lleva tu protocolo y un documento con foto. FLUJO Migração',
 '["María", "4567", "la unidad de Curitiba/PR"]'::jsonb),
('00000000-0000-0000-0000-000000000001', 'rnm_etapa_v2', 'es', 'BORRADOR', 'UTILITY',
 'Hola {{1}}, tu RNM terminado en {{2}} sigue avanzando en la Policía Federal y todavía no está listo para retirar. No tienes que hacer nada: te avisaremos apenas cambie. FLUJO Migração',
 '["María", "4567"]'::jsonb),
('00000000-0000-0000-0000-000000000001', 'rnm_problema_v2', 'es', 'BORRADOR', 'UTILITY',
 'Hola {{1}}, hay una novedad importante en tu RNM terminado en {{2}}: la Policía Federal pidió algo más para continuar o no aprobó la solicitud. Abre la app para ver cuál es y qué hacer, o escríbenos por aquí y te ayudamos. FLUJO Migração',
 '["María", "4567"]'::jsonb)
on conflict (organization_id, nombre, idioma) do nothing;
