# Fase 3 · Inicio y seguimiento (pantallas 05–08) — registro (12-oct-2026)

Rama `redesign/premium-ui`. Solo presentación; mismos datos y consultas, sin cambios en Supabase, precios ni cobro.

## Hecho
- **06 Mis RNM (pantalla nueva)**: sección `seccion-mis-rnm` con filtros Todos / En proceso / Listos (contadores, `aria-pressed`, scroll horizontal controlado) y botón Agregar RNM; acceso desde Inicio con "Ver todos (N)". Reutiliza `renderizarMisRnm`, que antes apuntaba a elementos inexistentes.
- **07 Detalle**: la explicación de FLUJO queda marcada como orientativa ("No es una decisión oficial ni una promesa de plazo") y separada del **estado literal informado por la Policía Federal** con fecha/hora de la última revisión.
- **08 Ubicación de retirada**: bloque "Dónde retirar tu documento" con Ciudad, Estado y Unidad; aviso diferenciado (misma ciudad / otra ciudad / no se sabe dónde vives / unidad no identificada); cambios de dirección en línea de tiempo (destino, estado, fecha); CTA de WhatsApp con fallback por correo; nota de que decide la PF. El RNM se muestra completo.
- sw v34.

## Pruebas ejecutadas (375×812, datos de ejemplo)
Lista de 4 RNM; contadores 4/1/3; filtro Listos → 3; `aria-pressed` correcto; "Ver todos (4)". Detalle con unidad conocida y misma ciudad (Florianópolis/SC), otra ciudad (Sorocaba/SP), código desconocido (`DPF/XXX/ZZ` → "No identificada", sin romper el diseño) y cambio de dirección con destino. Sin scroll horizontal.

## No probado
Datos reales de Supabase, navegación con teclado/lector de pantalla, 360×800 y escritorio, fallback por correo (WHATSAPP vacío), estados "problema" y "sin cobertura" en Inicio con datos reales.
