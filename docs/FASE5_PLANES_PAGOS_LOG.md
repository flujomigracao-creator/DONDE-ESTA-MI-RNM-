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
