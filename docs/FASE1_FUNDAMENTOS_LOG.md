# Fase 1 · Fundamentos visuales — registro (12-oct-2026)

Rama `redesign/premium-ui`. Solo presentación; sin cambios en Supabase, pagos ni lógica de datos.

## Hecho
- 43 estilos inline del HTML pasan a clases semánticas en `figma.css` (onboarding, botones pequeños, barras de regreso, ayuda, cuenta, modal de confirmación). Queda 0 `style="…"` en `index.html`. (Los 15 `.style.` de `app.js` se mantienen para una fase posterior.)
- Tokens nuevos: escala de espacio (4/8), escala tipográfica y `--touch: 44px`.
- Foco visible global (`:focus-visible`), áreas táctiles mínimas de 44 px, `prefers-reduced-motion` global.
- **Bug corregido**: la barra de progreso del perfil no avanzaba (el color inline pisaba la clase `.on`). Ahora avanza y expone `role="progressbar"` con `aria-valuenow`.
- sw v32.

## Pruebas ejecutadas
`node --check app.js`; en 375×812 con datos de ejemplo: pasos 2 y 3 del perfil (barra, botones de 44 px, sin scroll horizontal) y bienvenida. No se probó OAuth ni guardado real; no se revisaron otras vistas tras el cambio de clases más allá de la comprobación del DOM.

## Pendiente de verificar visualmente antes de Fase 2
Ayuda, Mi cuenta, Agregar RNM (paso 2) y diálogo de confirmación con las nuevas clases.
