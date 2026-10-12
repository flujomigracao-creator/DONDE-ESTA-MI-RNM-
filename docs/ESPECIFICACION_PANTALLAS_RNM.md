# Especificación y Auditoría de Pantallas — ¿Dónde está mi RNM?

**Fecha:** 2026-10-12  
**Alcance:** Frontend PWA (`app-rnm/`), mapeo con Supabase (`rumpfqevyspdmhaggxtq`), Edge Functions y Mercado Pago.  
**Propósito:** Inventario exhaustivo, auditoría técnica y mapa de implementación para el rediseño integral UX/UI en 25 pantallas.

---

## 1. Diagnóstico de la Arquitectura Actual

### 1.1 Stack Técnico
- **Arquitectura:** Single Page Application / PWA estática sin paso de compilación (HTML5, Vanilla JavaScript estructurado, CSS modular).
- **Librerías externas:**
  - Supabase JS Client (`@supabase/supabase-js@2.45.4` UMD via CDN).
  - Mercado Pago SDK v2 (`https://sdk.mercadopago.com/js/v2` CardForm iframe seguro).
  - ViaCEP API REST (`https://viacep.com.br/ws/{cep}/json/` para autocompletar dirección en Brasil).
  - Service Worker (`sw.js`, versión `rnm-v16`) para soporte offline y cacheo de assets.

### 1.2 Estado de las Vistas en el Código Vigente (`app-rnm/index.html` & `app.js`)
Actualmente la aplicación maneja solo 3 contenedores condicionales (`vista(nombre)`):
1. `#vista-login`: Botón simple "Entrar con Google" (`sb.auth.signInWithOAuth`).
2. `#vista-perfil`: Onboarding/edición de perfil en 3 pasos (Nombre -> Teléfono -> Dirección con CEP) en `#form-perfil`.
3. `#vista-app`: Vista monolítica que contiene en un único flujo vertical:
   - Barra de usuario / acciones (`#btn-planes`, `#btn-actualizar`, `#btn-datos`, `#btn-salir`).
   - Bloque de resumen dinámico (`actualizarResumen()`).
   - Formulario de alta (`#form-rnm` con RNM, fecha de nacimiento y consentimiento).
   - Listado de tarjetas de RNM (`#lista`).
   - Modal emergente para planes y checkout de tarjeta Mercado Pago (`#modal-planes`, `#cartel`).

### 1.3 Capacidades y Limitaciones del Backend Real
Para no inventar endpoints ni romper la seguridad de Supabase y RLS:
- **Autenticación:**
  - Google OAuth (`provider: 'google'`) plenamente configurado y probado.
  - Email/Password: La base de datos y Supabase Auth lo soportan de forma nativa (`signUp`, `signInWithPassword`, `resetPasswordForEmail`). En la UI actual solo se ofrecía Google.
- **Tabla `rnm_perfiles`:** Columnas disponibles: `user_id`, `nombre`, `telefono`, `direccion`, `ciudad`, `estado`, `cep`, `created_at`, `updated_at`.
- **Tabla `rnm_registros`:** Columnas visibles: `id`, `user_id`, `rnm`, `fecha_nacimiento`, `estado_pf`, `unidad_pf`, `cambio_direccion`, `ultimo_resultado`, `ultima_consulta_at`, `cerrado`, `requiere_pago`, `estado_pago`, `created_at`.
  - El cliente solo tiene permiso de `INSERT` para `user_id`, `rnm`, `fecha_nacimiento`.
  - El cliente puede `DELETE` registros propios (si no están cerrados).
  - `UPDATE` está bloqueado para clientes (solo operadores/staff vía funciones de servicio).
- **Tabla `rnm_planes`:** Columnas autorizadas para lectura: `cupos`, `precio_centavos`, `vence_at`, `user_id`.
- **Tabla `rnm_consultas`:** Registra consultas históricas (`id`, `registro_id`, `resultado`, `created_at`). SELECT habilitado por RLS para el dueño del registro.
- **RPC `rnm_gratis_disponible()`:** Devuelve un booleano indicando si la cuenta tiene derecho a su primera consulta gratuita.
- **Edge Function `mp-crear-suscripcion`:** Recibe `cupos` y `card_token_id`. No acepta números crudos de tarjeta en el frontend.

---

## 2. Matriz e Inventario de las 25 Pantallas

A continuación se detalla el análisis de cada pantalla requerida en la especificación, su estado actual, mapeo de datos y plan de adaptación:

