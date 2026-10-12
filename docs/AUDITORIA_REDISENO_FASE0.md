# Rediseño premium · Fase 0 — Auditoría previa (12-oct-2026)

Rama de trabajo: `redesign/premium-ui` (creada desde `rediseno-figma`). Sin cambios en producción, Supabase ni pagos.

## Estado de partida
- `main` (e7fdb68, sw v29): app "fintech premium" con sidebar de escritorio y barra inferior móvil.
- `rediseno-figma` añade `app-rnm/figma.css` (capa visual del Figma sobre `premium.css`), nueva bienvenida, Inicio con tarjeta hero, popup de planes compacto (sw v30-v31) y la carpeta `app-rnm-figma/` (versión alternativa antigua, sin Pix/boleto; candidata a borrar).
- Decisión del responsable: el RNM se muestra **completo** (se retiró el enmascarado del hero de Inicio).

## Inventario medido
| Medida | Valor |
|---|---|
| IDs en `index.html` | 82 |
| IDs que `app.js` consulta | 82 (todos resueltos; ver abajo los creados por JS) |
| `style="..."` inline en el HTML | 44 |
| Estilos asignados desde JS (`.style.` / `cssText`) | 15 |
| `premium.css` / `figma.css` | 1565 / ~170 líneas |
| Accesibilidad: `aria-*` en HTML / JS | 12 / 8 |
| `:focus-visible` en `premium.css` | 10 usos; `prefers-reduced-motion` presente |

## Riesgos de regresión detectados
1. **Cascada frágil**: `premium.css` redefine los mismos selectores varias veces (p. ej. `.nav-item` ×9, `.res` ×9, `.plan` ×10, `.fila-rnm` ×10, `.modal` ×7, `.tarjeta` ×7) y `figma.css` añade otra capa con `!important` en varios puntos. Cualquier cambio debe probarse en todas las pantallas.
2. **Reglas que se anulan entre sí**: un `display:… !important` por ID (p. ej. `#vista-perfil`) pisa a `.oculto`; ya ocurrió y se corrigió con `:not(.oculto)`. Evitar `!important` sobre contenedores de vistas.
3. **Código muerto en `app.js`**: referencias a elementos que ya no existen en el HTML (`count-todos`, `count-proceso`, `count-listos`, `lista-mis-rnm-clon`, `btn-ir-nueva-consulta`, `btn-nueva-consulta-mis-rnm`, filtros `#mis-rnm-filtros`). Están protegidas con `if (el)`, pero indican que **la pantalla "Mis RNM" con filtros del plan (pantalla 06) no existe todavía**.
4. **IDs creados por JS** (no están en el HTML, no renombrar): `mp-*`, `form-pago`, `btn-pagar-tarjeta`, `btn-volver-planes`, `px-*`, `btn-generar`, `btn-copiar`, `btn-abrir-boleto`, `panel-otro`, `msg-pago`, `btn-hero-empty-registrar`.
5. **Inline CSS** (44 en HTML + 15 en JS) dificulta unificar tokens; migrar por grupos y comprobar tras cada uno.
6. **Contraste y estados**: varios estados se distinguen solo por color (insignias `vigila`/`ok`); el plan pide texto + icono.
7. **Caché**: toda entrega visual debe subir la versión del service worker (`rnm-vNN`) y listar `figma.css`/`premium.css` en `ARCHIVOS`.

## Contratos que no se pueden tocar
IDs de `index.html` usados por `app.js`; RPC `rnm_gratis_disponible`; inserción en `rnm_registros`; tablas `rnm_perfiles`, `rnm_planes`, `rnm_consultas`; precios `PRECIOS` (R$ 4,99 / 8,99 / 12,99 / 15,99); revisión semanal; tokenización de Mercado Pago; OAuth de Google.

## Qué ya cubre `rediseno-figma` respecto al plan
- 01 Bienvenida (nuevo layout móvil), 05 Inicio (hero + plan + otros), 12/17 popup de planes (compacto, botones fijos).
- Pendiente: 02–04 (onboarding pulido), 06 (Mis RNM/filtros), 07–08 (detalle y ubicación), 09–11, 13–16, 18, 19.

## Pruebas ejecutadas en Fase 0
Solo comprobaciones estáticas (`node --check app.js`, recuento de IDs/selectores) y revisión visual en 375×812 con datos de ejemplo de bienvenida, Inicio y popup de planes. **No** se probó OAuth real, registro real, ni pagos. Capturas base completas por viewport: pendientes (la herramienta de captura falló a ratos).

## Siguiente paso propuesto
Fase 1 · Fundamentos: consolidar tokens y clases semánticas, foco visible/área táctil, y migrar inline CSS por grupos pequeños.
