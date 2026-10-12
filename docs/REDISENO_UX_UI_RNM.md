# Auditoría UX/UI — ¿Dónde está mi RNM?

Fecha: 2026-10-12. Alcance: app-rnm; no incluye cambios de Supabase, Edge Functions ni Mercado Pago.

## Arquitectura actual

PWA estática sin build: index.html reúne estructura y estilos; app.js gestiona presentación e integración con Supabase, Google OAuth, ViaCEP y Mercado Pago. Las reglas de acceso, consultas, planes y pagos permanecen en Supabase y RLS.

## Inventario

| Área | Flujo | Datos y acciones reales |
|---|---|---|
| Acceso | Inicio de sesión | Google OAuth de Supabase |
| Alta | Perfil en tres pasos | Perfil, consentimiento y CEP |
| Inicio | Registros RNM | Listado, resultado, cobertura y actualización |
| Consulta | Registro de RNM | RNM, fecha de nacimiento y consentimiento |
| Seguimiento | Tarjeta por RNM | Estado PF, última revisión, unidad y cambio de dirección |
| Pago | Planes y tarjeta | Precios existentes, Mercado Pago y confirmación del backend |
| Cuenta | Datos y salida | Edición de perfil y cierre de sesión |

## Hallazgos y propuesta

Prioridad P0: el alta se mostraba antes que los registros y los estilos estaban embebidos sin tokens. P1: la tarjeta no distinguía con claridad estado, actualización y siguiente acción; faltaban foco uniforme y un estado vacío significativo.

El rediseño usa una carcasa visual, tokens centralizados en premium.css, un resumen de orientación basado exclusivamente en los registros devueltos y tarjetas priorizadas antes del alta. No añade dependencias ni modifica Supabase, RLS, OAuth, precios ni Mercado Pago. No se inventan estados, etapas, plazos ni resultados; una cronología oficial requeriría datos verificables del backend.