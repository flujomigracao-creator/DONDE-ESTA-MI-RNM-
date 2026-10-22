# Cobro con Google Play Billing (app de Android) — guía de puesta en marcha

Estado (22 oct 2026): **construido y apagado**. Dentro de la app de Google Play los planes se compran SOLO con Play Billing; en la web sigue Mercado Pago.
Nada de esto se activa hasta que existan la app en Play Console y las credenciales de abajo.

## Qué hay construido
- App (`app-rnm/app.js`): `modoPlayBilling()` (solo la app de Play: origen `android-app://` o API de bienes digitales; una web instalada como PWA NO cuenta),
  `mostrarPagoPlay` (panel de compra), `comprarConPlay` (Digital Goods API + PaymentRequest `https://play.google.com/billing`), `restaurarComprasPlay`.
  Cancelar un plan de Play abre «Suscripciones» de Google Play. Sin Mercado Pago ni enlaces de pago dentro de la app.
- Servidor (Supabase): funciones `play-validar-compra` (verifica con Google y activa el plan) y `play-rtdn` (renovaciones/cancelaciones/reembolsos);
  tabla `rnm_suscripciones_play`; funciones SQL `rnm_registrar_compra_play` y `rnm_estado_compra_play`.
- Productos: `rnm_plan_quincenal` (R$ 4,99), `rnm_plan_semanal` (R$ 9,99), `rnm_plan_manual` (R$ 19,99). Paquete: `br.com.flujomigracao.rnm`.

## Lo que hay que hacer (tú, en Google)
1. **Play Console → crear la app** `br.com.flujomigracao.rnm` y subir una primera versión (pista interna). Hay que generarla con Play Billing activado
   (PWABuilder: opción «Google Play Billing»; Bubblewrap: `playBilling` activo). Sin eso, la API de bienes digitales no existe dentro de la app.
2. **Play Console → Monetizar → Productos → Suscripciones**: crear los 3 ids de arriba, cada uno con un plan base **mensual con renovación automática**
   y precio exacto en BRL (4,99 / 9,99 / 19,99). El servidor rechaza una compra si precio o moneda no coinciden.
3. **Cuenta de servicio**: en Google Cloud (proyecto vinculado a Play Console) habilitar «Google Play Android Developer API», crear una cuenta de servicio,
   descargar su clave JSON, e invitar su correo en Play Console → Usuarios y permisos con permiso de ver datos financieros y **administrar pedidos y suscripciones**.
4. **Secretos en Supabase** (Edge Functions → Secrets): `GOOGLE_PLAY_SA_JSON` = el JSON completo; `PLAY_RTDN_SECRET` = una cadena larga al azar.
5. **Avisos en tiempo real**: en Google Cloud crear un tema de Pub/Sub, darle permiso de publicar a `google-play-developer-notifications@system.gserviceaccount.com`,
   crear una suscripción **push** hacia `https://rumpfqevyspdmhaggxtq.supabase.co/functions/v1/play-rtdn?k=<PLAY_RTDN_SECRET>` y poner el nombre del tema en
   Play Console → Monetizar → Configuración de monetización → Notificaciones en tiempo real.
6. **Probadores de licencia** (Play Console → Configuración → Prueba de licencias): añadir tu correo para comprar sin cobrarte (compras de prueba).
7. `assetlinks.json` (en `mirnm.com.br/.well-known/`): al activar «Firma de apps de Play» añadir también la huella SHA-256 de la clave de firma de Google
   (Play Console → Integridad de la app), además de la de subida que ya está.

## Cómo se prueba (cuando exista la app)
1. Instalar desde la pista interna con una cuenta de probador de licencia. 2. Entrar → Planes → elegir plan → «Suscribirme». 3. Debe quedar el plan activo y
aparecer una fila en `rnm_suscripciones_play` (con `es_prueba = true`). 4. Cancelar desde Google Play y comprobar que `cancelado_at` se marca y que al vencer
el plan se cierra (`play-rtdn`). Registro de errores: Supabase → Edge Functions → logs de `play-validar-compra` y `play-rtdn`.

## Ojo
- **Comisión de Google**: en suscripciones 15 % (en Brasil no hay cifra oficial publicada en las páginas que revisé; confirmar en Play Console).
- **Cambiar de Mercado Pago a Play (o al revés)**: la cuenta con una tarjeta activa en Mercado Pago que compre en Play pagaría dos veces. Hoy NO se cancela
  automáticamente la suscripción de Mercado Pago al comprar en Play: hay que avisar a la persona o cancelarla desde el panel.
- **Garantía de 1 hora y reembolsos**: aplican a Mercado Pago (`pago_ref` = `mp:…`). Las compras de Play (`pago_ref` = `play:…`) se reembolsan desde Google Play.
- **Pix en Play Billing**: no pude confirmar que Google Play lo admita en Brasil; verificarlo en Play Console antes de prometerlo.
- La integración de TWA con Play Billing depende de la versión de Chrome y de cómo se genere la app; probar de verdad en un teléfono antes de publicar.
- Probado solo con simulaciones (la compra real, la verificación con Google y los avisos de Pub/Sub no se han podido probar sin app en Play).