```
[Leyenda de Estado: EXISTE (funcional en app) | PARCIAL (elementos dispersos o modal) | NO EXISTE (requiere creación)]
```

### A. Acceso y Cuenta

| # | Pantalla | Estado | Mapeo Backend Real | Brechas y Adaptación Requerida |
|---|---|---|---|---|
| **1** | **Bienvenida** | PARCIAL | Supabase Auth (anónimo) | Hoy la landing no autenticada muestra directamente el botón de Google sin propuesta de valor fintech ni estructura desktop de dos columnas. Se creará la pantalla de bienvenida con beneficios, confianza y acceso directo a login/registro. |
| **2** | **Inicio de sesión** | EXISTE (básico) | `sb.auth.signInWithOAuth({ provider: 'google' })` y `sb.auth.signInWithPassword()` | Existe solo botón de Google (`#vista-login`). Se adaptará a formulario completo con email/password accesible + Google OAuth como opción rápida + recuperación de clave. |
| **3** | **Registro** | NO EXISTE | `sb.auth.signUp({ email, password })` | Se agregará pantalla de creación de cuenta con validación de requisitos de contraseña, confirmación y términos de servicio, reutilizando Supabase Auth. |
| **4** | **Recuperar contraseña** | NO EXISTE | `sb.auth.resetPasswordForEmail(email)` | Pantalla con campo de correo, mensaje neutro antienumeración de cuentas y enlace de regreso a login. |

---

### B. Área Principal

| # | Pantalla | Estado | Mapeo Backend Real | Brechas y Adaptación Requerida |
|---|---|---|---|---|
| **5** | **Inicio / Dashboard** | PARCIAL | `rnm_registros`, `rnm_planes`, `rnm_perfiles` | Hoy todo está apilado en una sola vista vertical sin navegación lateral ni superior. Se separará como Dashboard fintech: Tarjeta principal dominante de estado, bloque "¿Qué puedes hacer ahora?", resumen de actividad, 4 accesos rápidos y avisos reales. |
| **6** | **Mis RNM** | PARCIAL | `rnm_registros` (SELECT) | Hoy se listan todos los registros directamente en `#lista`. Se adaptará con tarjetas independientes, filtros (Todos, En proceso, Listos), botón de "Nueva consulta", y ordenación por fecha. |
| **7** | **Detalle del RNM** | PARCIAL | Registro individual + `unidad_pf` + `cambio_direccion` + `ultimo_resultado` | La información se mostraba colapsada en la tarjeta. Se estructurará en vista de detalle dedicada: Cabecera con botón volver, estado comprensible, bloque de unidad policial/geolocalización, gestión de cambio de dirección y confirmación de borrado. |
| **8** | **Historial de estados** | PARCIAL | `rnm_consultas` + marcas de tiempo | Los cambios de dirección ya parsean eventos (`lineasCambio()`). Para el trámite general, se conectará con `rnm_consultas` mostrando línea de tiempo vertical con fechas reales, sin simular etapas que la PF no haya reportado. |

---

### C. Consultas

| # | Pantalla | Estado | Mapeo Backend Real | Brechas y Adaptación Requerida |
|---|---|---|---|---|
| **9** | **Nueva consulta** | EXISTE | `INSERT rnm_registros (rnm, fecha_nacimiento)` + `rnm_gratis_disponible()` | El formulario actual estaba fijo en el dashboard. Se convertirá en una pantalla con indicador de pasos (1. Datos, 2. Confirmación, 3. Resultado), validaciones inmediatas y aviso de consumo de cupos. |
| **10** | **Confirmar datos** | NO EXISTE | Prevalidación frontend antes del submit | Paso intermedio para que el usuario verifique su RNM (enmascarado) y fecha de nacimiento antes de consumir su consulta gratis o cupo mensual. |
| **11** | **Resultado de consulta** | PARCIAL | Objeto `ultimo_resultado` y reglas de `explicar()` | Se desacopla de la tarjeta básica a una pantalla/vista enfocada de resultado que explique claramente qué significa el estado y qué acción tomar. |
| **12** | **Historial de consultas** | PARCIAL | `sb.from('rnm_consultas').select('*')` | Se formalizará la vista de auditoría histórica de consultas para el usuario con fecha, hora y respuesta obtenida. |

---

### D. Monetización

