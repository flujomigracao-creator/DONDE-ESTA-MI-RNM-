# Plan de implementación — ¿Dónde está mi RNM?

## Estado de implementación (2026-10-12, autorizado por el propietario: "haz todo lo necesario")

| Cambio | Estado | Detalle |
|---|---|---|
| C1 pago atómico | **Hecho y desplegado** | Migración `app_rnm_endurecimiento` + `mp-webhook` v7. Probado en transacciones con rollback: aplica, duplicado = `ya_aplicado`, plan inválido no deja pago a medias |
| C2 firma obligatoria | **Hecho y desplegado** | Antes se comprobó que el secreto estaba configurado (401 sin firma). Sin secreto, el webhook responde 503. Probado: sin firma y firma falsa dan 401 |
| C3 rotar token | **Pendiente (propietario)** | |
| C4 moneda y dueño | **Hecho y desplegado** | `mp-webhook` v7 (no probado contra Mercado Pago real) |
| C5 reembolsos | **Cerrado por decisión del propietario** | No habrá reembolsos; no se implementa reversión de planes. Ojo: `terminos.html` §5 todavía ofrece reembolso si el fallo es de FLUJO |
| C6 INSERT mínimo | **Hecho** | Probado: insertar con 3 columnas funciona; con `unidad_pf` o `ultima_consulta_at` da `permission denied` |
| C7 sin detalle de MP al navegador | **Hecho y desplegado** | `mp-crear-suscripcion` v7 + `app.js` |
| C8 contacto sin WhatsApp | **Hecho y desplegado** | Correo de contacto cuando `WHATSAPP` está vacío. El propietario entregó el número (2026-10-12) y quedó configurado en `app.js` |
| C9 esquema versionado / Vercel–GitHub | **Parcial; Vercel–GitHub: decisión SÍ, pendiente de conectar** (la API de Vercel responde 403, hay que hacerlo desde el panel) | Esta migración está en `supabase-migraciones-rnm/`; faltan las 12 anteriores (`supabase db pull`) y decidir conexión Vercel–GitHub |
| C10 auditoría | **Hecho** | Tabla `rnm_auditoria`; probado con activar plan y guardar resultado |
| C11 funciones `private` | **Hecho** | Probado: el equipo sigue funcionando (pendientes, por cobrar, activar plan, guardar resultado) |
| C12 columnas de `rnm_planes` | **Hecho** | Probado: leer columnas permitidas funciona; `mp_preapproval_id` da `permission denied` |
| C13 rotar RNM en un plan | **Cerrado por decisión del propietario** | Se permite borrar un RNM y registrar otro dentro del mismo plan; sin cambios |
| C14 columnas heredadas | No hecho (destructivo) | Requiere respaldo y autorización |
| C15 otros módulos | No hecho (fuera de alcance) | |

Estado original del plan (antes de implementar): propuesto. Cada etapa necesitaba autorización del propietario antes de tocar producción.
Orden: seguridad y pagos primero; después lo funcional. Cada cambio es pequeño, revisable y reversible.

## Etapa 1 — Pagos e integridad (P1)

### C1. Activación de pago atómica (H1)
- **Problema:** pago registrado sin plan si el proceso se corta entre pasos.
- **Cambio:** migración SQL nueva `rnm_registrar_pago_mp(p_payment, p_preapproval, p_user, p_cupos, p_monto, p_ref)` (SECURITY DEFINER, `search_path=public`, EXECUTE solo `service_role`): inserta el pago (con `ON CONFLICT DO NOTHING`), y solo si fue nuevo aplica el plan y marca la suscripción, todo en una transacción. `mp-webhook` pasa a llamarla en un único `rpc`.
- **Archivos:** nueva migración; `supabase-funciones-rnm/mp-webhook/index.ts`.
- **Riesgo de regresión:** medio (toca el cobro). **Pruebas:** M-P1…M-P9 de la matriz, en entorno de prueba.
- **Reversión:** redeploy de la versión anterior del webhook; la función SQL nueva puede quedarse sin uso.

