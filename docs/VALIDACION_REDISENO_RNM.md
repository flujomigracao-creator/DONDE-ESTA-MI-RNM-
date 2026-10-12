# Validación del rediseño RNM

**Fecha:** 2026-10-12  
**Alcance:** Entregas 1, 2 y 3 — Sistema Visual, Navegación, Seguimiento y Flujo de Consultas (`app-rnm/`).  
**Estado:** Cambios implementados y verificados en entorno local (sin alterar producción ni backend).

---

## 1. Comprobaciones de Calidad y Estructura

| Comprobación | Resultado | Evidencia / Detalle |
|---|---|---|
| **Sintaxis JavaScript** | Aprobada | `node --check app-rnm/app.js` ejecutado sin errores |
| **Consistencia Git / Parches** | Aprobada | `git diff --check` limpio (0 advertencias) |
| **Caché PWA & Service Worker** | Aprobada | `sw.js` en `rnm-v19` con invalidación de assets |
| **Tokens y Sistema Visual** | Aprobado | Centralizado en `premium.css` con variables CSS exactas del plan maestro |
| **Layout Híbrido Responsivo** | Aprobado | Sidebar desktop ($\ge 1024px$) y Bottom Nav con 5 pestañas para móvil ($< 1024px$) |
| **Enrutador de Secciones** | Aprobado | `navegarA()` conmuta fluidamente entre Inicio, Mis RNM, Detalle del RNM, Nueva consulta, Historial de consultas, Planes, Ayuda y Perfil |
| **Integridad de Elementos y Backend** | Aprobado | Todos los IDs de formulario, inputs, Supabase client y Mercado Pago SDK preservados |

---

## 2. Pantallas Implementadas en la Entrega 3 (Flujo de Consultas)

1. **Pantalla 9 (Nueva consulta — Asistente por pasos):**
   - **Indicador de etapas (`.stepper-bar`):** Pasos claramente numerados (1. Datos, 2. Confirmación, 3. Resultado).
   - **Validación en tiempo real:** Control de máscara alfanumérica de 6 a 12 caracteres para el RNM y máscara automática `dd/mm/aaaa` para fecha de nacimiento con validación ISO.
   - **Información de costo/cupos:** Notificación clara indicando si el registro es gratuito (primera consulta) o si consume cupos de plan mensual.

2. **Pantalla 10 (Confirmación de datos):**
   - **Tarjeta de revisión (`.review-summary-card`):** Presentación del RNM con enmascaramiento de seguridad, fecha de nacimiento formateada y nota de condición comercial antes de enviar la solicitud.
   - **Acciones seguras:** Botón "← Corregir datos" que retorna al formulario preservando todos los valores intactos, y botón "Confirmar y registrar" con protección contra clics dobles.

3. **Pantalla 11 (Resultado de la consulta):**
   - Tarjeta explicativa inmediata con el resultado retornado o confirmación del estado de supervisión activa.
   - Botón directo para revisar el trámite completo en *Mis RNM* o realizar una nueva consulta.

4. **Pantalla 12 (Historial de consultas):**
   - Vista dedicada de auditoría que recupera las operaciones registradas en `rnm_consultas`.
   - Cada tarjeta muestra fecha y hora de la verificación, número de RNM mapeado, badge semántico del resultado devuelto y resumen del dictamen.
   - Botón para actualizar el listado y componente `EmptyState` cuando no existen consultas históricas.

---

## 3. Próximo Paso Recomendado

- **Entrega 4 — Monetización y Pagos:**
  - Pantalla 13 (Planes y comparativa de precios por RNM y ahorro porcentual).
  - Pantalla 14 (Checkout y formulario de tarjeta seguro con Mercado Pago SDK v2).
  - Pantalla 15 (Resultado del pago: confirmado por backend, pendiente o causa de rechazo).
  - Pantalla 16 (Suscripción y pagos: control de cupos y fecha de vencimiento).
---

## 3. Revisión independiente y correcciones (2026-10-12)

Una segunda revisión del rediseño (Entregas 1–3) encontró y corrigió lo siguiente. Todo se comprobó en la vista previa local con datos de prueba (sin sesión real); no se alteró la base de datos.

