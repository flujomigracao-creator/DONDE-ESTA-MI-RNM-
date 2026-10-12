# Fase 5 · Planes y pagos (pantallas 12–14) — registro (12-oct-2026)

Rama `redesign/premium-ui`. **No se tocó**: precios (R$ 4,99 / 8,99 / 12,99 / 15,99), cálculo del ahorro, tokenización de Mercado Pago, `mp-crear-suscripcion`, `mp-crear-pago`, ni la lógica que confirma el pago (se activa solo cuando `rnm_planes.vence_at` cambia en el servidor; volver de Mercado Pago no marca nada como pagado).

## Hecho
- **12 Comparativa** (pantalla Planes y pagos): tarjetas de 1–4 RNM con precio mensual, precio por RNM, % de ahorro (el mismo cálculo existente) y sello **Tu plan / Vencido / Mejor precio** (texto, no solo color). Tocar un plan abre el popup con ese plan preseleccionado (sin RNM en seguimiento lleva a registrar uno). Dos recuadros explican **Tarjeta (se renueva sola)** vs **Pix o boleto (un mes cada vez)**.
- **13 Método**: el selector Tarjeta/Pix/Boleto ahora se maneja con **flechas del teclado** (roving tabindex, `aria-checked`); el importe queda en el botón de Pix/boleto ("Generar código Pix · R$ 8,99"); botón de pago fijo abajo del popup.
- **14 Pix/boleto**: estado **"Pago pendiente"** con aviso explícito de que *pendiente no es pagado*; cuenta atrás del Pix; estilo propio cuando el código venció; **copiar** con confirmación verde y, si el portapapeles falla, el código queda seleccionado con instrucciones para copiarlo a mano.
- sw v39.

## Pruebas ejecutadas (375×812, Mercado Pago y Supabase simulados)
- Planes sin plan / con plan activo de 2 / con plan vencido de 3 → sellos correctos (Tu plan, Vencido, Mejor precio).
- Clic en el plan de 2 → popup abierto con "Continuar · 2 RNM · R$ 8,99/mes".
- Flecha derecha en el selector → pasa a Pix, `aria-checked` y `tabindex` correctos, texto del botón con importe.
- Pantalla Pix: "Pago pendiente · el código vence en 30:00"; copiar con portapapeles rechazado → mensaje de respaldo y botón "Copia a mano ↑".
- Sin scroll horizontal.

## No probado
Pago real con tarjeta (rechazo, aprobación), generación real de Pix/boleto, retorno de Mercado Pago, confirmación real vía servidor, método no disponible, teclado/lector de pantalla completos, 360×800 y escritorio.

## Ajuste: ampliar plan (12-oct-2026)
**Problemas encontrados** al reproducir "Ampliar" con un plan de 1 RNM y 3 RNM registrados: (1) se podían tocar planes que no cubren todos los RNM y el clic volvía solo al plan mínimo, sin explicación; (2) el plan actual aparecía como elegible; (3) el cobro mostraba el precio completo del plan nuevo sin decir cómo se relaciona con el plan que ya está pagado.

**Cambios (solo UI):** los planes que no alcanzan quedan bloqueados con el motivo ("No alcanza para tus 3 RNM" / "Tu plan actual"); aviso "Cómo funciona ampliar" con el importe y el efecto real.

**Comportamiento del servidor (leído en la base, sin cambios):** `private.rnm_aplicar_plan` pone `cupos` y `precio` del plan nuevo y `vence_at = now() + 1 mes`. **Solo suma meses si el plan tiene los mismos cupos.** Es decir, al ampliar **no hay prorrateo**: se paga el plan nuevo completo y los días que quedaban del anterior se pierden. La suscripción de tarjeta anterior se devuelve como `preapproval_anterior`. Si se quiere descontar o sumar los días restantes, es una decisión comercial + cambio de servidor, no de diseño.

Probado en 375×812: planes bloqueados/seleccionables, aviso con importe, cambio de plan a 4, caso sin plan.