### C2. Firma de webhook obligatoria (H2)
- **Cambio:** si falta `MP_WEBHOOK_SECRET`, responder 503 y no procesar (falla segura). Confirmar el formato del manifiesto con la documentación vigente de Mercado Pago.
- **Prerrequisito del propietario:** configurar `MP_WEBHOOK_SECRET` en Supabase **antes** de desplegar, o el webhook dejará de activar planes.
- **Riesgo:** alto si se despliega sin el secreto. **Reversión:** versión anterior del webhook.

### C3. Rotar el token de Mercado Pago (H3) — acción del propietario
Generar un token nuevo en Mercado Pago y reemplazar `MP_ACCESS_TOKEN` en Supabase. Probar un cobro de R$ 4,99 después.

## Etapa 2 — Endurecimiento (P2)

### C4. Validar moneda y referencia (H5)
Comparar `currency_id == "BRL"` y que la suscripción pertenezca al usuario esperado antes de activar. Archivo: `mp-webhook`.

### C5. Reembolsos y contracargos (H4)
Escuchar el tema `payment`; si el estado pasa a `refunded`/`charged_back`, registrar el evento y marcar el plan como "en revisión" (decisión de negocio: ¿cortar acceso de inmediato o al vencer?). **Requiere decisión del propietario.**

### C6. Restringir INSERT de `rnm_registros` (H6)
`REVOKE INSERT … FROM authenticated; GRANT INSERT (user_id, rnm, fecha_nacimiento) …`. La app ya envía solo esas columnas. **Reversión:** `GRANT INSERT` de las columnas quitadas. **Prueba:** registrar un RNM desde la app; intentar insertar `unidad_pf` debe fallar.

### C7. Quitar detalle de errores de pago al navegador (H8)
`mp-crear-suscripcion`: devolver solo `error` y `mp_status`; el detalle queda en el log. Ajustar `textoErrorPago` en `app.js` para depender del código.

### C8. Contacto cuando falta WhatsApp (H7)
Si `WHATSAPP` está vacío, reemplazar "Escríbenos por WhatsApp" por un enlace `mailto:flujoescalaempresas@gmail.com` en `ESTADOS` y `cajaUnidad`. No se inventa ningún número. Cuando el propietario entregue el número, se completa `WHATSAPP`.

### C9. Versionar el esquema (H9) y la trazabilidad del despliegue (H10)
`supabase db pull` para traer las migraciones `app_rnm_*` al repositorio. Decidir si Vercel se conecta al repositorio de GitHub (despliegue desde `main`, root `app-rnm`) para que lo publicado sea siempre lo versionado. **Decisión del propietario.**

## Etapa 3 — Mejoras (P3)

| Id | Cambio | Nota |
|---|---|---|
| C10 | Tabla de auditoría de acciones de staff (activar plan, guardar resultado) | H11 |
| C11 | `REVOKE EXECUTE … FROM PUBLIC` en `private.*` y fijar `search_path` en 3 funciones | H12 |
| C12 | Columnas de `rnm_planes` visibles al cliente: solo `cupos, precio_centavos, vence_at, user_id` | H13 |
| C13 | Decidir regla sobre rotar RNM dentro de un plan | H14 |
| C14 | Retirar columnas heredadas de `rnm_registros` | H15, migración destructiva: solo con respaldo y autorización |
| C15 | Revisar aparte funciones `SECURITY DEFINER` expuestas a `anon` de otros módulos | H16 |

## Qué requiere autorización del propietario

1. Rotar `MP_ACCESS_TOKEN` y configurar `MP_WEBHOOK_SECRET` (C2, C3).
2. Aplicar migraciones SQL en producción (C1, C6, C10–C14).
3. Desplegar funciones Edge y la app (C1, C2, C4, C7, C8).
4. Decisiones de negocio: reembolsos (C5), rotación de RNM (C13), conexión Vercel–GitHub (C9).
5. Número de WhatsApp de FLUJO (C8).

## Despliegue y reversión (general)

1. Probar en una rama de Supabase o proyecto de prueba (no en producción).
2. Aplicar migración → desplegar función → verificar con la matriz de pruebas → desplegar app.
3. Guardar la versión previa de cada función Edge (el panel de Supabase conserva el historial) y el commit anterior de la app.
4. Reversión: redeploy de la versión anterior; las migraciones se revierten con el script inverso documentado en cada una.