| # | Pantalla | Estado | Mapeo Backend Real | Brechas y Adaptación Requerida |
|---|---|---|---|---|
| **13** | **Planes** | EXISTE (en modal) | `PRECIOS = {1:499, 2:899, 3:1299, 4:1599}`, `rnm_planes` | Hoy vive en una ventana modal emergente `#modal-planes`. Se convertirá en pantalla completa responsiva con comparativa, cupos, precio por RNM, ahorro porcentual y estado del plan actual. |
| **14** | **Pago / Checkout** | EXISTE | SDK `MercadoPago.cardForm` + Edge Function `mp-crear-suscripcion` | Se rediseñará con estética premium bancaria, respetando la integración por iframe de Mercado Pago (número, vencimiento, CVV, nombre, CPF). |
| **15** | **Resultado del pago** | PARCIAL | Polling a `rnm_planes` y temporizador de espera | Mensaje formal de pago confirmado (cuando el backend lo valide), pendiente de confirmación (polling a webhook) o error con causa comprensible. |
| **16** | **Suscripción y pagos** | PARCIAL | `rnm_planes` + `rnm_pagos_mp` | Pantalla de estado de la suscripción: cupos activos, fecha de vencimiento (`vence_at`) y condiciones. |

---

### E. Cuenta y Soporte

| # | Pantalla | Estado | Mapeo Backend Real | Brechas y Adaptación Requerida |
|---|---|---|---|---|
| **17** | **Perfil** | EXISTE (onboarding) | `rnm_perfiles` (SELECT / UPDATE) + ViaCEP | El formulario de 3 pasos se integrará en una pantalla de gestión de perfil completa: avatar con iniciales, datos personales, dirección con autocompletado CEP y estado del plan. |
| **18** | **Seguridad** | NO EXISTE | Supabase Auth (`updateUser`, `signOut`) | Pantalla dedicada para cambio de contraseña, sesiones activas, política de privacidad y cierre seguro de sesión. |
| **19** | **Notificaciones** | NO EXISTE | Notificaciones contextuales in-app / cambios en `rnm_registros` | Bandeja de avisos del sistema (cambios de estado, confirmación de pagos, vencimientos de plan). |
| **20** | **Ayuda y soporte** | NO EXISTE | Enlace WhatsApp oficial (`5548984553309`) + Email soporte | Centro de ayuda con FAQs sobre el trámite de RNM, tiempos de la Policía Federal, cambio de delegacia y botón directo a WhatsApp. |

---

### F. Estados Especiales (Componentes y Vistas del Sistema)

| # | Pantalla / Estado | Estado | Mapeo Backend Real | Brechas y Adaptación Requerida |
|---|---|---|---|---|
| **21** | **Sin registros** | PARCIAL | `regs.length === 0` | Componente `EmptyState` elegante con ilustración sobria, mensaje claro y botón de acción "Registrar mi primer RNM". |
| **22** | **Sin consultas disponibles** | PARCIAL | `!gratisDisponible && !cubierto` | Componente informativo que explica el agotamiento de cupos y ofrece seleccionar un plan mensual para continuar el monitoreo. |
| **23** | **Error o conexión perdida** | PARCIAL | Bloques de aviso `.msg` | Banner/Modal de error neutral y accesible, con botón de reintento y sin filtrar trazas técnicas ni datos internos. |
| **24** | **Sesión expirada** | NO EXISTE | Evento `TOKEN_REFRESHED` fallido / 401 en Supabase | Diálogo de advertencia invitando a renovar la sesión sin perder el contexto. |
| **25** | **Confirmación de acciones** | PARCIAL | `window.confirm()` nativo | Componente `ConfirmDialog` accesible (reemplazando los alerts del navegador para eliminar un RNM o cerrar sesión). |

---

## 3. Sistema Visual y Tokens de Diseño

Se implementará un sistema visual centralizado en `premium.css` respetando las directrices exactas:

```css
:root {
  /* Paleta Base */
  --canvas: #F6F8FC;        /* Fondo general */
  --surface: #FFFFFF;       /* Superficies de tarjetas y paneles */
  --brand: #155EEF;         /* Azul principal para acciones */
  --brand-hover: #0C44C7;   /* Hover acción principal */
  --brand-soft: #EFF6FF;    /* Fondos suaves de acento */
  --navy: #102A56;          /* Azul marino profundo (confianza/cabeceras) */
  --text-main: #182230;     /* Texto principal de alto contraste */
  --text-muted: #667085;    /* Texto secundario / metadatos */
  --border-light: #E4E7EC;  /* Bordes de tarjetas y separadores */
  --border-field: #D0D5DD;  /* Bordes de formularios */

  /* Colores Semánticos */
  --success: #067647;
  --success-soft: #ECFDF3;
  --warning: #B54708;
  --warning-soft: #FFFAEB;
  --danger: #B42318;
  --danger-soft: #FEF3F2;

  /* Geometría y Elevación */
  --radius-card: 16px;
  --radius-button: 10px;
  --radius-input: 10px;
  --shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.05);
  --shadow-md: 0 4px 16px rgba(16, 42, 86, 0.06);
  --shadow-lg: 0 12px 32px rgba(16, 42, 86, 0.12);

  /* Dimensiones Táctiles */
  --control-height: 48px;
}
```

