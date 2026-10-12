# Auditoría técnica — ¿Dónde está mi RNM?

Fecha: 2026-10-11/12 · Alcance: repositorio, Supabase (`rumpfqevyspdmhaggxtq`), código de las funciones Edge, app web, extensión.
Método: solo lectura. No se modificó producción, secretos ni configuración durante esta auditoría.
Leyenda: **Verificado** (comprobado con evidencia) · **No verificado** (sin acceso) · **Pendiente** (requiere prueba).

## 1. Resumen ejecutivo

- El aislamiento entre usuarios funciona en los puntos probados: un usuario inventado ve 0 filas de las tablas con datos de clientes; `anon` no puede leer; las funciones de staff devuelven `no_autorizado`; las de servicio dan "permission denied".
- **No se encontró ningún riesgo P0 demostrado.**
- Los riesgos reales están en el flujo de pagos (activación no atómica, firma de webhook opcional, sin manejo de reembolsos) y en permisos más amplios de lo necesario (columnas de INSERT).
- El token de Mercado Pago se pegó en un chat: rotarlo es obligatorio (acción del propietario).
- Vercel no se pudo consultar (403): lo que depende del panel de Vercel está **No verificado**.

## 2. Estado de la conexión (Verificado en repositorio)

| Elemento | Resultado |
|---|---|
| URL de Supabase en `app-rnm/app.js` y `extension-rnm-pf/background.js` | `https://rumpfqevyspdmhaggxtq.supabase.co` (el proyecto esperado) |
| Clave en el frontend | `sb_publishable_…` (clave pública por diseño). No hay `service_role` en el repositorio |
| Clave pública de Mercado Pago en `app.js` | `APP_USR-…` (Public Key, apta para el navegador) |
| `service_role` | Solo en las funciones Edge, vía `SUPABASE_SERVICE_ROLE_KEY` (entorno de Supabase) |
| `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `APP_URL` | Solo como secretos/variables de entorno de Supabase. **No verificable desde aquí** si `MP_WEBHOOK_SECRET` existe |
| Vercel | **No verificado** (403). Inferencia: el despliegue se hizo por API con archivos inline desde esta sesión; el repositorio de GitHub **no** parece ser la fuente del despliegue. Hay que confirmar en el panel: proyecto `rnm-flujo`, root directory, si hay Git conectado |

## 3. Seguridad de Supabase

### 3.1 Tablas (Verificado con consultas al catálogo)

| Tabla | RLS | Políticas | Acceso `authenticated` | `anon` |
|---|---|---|---|---|
| `rnm_registros` | sí | cliente: select/insert/delete propios; staff: select/update | SELECT, INSERT, DELETE; UPDATE solo en 5 columnas (`cerrado, estado_pf, proxima_consulta_at, ultima_consulta_at, ultimo_resultado`) y solo staff por RLS | ninguno |
| `rnm_consultas` | sí | cliente: select propio; staff: select/insert | SELECT, INSERT (staff por RLS) | ninguno |
| `rnm_perfiles` | sí | cliente: select/insert/update propios; staff: select | SELECT, INSERT, UPDATE (6 columnas) | ninguno |
| `rnm_planes` | sí | cliente: select propio; staff: select | SELECT | ninguno |
| `rnm_cuentas_gratis` | sí | **ninguna** | ninguno | ninguno |
| `rnm_suscripciones_mp` | sí | **ninguna** | ninguno | ninguno |
| `rnm_pagos_mp` | sí | **ninguna** | ninguno | ninguno |

**RLS sin políticas (3 tablas): comportamiento intencional.** Los GRANT a `authenticated` y `anon` están revocados; solo `service_role` (que omite RLS) accede. Es la configuración correcta para tablas solo de servidor. Evidencia: `role_table_grants` y la prueba "permission denied for table rnm_suscripciones_mp" como usuario autenticado.

### 3.2 Funciones `SECURITY DEFINER` (Verificado)

Todas tienen `search_path=public` y dueño `postgres`.

| Función | EXECUTE | Control interno |
|---|---|---|
| `rnm_pendientes`, `rnm_guardar_resultado`, `rnm_por_cobrar`, `rnm_activar_plan` | authenticated, service_role | `private.get_user_org_id() is null → no_autorizado` (staff) |
| `rnm_activar_plan_servicio`, `rnm_precio_plan` | solo service_role | probado: un autenticado recibe "permission denied" |
| `rnm_gratis_disponible` | authenticated | usa `auth.uid()` |
| `private.*` | PUBLIC (por defecto) | el esquema `private` no está expuesto por la API REST (**No verificado** en la configuración de "Exposed schemas") |

### 3.3 Pruebas de aislamiento ejecutadas (solo lectura, sin datos reales)

Con un usuario inventado (`sub` = `00000000-…-0001`, sin filas): `rnm_registros`=0, `rnm_perfiles`=0, `rnm_planes`=0, `rnm_consultas`=0. Como `anon`: permission denied. Quedan **Pendientes** las pruebas con dos usuarios reales de prueba (A no modifica B).

## 4. Hallazgos

### P1 — integridad y operación

**H1. Activación de pago no atómica** — `supabase-funciones-rnm/mp-webhook/index.ts`, `cobroAutorizado`.
Hace tres llamadas separadas: `insert rnm_pagos_mp` → `rpc rnm_activar_plan_servicio` → `update rnm_suscripciones_mp`. Hay compensación (borra el pago si falla el plan), pero si el proceso muere entre el insert y la activación, el pago queda registrado sin plan y todos los reintentos de Mercado Pago responden `ya_aplicado`: **el cliente pagó y no recibe el plan**.
Propuesta: una función SQL transaccional `rnm_registrar_pago_mp` (solo service_role) que inserte el pago y aplique el plan en una sola transacción.

**H2. Firma del webhook opcional** — `mp-webhook/index.ts`, `firmaValida`: `if (!secreto) return true`.
Si `MP_WEBHOOK_SECRET` no está configurado, cualquiera puede llamar al webhook. Mitigación existente: el webhook nunca confía en el cuerpo; consulta el cobro a la API de Mercado Pago y verifica monto y suscripción; la idempotencia limita el daño a reprocesar un cobro real. Aun así debe exigirse la firma en producción (fallar de forma segura si falta el secreto). **No verificado** si el secreto está configurado hoy.

**H3. Token de Mercado Pago expuesto en un chat.** Acción del propietario: regenerar y actualizar `MP_ACCESS_TOKEN`.

### P2 — errores funcionales / endurecimiento

**H4. Sin manejo de reembolsos/contracargos.** El webhook ignora el tema `payment`. Un pago reembolsado no revierte el plan (dura hasta `vence_at`, máximo un mes).
**H5. Moneda y referencia no validadas.** Se compara el monto con lo guardado, pero no `currency_id` ni que `external_reference` coincida con `user_id`.
**H6. Columnas de INSERT demasiado amplias en `rnm_registros`.** El cliente puede insertar `unidad_pf`, `cambio_direccion`, `ultima_consulta_at`, `proxima_consulta_at`, `precio_centavos`, `consentimiento_at`. La política limita varias columnas, pero estas no. Impacto bajo (un cliente que fije `ultima_consulta_at` se quita su propia consulta gratis), pero el principio de mínimo privilegio pide restringirlo a `user_id, rnm, fecha_nacimiento`. La app solo envía esas tres.
**H7. WhatsApp sin configurar → textos sin canal.** `var WHATSAPP = ""` (`app.js:5`). Los botones están protegidos (`if (WHATSAPP …)`), pero los textos dicen "Escríbenos por WhatsApp" en `ESTADOS` y en `cajaUnidad` sin ofrecer ningún enlace. Falta un contacto alternativo (el correo `flujoescalaempresas@gmail.com` ya figura en privacidad y términos).
**H8. La función de pago devuelve el detalle de Mercado Pago al navegador** (`detalle`, `causa`, agregado para depurar). Debe quitarse; el detalle ya queda en el log del servidor.
**H9. El esquema SQL de la app no está versionado en el repositorio.** Las 12 migraciones `app_rnm_*` (20261012001612 … 20261012014222) existen solo en la base. Dificulta reconstruir o auditar. Exportar con `supabase db pull`.
**H10. Despliegue sin trazabilidad** (ver sección 2): repositorio y producción pueden divergir.

### P3 — mejoras

**H11.** Cualquier miembro de `organization_members` ve RNM y fecha de nacimiento de todos los clientes y puede activar planes (`rnm_activar_plan`, ref `manual`) sin registro de auditoría. Es intencional para operadores; conviene una tabla de auditoría.
**H12.** `REVOKE EXECUTE … FROM PUBLIC` en `private.rnm_aplicar_plan` y demás funciones `private` (defensa en profundidad). Tres funciones `private` sin `search_path` fijo (advisor): `rnm_perfil_updated_at`, `rnm_estado_normalizado`, `rnm_precio_centavos`.
**H13.** `rnm_planes` expone `mp_preapproval_id` y `pago_ref` a su dueño: innecesario; restringir columnas.
**H14.** Regla de negocio: se puede borrar un RNM y registrar otro dentro del mismo plan (rotación). No es un fallo de seguridad; decidir si es aceptable.
**H15.** Columnas heredadas sin uso: `estado_pago`, `pagado_at`, `pago_ref`, `suscripcion_hasta`, `precio_centavos` en `rnm_registros`.
**H16 (fuera de alcance).** El linter de Supabase marca funciones `SECURITY DEFINER` ejecutables por `anon` en otros módulos (`comercial_*`, `nora_pausar_por_asesor`, `seguimiento_lote_respuesta`) y 7 tablas sin políticas ajenas a RNM. Revisar aparte.

## 5. Puntos que ya están bien (Verificado)

- El cliente no puede cambiar su plan ni su pago: `rnm_planes` es solo SELECT; el INSERT de `rnm_registros` exige `estado_pago='pendiente'`, sin `pagado_at`/`pago_ref`/`suscripcion_hasta`/`estado_pf`/`ultimo_resultado`, y `cerrado=false`.
- `requiere_pago` lo fija un trigger, no el cliente.
- Límite de 4 RNM por cuenta (trigger) y RNM único global (`UNIQUE (rnm)`).
- El precio sale de la base (`rnm_precio_plan`), no del navegador. El servidor valida el plan (1–4).
- Un pago se aplica una sola vez (`payment_id` es clave primaria).
- La función de pago exige sesión real (`auth.getUser`) además de `verify_jwt`.
- La extensión usa solo la sesión del operador (no guarda la contraseña) y la clave pública.
- No hay datos personales ni secretos en el repositorio.

## 6. No verificado por falta de acceso

Vercel (proyecto, rama, directorio raíz, variables, historial) · valor y existencia de los secretos de Supabase · esquemas expuestos por PostgREST · comportamiento real de cobro, renovación, cancelación y reembolso en Mercado Pago · pruebas con dos usuarios reales.
