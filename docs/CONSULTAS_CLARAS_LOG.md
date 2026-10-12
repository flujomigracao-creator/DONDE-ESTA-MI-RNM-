# Información de las consultas en lenguaje claro (12-oct-2026)

Rama `redesign/premium-ui`. Solo presentación: no cambia lo que guarda la base ni lo que consulta el equipo.

## Problema
La Policía Federal devuelve textos largos en portugués (p. ej. «Seu documento foi confeccionado e está pronto para ser retirado na unidade… Preencha o formulário abaixo e faça o agendamento…» o «Seu documento está em transferência da unidade … para a unidade …»). La app mostraba ese texto casi crudo; los traslados aparecían como "Hay una novedad".

## Qué se hizo
- `interpretarConsulta(texto)` (en `app.js`) convierte el texto de la PF en: **título corto**, **una frase de resumen** (con ciudad/UF de las unidades que aparecen en el texto) y **2–3 pasos cortos** ("Qué puedes hacer"). Casos: entregado, **en traslado (nuevo)**, listo, problema, falta información, en trámite, no encontrado y desconocido.
- **Barra de etapas** en el detalle: En trámite → En traslado → Listo → Entregado, con la etapa actual marcada (no aparece en "problema" ni "no encontrado").
- El texto original de la PF queda **plegado** ("Ver lo que dice la Policía Federal"), con fecha de la última revisión y la nota de que la explicación es orientativa.
- **Historial y línea de tiempo**: ahora muestran el resumen interpretado y la unidad como ciudad/UF, no el texto crudo cortado.
- Inicio: la etiqueta del estado sale del mismo intérprete.
- sw v35.

## Probado (375×812, textos reales de la PF tomados de la base, sin datos personales)
Listo (BA), en traslado (RR→PR), en análisis y no encontrado devuelven título/resumen/pasos correctos; barra de etapas marca la etapa 2 en el traslado; sin scroll horizontal.

## No probado
Con sesión y datos reales; textos de la PF que no estén en el catálogo (caen en "novedad" con el original plegado); revisión de redacción por alguien de soporte.

## Ajuste del mismo día (detalles que faltaban)
- **Sin información todavía**: el título es "Tu documento se está confeccionando" (con aviso de plan si el RNM espera uno).
- **Dónde está tu RNM ahora**: bloque destacado en el detalle y línea 📍 en la tarjeta principal de Inicio — "En la unidad de Salvador/BA, listo para retirar", "En camino de Boa Vista/RR a Curitiba/PR", o la unidad que figura en el registro.
- **Detalles completos otra vez**: unidad con ciudad y código (`DELEMIG/DREX/SR/PF/BA`), origen y destino del traslado, instrucciones completas de retirada (formulario de carteiras, unidades sin agenda).
- **Cambios de dirección**: ahora se muestran también en cada fila del historial y de la línea de tiempo, con destino, fecha y estado **Aprobada / Desaprobada** (insignia verde/roja; además "en trámite", "aún no iniciada", "cancelada").
- sw v36.

Probado (375×812, textos reales de la PF + cambios de ejemplo "Deferido"/"Indeferido"): ubicación para listo, traslado, sin información y en trámite; chips Aprobada/Desaprobada; sin scroll horizontal. No probado con datos reales de Supabase.

## Detalle del RNM reordenado (12-oct-2026)
Orden de lectura: **cabecera** (RNM + etiqueta de estado + última revisión + si hay seguimiento semanal) → **tarjeta de estado** (título, barra de etapas, "Dónde está tu RNM ahora", resumen) → **Qué puedes hacer** (pasos numerados en tarjeta propia) → dónde retirar (si hay unidad) → historial plegado → texto original de la PF plegado + aviso orientativo → "Quitar este RNM" como enlace discreto. Se eliminó la repetición de la unidad de retiro y la etiqueta confusa "Consulta lista". sw v37. Probado en 375×812 con listo, traslado y sin información (sin scroll horizontal).