### 3.1 Estructura del Layout Compartido (`AppLayout`)
1. **Escritorio (Desktop $\ge$ 1024px):**
   - **Sidebar Lateral Izquierda fija (260px):**
     1. Logo y marca "¿Dónde está mi RNM?"
     2. Inicio (Dashboard)
     3. Mis RNM
     4. Nueva consulta
     5. Historial de consultas
     6. Planes y pagos
     7. Ayuda y soporte
     8. Perfil (en la parte inferior)
   - **Cabecera Superior (`PageHeader`):** Título de contexto, indicador de usuario y botón de acción contextual.
   - **Área Central (`ContentArea`):** Contenedor con `max-width: 1080px`, centrado y espaciado generoso.

2. **Móvil (Mobile $<$ 1024px):**
   - **Cabecera superior compacta:** Logo resumido + avatar de usuario.
   - **Navegación inferior fija (Bottom Nav):** 5 accesos directos con iconos y etiquetas:
     - 🏠 Inicio
     - 📄 Mis RNM
     - 🔍 Consultas
     - 💳 Planes
     - 👤 Perfil
   - Espacio inferior seguro (`env(safe-area-inset-bottom)`) para evitar solapamiento con botones.

---

## 4. Hoja de Ruta de Entregas Incrementales

Para asegurar cero tiempo de inactividad, preservación de datos y verificación continua:

- **Entrega 1 — Sistema Visual, Layout Compartido y Navegación:**
  - Creación del nuevo `AppLayout` responsivo (Sidebar en desktop + Bottom Bar en móvil).
  - Unificación de tokens CSS, tipografía, botones, campos (`FormField`), tarjetas base y `PageHeader`.
  - Enrutador visual en `app.js` para alternar limpiamente entre secciones sin recargar la página.

- **Entrega 2 — Inicio y Seguimiento (Núcleo del Producto):**
  - **Pantalla 5 (Dashboard):** Tarjeta principal de estado con semántica clara, recomendación del siguiente paso y accesos rápidos.
  - **Pantalla 6 (Mis RNM):** Listado con tarjetas avanzadas `RnmSummaryCard`.
  - **Pantalla 7 (Detalle del RNM):** Vista dedicada con desglose de unidad de la Policía Federal y cambio de dirección.
  - **Pantalla 8 (Historial de Estados):** Línea de tiempo vertical `RnmTimeline` con datos reales.
  - **Pantalla 21 & 25:** Estados vacíos (`EmptyState`) y diálogos de confirmación (`ConfirmDialog`).

- **Entrega 3 — Flujo de Consultas:**
  - **Pantalla 9 (Nueva Consulta):** Asistente paso a paso con validaciones en tiempo real.
  - **Pantalla 10 (Confirmación de Datos):** Resumen de datos previo al registro.
  - **Pantalla 11 (Resultado):** Explicación clara sin tecnicismos.
  - **Pantalla 12 (Historial de Consultas):** Registro de actividad previa.

- **Entrega 4 — Monetización y Pagos:**
  - **Pantalla 13 (Planes):** Cuadrícula comparativa con ahorro porcentual y cupos.
  - **Pantalla 14 (Checkout seguro):** Integración reforzada del SDK de Mercado Pago.
  - **Pantalla 15 & 16:** Confirmación de cobro atómica y administración de suscripciones activas.

- **Entrega 5 — Cuenta, Acceso y Acabado Final:**
  - **Pantallas 1–4:** Bienvenida, Login con Google y Email/Pass, Registro y Recuperación.
  - **Pantallas 17–20:** Perfil, Seguridad, Notificaciones y Soporte.
  - **Pantallas 22–24:** Estados especiales (Sin cupos, Errores de red, Sesión expirada).
  - Pruebas de accesibilidad, validación móvil/desktop y documentación final en `docs/VALIDACION_REDISENO_RNM.md`.

