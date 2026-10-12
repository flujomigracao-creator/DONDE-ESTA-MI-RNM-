# Fase 4 · Registro de RNM e historial (pantallas 09–11) — registro (12-oct-2026)

Rama `redesign/premium-ui`. Sin cambios en el RPC `rnm_gratis_disponible`, en la inserción en `rnm_registros`, en el límite de 4 ni en los precios.

## Hecho
- **09 Datos**: encabezado con "Paso 1 de 2"; **un solo aviso de coste** según el caso — primera consulta gratis / cubierto por tu plan / RNM adicional con plan / límite de 4 (antes se mostraban según banderas sueltas). Ayudas bajo RNM (6–12 letras y números) y fecha (dd/mm/aaaa, ejemplo). Consentimiento con "Para qué usamos estos datos".
- **Validación junto al campo** (RNM vacío o mal formado, fecha vacía / imposible / futura, consentimiento) con `aria-invalid`, foco y borrado al corregir; se desactiva la validación nativa del navegador (`novalidate`) para que los mensajes sean los de la app. Los helpers se generalizaron (`marcarCampoEn`) y los usa también el perfil.
- **10 Revisión**: se conserva el resumen con el coste aplicable, "Corregir datos" (secundario) y "Confirmar y registrar" (primario, bloqueado durante el envío); mensajes de error específicos (límite, duplicado) intactos.
- **11 Historial**: estado de carga visible (con `aria-busy`), error con "Reintentar", vacío y lista; botón "Actualizar lista" muestra "Actualizando…" y luego "Lista actualizada ✓". **Bug corregido**: dos cargas seguidas podían dejar la lista duplicada o mezclar un error viejo con datos nuevos; ahora solo cuenta la última carga.
- sw v38.

## Pruebas ejecutadas (375×812, `sb` simulado)
- Registro: 6 errores distintos aparecen junto a su campo con el texto esperado; con datos válidos pasa al paso 2 (RNM, fecha y "Primera consulta gratuita incluida") sin errores residuales.
- Aviso de coste: gratis, adicional, cubierto por plan, sin cupo (→ adicional) y límite → siempre exactamente uno visible.
- Historial: cargando → error (con Reintentar) → vacío → lista con tarjeta interpretada, unidad, cambio de dirección "Desaprobada"; botón con estados; carga vieja que falla + carga nueva buena → 1 tarjeta, 0 errores.

## No probado
Inserción real en Supabase (duplicado, límite, red caída), el RPC real, teclado/lector de pantalla, 360×800 y escritorio.
