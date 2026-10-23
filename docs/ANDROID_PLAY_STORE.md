# App de Android (Google Play) — cómo se genera y cómo se publica

La app de Android es la misma web (`mirnm.com.br`) dentro de una **Trusted Web Activity** (Chrome a pantalla completa, sin barra de direcciones).
No hay código de pantallas en Android: cualquier cambio en `app-rnm/` llega a la app al publicarlo en Vercel, sin subir otra versión a Play.

## Qué hay en `android/`
- Proyecto Gradle generado con Bubblewrap (`@bubblewrap/core` 1.27), con **Play Billing** (Digital Goods API) y **notificaciones delegadas** activados.
- Paquete `br.com.flujomigracao.rnm`, nombre en el teléfono «Mi RNM», minSdk 24 (Android 7, lo exige la librería de Play Billing), targetSdk 36.
- Última compilación: `android/salida/mi-rnm-1.0.0.aab` (para Play) y `mi-rnm-1.0.0-prueba.apk` (para instalar a mano). No van a GitHub.
- Accesos directos (mantener pulsado el ícono): Validar, Historial, Planes.
- `twa-manifest.json`: la configuración de Bubblewrap (si se usa `bubblewrap update`, sale de aquí).
- **Llave de subida**: `android/rnm-upload.keystore` + `android/keystore.properties` (contraseña). **No están en GitHub** (`.gitignore`).
  Están en Google Drive con el resto del repo: haz una copia aparte (USB o gestor de contraseñas). Huella SHA-256:
  `7A:C8:1A:F0:9F:5D:48:F4:75:94:D6:CF:D3:0D:3D:1C:E8:80:9B:23:28:FD:1A:35:13:8F:B8:66:C2:A5:FC:88`
  Con «Firma de apps de Play» activada, si se pierde esta llave Google permite cambiarla (Play Console → Integridad de la app); no se pierde la app.

## Compilar
Necesita JDK 17 (el de Android Studio 2025+ es Java 25 y no sirve para este Gradle) y el SDK de Android.
Mejor compilar en una copia fuera de Google Drive (Gradle y la sincronización de Drive se pisan):
```
set JAVA_HOME=C:\Users\Desktop\.jdks\jbr-17.0.14
gradlew bundleRelease      → app/build/outputs/bundle/release/app-release.aab  (para subir a Play)
gradlew assembleDebug      → app/build/outputs/apk/debug/app-debug.apk        (para probar en un teléfono)
```
`android/local.properties` lleva `sdk.dir=C:/Users/Desktop/AppData/Local/Android/Sdk` (con barras normales).
Cada versión nueva para Play: subir `versionCode` (y `versionName`) en `app/build.gradle` y en `twa-manifest.json`.

## Antes de subir: la web tiene que estar publicada
La app abre `https://mirnm.com.br`. Antes de la primera subida hay que publicar en Vercel:
`/.well-known/assetlinks.json` (con la huella de arriba), `manifest.json`, `icon-maskable-*.png`, `offline.html`, `movil.css`.
Si `assetlinks.json` no coincide, la app se abre con una barra de direcciones arriba (señal de que falta la verificación).
Comprobar: https://developers.google.com/digital-asset-links/tools/generator

## Publicar en Play Console
1. **Cuenta de desarrollador**: si es personal (creada después de nov-2023), Google exige una **prueba cerrada con al menos 12 personas
   durante 14 días** antes de poder pasar a producción. Una cuenta de **organización** (CNPJ + D-U-N-S) no tiene ese requisito.
2. Crear la app → subir `app-release.aab` a **Prueba interna** → activar **Firma de apps de Play**.
3. Copiar la huella SHA-256 de la **clave de firma de Google** (Integridad de la app) y **añadirla** a `assetlinks.json`
   (en la lista `sha256_cert_fingerprints`, junto a la de subida). Publicar en Vercel. Sin esto, la versión instalada desde Play muestra la barra de direcciones.
4. Play Billing: seguir `docs/PLAY_BILLING.md` (productos, cuenta de servicio, Pub/Sub, probadores). Al publicar la app, poner `publicada: true` en `app-rnm/play.js`.
5. **Ficha de la tienda** — reglas que más rechazos causan en apps como esta:
   - **No usar el escudo ni el nombre de la Polícia Federal como si fuera la app oficial** (política de suplantación y de apps relacionadas
     con el gobierno). Nada de creativos de la carpeta «CON EL ESCUDO DE LA PF» en la ficha.
   - En la descripción (y dentro de la app, ya está): «Servicio independiente, no es un canal oficial de la Policía Federal» y el enlace a la fuente oficial
     (servicos.pf.gov.br).
   - Capturas: tomarlas de la app real (teléfono) — Inicio, Detalle, Validar, Planes.
6. **Seguridad de los datos** (formulario obligatorio): se recogen nombre, correo, teléfono, dirección/ciudad, número de RNM, fecha de nacimiento,
   fotos del carné (opcional), historial de compras; se comparten con Meta (píxel, solo con consentimiento) y Mercado Pago/Google Play (pagos).
   Cifrado en tránsito: sí. Borrado: a pedido (ver abajo).
7. **Borrado de cuenta**: Play exige poder pedirlo **desde la app** y **desde una página web**. Hoy se pide por WhatsApp/correo desde Perfil;
   dar en Play Console la URL de `privacidad.html` (sección de eliminación) como página web.
8. Clasificación de contenido, público objetivo (18+), país: Brasil.

## Probar en un teléfono (sin Play)
Activar «Depuración USB», conectar y: `adb install app-debug.apk`. Mientras `assetlinks.json` no tenga la huella de la llave de depuración
(`~/.android/debug.keystore`), la versión de depuración muestra la barra de direcciones: es normal.
