# Extensión FLUJO – Consulta RNM (Polícia Federal)

La consulta de la PF tiene verificación de Cloudflare ("ser humano"): solo una persona puede marcarla.
Esta extensión hace todo lo demás dentro de tu Chrome.

## Instalar (una vez)
1. En Chrome abre `chrome://extensions` y activa **Modo de desarrollador**.
2. **Cargar descomprimida** → elige esta carpeta (`extension-rnm-pf`).
3. Haz clic en el ícono de la extensión y entra con tu email y contraseña del panel (la cuenta del equipo).

## Cómo trabaja
- La cola tiene dos tipos de RNM: la **1.ª consulta gratis** del primer RNM de cada cuenta y los RNM **cubiertos por el plan activo** de la cuenta. Cada RNM cubierto se revisa a las 12 h (6 h si no apareció).
- Planes por cuenta (máximo 4 RNM): **1 RNM R$ 4,99 · 2 RNM R$ 8,99 · 3 RNM R$ 12,99 · 4 RNM R$ 15,99** al mes. Los RNM se cubren por orden de registro hasta el número de cupos del plan.
- En el ícono: **Empezar a consultar** abre la PF con el primer RNM ya llenado (RNM + fecha de nacimiento).
- Tú solo: marcas **"Verifique que es un ser humano"** y pulsas **Pesquisar**.
- La extensión lee el resultado, lo guarda (el cliente lo ve en su app) y **abre el siguiente sola**.
  Si el RNM sale como *listo para retirar* o *entregado*, deja de vigilarse.
- Si no detecta el resultado, usa el botón **Guardar lo que veo** de la barra azul.
- "Abrir solo el siguiente cada 2 min" (menú de la extensión) abre la PF sola cuando hay pendientes.

## Pagos mientras no haya pasarela
En el menú de la extensión, **Cuentas por cobrar**: elige el plan que pagó el cliente (por defecto el que cubre todos sus RNM) y pulsa **Pagó 1 mes**. Si el plan es el mismo y sigue vigente, se suma un mes; si cambia de tamaño, el mes nuevo empieza hoy.

## Seguridad
La extensión usa la sesión del operador (nunca una clave de servicio) y la base la protege con RLS:
solo cuentas del equipo pueden ver la cola o guardar resultados.

## Modo automático total (v1.2.0)
Casilla **Modo automático total** en el menú de la extensión. Con ella activa:
1. Cada 2 min, si hay RNM por consultar, abre la PF en una **ventana aparte** que no te quita el foco.
2. Llena RNM y fecha, **espera a que Cloudflare verifique solo** (hasta 45 s) y pulsa *Pesquisar*.
3. Lee el resultado, lo guarda y, tras una pausa de 8–20 s, abre el siguiente. Al terminar la cola cierra su ventana.

**Nunca marca ni resuelve la verificación de Cloudflare.** Si no valida sola, o la PF no devuelve resultado en 40 s, el bot se **detiene en ese RNM, deja la ventana abierta y manda una notificación** para que una persona la revise. Sin la casilla activa, todo funciona como antes.

La **Prueba de Cloudflare** (v1.1.0) sigue midiendo cuántas veces pasa sola; se ve en el menú.

Probado con una página que imita la PF (token a los 3 s → llenó, pulsó y guardó con la unidad; sin token → no pulsó y avisó). **No probado** contra la PF real, ni la ventana sin foco ni las notificaciones en Chrome real.

## Reintentos inteligentes (v1.3.0)
Si Cloudflare no verifica solo, no aparece el botón o la PF no responde (modo automático):
- El fallo se registra y ese RNM se **reintenta con espera creciente: 2 → 5 → 15 → 30 min**. Tras el 5.º fallo **descansa 3 h** y llega una notificación.
- Con **3 fallos seguidos** (de cualquier RNM) **todo el bot descansa 30 min** y avisa (evita insistir mientras Cloudflare está exigente).
- Mientras un RNM espera, el bot sigue con los demás; un éxito reinicia los contadores. La ventana del intento fallido se cierra sola.
- El menú muestra el estado: descanso activo, cuántos RNM esperan reintento y el último fallo.

Probado con una simulación del servicio de fondo (escalera de esperas, descanso global, regreso a la cola, reinicio tras éxito). **No probado** en Chrome real contra la PF.

## Límite importante: necesita un Chrome real encendido
El bot corre dentro de **un Chrome real con la extensión**, así que solo trabaja mientras ese equipo esté encendido, con sesión abierta y Chrome abierto. No funciona en un servidor sin pantalla: Cloudflare detecta esos navegadores, y esta extensión nunca intenta engañarlo.
