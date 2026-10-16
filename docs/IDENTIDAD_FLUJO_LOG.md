# Identidad FLUJO Migração en la app (15-oct-2026)

Rama `redesign/identidad-flujo` (sobre `redesign/premium-ui`). Solo presentación.

**Problema:** la app se veía genérica (icono de "controles" azul, ilustración neutra, azul de plantilla).
**Hecho:**
- **Logo real** (F navy con la franja de Brasil) recortado con fondo transparente: `logo-flujo.png` (completo con lema «Facilitamos seus trâmites no Brasil») y `logo-marca.png` (solo la F). Aparece en la bienvenida, la barra superior, el pie y la ayuda; icono PWA `icon-192/512.png` nuevo con la marca.
- **Paleta de la marca:** azul marino `#0A2A5E` / azul `#0E3F8E` para acciones, **verde `#13803D`** y amarillo `#F7C600` solo como acento (franja bajo la barra, borde de la tarjeta principal, "Migração" en verde).
- **Confianza (sin cifras inventadas):** en la bienvenida "Sin contraseñas · Tus datos, protegidos (LGPD) · Servicio independiente, no es un canal oficial de la PF"; tarjeta "FLUJO Migração" en Ayuda; pie con el nombre y el lema. No se usa el escudo ni la imagen de la Policía Federal.
- manifest `theme_color` y sw v43 (cachea los logos).

**Probado** (375×812, datos simulados): bienvenida, Inicio, ayuda, cuenta, planes, historial sin scroll horizontal; imágenes cargan.
**No probado:** otros tamaños tras el cambio de paleta, contraste de los colores nuevos en todos los componentes, el icono PWA instalado en un celular real.
**Pendiente (requiere decisión del dueño):** datos de empresa reales en el pie (razón social/CNPJ, dirección, horario de atención) y testimonios o cifras verificables.

## Prueba (15-oct-2026)
Recorrido de 18 pantallas/estados con datos y servicios simulados en **360×800, 390×844, 768×1024, 1280×800 y 1440×900** (marcos de distinto ancho dentro de una pestaña): 0 desbordes horizontales, 0 controles menores de 40 px, 0 imágenes rotas, 0 errores de JavaScript, popup de planes cabe en pantalla. Contraste de la paleta nueva: todos los pares ≥ 4,5:1 salvo verde sobre verde claro (4,48) → se eliminó ese ajuste y vuelve al verde anterior (4,74).
**No probado:** login real, registro, consultas y pagos reales; dispositivos reales; icono PWA instalado.
