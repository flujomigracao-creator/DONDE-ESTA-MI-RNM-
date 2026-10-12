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
