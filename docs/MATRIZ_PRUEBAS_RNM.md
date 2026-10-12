# Matriz de pruebas — ¿Dónde está mi RNM?

Estados: **Aprobada** · **Fallida** · **Bloqueada** (falta acceso o credenciales) · **No ejecutada**.
Ninguna prueba usó datos reales de clientes ni generó cobros.

## A. Aislamiento y permisos (Supabase)

| Id | Prueba | Esperado | Observado | Estado | Evidencia / límite |
|---|---|---|---|---|---|
| S1 | Usuario autenticado inventado cuenta filas de `rnm_registros`, `rnm_perfiles`, `rnm_planes`, `rnm_consultas` | 0 | 0 / 0 / 0 / 0 | **Aprobada** | Consulta de solo lectura dentro de una transacción con rollback |
| S2 | `anon` lee `rnm_registros` | Denegado | `permission denied for table rnm_registros` | **Aprobada** | |
| S3 | Autenticado lee `rnm_suscripciones_mp` | Denegado | `permission denied` | **Aprobada** | |
| S4 | Autenticado sin staff llama `rnm_pendientes()` | `no_autorizado` | `no_autorizado` | **Aprobada** | |
| S5 | Autenticado llama `rnm_activar_plan_servicio` | Denegado | `permission denied for function` | **Aprobada** | |
| S6 | Usuario A no lee ni modifica registros de B (dos usuarios de prueba) | Sin acceso | — | **No ejecutada** | Requiere dos cuentas de prueba |
| S7 | Autenticado intenta `update rnm_planes` / `insert rnm_planes` | Denegado | — | **No ejecutada** | Por catálogo: solo SELECT |
| S8 | Autenticado intenta insertar `unidad_pf` en `rnm_registros` | Debe fallar tras C6 | — | **No ejecutada** | Hoy está permitido (H6) |
| S9 | RLS sin políticas en 3 tablas: ninguna ruta de cliente | Sin acceso | Sin GRANT para `anon`/`authenticated` | **Aprobada** | `role_table_grants` |

## B. Mercado Pago y activación de plan

Todas **No ejecutadas** o **Bloqueadas**: no hay entorno sandbox configurado ni se generaron cobros.

| Id | Prueba | Esperado | Estado |
|---|---|---|---|
| M-P1 | Pago aprobado | Un registro en `rnm_pagos_mp`, plan activo, `vence_at` +1 mes | No ejecutada (cobro real pendiente de prueba con pagador distinto) |
| M-P2 | Pago pendiente | No activa plan | No ejecutada |
| M-P3 | Pago rechazado | No activa plan | No ejecutada |
| M-P4 | Firma ausente o inválida con `MP_WEBHOOK_SECRET` | 401 | Bloqueada (secreto no verificable) |
| M-P5 | Monto distinto al guardado | No activa; log `monto_distinto` | No ejecutada |
| M-P6 | Evento duplicado | Segundo aviso responde OK sin duplicar | No ejecutada (la clave primaria lo garantiza por diseño) |
| M-P7 | Usuario incorrecto / suscripción desconocida | 500 y reintento, sin activar | No ejecutada |
| M-P8 | Error de comunicación con Mercado Pago | 500 y reintento, sin activación parcial | No ejecutada |
| M-P9 | Renovación y cancelación | Renueva con cobro aprobado; cancelada no extiende | No ejecutada |
| M-P10 | Corte entre insert de pago y activación (H1) | Debe quedar todo o nada | No ejecutada (se cubre con C1) |
| M-P11 | Pago con el mismo correo de la cuenta cobradora | Rechazo `Payer and collector cannot be the same user` | **Aprobada** (observado en producción, error 400 de Mercado Pago) |

## C. Aplicación web

