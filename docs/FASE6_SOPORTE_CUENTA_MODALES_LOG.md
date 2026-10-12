# Fase 6 · Ayuda, cuenta, modales y páginas legales (pantallas 15–18) — registro (12-oct-2026)

Rama `redesign/premium-ui`. Solo presentación y accesibilidad. **El texto legal no se modificó** (solo el estilo de `terminos.html` y `privacidad.html`).

## Hecho
- **15 Ayuda**: aviso fijo "Servicio independiente de FLUJO… no garantizamos plazos… revisión semanal"; bloque de contacto con **WhatsApp primero** y correo como alternativa (el WhatsApp se oculta si no hay número, como antes); preguntas frecuentes en acordeones (filas de 52 px, foco visible) y una pregunta nueva sobre **cómo ampliar el plan** (se paga el plan nuevo completo y reemplaza al actual).
- **16 Mi cuenta**: identidad (avatar con tu inicial — antes siempre "U"), correo, **teléfono, dirección y ciudad**; "Editar mis datos" como acción principal; tarjeta de acceso con Google (sin contraseña local, enlace a la seguridad de Google) y **Cerrar sesión con confirmación**; texto para eliminar cuenta/datos escribiendo a soporte.
- **17 Modales**: foco inicial, **Escape**, **devolución del foco** al botón que abrió el modal (planes y confirmación), **Tab atrapado** dentro del modal abierto, sin scroll del fondo.
- **18 Legales**: mismo estilo que la app (Inter, azul, ancho de lectura, barra superior con "← Volver a la app" de 44 px, foco visible, modo oscuro).
- sw v41.

## Pruebas ejecutadas (375×812, datos de ejemplo)
Cuenta: avatar "A", teléfono, dirección con CEP y ciudad correctos. Modal de planes: foco en el contenedor, Tab desde el último elemento vuelve al primero, Escape cierra, el foco vuelve al botón de Planes, el scroll del fondo se restaura. Confirmación: foco inicial en la acción, Escape devuelve `false` y devuelve el foco, Tab queda dentro. Ayuda: 7 preguntas, acordeón abre, enlace de WhatsApp correcto. Términos: se ve con el estilo nuevo. Sin scroll horizontal.

## No probado
Lector de pantalla, navegación completa solo con teclado en todas las pantallas, 360×800 y escritorio, `privacidad.html` visualmente (misma hoja de estilo que términos), cerrar sesión real.
