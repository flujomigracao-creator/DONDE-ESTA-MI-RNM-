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

## Estilo interior, responsive y Mi cuenta (15-oct-2026)
- **Lo que el dueño veía** (captura) era la **versión publicada antigua** (`rnm-v29`): "Hola, Flujo", "Todavía no tienes RNM registrados". Los cambios están en las ramas, **no publicados**.
- **Responsive real**: móvil/tablet (<1024 px) → barra inferior; **escritorio (≥1024 px) → barra lateral navy con el logo de FLUJO**, contenido de hasta 1080 px y rejillas (Inicio en 2 columnas, detalle en 2 columnas, planes en 4).
- **Inicio vacío**: tarjeta de bienvenida navy con franja verde/amarilla, "Primera consulta gratis" y botón claro; sección **Cómo funciona** (3 pasos) en vez del bloque genérico.
- **Pulido general**: sombras suaves, fondo con degradado, tarjetas elevables al pasar el cursor, animación de entrada (respeta `prefers-reduced-motion`), cabecera translúcida.
- **Mi cuenta resumida y funcional**: cabecera con avatar y "Editar", dos cifras (RNM registrados y plan actual con fecha), lista "Tus datos" (teléfono, dirección, ciudad) y lista "Cuenta y ayuda" con accesos directos (Mis RNM, Planes y pagos, Ayuda, Privacidad, Términos), "Cerrar sesión" con confirmación y enlace discreto a soporte para eliminar la cuenta.
- sw v44.
**Probado** (19 pantallas × 6 tamaños: 360, 390, 768, 1024, 1280, 1440; datos simulados): 0 desbordes, 0 controles < 40 px, 0 imágenes rotas, 0 errores JS, popup cabe. **No probado:** login/registro/pagos reales, dispositivos reales.

## Efectos, iconos y microinteracciones (15-oct-2026, sw v45)
- **`efectos.js` (nuevo, opcional):** avisos emergentes (`toast`) con icono, onda al tocar botones, vibración suave en la barra inferior (móvil), sombra de cabecera al desplazar, aparición escalonada de tarjetas (con red de seguridad para que nada quede invisible), contador animado, **esqueleto de carga** en Inicio (con mensaje y "Reintentar" si los datos no llegan en 9 s).
- **Iconos SVG** en lugar de emojis y flechas de texto (candado, pin, check, flecha de volver); **insignias con icono propio** (reloj/check/alerta) para no depender solo del color; icono activo relleno en la navegación.
- **Efectos de marca:** cinta verde/amarilla animada en la bienvenida y la tarjeta principal, logo flotante, brillo y "check" animado cuando el documento está **Listo**, barra de etapas que se llena, punto de la etapa actual con latido, spinner en botones mientras envían, acento verde/amarillo en los títulos de sección.
- Todo respeta `prefers-reduced-motion`.
- **Bug encontrado en la prueba y corregido:** un `$$` mal escapado hacía fallar el temporizador de seguridad (error de JavaScript al cambiar de pantalla).
**Probado:** 19 pantallas × 6 tamaños (360–1440 px, datos simulados): 0 errores JS, popup cabe; un botón "Quitar este RNM" medía 39,6 px → 44 px. **No probado:** dispositivos reales, vibración, rendimiento en móviles lentos.

## Lo importante primero + onboarding por pasos (16-oct-2026, sw v46)
Pensado para el cliente con prisa que solo quiere saber **dónde está su RNM**.
- **Rastreador del RNM** (Inicio y detalle): titular grande "Tu RNM está en Salvador/BA" + "Listo para retirar" (o "está en camino", "sigue en trámite", "se está confeccionando"), línea de recorrido de 4 estaciones con **marcador animado**, color por estado (verde/azul/ámbar/rojo) y **una sola acción** ("Cómo retirarlo").
- **Inicio con RNM**: saludo + botón "Agregar" + **una línea de plan** (ámbar si falta activarlo) + el rastreador + filas compactas de los demás. Se quitaron: subtítulos, tarjeta de plan, "Otros RNM / Ver todos", notas legales y el pie.
- **Detalle**: rastreador → "Qué hacer ahora" (máx. 3 pasos) → "Retira en … / es tu ciudad o no" (con botón de cambio de dirección solo si hace falta) → **"Más detalles"** plegado (última revisión, plan, unidad con código, historial, cambios de dirección, texto original, aviso orientativo, quitar RNM).
- **Onboarding guiado**: una pregunta por pantalla (RNM → fecha de nacimiento → autorización) con puntos de progreso, transiciones deslizantes, check animado al validar y botón "Atrás"; luego la revisión de datos y una **pantalla de progreso** (RNM registrado → en cola para consultar la PF → aquí verás dónde está) antes de abrir el detalle. Es honesta: no dice que ya consultó la PF.
- Planes/Historial/Mis RNM: se ocultan textos de ayuda repetidos.
**Probado** (22 pantallas × 6 tamaños, datos simulados): 0 desbordes, 0 controles < 40 px, 0 errores JS, popup cabe; onboarding completo (validaciones, Atrás, formato de fecha, progreso) y pantalla de progreso. **No probado:** registro/consulta/pagos reales, dispositivos reales.