| Id | Prueba | Estado | Evidencia |
|---|---|---|---|
| A1 | El formulario de tarjeta carga (3 recuadros seguros + selector de CPF/CNPJ), sin errores de consola | **Aprobada** | Vista previa local |
| A2 | Los archivos publicados en Vercel coinciden con los locales | **Aprobada** | `cmp` de `app.js`, `index.html`, `sw.js` |
| A3 | Inicio y cierre de sesión con Google | **Aprobada** (verificado antes por el propietario) | |
| A4 | Pago de extremo a extremo con tarjeta real | No ejecutada | Requiere pagador distinto a la cuenta cobradora |
| A5 | Con `WHATSAPP` vacío no se muestran enlaces rotos | **Aprobada** (por código: `if (WHATSAPP …)`) | Los textos "Escríbenos por WhatsApp" siguen sin canal (H7) |
| A6 | Diseño móvil y escritorio | No ejecutada de forma sistemática | |
| A7 | Quitar RNM, límite de 4, RNM duplicado | No ejecutada en esta auditoría | Verificado antes durante el desarrollo |

## D. Calidad y despliegue

| Id | Prueba | Estado | Nota |
|---|---|---|---|
| Q1 | Linter, tests, build | No aplica | El proyecto es HTML/JS estático sin `package.json`, linter ni build |
| Q2 | Comprobación de sintaxis de `app.js` | **Aprobada** | `node --check` |
| Q3 | Vercel: proyecto, rama, directorio raíz, variables | Bloqueada | API devolvió 403 |
| Q4 | Esquemas expuestos por PostgREST | Bloqueada | Sin acceso a la configuración |

## E. Pruebas tras la implementación (2026-10-12)

Todas ejecutadas en transacciones que se deshacen al final; se comprobó después que no quedó ninguna fila de prueba (0 pagos, 0 suscripciones de prueba, 0 registros de prueba, 0 filas de auditoría).

| Id | Prueba | Esperado | Observado | Estado |
|---|---|---|---|---|
| R1 | Primer cobro con `rnm_registrar_pago_mp` | Aplica el plan | `aplicado=true`, suscripción `activa` | **Aprobada** |
| R2 | El mismo cobro dos veces | Segundo no cambia nada | `ya_aplicado`, `vence_at` igual | **Aprobada** |
| R3 | Plan inválido (9 RNM) | Todo o nada | `plan_invalido`, 0 pagos guardados | **Aprobada** |
| R4 | Cliente inserta con `user_id, rnm, fecha_nacimiento` | Permitido | ok | **Aprobada** |
| R5 | Cliente inserta `unidad_pf` / `ultima_consulta_at` | Denegado | `permission denied for table rnm_registros` | **Aprobada** (cierra H6, S8) |
| R6 | Cliente lee `mp_preapproval_id` de `rnm_planes` | Denegado | `permission denied for table rnm_planes` | **Aprobada** (cierra H13) |
| R7 | Cliente actualiza `rnm_planes` | Denegado | `permission denied` | **Aprobada** (cierra S7) |
| R8 | Cliente ejecuta `private.rnm_aplicar_plan` | Denegado | `permission denied for schema private` | **Aprobada** |
| R9 | Equipo: `rnm_pendientes`, `rnm_por_cobrar`, `rnm_activar_plan`, `rnm_guardar_resultado` | Siguen funcionando | todas ok; 2 filas de auditoría | **Aprobada** |
| R10 | Webhook sin firma / con firma falsa | 401 | 401 / 401 | **Aprobada** (cierra M-P4 en producción) |
| R11 | Aviso vacío al webhook | 200 | 200 | **Aprobada** |
| R12 | `mp-crear-suscripcion` sin sesión | 401 | 401 | **Aprobada** |
| R13 | `app.js`: mensajes de error por código y contacto sin WhatsApp (vista previa local) | Texto y enlace `mailto:` correctos, sin errores de consola | ok | **Aprobada** |
| R14 | Archivos de Vercel idénticos al repositorio | iguales | `cmp` igual (app.js, sw.js, index.html) | **Aprobada** |
| R15 | Cobro real con tarjeta + webhook de extremo a extremo (incluye moneda y dueño) | Plan activo | — | **No ejecutada** (requiere pagador distinto a la cuenta cobradora) |
| R16 | Prueba con dos usuarios reales de prueba (A no ve a B) | Sin acceso | — | **No ejecutada** |
