# Fase 2 · Acceso y onboarding (pantallas 01–04) — registro (12-oct-2026)

Rama `redesign/premium-ui`. Solo presentación y validación del lado del cliente; mismos campos guardados en `rnm_perfiles`, mismo OAuth y mismo envío del CEP a ViaCEP.

## Hecho
- **Errores junto al campo**: nombre, teléfono, CEP, dirección, ciudad, UF y consentimiento muestran el mensaje justo debajo, con `aria-invalid`, `aria-describedby` y `role="alert"`; el foco va al campo; el error se borra al corregir; no se pierde lo escrito.
- **CEP**: estados visibles — buscando (con indicador), completado, y fallo (invita a completar a mano).
- **Botón de Google**: estado de carga ("Conectando con Google…", deshabilitado, `aria-busy`) y recuperación con mensaje si falla; hover/foco/disabled definidos.
- **Pasos 1–3**: ayuda bajo nombre y teléfono (formato con ejemplo); "Siguiente" siempre en la misma posición y "Atrás" debajo (los botones ya no saltan entre pasos); consentimiento con "Autorización necesaria para usar el servicio".
- sw v33.

## Pruebas ejecutadas (375×812, datos de ejemplo, con `sb.auth.signInWithOAuth` simulado)
- Paso 1 vacío → error junto al campo, foco, `aria-*` correctos; al escribir se limpia.
- Paso 2 con "123" → error de teléfono y el valor se conserva.
- Paso 3 sin consentimiento → error junto a la casilla; barra de progreso `aria-valuenow=3`.
- CEP 01310-100 contra ViaCEP real → estados "buscando" y "ok"; ciudad rellenada.
- Google: carga → fallo simulado → botón recuperado y mensaje.
- Sin scroll horizontal en Inicio, Historial, Planes, Ayuda, Perfil, Agregar (paso 1 y 2); diálogo de confirmación se abre y cierra.

## No probado
OAuth real con Google, guardado real del perfil en Supabase, CEP inválido/sin conexión (solo el camino feliz contra ViaCEP), teclado completo con lector de pantalla, 360×800 y escritorio.
