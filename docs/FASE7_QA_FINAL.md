# Fase 7 · QA visual y entrega — registro (12-oct-2026)

Rama `redesign/premium-ui` → PR contra `main` (sin fusionar, sin desplegar). sw v42.

## Qué se ejecutó
Recorrido automático en el navegador integrado con **datos y servicios simulados** (Supabase y Mercado Pago falsos), en **360×800, 390×844, 768×1024, 1280×800 y 1440×900**. Por cada tamaño: 18 pantallas/estados — bienvenida, perfil (3 pasos), Inicio, Mis RNM, Agregar (paso 1 y 2), Historial, Planes, Ayuda, Mi cuenta, 4 detalles de RNM (listo con cambios de dirección, en traslado, sin información, no encontrado), popup de planes y pantalla de pago. Se midió: scroll horizontal, elementos que se salen del ancho, controles menores de 40 px de alto, que el popup quepa en pantalla y errores de JavaScript.

| Tamaño | Scroll horizontal | Controles < 40 px | Errores JS | Popup cabe |
|---|---|---|---|---|
| 360×800 | No | 0 (tras corregir) | 0 | Sí |
| 390×844 | No | 2 → corregidos | 0 | Sí |
| 768×1024 | No | 2 → corregidos | 0 | Sí |
| 1280×800 | No | 2 → corregidos | 0 | Sí |
| 1440×900 | No | 2 → corregidos | 0 | Sí |

Corregido en esta fase: enlace "Ver todos" (18 px) y botón "← Cambiar plan" (36 px) → 44 px; **contraste** del texto secundario (`#66758C` daba 4,36:1 sobre el fondo gris) → `#5B6B83` (5,05:1). Los demás pares de colores revisados (azul/blanco 6,12; verde, ámbar y rojo sobre sus fondos 4,7–5,7; hero 7,6–10,3) cumplen 4,5:1.
Tras los arreglos solo se **repitió el recorrido completo en 360×800** (0 problemas); en los otros cuatro tamaños el resultado previo a los arreglos era idéntico salvo esos dos controles.

## Qué NO se probó (importante antes de publicar)
- **Flujos reales**: login con Google, guardado de perfil, registro de RNM, consultas reales, y sobre todo **pagos reales** (tarjeta, Pix, boleto, rechazo, retorno de Mercado Pago, confirmación por servidor). Todo usó datos simulados.
- Lector de pantalla y navegación completa solo con teclado en todas las pantallas (sí se probaron foco, Escape y Tab en los dos modales).
- Zoom de texto al 200 %, `prefers-reduced-motion` visual, modo oscuro de la app, Safari/iOS y Android reales, instalación como PWA y caché del service worker (`rnm-v42`) en un celular real.
- Escritorio: la app se muestra como **una columna centrada de 560 px** (sin barra lateral). Es consistente y sin desbordes, pero deja espacio vacío a los lados; el plan original pedía conservar la barra lateral en escritorio.

## Archivos
`app-rnm/index.html`, `app-rnm/app.js`, `app-rnm/figma.css` (nuevo), `app-rnm/sw.js`, `app-rnm/terminos.html`, `app-rnm/privacidad.html`, `app-rnm-figma/` (versión alternativa antigua: borrar), `docs/` (auditoría y registro por fase).