| Hallazgo | Gravedad | Corrección | Comprobación |
|---|---|---|---|
| La pantalla **Planes y pagos** copiaba el HTML de la ventana de pago: los botones de plan quedaban sin función | Alta | Pantalla propia con el estado real del plan, los precios existentes y un único botón que abre la ventana de pago | Plan sin plan / plan activo; el botón abre la ventana con los 4 planes; el formulario de tarjeta monta sus 3 recuadros seguros |
| **Historial de consultas** leía una columna inexistente (`resultado`) y trataba un error de carga como "sin consultas"; además pedía `select *` (incluía el id del operador) | Alta | Columnas reales (`resultado_texto`, `estado_normalizado`, `unidad_pf`…), sin datos internos, con estado de error y reintento | Historial con datos y con error simulado |
| Un RNM recién registrado (sin resultado) mostraba "Hay una novedad en tu trámite" | Media | Mensaje propio: "Estamos haciendo tu primera consulta" / "Este RNM espera un plan" | Hero del Inicio con un RNM sin consultar |
| El **Detalle** armaba la línea de tiempo con campos sueltos y saltaba al inicio en cada refresco | Media | Revisiones reales desde `rnm_consultas`; se reconstruye sin saltar | Línea de tiempo con 2 revisiones reales + alta + cambio de dirección |
| En móvil **no había forma de cerrar sesión** (el botón estaba en la barra lateral oculta) | Alta | Botón en Mi cuenta; ambos piden confirmación; aviso cuando la sesión caduca | Diálogo de confirmación abre y cancela |
| Cabecera móvil: título tapado por tres botones | Media | Subtítulo y botones secundarios ocultos en móvil (están en la navegación inferior) | Captura a 375 px, sin desplazamiento horizontal |
| Ayuda: contacto fijo en el HTML | Baja | El botón de WhatsApp usa el número configurado (y se oculta si falta); FAQ ampliada con puntos reales | Enlace `wa.me` correcto |

**Limitaciones declaradas:** no hay historial de pagos dentro de la app (el cliente no tiene acceso a esa tabla; se explica en pantalla); el acceso es solo con Google, por lo que registro, recuperación y cambio de contraseña propios no aplican; no existen notificaciones push ni bandeja de notificaciones.
**No ejecutado:** prueba con una sesión real de cliente y un cobro real (depende de un pagador distinto a la cuenta cobradora).

---

## 4. Simplificación de pantallas (2026-10-12)

Objetivo: quitar lo innecesario y resumir cada espacio. Verificado en la vista previa local con datos de prueba (Inicio, Mis RNM, detalle, nueva consulta, Planes, Ayuda; 0 errores de consola).

| Pantalla | Antes | Ahora |
|---|---|---|
| Cabecera | Título, subtítulo y 3 botones (Planes, Actualizar, Mis datos) | Título y Actualizar (Planes y Mis datos ya están en el menú y en Mi cuenta) |
| Inicio | Saludo, estado, siguiente paso, 4 accesos rápidos, tarjeta de resumen y lista completa de documentos | Saludo, estado principal, siguiente paso y, si hay más de un RNM, "Tus otros RNM" en filas |
| Mis RNM | Tarjeta larga por RNM (resultado, unidad, cambios, botones) | Fila compacta (RNM, estado, ciudad, insignia); todo el detalle está en el detalle del RNM |
| Nueva consulta | 3 pasos (datos, confirmación, resultado) | 2 pasos; al confirmar se abre el detalle del RNM nuevo. Se corrigió el texto de costo ("cubierto por tu plan") y se quitó el RNM duplicado en la confirmación |
| Planes y pagos | 3 tarjetas | 2 tarjetas (plan actual y precios); el historial de pagos pasa a una línea |
| Ayuda | 6 preguntas largas siempre abiertas | 6 preguntas plegables y más cortas |
| Mi cuenta | Tarjeta de seguridad aparte | Una línea |
| Navegación | Sin dirección propia (el botón "atrás" salía de la app) | Cada sección tiene su dirección (#inicio, #mis-rnm, …) y "atrás" funciona; al recargar se vuelve a la misma sección |

---

## 5. Información del RNM resumida (2026-10-12)

| Elemento | Antes | Ahora |
|---|---|---|
| Estado | Título + 2 párrafos | Título + 1 frase por estado |
| Unidad de la PF | Caja con unidad, comparación con tu ciudad, texto de ayuda y "no hay solicitudes de cambio" | "Retiro: Polícia Federal de X" + unidad y si es tu ciudad |
| Cambio de dirección | Párrafo introductorio + línea por solicitud + aviso | Una línea por solicitud ("hacia Sorocaba/SP: aún no iniciada (fecha)") y, si aplica, una línea de aviso |
| Historial del trámite | Tarjeta siempre abierta con subtítulo | Plegado ("+"), eventos más cortos |
| Cabecera y acciones | Etiqueta "Documento en seguimiento", tarjeta "Acciones del registro" | Solo el RNM y su estado; "Quitar este RNM" sin tarjeta |
| Inicio (estado principal) | "Documento en seguimiento principal" + unidad completa + "Ver detalles completos del trámite" | RNM, estado, 1 frase, "Retiro en: ciudad" y "Ver detalle" |

Verificado en la vista previa con el caso real (Salvador, cambio hacia Sorocaba): el detalle completo cabe en una pantalla móvil y el historial queda plegado.
